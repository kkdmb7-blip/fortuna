// fortuna-silk.vercel.app/api/daily-fortune.js
// 일일 운세 전용 Claude 호출 (쿼터 소모 없음) + daily_fortune 캐시 조회/저장
// (Vercel Hobby 플랜 서버리스 함수 12개 제한 때문에 캐시용 별도 파일을 안 만들고 이 파일에 합침)
import { createClient } from '@supabase/supabase-js';

const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
const sb = createClient(process.env.SUPABASE_URL, process.env.SB_SERVICE_KEY);

const _CORS_ALLOWED = ['https://picolab.kr','https://www.picolab.kr','https://kkdmb7-blip.github.io','https://fortuna-silk.vercel.app'];
export default async function handler(req, res) {
  const _origin = req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', _CORS_ALLOWED.includes(_origin) ? _origin : _CORS_ALLOWED[0]);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // daily_fortune은 RLS(user_id=auth.uid()) 정책인데 클라이언트는 Supabase Auth 세션이 없어서
  // anon 키 직접 select/upsert가 항상 막힘 → 서비스키로 여기서 대신 조회/저장
  if (req.method === 'GET' && req.query.action === 'cache-get') {
    const uid = req.query.user_id;
    const date = req.query.date;
    if (!uid || !date) return res.status(400).json({ error: 'user_id, date required' });
    const { data, error } = await sb.from('daily_fortune').select('*').eq('user_id', uid).eq('date', date).maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ row: data || null });
  }

  if (req.method === 'POST' && req.body && req.body.action === 'cache-save') {
    const { user_id, date, keyword, summary, content, caution, recommendation } = req.body;
    if (!user_id || !date || !keyword) return res.status(400).json({ error: 'user_id, date, keyword required' });
    const { error } = await sb.from('daily_fortune')
      .upsert({ user_id, date, keyword, summary, content, caution, recommendation }, { onConflict: 'user_id,date' });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  if (req.method !== 'POST') return res.status(405).end();

  const { prompt } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'missing prompt' });
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'missing key' });

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system: '당신은 사주명리학과 서양 점성술 전문가입니다. 반드시 요청된 JSON 형식으로만 답하세요. keyword 필드는 절대 비워두지 마세요. 각 필드는 요청된 글자수 제한을 반드시 지켜 간결하게 쓰세요(제한 초과 금지). 마크다운 코드블록 없이 순수 JSON 객체 하나만 출력하세요.',
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return res.status(502).json({ error: err.error?.message || 'Claude error' });
    }
    const data = await resp.json();
    const reply = data.content?.[0]?.text || '';
    return res.json({ reply });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
