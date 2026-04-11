// fortuna-silk.vercel.app/api/save-context
// 카카오 유저 user_context 누적 저장 (서비스 키 사용, RLS 우회)

const SB_URL = 'https://ymghmfkqctckxxysxkvy.supabase.co';

const ALLOWED_ORIGINS = [
  'https://kkdmb7-blip.github.io',
  'https://picolab.kr',
  'https://www.picolab.kr',
  'http://localhost:3000'
];

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : '*';
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SB_KEY = process.env.SB_SERVICE_KEY;
  if (!SB_KEY) return res.status(500).json({ error: 'Server config error' });

  // GET: 유저 맥락 조회
  if (req.method === 'GET') {
    const user_id = req.query.user_id;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    try {
      const resp = await fetch(`${SB_URL}/rest/v1/user_context?user_id=eq.${encodeURIComponent(user_id)}&limit=1`, {
        headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` }
      });
      const data = await resp.json();
      return res.status(200).json({ data: data[0] || null });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { user_id, people, situations, concerns, last_topics, emotion_pattern } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id required' });

  try {
    const resp = await fetch(`${SB_URL}/rest/v1/user_context`, {
      method: 'POST',
      headers: {
        'apikey': SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({
        user_id,
        people: people || [],
        situations: situations || [],
        concerns: concerns || [],
        last_topics: last_topics || [],
        emotion_pattern: emotion_pattern || '',
        updated_at: Date.now()
      })
    });
    if (!resp.ok) {
      const err = await resp.text();
      return res.status(500).json({ error: err });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
