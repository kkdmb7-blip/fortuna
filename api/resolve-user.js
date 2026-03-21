// fortuna-silk.vercel.app/api/resolve-user
// 이메일로 유저 조회 또는 신규 생성 (서비스 키 사용, RLS 우회)

import { randomUUID } from 'crypto';

const SB_URL = 'https://ymghmfkqctckxxysxkvy.supabase.co';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'DELETE') {
    const { user_id } = req.body || {};
    const SB_KEY2 = process.env.SB_SERVICE_KEY;
    await fetch(SB_URL + '/rest/v1/chat_messages?user_id=eq.' + user_id, {
      method: 'DELETE',
      headers: { 'apikey': SB_KEY2, 'Authorization': 'Bearer ' + SB_KEY2 }
    });
    await fetch(SB_URL + '/rest/v1/chat_users?id=eq.' + user_id, {
      method: 'DELETE',
      headers: { 'apikey': SB_KEY2, 'Authorization': 'Bearer ' + SB_KEY2 }
    });
    return res.json({ ok: true });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, name } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });

  const SB_KEY = process.env.SB_SERVICE_KEY;
  if (!SB_KEY) return res.status(500).json({ error: 'Server config error' });

  try {
    // 1. 이메일로 기존 유저 조회
    const resp = await fetch(
      `${SB_URL}/rest/v1/chat_users?email=eq.${encodeURIComponent(email)}&select=*&limit=1`,
      { headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` } }
    );
    const data = await resp.json();
    const existing = Array.isArray(data) && data[0];
    if (existing) return res.status(200).json(existing);

    // 2. 없으면 새 레코드 생성
    const newId = randomUUID();
    const insertResp = await fetch(`${SB_URL}/rest/v1/chat_users`, {
      method: 'POST',
      headers: {
        'apikey': SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ id: newId, email, name: name || '포르투나 회원' })
    });
    const inserted = await insertResp.json();
    const newProfile = Array.isArray(inserted) ? inserted[0] : inserted;
    return res.status(200).json(newProfile || { id: newId, email, name: name || '포르투나 회원' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
