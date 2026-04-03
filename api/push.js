// fortuna-silk.vercel.app/api/push.js
// Vercel Serverless Function + Cron Job (매일 UTC 22:30 = KST 07:30)
// 환경변수: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL, SB_SERVICE_KEY

import webpush from 'web-push';

const SB_URL = 'https://ymghmfkqctckxxysxkvy.supabase.co';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // POST: 구독 저장 (save-push-sub 통합)
  if (req.method === 'POST') {
    const { user_id, subscription } = req.body || {};
    if (!user_id || !subscription) return res.status(400).json({ error: 'missing fields' });
    const SB_KEY0 = process.env.SB_SERVICE_KEY;
    const resp = await fetch(`${SB_URL}/rest/v1/push_subscriptions?on_conflict=user_id`, {
      method: 'POST',
      headers: {
        'apikey': SB_KEY0, 'Authorization': `Bearer ${SB_KEY0}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ user_id, subscription, updated_at: new Date().toISOString() })
    });
    if (!resp.ok) { const err = await resp.json().catch(() => ({})); return res.status(500).json({ error: err.message || 'upsert failed' }); }
    return res.json({ ok: true });
  }

  // Cron 인증 (Vercel Cron은 Authorization 헤더로 CRON_SECRET 전달)
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY;
  const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
  const VAPID_EMAIL       = process.env.VAPID_EMAIL || 'mailto:kkdmb@naver.com';
  const SB_KEY            = process.env.SB_SERVICE_KEY;

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !SB_KEY) {
    return res.status(500).json({ error: 'Missing env vars' });
  }

  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  // Supabase에서 구독 + 프로필 이름 함께 조회
  let subscriptions = [];
  try {
    const sbRes = await fetch(
      `${SB_URL}/rest/v1/push_subscriptions?select=user_id,subscription`,
      { headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` } }
    );
    subscriptions = await sbRes.json();
    if (!Array.isArray(subscriptions)) subscriptions = [];
  } catch (e) {
    return res.status(500).json({ error: 'Supabase 조회 실패', detail: e.message });
  }

  // 사용자 이름 일괄 조회 (user_id 목록으로)
  const userIds = subscriptions.map(s => s.user_id).filter(Boolean);
  let nameMap = {};
  if (userIds.length > 0) {
    try {
      const profileRes = await fetch(
        `${SB_URL}/rest/v1/chat_users?select=id,name&id=in.(${userIds.map(id => `"${id}"`).join(',')})`,
        { headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` } }
      );
      const profiles = await profileRes.json();
      if (Array.isArray(profiles)) {
        profiles.forEach(p => { if (p.id && p.name) nameMap[p.id] = p.name; });
      }
    } catch (e) { /* 이름 조회 실패해도 발송은 계속 */ }
  }

  const results = { sent: 0, failed: 0, expired: [] };

  await Promise.allSettled(
    subscriptions.map(async (row) => {
      const sub = typeof row.subscription === 'string' ? JSON.parse(row.subscription) : row.subscription;
      if (!sub || !sub.endpoint) return;
      const name = nameMap[row.user_id];
      const payload = JSON.stringify({
        title: '🔮 포르투나',
        body: name ? `${name}님의 오늘 운세가 도착했어요 ✨` : '오늘의 운세가 도착했어요. 확인해보세요!',
        url: '/memox/?daily=1'
      });
      try {
        const parsedSub = typeof sub === 'string' ? JSON.parse(sub) : sub;
        await webpush.sendNotification(parsedSub, payload);
        results.sent++;
      } catch (e) {
        results.failed++;
        console.error('푸시 실패 상세:', e.statusCode, e.message, JSON.stringify(e.body));
        // 410 Gone = 구독 만료 → 삭제 처리
        if (e.statusCode === 410 || e.statusCode === 404) {
          results.expired.push(row.user_id);
          await fetch(
            `${SB_URL}/rest/v1/push_subscriptions?user_id=eq.${row.user_id}`,
            {
              method: 'DELETE',
              headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` }
            }
          ).catch(() => {});
        }
      }
    })
  );

  return res.status(200).json({
    ok: true,
    total: subscriptions.length,
    ...results
  });
}
