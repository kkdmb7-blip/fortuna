// fortuna-silk.vercel.app/api/push-seed
// 푸시 클릭으로 들어온 memox 페이지가 호출:
//   GET  ?id=<log_id>&user_id=<uid>  → 메시지 반환 + opened_at 기록
//   POST { id, user_id, action: 'dismissed' } → dismissed_at 기록 (옵션)

const SB_URL = 'https://ymghmfkqctckxxysxkvy.supabase.co';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SB_KEY = process.env.SB_SERVICE_KEY;
  if (!SB_KEY) return res.status(500).json({ error: 'no service key' });
  const headers = { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };

  if (req.method === 'GET') {
    const id = req.query.id;
    const user_id = req.query.user_id;
    if (!id) return res.status(400).json({ error: 'id required' });
    try {
      const r = await fetch(
        `${SB_URL}/rest/v1/push_logs?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
        { headers }
      );
      const rows = await r.json();
      const row = Array.isArray(rows) && rows[0];
      if (!row) return res.status(404).json({ error: 'not found' });
      // user_id 일치 검증 (다른 유저 링크 열람 차단)
      if (user_id && row.user_id !== user_id) {
        return res.status(403).json({ error: 'forbidden' });
      }
      // opened_at 최초 기록
      if (!row.opened_at) {
        await fetch(
          `${SB_URL}/rest/v1/push_logs?id=eq.${encodeURIComponent(id)}`,
          { method: 'PATCH', headers, body: JSON.stringify({ opened_at: new Date().toISOString() }) }
        ).catch(() => {});
      }
      return res.status(200).json({ ok: true, row });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    const { id, action } = req.body || {};
    if (!id || !action) return res.status(400).json({ error: 'id and action required' });
    const field = action === 'dismissed' ? 'dismissed_at' : null;
    if (!field) return res.status(400).json({ error: 'invalid action' });
    try {
      await fetch(
        `${SB_URL}/rest/v1/push_logs?id=eq.${encodeURIComponent(id)}`,
        { method: 'PATCH', headers, body: JSON.stringify({ [field]: new Date().toISOString() }) }
      );
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'method not allowed' });
}
