const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SB_SERVICE_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const { user_id } = req.body;
  await sb.from('chat_messages').delete().eq('user_id', user_id);
  await sb.from('chat_users').delete().eq('id', user_id);
  res.json({ ok: true });
};
