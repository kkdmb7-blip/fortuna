import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SB_SERVICE_KEY);

webpush.setVapidDetails(
  'mailto:fortuna@fortuna.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.headers.authorization !== 'Bearer ' + process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { data: subs } = await sb.from('push_subscriptions').select('*');
  if (!subs || subs.length === 0) return res.json({ sent: 0 });

  const payload = JSON.stringify({
    title: '🔮 포르투나',
    body: '오늘의 운세가 도착했어요. 지금 확인해보세요!',
    icon: '/memox/goddess.png',
    url: '/memox/'
  });

  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub.subscription, payload);
      sent++;
    } catch(e) {
      if (e.statusCode === 410) {
        await sb.from('push_subscriptions').delete().eq('user_id', sub.user_id);
      }
    }
  }
  res.json({ sent });
}
