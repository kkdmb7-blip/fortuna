// fortuna-silk.vercel.app/api/resolve-user
// 이메일로 기존 유저 프로필 조회 (서비스 키 사용, RLS 우회)

const SB_URL = 'https://ymghmfkqctckxxysxkvy.supabase.co';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });

  const SB_KEY = process.env.SB_SERVICE_KEY;
  if (!SB_KEY) return res.status(500).json({ error: 'Server config error' });

  try {
    const resp = await fetch(
      `${SB_URL}/rest/v1/chat_users?email=eq.${encodeURIComponent(email)}&select=*&limit=1`,
      { headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` } }
    );
    const data = await resp.json();
    const found = Array.isArray(data) && data[0];
    return res.status(200).json({ profile: found || null });
  } catch (e) {
    return res.status(200).json({ profile: null });
  }
}
