const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SB_SERVICE_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const { user_id, id, role, content, created_at } = req.body;
  const { error } = await sb.from('chat_messages').insert({ id, user_id, role, content, created_at });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
};
