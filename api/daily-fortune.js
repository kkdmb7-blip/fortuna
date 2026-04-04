// fortuna-silk.vercel.app/api/daily-fortune.js
// 일일 운세 전용 Claude 호출 (쿼터 소모 없음)

const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
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
        max_tokens: 600,
        system: '당신은 사주명리학과 서양 점성술 전문가입니다. 반드시 요청된 JSON 형식으로만 답하세요. keyword 필드는 절대 비워두지 마세요. 마크다운 없이 순수 JSON만 출력하세요.',
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
