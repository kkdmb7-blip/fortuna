// fortuna-silk.vercel.app/api/quote-push
// picolab.kr 사주 기반 개인화 푸시 (Worker 크론에서 호출)
// POST { users: [{user_id, name, ilgan, geokguk, yongshin}] }

import webpush from 'web-push';

const SB_URL = 'https://ymghmfkqctckxxysxkvy.supabase.co';

const FALLBACK_MESSAGES = [
  '오늘 하루도 내 흐름을 믿어봐.',
  '지금 이 순간이 쌓여 큰 흐름이 돼.',
  '서두르지 않아도 돼. 때가 되면 온다.',
  '오늘 한 가지만 집중해봐.',
  '내 에너지를 아끼는 것도 전략이야.',
];

function getFallback(name) {
  const msg = FALLBACK_MESSAGES[Math.floor(Math.random() * FALLBACK_MESSAGES.length)];
  return name ? `${name}님, ${msg}` : msg;
}

async function generateMessage(apiKey, user) {
  const { name, ilgan, geokguk, yongshin } = user;
  const kst = new Date(Date.now() + 9 * 3600000);
  const dow = ['일','월','화','수','목','금','토'][kst.getUTCDay()];
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        system: '당신은 사주 운세 코치입니다. 60~100자 한 줄 메시지만 반환. 이모지 1개 이내. 이름 자연스럽게 1회 포함. 확정 예언 금지.',
        messages: [{ role: 'user', content: `오늘: ${dow}요일\n이름: ${name||'유저'}\n일간: ${ilgan||''} 격국: ${geokguk||''} 용신: ${yongshin||''}\n오늘 이 사람에게 보낼 한 줄 메시지:` }]
      })
    });
    const data = await res.json();
    const text = (data?.content?.[0]?.text || '').trim().replace(/^["'「]+|["'」]+$/g, '').slice(0, 120);
    return text || null;
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const cronSecret = process.env.FORTUNA_CONTEXT_TOKEN;
  if (cronSecret) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${cronSecret}`) return res.status(401).json({ error: 'Unauthorized' });
  }

  const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY;
  const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
  const VAPID_EMAIL       = process.env.VAPID_EMAIL || 'mailto:kkdmb@naver.com';
  const SB_KEY            = process.env.SB_SERVICE_KEY;
  const ANTHROPIC_KEY     = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_KEY;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !SB_KEY) {
    return res.status(500).json({ error: 'Missing env vars' });
  }

  const { users } = req.body || {};
  if (!Array.isArray(users) || users.length === 0) return res.status(400).json({ error: 'users required' });

  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  const sbH = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

  const ids = users.map(u => `"${u.user_id}"`).join(',');
  const subRes = await fetch(
    `${SB_URL}/rest/v1/pico_push_subscriptions?select=user_id,subscription&user_id=in.(${ids})`,
    { headers: sbH }
  );
  const rows = await subRes.json();
  if (!Array.isArray(rows) || rows.length === 0) return res.status(200).json({ sent: 0 });

  const userMap = {};
  users.forEach(u => { userMap[u.user_id] = u; });

  let sent = 0, failed = 0;
  for (const row of rows) {
    try {
      const sub = typeof row.subscription === 'string' ? JSON.parse(row.subscription) : row.subscription;
      if (!sub || !sub.endpoint) continue;

      const user = userMap[row.user_id] || {};
      const msg = (ANTHROPIC_KEY ? await generateMessage(ANTHROPIC_KEY, user) : null) || getFallback(user.name);

      const payload = JSON.stringify({
        title: '✦ 오늘의 운세',
        body: msg,
        url: 'https://picolab.kr'
      });

      await webpush.sendNotification(sub, payload);
      sent++;
    } catch (e) {
      failed++;
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
