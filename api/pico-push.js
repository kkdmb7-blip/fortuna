// fortuna-silk.vercel.app/api/pico-push.js
// 피코랩 범용 푸시 발송 (월운, 연운, 대운 등 커스텀 페이로드)
// 환경변수: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL, SB_SERVICE_KEY, CRON_SECRET

import webpush from 'web-push';

const SB_URL = 'https://ymghmfkqctckxxysxkvy.supabase.co';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'];
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { user_ids, title, body, url } = req.body || {};
  if (!Array.isArray(user_ids) || user_ids.length === 0) {
    return res.status(400).json({ error: 'user_ids 배열 필요' });
  }
  if (!title || !body) {
    return res.status(400).json({ error: 'title, body 필요' });
  }

  const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY;
  const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
  const VAPID_EMAIL       = process.env.VAPID_EMAIL || 'mailto:kkdmb@naver.com';
  const SB_KEY            = process.env.SB_SERVICE_KEY;

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !SB_KEY) {
    return res.status(500).json({ error: 'Missing env vars' });
  }

  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  // pico_push_subscriptions에서 해당 유저 구독 정보 조회
  const sbHeaders = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };
  let subMap = {};
  try {
    const sbRes = await fetch(
      `${SB_URL}/rest/v1/pico_push_subscriptions?user_id=in.(${user_ids.join(',')})&select=user_id,subscription`,
      { headers: sbHeaders }
    );
    const subs = await sbRes.json();
    if (Array.isArray(subs)) {
      subs.forEach(s => { if (s.user_id) subMap[s.user_id] = s.subscription; });
    }
  } catch (e) {
    return res.status(500).json({ error: 'Supabase 조회 실패', detail: e.message });
  }

  const payload = JSON.stringify({
    title,
    body,
    url: url || 'https://picolab.kr'
  });

  const results = { sent: 0, failed: 0, skipped: 0, expired: [] };

  await Promise.allSettled(
    user_ids.map(async (userId) => {
      const sub = subMap[userId];
      if (!sub) { results.skipped++; return; }

      const parsedSub = typeof sub === 'string' ? JSON.parse(sub) : sub;
      try {
        await webpush.sendNotification(parsedSub, payload);
        results.sent++;
      } catch (e) {
        results.failed++;
        if (e.statusCode === 410 || e.statusCode === 404) {
          results.expired.push(userId);
          await fetch(
            `${SB_URL}/rest/v1/pico_push_subscriptions?user_id=eq.${userId}`,
            { method: 'DELETE', headers: sbHeaders }
          ).catch(() => {});
        }
      }
    })
  );

  return res.status(200).json({ ok: true, total: user_ids.length, ...results });
}
