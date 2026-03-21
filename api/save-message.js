const SB_URL = 'https://ymghmfkqctckxxysxkvy.supabase.co';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { user_id, id, role, content, created_at } = req.body || {};
  if (!user_id || !id || !role || !content) return res.status(400).json({ error: 'missing fields' });

  const SB_KEY = process.env.SB_SERVICE_KEY;
  if (!SB_KEY) return res.status(500).json({ error: 'Server config error' });

  try {
    const resp = await fetch(`${SB_URL}/rest/v1/chat_messages`, {
      method: 'POST',
      headers: {
        'apikey': SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ id, user_id, role, content, created_at })
    });
    if (!resp.ok) {
      const err = await resp.json();
      return res.status(500).json({ error: err.message || 'insert failed' });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
