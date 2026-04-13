// fortuna-silk.vercel.app/api/qimen-push.js
// Worker에서 호출: 기문둔갑 대길 사용자에게 개인화 푸시 발송
// 환경변수: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL, SB_SERVICE_KEY, CRON_SECRET

import webpush from 'web-push';

const SB_URL = 'https://ymghmfkqctckxxysxkvy.supabase.co';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 인증
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'];
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // 요청 바디: { users: [{user_id, name, keyword, next_shi}] }
  const { users } = req.body || {};
  if (!Array.isArray(users) || users.length === 0) {
    return res.status(400).json({ error: 'users 배열 필요' });
  }

  const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY;
  const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
  const VAPID_EMAIL       = process.env.VAPID_EMAIL || 'mailto:kkdmb@naver.com';
  const SB_KEY            = process.env.SB_SERVICE_KEY;

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !SB_KEY) {
    return res.status(500).json({ error: 'Missing env vars' });
  }

  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  // 대상 user_id 목록으로 push_subscriptions 조회
  const userIds = users.map(u => u.user_id).filter(Boolean);
  let subMap = {};
  try {
    const sbRes = await fetch(
      `${SB_URL}/rest/v1/push_subscriptions?user_id=in.(${userIds.join(',')})&select=user_id,subscription`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    const subs = await sbRes.json();
    if (Array.isArray(subs)) {
      subs.forEach(s => { if (s.user_id) subMap[s.user_id] = s.subscription; });
    }
  } catch (e) {
    return res.status(500).json({ error: 'Supabase 조회 실패', detail: e.message });
  }

  const results = { sent: 0, failed: 0, skipped: 0, expired: [] };

  await Promise.allSettled(
    users.map(async (u) => {
      const sub = subMap[u.user_id];
      if (!sub) { results.skipped++; return; }

      const parsedSub = typeof sub === 'string' ? JSON.parse(sub) : sub;
      const name = u.name || '';
      const shiName = u.next_shi || '다음 시간';
      const keyword = u.keyword || '대길의 기운';

      const payload = JSON.stringify({
        title: '🔯 기문둔갑 대길 알림',
        body: name
          ? `${name}님, 30분 후 ${shiName}이 대길입니다 ✨ ${keyword}`
          : `30분 후 ${shiName}이 대길입니다 ✨ ${keyword}`,
        url: '/memox/'
      });

      try {
        await webpush.sendNotification(parsedSub, payload);
        results.sent++;
      } catch (e) {
        results.failed++;
        if (e.statusCode === 410 || e.statusCode === 404) {
          results.expired.push(u.user_id);
          await fetch(
            `${SB_URL}/rest/v1/push_subscriptions?user_id=eq.${u.user_id}`,
            { method: 'DELETE', headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
          ).catch(() => {});
        }
      }
    })
  );

  return res.status(200).json({ ok: true, total: users.length, ...results });
}
