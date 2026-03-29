import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SB_SERVICE_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: 'missing user_id' });

  const todayKST = new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })
    .replace(/\. /g, '-').replace('.', '').trim();

  const { data, error } = await sb.from('chat_users')
    .select('daily_count, daily_reset_at, paid_count')
    .eq('id', user_id)
    .single();

  if (error || !data) return res.status(404).json({ error: 'user_not_found' });

  const FREE_DAILY = parseInt(process.env.FREE_DAILY || '3', 10);
  const freeLeft = data.daily_reset_at === todayKST
    ? Math.max(0, FREE_DAILY - (data.daily_count || 0))
    : FREE_DAILY;
  const paidLeft = data.paid_count || 0;

  res.json({ free_left: freeLeft, paid_left: paidLeft, total: freeLeft + paidLeft });
}
