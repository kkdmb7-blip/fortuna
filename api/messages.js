import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SB_SERVICE_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const uid = req.query.user_id;
    const sid = req.query.session_id;
    if (!uid) return res.status(400).json({ error: 'user_id required' });
    let query = sb.from('chat_messages').select('*').eq('user_id', uid);
    if (sid) query = query.eq('session_id', sid);
    const { data, error } = await query.order('created_at', { ascending: false }).limit(50);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ messages: data || [] });
  }

  if (req.method === 'POST') {
    const { user_id, id, role, content, created_at, session_id } = req.body || {};
    const { error } = await sb.from('chat_messages').insert({ id, user_id, role, content, created_at, session_id });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  res.status(405).end();
}
