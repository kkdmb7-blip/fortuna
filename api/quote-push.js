// fortuna-silk.vercel.app/api/quote-push.js
// Worker 크론에서 호출: 피코랩 사용자에게 사주 맞춤 명언 발송 (매일 오전 8시 KST)
// 환경변수: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL, SB_SERVICE_KEY, CRON_SECRET, ANTHROPIC_API_KEY

import webpush from 'web-push';

const SB_URL = 'https://ymghmfkqctckxxysxkvy.supabase.co';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 인증
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'];
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // 요청 바디: { users: [{user_id, name, ilgan, geokguk, yongshin}] }
  const { users } = req.body || {};
  if (!Array.isArray(users) || users.length === 0) {
    return res.status(400).json({ error: 'users 배열 필요' });
  }

  const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY;
  const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
  const VAPID_EMAIL       = process.env.VAPID_EMAIL || 'mailto:kkdmb@naver.com';
  const SB_KEY            = process.env.SB_SERVICE_KEY;
  const ANTHROPIC_KEY     = process.env.ANTHROPIC_API_KEY;

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !SB_KEY || !ANTHROPIC_KEY) {
    return res.status(500).json({ error: 'Missing env vars' });
  }

  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  // push_subscriptions 조회 (pico_push_subscriptions 테이블)
  const userIds = users.map(u => u.user_id).filter(Boolean);
  let subMap = {};
  try {
    const sbRes = await fetch(
      `${SB_URL}/rest/v1/pico_push_subscriptions?user_id=in.(${userIds.join(',')})&select=user_id,subscription`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    const subs = await sbRes.json();
    if (Array.isArray(subs)) {
      subs.forEach(s => { if (s.user_id) subMap[s.user_id] = s.subscription; });
    }
  } catch (e) {
    return res.status(500).json({ error: 'Supabase 조회 실패', detail: e.message });
  }

  // 일간별 명언 캐시 (동일 일간 유저는 같은 명언 사용, API 절약)
  const quoteCache = {};

  async function getQuote(ilgan, geokguk, yongshin, name) {
    const key = ilgan || 'default';
    if (quoteCache[key]) return quoteCache[key];

    const ilganDesc = {
      '갑': '갑목(甲木) — 하늘을 향해 곧게 뻗는 큰 나무. 리더십과 도전 정신.',
      '을': '을목(乙木) — 유연하게 굽는 풀과 덩굴. 적응력과 끈기.',
      '병': '병화(丙火) — 태양처럼 밝고 뜨거운 불. 열정과 표현력.',
      '정': '정화(丁火) — 촛불처럼 은은하고 집중된 빛. 직관과 섬세함.',
      '무': '무토(戊土) — 광활한 대지. 묵직한 신뢰와 포용력.',
      '기': '기토(己土) — 비옥한 밭. 현실감각과 세심한 배려.',
      '경': '경금(庚金) — 단단한 원석. 강인한 의지와 정의감.',
      '신': '신금(辛金) — 날카로운 보석. 예리함과 완벽주의.',
      '임': '임수(壬水) — 큰 강과 바다. 지혜와 포용, 흐르는 유연성.',
      '계': '계수(癸水) — 이슬과 빗물. 섬세한 감수성과 직관력.'
    }[ilgan] || '오늘 하루의 기운';

    const prompt = `당신은 사주 기반 동기부여 명언을 작성하는 전문가입니다.

일간: ${ilganDesc}
격국: ${geokguk || '정격'}
용신: ${yongshin || '미상'}

이 사주의 기질과 특성에 맞는 오늘의 명언 1개를 작성해주세요.
조건:
- 동서양 고전이나 철학적 지혜를 사주 기질에 연결해서 재해석
- 70자 이내의 간결한 문장
- 이름 없이 보편적으로 적용 가능한 내용
- 마지막에 출처(인물명 또는 고전명) 추가 — 예: — 공자, — 마르쿠스 아우렐리우스
- JSON으로만 반환: {"quote": "...", "source": "..."}`;

    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const d = await r.json();
      const raw = d?.content?.[0]?.text?.trim() || '';
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        quoteCache[key] = parsed;
        return parsed;
      }
    } catch (e) {}

    // 폴백
    const fallback = { quote: '오늘 하루도 자신의 기질을 믿고 나아가세요.', source: '피코랩' };
    quoteCache[key] = fallback;
    return fallback;
  }

  const results = { sent: 0, failed: 0, skipped: 0, expired: [] };

  await Promise.allSettled(
    users.map(async (u) => {
      const sub = subMap[u.user_id];
      if (!sub) { results.skipped++; return; }

      const parsedSub = typeof sub === 'string' ? JSON.parse(sub) : sub;
      const { quote, source } = await getQuote(u.ilgan, u.geokguk, u.yongshin, u.name);
      const name = u.name || '';

      const payload = JSON.stringify({
        title: '🔮 오늘의 명언',
        body: name
          ? `${name}님을 위한 오늘의 명언\n"${quote}" — ${source}`
          : `"${quote}" — ${source}`,
        url: 'https://picolab.kr'
      });

      try {
        await webpush.sendNotification(parsedSub, payload);
        results.sent++;
      } catch (e) {
        results.failed++;
        if (e.statusCode === 410 || e.statusCode === 404) {
          results.expired.push(u.user_id);
          await fetch(
            `${SB_URL}/rest/v1/pico_push_subscriptions?user_id=eq.${u.user_id}`,
            { method: 'DELETE', headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
          ).catch(() => {});
        }
      }
    })
  );

  return res.status(200).json({ ok: true, total: users.length, ...results });
}
