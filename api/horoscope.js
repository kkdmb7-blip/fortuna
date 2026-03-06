export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body = await req.json();
    const { signName, moonSign, todayStr, category } = body;

    const catNames = { overall: '전체운', love: '애정운', money: '금전운', health: '건강운' };
    const catGuides = {
      overall: '오늘 하루 전반적인 흐름, 주의할 점, 좋은 시간대',
      love: '연애 중이거나 관계를 원하는 사람에게 오늘 애정운 흐름',
      money: '오늘 금전 흐름, 지출 주의점, 기회가 있는 시간',
      health: '오늘 컨디션, 몸이나 마음에서 주의할 부분',
    };

    const prompt = `오늘은 ${todayStr}입니다.
태양자리: ${signName}
달자리: ${moonSign}

위 정보를 바탕으로 오늘의 ${catNames[category]}를 작성해주세요.
주제: ${catGuides[category]}

작성 규칙:
- 3~5문장으로 작성
- 질문형 또는 공감형 첫 문장으로 시작 (예: "오늘은 ~한 느낌이 드시지 않나요?")
- 구체적인 상황이나 행동 조언 포함
- 따뜻하고 현실적인 톤
- 마크다운 기호(#, *, -, **) 절대 사용 금지
- 첫 줄에 별점 숫자(1~5)만 단독으로 작성
- 둘째 줄부터 운세 내용 작성`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await claudeRes.json();
    const raw = data.content?.[0]?.text || '';
    const lines = raw.trim().split('\n').filter(l => l.trim());
    const stars = parseInt(lines[0]) || 3;
    const text = lines.slice(1).join('\n').trim();

    return new Response(JSON.stringify({ stars, text }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
