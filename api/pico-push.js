// fortuna-silk.vercel.app/api/pico-push
// picolab.kr 웹 푸시 발송 (Worker 크론에서 호출)
// POST { user_ids: [...], title, body, url }

import webpush from 'web-push';

const SB_URL = 'https://ymghmfkqctckxxysxkvy.supabase.co';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 크론 시크릿 인증
  const cronSecret = process.env.FORTUNA_CONTEXT_TOKEN;
  if (cronSecret) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${cronSecret}`) return res.status(401).json({ error: 'Unauthorized' });
  }

  const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY;
  const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
  const VAPID_EMAIL       = process.env.VAPID_EMAIL || 'mailto:kkdmb@naver.com';
  const SB_KEY            = process.env.SB_SERVICE_KEY;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !SB_KEY) {
    return res.status(500).json({ error: 'Missing env vars' });
  }

  const { user_ids, title, body, url } = req.body || {};
  if (!Array.isArray(user_ids) || user_ids.length === 0) {
    return res.status(400).json({ error: 'user_ids required' });
  }

  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  const sbH = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

  // 해당 유저들의 구독 정보 조회
  const ids = user_ids.map(id => `"${id}"`).join(',');
  const subRes = await fetch(
    `${SB_URL}/rest/v1/pico_push_subscriptions?select=user_id,subscription&user_id=in.(${ids})`,
    { headers: sbH }
  );
  const rows = await subRes.json();
  if (!Array.isArray(rows) || rows.length === 0) return res.status(200).json({ sent: 0 });

  const payload = JSON.stringify({
    title: title || '✦ 피코랩',
    body:  body  || '오늘의 운세 메시지가 도착했어요.',
    url:   url   || 'https://picolab.kr'
  });

  let sent = 0, failed = 0;
  for (const row of rows) {
    try {
      const sub = typeof row.subscription === 'string' ? JSON.parse(row.subscription) : row.subscription;
      if (!sub || !sub.endpoint) continue;
      await webpush.sendNotification(sub, payload);
      sent++;
    } catch (e) {
      failed++;
      // 410 = 구독 만료 → 삭제
      if (e.statusCode === 410 || e.statusCode === 404) {
        await fetch(
          `${SB_URL}/rest/v1/pico_push_subscriptions?user_id=eq.${encodeURIComponent(row.user_id)}`,
          { method: 'DELETE', headers: sbH }
        ).catch(() => {});
      }
    }
  }

  return res.status(200).json({ sent, failed });
}
