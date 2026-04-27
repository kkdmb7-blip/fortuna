// fortuna-silk.vercel.app/api/save-profile
// 카카오 유저 프로필 저장 + 이벤트 로깅 (서비스 키 사용, RLS 우회)

const SB_URL = 'https://ymghmfkqctckxxysxkvy.supabase.co';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SB_KEY = process.env.SB_SERVICE_KEY;
  if (!SB_KEY) return res.status(500).json({ error: 'Server config error' });

  // ?action=log → 이벤트 로깅
  if (req.query.action === 'log') {
    const { user_id, event_type, properties } = req.body || {};
    if (!event_type) return res.status(400).json({ error: 'event_type required' });
    try {
      await fetch(`${SB_URL}/rest/v1/user_events`, {
        method: 'POST',
        headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ user_id: user_id || null, event_type, properties: properties || {} }),
      });
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  const profile = req.body;
  if (!profile || !profile.id) return res.status(400).json({ error: 'profile.id required' });

  try {
    const resp = await fetch(`${SB_URL}/rest/v1/chat_users`, {
      method: 'POST',
      headers: {
        'apikey': SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify(profile)
    });
    const data = await resp.json();
    return res.status(200).json({ ok: true, data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
