// fortuna-silk.vercel.app/api/chat.js
// Vercel Serverless Function - Claude Haiku 채팅 중계 + RAG (지식DB + 규칙DB)

const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
const OPENAI_KEY    = process.env.OPENAI_API_KEY;
const SB_URL        = 'https://ymghmfkqctckxxysxkvy.supabase.co';
const FREE_DAILY    = 999; // 이니시스 연동 후 3으로 변경

// ─────────────────────────────────────────────────────────────
// 카테고리 감지
// ─────────────────────────────────────────────────────────────
function detectCategory(text) {
  const t = text || '';
  if (/재회|연락|속마음|좋아하|연애|결혼|이별|사귀|헤어|남자친구|여자친구|썸|고백|궁합|짝사랑|바람|이혼|첫사랑/.test(t))
    return 'love_reunion_marriage';
  if (/돈|재물|월급|투자|주식|코인|사업|창업|이직|취업|합격|승진|부동산|직장|직업|부업/.test(t))
    return 'wealth_career_business';
  if (/가족|부모|자녀|아이|건강|병|수술|임신|업보|카르마|전생|조상|형제|시댁|처가/.test(t))
    return 'family_health_karma';
  return 'self_life_flow';
}

// ─────────────────────────────────────────────────────────────
// 키워드 추출
// ─────────────────────────────────────────────────────────────
function extractKeywords(text) {
  const map = {
    '재회': ['재회', '다시', '복합'],
    '연락': ['연락'],
    '속마음': ['속마음', '마음', '좋아'],
    '결혼': ['결혼', '혼인'],
    '이별': ['이별', '헤어'],
    '투자': ['투자', '주식', '코인'],
    '사업': ['사업', '창업'],
    '이직': ['이직', '퇴사'],
    '합격': ['합격', '취업', '시험'],
    '건강': ['건강', '수술', '병']
  };
  const found = [];
  for (const [kw, aliases] of Object.entries(map)) {
    if (aliases.some(a => text.includes(a))) found.push(kw);
  }
  return found;
}

