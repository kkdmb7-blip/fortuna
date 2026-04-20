// fortuna-silk.vercel.app/api/pet-advice
// 용신 다마고치 - 오늘 일진 + 용신 + 프로필 기반 맞춤 조언 (Orb 소모 없음)

const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { yongsin, element, day_pillar, profile } = req.body || {};
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'missing key' });

  const elemLabel = { wood:'목(木)', fire:'화(火)', earth:'토(土)', metal:'금(金)', water:'수(水)' };
  const elemName = elemLabel[element] || element || '미정';

  const profileDesc = profile
    ? `${profile.year || '?'}년 ${profile.month || '?'}월 ${profile.day || '?'}일생, ${profile.gender === 'M' ? '남성' : '여성'}`
    : '프로필 미설정';

  const prompt = `
사용자 정보:
- 생년월일: ${profileDesc}
- 용신: ${yongsin || elemName}
- 오늘 일주(일진): ${day_pillar || '미상'}

위 정보를 바탕으로 오늘 하루 맞춤 운세 조언을 작성해주세요.

규칙:
- 용신 오행과 오늘 일진 천간의 오행 관계(상생/상극/동일)를 반드시 반영
- 실생활에 바로 쓸 수 있는 구체적 조언 포함 (색상, 방향, 행동, 주의사항 등)
- 따뜻하고 격려하는 톤
- 3문장 이내, 150자 이내
- JSON으로만 답하세요: { "advice": "조언 내용", "keyword": "오늘의 키워드 한 단어", "lucky": "행운 아이템/색상/방향" }
`.trim();

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
        max_tokens: 400,
        system: '당신은 사주명리학 용신 전문가입니다. 반드시 순수 JSON만 출력하세요. 마크다운 없음.',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await resp.json();
    const text = data?.content?.[0]?.text || '{}';
    let parsed;
    try { parsed = JSON.parse(text); } catch(e) { parsed = { advice: text, keyword: '용신', lucky: '' }; }
    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
