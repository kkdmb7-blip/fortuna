// fortuna-silk.vercel.app/api/diary-feedback.js
// 사주일기 AI 피드백 생성 (Claude Haiku)
// Input: { ilgan, tomorrow_ilgan, mood, events[], memo }
// Output: { feedback }

const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;

const MOOD_LABEL = {
  good:      '좋았어',
  normal:    '평범했어',
  bad:       '힘들었어',
  energetic: '에너지 넘쳤어',
  tired:     '지쳤어',
};

const ILGAN_DESC = {
  갑: '갑목(甲木) — 새싹처럼 뻗어나가는 기운',
  을: '을목(乙木) — 유연하게 굽히며 성장하는 기운',
  병: '병화(丙火) — 태양처럼 밝고 뜨거운 기운',
  정: '정화(丁火) — 촛불처럼 따뜻하고 섬세한 기운',
  무: '무토(戊土) — 산처럼 묵직하고 안정된 기운',
  기: '기토(己土) — 논밭처럼 포용하고 기르는 기운',
  경: '경금(庚金) — 칼날처럼 예리하고 단호한 기운',
  신: '신금(辛金) — 보석처럼 정밀하고 집중하는 기운',
  임: '임수(壬水) — 강처럼 넓고 깊은 지혜의 기운',
  계: '계수(癸水) — 이슬처럼 섬세하고 직관적인 기운',
};

const _CORS_ALLOWED = ['https://picolab.kr','https://www.picolab.kr','https://kkdmb7-blip.github.io','https://fortuna-silk.vercel.app'];
export default async function handler(req, res) {
  const _origin = req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', _CORS_ALLOWED.includes(_origin) ? _origin : _CORS_ALLOWED[0]);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'Missing ANTHROPIC_KEY' });

  const { ilgan, tomorrow_ilgan, mood, events, memo } = req.body || {};
  if (!ilgan || !mood) return res.status(400).json({ error: 'ilgan, mood 필요' });

  const moodLabel   = MOOD_LABEL[mood] || mood;
  const eventsStr   = Array.isArray(events) && events.length > 0 ? events.join(', ') : '특별한 일 없음';
  const ilganDesc   = ILGAN_DESC[ilgan]         || ilgan + '일';
  const tomorrowDesc = ILGAN_DESC[tomorrow_ilgan] || tomorrow_ilgan + '일';

  const prompt = `오늘은 ${ilganDesc}이야.
사용자 기분: ${moodLabel}
있었던 일: ${eventsStr}${memo ? '\n메모: ' + memo : ''}

오늘 일진 기운의 특성과 실제 하루를 자연스럽게 연결해서 2~3문장으로 따뜻하게 코멘트해줘.
내일은 ${tomorrowDesc}인데, 내일 기운을 한 줄로 짧게 언급해줘.
반말로, 친근하고 따뜻하게. 100자 이내로.`;

  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!aiRes.ok) {
      const err = await aiRes.text();
      return res.status(500).json({ error: 'AI 오류', detail: err });
    }

    const data     = await aiRes.json();
    const feedback = data.content?.[0]?.text || '';
    return res.json({ feedback });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