// ─────────────────────────────────────────────────────────────
// ① 임베딩 생성
// ─────────────────────────────────────────────────────────────
async function getEmbedding(text) {
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`
      },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: text })
    });
    const data = await res.json();
    return data.data?.[0]?.embedding || null;
  } catch (e) {
    console.warn('임베딩 실패:', e.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// ② 지식 문서 검색 (pgvector)
// ─────────────────────────────────────────────────────────────
async function searchKnowledge(query, sbKey) {
  try {
    const embedding = await getEmbedding(query);
    if (!embedding) return [];

    const res = await fetch(`${SB_URL}/rest/v1/rpc/match_knowledge`, {
      method: 'POST',
      headers: {
        'apikey': sbKey,
        'Authorization': `Bearer ${sbKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query_embedding: embedding,
        match_threshold: 0.30,
        match_count: 3
      })
    });
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn('지식 검색 실패 (건너뜀):', e.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// ③ 사주 규칙 검색
// ─────────────────────────────────────────────────────────────
async function searchBaziRules(category, query, sbKey) {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/bazi_rules?category=eq.${category}&db_recommended=eq.Y&importance=gte.3&order=importance.desc&limit=6`,
      { headers: { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}` } }
    );
    const data = await res.json();
    if (!Array.isArray(data)) return [];

    const keywords = extractKeywords(query);
    const scored = data.map(r => ({
      ...r,
      score: keywords.some(kw =>
        (r.concept || '').includes(kw) ||
        (r.subfield || '').includes(kw)
      ) ? 1 : 0
    }));
    scored.sort((a, b) => b.score - a.score || b.importance - a.importance);
    return scored.slice(0, 4);
  } catch (e) {
    console.warn('사주 규칙 검색 실패 (건너뜀):', e.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// ④ 점성 규칙 검색
// ─────────────────────────────────────────────────────────────
async function searchAstrologyRules(category, query, sbKey) {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/astrology_rules?category=eq.${category}&db_recommended=eq.Y&importance=gte.3&order=importance.desc&limit=5`,
      { headers: { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}` } }
    );
    const data = await res.json();
    if (!Array.isArray(data)) return [];

    const keywords = extractKeywords(query);
    const scored = data.map(r => ({
      ...r,
      score: keywords.some(kw =>
        (r.concept || '').includes(kw) ||
        (r.subfield || '').includes(kw)
      ) ? 1 : 0
    }));
    scored.sort((a, b) => b.score - a.score || b.importance - a.importance);
    return scored.slice(0, 3);
  } catch (e) {
    console.warn('점성 규칙 검색 실패 (건너뜀):', e.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// ⑤ 프롬프트 블록 생성
// ─────────────────────────────────────────────────────────────
function buildKnowledgeBlock(docs) {
  if (!docs || docs.length === 0) return '';
  const lines = docs.map((d, i) =>
    `[참고지식 ${i + 1}] ${d.title}\n${d.content}`
  ).join('\n\n---\n\n');
  return `\n\n【포르투나 전문 지식 DB】\n아래 지식을 내담자 사주·점성 데이터와 연결하여 개인화된 답변을 줘라.\n\n${lines}\n\n【지식 DB 끝】\n`;
}

function buildRulesBlock(baziRules, astroRules) {
  if (baziRules.length === 0 && astroRules.length === 0) return '';
  let block = '\n\n【사주·점성 해석 규칙 DB】\n아래 규칙을 내담자 실제 데이터에 적용하여 해석하라. 조건이 맞을 때만 언급하라.\n\n';
  if (baziRules.length > 0) {
    block += '▶ 사주 규칙\n';
    baziRules.forEach((r, i) => {
      block += `[사주${i + 1}] ${r.subfield || ''} — ${r.concept}\n조건: ${r.condition}\n해석: ${r.interpretation}\n`;
      if (r.exception) block += `주의: ${r.exception}\n`;
      block += '\n';
    });
  }
  if (astroRules.length > 0) {
    block += '▶ 점성 규칙\n';
    astroRules.forEach((r, i) => {
      block += `[점성${i + 1}] ${r.subfield || ''} — ${r.concept}\n조건: ${r.condition}\n해석: ${r.interpretation}\n`;
      if (r.exception) block += `주의: ${r.exception}\n`;
      block += '\n';
    });
  }
  block += '【규칙 DB 끝】\n';
  return block;
}

// ─────────────────────────────────────────────────────────────
// 메인 핸들러
// ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { user_id, messages, system_prompt, sb_key } = req.body;
  if (!user_id || !messages) return res.status(400).json({ error: 'missing params' });

  const SB_KEY = sb_key || process.env.SB_SERVICE_KEY;

  try {
    // ── 카운트 체크 ──────────────────────────────────────────
    const userRes = await fetch(
      `${SB_URL}/rest/v1/chat_users?id=eq.${user_id}&select=daily_count,daily_reset_at,paid_count`,
      { headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` } }
    );
    const users = await userRes.json();
    const user  = users && users[0];
    if (!user) return res.status(404).json({ error: 'user not found' });

    const kstNow  = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const todayKST = kstNow.toISOString().slice(0, 10);
    let dailyCount = user.daily_count || 0;
    let paidCount  = user.paid_count  || 0;
    if ((user.daily_reset_at || '') !== todayKST) dailyCount = 0;

    const freeLeft = Math.max(0, FREE_DAILY - dailyCount);
    const canUse   = freeLeft > 0 || paidCount > 0;
    if (!canUse) return res.status(429).json({ error: 'limit_exceeded', free_left: 0, paid_left: paidCount });

    // ── RAG: 지식 + 규칙 검색 ────────────────────────────────
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const queryText   = lastUserMsg ? lastUserMsg.content : '';
    const category    = detectCategory(queryText);

    const [knowledgeDocs, baziRules, astroRules] = await Promise.all([
      searchKnowledge(queryText, SB_KEY),
      searchBaziRules(category, queryText, SB_KEY),
      searchAstrologyRules(category, queryText, SB_KEY)
    ]);

    // ── 프롬프트 주입 ─────────────────────────────────────────
    let enrichedPrompt = system_prompt || '';
    const injection = buildRulesBlock(baziRules, astroRules) + buildKnowledgeBlock(knowledgeDocs);
    if (injection) {
      const insertPoint = enrichedPrompt.indexOf('【추가 지침】');
      enrichedPrompt = insertPoint !== -1
        ? enrichedPrompt.slice(0, insertPoint) + injection + enrichedPrompt.slice(insertPoint)
        : enrichedPrompt + injection;
    }

    console.log(`🔍 ${category} | 지식:${knowledgeDocs.length} 사주:${baziRules.length} 점성:${astroRules.length}`);

    // ── Claude Haiku 호출 ─────────────────────────────────────
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: enrichedPrompt,
        messages: messages,
      })
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      console.error('[claude error]', claudeRes.status, err);
      return res.status(500).json({ error: 'claude_error', detail: err });
    }

    const claudeData = await claudeRes.json();
    const reply = claudeData.content?.[0]?.text || '';

    // ── 카운트 업데이트 ───────────────────────────────────────
    const newDailyCount = freeLeft > 0 ? dailyCount + 1 : dailyCount;
    const newPaidCount  = freeLeft > 0 ? paidCount : paidCount - 1;
    await fetch(`${SB_URL}/rest/v1/chat_users?id=eq.${user_id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        daily_count: newDailyCount,
        daily_reset_at: todayKST,
        paid_count: newPaidCount,
        updated_at: Date.now()
      })
    });

    return res.status(200).json({
      reply,
      free_left: Math.max(0, FREE_DAILY - newDailyCount),
      paid_left: newPaidCount
    });

  } catch (e) {
    console.error('[chat error]', e);
    return res.status(500).json({ error: 'server_error', detail: e.message });
  }
}
