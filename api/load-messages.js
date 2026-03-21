const SB_URL = 'https://ymghmfkqctckxxysxkvy.supabase.co';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { user_id } = req.body || {};
  if (!user_id) return res.status(400).json({ error: 'user_id required' });

  const SB_KEY = process.env.SB_SERVICE_KEY;
  if (!SB_KEY) return res.status(500).json({ error: 'Server config error' });

  try {
    const resp = await fetch(
      `${SB_URL}/rest/v1/chat_messages?user_id=eq.${encodeURIComponent(user_id)}&order=created_at.desc&limit=50&select=*`,
      { headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` } }
    );
    const data = await resp.json();
    return res.status(200).json({ messages: Array.isArray(data) ? data : [] });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
