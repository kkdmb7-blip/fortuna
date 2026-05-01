// fortuna-silk.vercel.app/api/resolve-user
// 이메일로 유저 조회 또는 신규 생성 (서비스 키 사용, RLS 우회)

import { randomUUID } from 'crypto';

const SB_URL = 'https://ymghmfkqctckxxysxkvy.supabase.co';

const _CORS_ALLOWED = ['https://picolab.kr','https://www.picolab.kr','https://kkdmb7-blip.github.io','https://fortuna-silk.vercel.app'];
export default async function handler(req, res) {
  const _origin = req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', _CORS_ALLOWED.includes(_origin) ? _origin : _CORS_ALLOWED[0]);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'DELETE') {
    const { user_id } = req.body || {};
    const SB_KEY2 = process.env.SB_SERVICE_KEY;
    // 대화 내역만 삭제 (chat_users 행은 절대 삭제하지 않음 — ID 안정성 보장)
    await fetch(SB_URL + '/rest/v1/chat_messages?user_id=eq.' + user_id, {
      method: 'DELETE',
      headers: { 'apikey': SB_KEY2, 'Authorization': 'Bearer ' + SB_KEY2 }
    });
    return res.json({ ok: true });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, name, kakao_id } = req.body || {};
  if (!email && !kakao_id) return res.status(400).json({ error: 'email or kakao_id required' });

  const SB_KEY = process.env.SB_SERVICE_KEY;
  if (!SB_KEY) return res.status(500).json({ error: 'Server config error' });

  const headers = { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` };

  try {
    // 1. kakao_id로 먼저 조회 (가장 안정적인 식별자)
    if (kakao_id) {
      const r1 = await fetch(
        `${SB_URL}/rest/v1/chat_users?kakao_id=eq.${encodeURIComponent(String(kakao_id))}&select=*&limit=1`,
        { headers }
      );
      const d1 = await r1.json();
      const byKakao = Array.isArray(d1) && d1[0];
      if (byKakao) {
        // kakao_id로 찾음 — 이메일 불일치 시 업데이트
        if (email && byKakao.email !== email) {
          await fetch(`${SB_URL}/rest/v1/chat_users?id=eq.${byKakao.id}`, {
            method: 'PATCH',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
          });
        }
        return res.status(200).json(byKakao);
      }
    }

    // 2. 이메일로 조회
    if (email) {
      const r2 = await fetch(
        `${SB_URL}/rest/v1/chat_users?email=eq.${encodeURIComponent(email)}&select=*&limit=1`,
        { headers }
      );
      const d2 = await r2.json();
      const byEmail = Array.isArray(d2) && d2[0];
      if (byEmail) {
        // 이메일로 찾음 — kakao_id가 있으면 업데이트 (향후 조회 안정화)
        if (kakao_id && !byEmail.kakao_id) {
          await fetch(`${SB_URL}/rest/v1/chat_users?id=eq.${byEmail.id}`, {
            method: 'PATCH',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ kakao_id: String(kakao_id) })
          });
        }
        return res.status(200).json(byEmail);
      }
    }

    // 3. 없으면 새 레코드 생성
    const newId = randomUUID();
    const newRecord = { id: newId, email: email || null, name: name || '포르투나 회원' };
    if (kakao_id) newRecord.kakao_id = String(kakao_id);

    const insertResp = await fetch(`${SB_URL}/rest/v1/chat_users`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify(newRecord)
    });
    const inserted = await insertResp.json();

    // INSERT 실패(중복 충돌) 시 다시 SELECT
    if (!insertResp.ok || (Array.isArray(inserted) && inserted.length === 0)) {
      if (kakao_id) {
        const r3 = await fetch(
          `${SB_URL}/rest/v1/chat_users?kakao_id=eq.${encodeURIComponent(String(kakao_id))}&select=*&limit=1`,
          { headers }
        );
        const d3 = await r3.json();
        if (Array.isArray(d3) && d3[0]) return res.status(200).json(d3[0]);
      }
      if (email) {
        const r4 = await fetch(
          `${SB_URL}/rest/v1/chat_users?email=eq.${encodeURIComponent(email)}&select=*&limit=1`,
          { headers }
        );
        const d4 = await r4.json();
        if (Array.isArray(d4) && d4[0]) return res.status(200).json(d4[0]);
      }
    }

    const newProfile = Array.isArray(inserted) ? inserted[0] : inserted;
    const finalId = (newProfile && newProfile.id) || newId;

    // 신규가입 보너스 500 Orb (balance/free/paid 동시)
    let bonusGranted = false;
    try {
      const obResp = await fetch(`${SB_URL}/rest/v1/orb_balance`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', 'Prefer': 'return=minimal,resolution=ignore-duplicates' },
        body: JSON.stringify({ user_id: finalId, balance: 500, free_balance: 500, paid_balance: 0 })
      });
      if (obResp.ok) {
        bonusGranted = true;
        await fetch(`${SB_URL}/rest/v1/orb_transactions`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify({ user_id: finalId, type: 'bonus', amount: 500, description: '신규가입 축하 보너스', balance_after: 500, created_at: new Date().toISOString() })
        });
      }
    } catch(e) {}

    const responseProfile = newProfile || newRecord;
    if (bonusGranted) responseProfile.signup_bonus = 500;
    return res.status(200).json(responseProfile);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
