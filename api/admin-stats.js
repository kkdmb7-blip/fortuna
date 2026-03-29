import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SB_SERVICE_KEY);

const ADMIN_ID = '3d7633bc-3351-4f22-bc10-10cd1bfc5c28';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { admin_id } = req.query;
  if (admin_id !== ADMIN_ID) return res.status(403).json({ error: 'forbidden' });

  const todayKST = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [
    { count: totalUsers },
    { count: todayUsers },
    { count: totalMessages },
    { count: todayMessages }
  ] = await Promise.all([
    sb.from('chat_users').select('*', { count: 'exact', head: true }),
    sb.from('chat_users').select('*', { count: 'exact', head: true }).eq('daily_reset_at', todayKST),
    sb.from('chat_messages').select('*', { count: 'exact', head: true }).eq('role', 'user'),
    sb.from('chat_messages').select('*', { count: 'exact', head: true }).eq('role', 'user').gte('created_at', new Date(todayKST).getTime())
  ]);

  res.json({ totalUsers, todayUsers, totalMessages, todayMessages });
}
