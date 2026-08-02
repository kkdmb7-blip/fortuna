// fortuna-silk.vercel.app/api/daily-fortune-cache.js
// daily_fortune 테이블 조회/저장 전용 (서비스키로 RLS 우회 — 클라이언트는 Supabase Auth 세션이 없어
// user_id = auth.uid() 정책의 anon 키 직접 접근이 항상 막힘)
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SB_SERVICE_KEY);

const _CORS_ALLOWED = ['https://picolab.kr','https://www.picolab.kr','https://kkdmb7-blip.github.io','https://fortuna-silk.vercel.app'];
export default async function handler(req, res) {
  const _origin = req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', _CORS_ALLOWED.includes(_origin) ? _origin : _CORS_ALLOWED[0]);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const uid = req.query.user_id;
    const date = req.query.date;
    if (!uid || !date) return res.status(400).json({ error: 'user_id, date required' });
    const { data, error } = await sb.from('daily_fortune').select('*').eq('user_id', uid).eq('date', date).maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ row: data || null });
  }

  if (req.method === 'POST') {
    const { user_id, date, keyword, summary, content, caution, recommendation } = req.body || {};
    if (!user_id || !date || !keyword) return res.status(400).json({ error: 'user_id, date, keyword required' });
    const { error } = await sb.from('daily_fortune')
      .upsert({ user_id, date, keyword, summary, content, caution, recommendation }, { onConflict: 'user_id,date' });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  res.status(405).end();
}
