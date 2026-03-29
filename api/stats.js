import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SB_SERVICE_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { count, error } = await sb.from('chat_messages')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'user');

  if (error) return res.status(500).json({ error: error.message });
  res.json({ total_consultations: count || 0 });
}
