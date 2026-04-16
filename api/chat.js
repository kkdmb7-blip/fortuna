// fortuna-silk.vercel.app/api/chat.js
// Vercel Serverless Function - Claude Haiku 채팅 중계 + RAG (지식DB + 규칙DB)

const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
const OPENAI_KEY    = process.env.OPENAI_API_KEY;
const SB_URL        = 'https://ymghmfkqctckxxysxkvy.supabase.co';
const FREE_DAILY    = parseInt(process.env.FREE_DAILY || '3', 10);

// ─────────────────────────────────────────────────────────────
// 카테고리 감지 → 한국어 도메인명으로 변경
// ─────────────────────────────────────────────────────────────
/* RAG 비활성화 - memox 프롬프트만 적용
function detectDomain(text) {
  const t = text || '';
  if (/재회|연락|속마음|좋아하|썸|고백|짝사랑|첫사랑|바람/.test(t)) return '연애';
  if (/결혼|혼인|배우자|신랑|신부|웨딩/.test(t)) return '결혼';
  if (/이별|헤어|이혼|별거/.test(t)) return '이별';
  if (/남자친구|여자친구|사귀|궁합|연애/.test(t)) return '연애';
  if (/돈|재물|월급|투자|주식|코인|부동산|재테크/.test(t)) return '재물';
  if (/사업|창업|가게|법인/.test(t)) return '재물';
  if (/이직|취업|합격|승진|직장|직업|부업/.test(t)) return '직업';
  if (/가족|부모|자녀|아이|형제|시댁|처가/.test(t)) return '가족';
  if (/건강|병|수술|임신/.test(t)) return '건강';
  if (/언제|시기|시운|올해|내년|대운|세운/.test(t)) return '시기운세';
  return '연애'; // 기본값
}
*/

// ─────────────────────────────────────────────────────────────
// 키워드 추출
// ─────────────────────────────────────────────────────────────
/* RAG 비활성화
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
*/

// ─────────────────────────────────────────────────────────────
// ① 임베딩 생성
// ─────────────────────────────────────────────────────────────
/* RAG 비활성화
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
*/

// ─────────────────────────────────────────────────────────────
// ② 지식 문서 검색 (pgvector)
// ─────────────────────────────────────────────────────────────
/* RAG 비활성화
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
*/

// ─────────────────────────────────────────────────────────────
// ③ 사주 규칙 검색 (새 컬럼 기준)
// ─────────────────────────────────────────────────────────────
/* RAG 비활성화
async function searchBaziRules(domain, query, sbKey) {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/bazi_rules?domain=eq.${encodeURIComponent(domain)}&weight=gte.5&order=weight.desc&limit=6`,
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
    scored.sort((a, b) => b.score - a.score || b.weight - a.weight);
    return scored.slice(0, 4);
  } catch (e) {
    console.warn('사주 규칙 검색 실패 (건너뜀):', e.message);
    return [];
  }
}
*/

// ─────────────────────────────────────────────────────────────
// ④ 점성 규칙 검색 (새 컬럼 기준)
// ─────────────────────────────────────────────────────────────
/* RAG 비활성화
async function searchAstrologyRules(domain, query, sbKey) {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/astrology_rules?domain=eq.${encodeURIComponent(domain)}&weight=gte.5&order=weight.desc&limit=5`,
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
    scored.sort((a, b) => b.score - a.score || b.weight - a.weight);
    return scored.slice(0, 3);
  } catch (e) {
    console.warn('점성 규칙 검색 실패 (건너뜀):', e.message);
    return [];
  }
}
*/

// ─────────────────────────────────────────────────────────────
// ⑤ 도메인 가이드라인 조회 (신규)
// ─────────────────────────────────────────────────────────────
/* RAG 비활성화
async function getDomainGuideline(domain, sbKey) {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/domain_guidelines?domain=eq.${encodeURIComponent(domain)}&limit=1`,
      { headers: { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}` } }
    );
    const data = await res.json();
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  } catch (e) {
    console.warn('도메인 가이드라인 조회 실패 (건너뜀):', e.message);
    return null;
  }
}
*/

// ─────────────────────────────────────────────────────────────
// ⑥ 답변 스타일 조회 (신규)
// ─────────────────────────────────────────────────────────────
/* RAG 비활성화
async function getAnswerStyle(domain, sbKey) {
  const styleMap = {
    '연애': '연애공감형',
    '결혼': '기본상담형',
    '이별': '연애공감형',
    '재물': '재물분석형',
    '직업': '기본상담형',
    '건강': '건강주의형',
    '가족': '기본상담형',
    '시기운세': '시기분석형'
  };
  const styleName = styleMap[domain] || '기본상담형';
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/answer_style?style_name=eq.${encodeURIComponent(styleName)}&limit=1`,
      { headers: { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}` } }
    );
    const data = await res.json();
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  } catch (e) {
    console.warn('답변 스타일 조회 실패 (건너뜀):', e.message);
    return null;
  }
}
*/

// ─────────────────────────────────────────────────────────────
// ⑦ 충돌 예외 조회 (신규)
// ─────────────────────────────────────────────────────────────
/* RAG 비활성화
async function getRuleExceptions(baziRules, sbKey) {
  if (!baziRules || baziRules.length === 0) return [];
  try {
    const concepts = baziRules.map(r => r.concept).filter(Boolean);
    const exceptions = [];
    for (const concept of concepts) {
      const res = await fetch(
        `${SB_URL}/rest/v1/rule_exceptions?base_rule_id=eq.${encodeURIComponent(concept)}&limit=2`,
        { headers: { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}` } }
      );
      const data = await res.json();
      if (Array.isArray(data)) exceptions.push(...data);
    }
    return exceptions;
  } catch (e) {
    console.warn('충돌 예외 조회 실패 (건너뜀):', e.message);
    return [];
  }
}
*/

// ─────────────────────────────────────────────────────────────
// ⑧ 프롬프트 블록 생성
// ─────────────────────────────────────────────────────────────
/* RAG 비활성화
function buildGuidelineBlock(guideline, style) {
  if (!guideline && !style) return '';
  let block = '\n\n【해석 기준】\n';
  if (guideline) {
    block += `도메인: ${guideline.domain}\n`;
    if (guideline.priority_elements) block += `우선 확인 요소: ${guideline.priority_elements}\n`;
    if (guideline.interpretation_focus) block += `해석 포인트: ${guideline.interpretation_focus}\n`;
    if (guideline.forbidden_expressions) block += `금지 표현: ${guideline.forbidden_expressions}\n`;
    if (guideline.caution_note) block += `주의사항: ${guideline.caution_note}\n`;
  }
  if (style) {
    block += `\n답변 톤: ${style.tone}\n`;
    block += `답변 길이: ${style.length_guide}\n`;
    if (style.forbidden_words) block += `금지어: ${style.forbidden_words}\n`;
    if (style.required_ending) block += `마무리 문장 포함: ${style.required_ending}\n`;
  }
  block += '【해석 기준 끝】\n';
  return block;
}

function buildKnowledgeBlock(docs) {
  if (!docs || docs.length === 0) return '';
  const lines = docs.map((d, i) =>
    `[참고지식 ${i + 1}] ${d.title}\n${d.content}`
  ).join('\n\n---\n\n');
  return `\n\n【포르투나 전문 지식 DB】\n아래 지식을 내담자 사주·점성 데이터와 연결하여 개인화된 답변을 줘라.\n\n${lines}\n\n【지식 DB 끝】\n`;
}

function buildRulesBlock(baziRules, astroRules, exceptions) {
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

  if (exceptions && exceptions.length > 0) {
    block += '▶ 충돌 처리 (아래 조건 해당 시 우선 적용)\n';
    exceptions.forEach((e, i) => {
      block += `[충돌${i + 1}] ${e.base_rule_id} + ${e.conflict_rule_id}\n`;
      block += `조건: ${e.exception_condition}\n`;
      block += `수정 해석: ${e.adjusted_interpretation}\n\n`;
    });
  }

  block += '【규칙 DB 끝】\n';
  return block;
}
*/

// ─────────────────────────────────────────────────────────────
// 메인 핸들러
// ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const { user_id, messages, system_prompt, sb_key, mode } = body;
  if (!user_id || !messages) return res.status(400).json({ error: 'missing params' });

  const SB_KEY = sb_key || process.env.SB_SERVICE_KEY;

  try {
    // ── Orb 잔액 체크 ────────────────────────────────────────
    const skipOrb = body.skip_orb === true;
    const ORB_COST = skipOrb ? 0 : ((body.orb_override && Number(body.orb_override) > 0) ? Number(body.orb_override) : 20);
    let orbBalance = 0;

    if (!skipOrb) {
      const orbRes = await fetch(
        `${SB_URL}/rest/v1/orb_balance?user_id=eq.${user_id}&select=balance`,
        { headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` } }
      );
      const orbRows = await orbRes.json();
      const orbRow = orbRows && orbRows[0];

      if (!orbRow) {
        await fetch(`${SB_URL}/rest/v1/orb_balance`, {
          method: 'POST',
          headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify({ user_id, balance: 0, free_balance: 0, paid_balance: 0 })
        });
        orbBalance = 0;
      } else {
        orbBalance = orbRow.balance || 0;
      }

      if (orbBalance < ORB_COST) {
        return res.status(429).json({ error: 'orb_insufficient', orb_balance: orbBalance, orb_cost: ORB_COST });
      }
    }

    // ── RAG: 전체 조회 병렬 실행 (비활성화) ──────────────────
    // const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    // const queryText   = lastUserMsg ? lastUserMsg.content : '';
    // const domain      = detectDomain(queryText);
    //
    // const [knowledgeDocs, baziRules, astroRules, guideline, style] = await Promise.all([
    //   searchKnowledge(queryText, SB_KEY),
    //   searchBaziRules(domain, queryText, SB_KEY),
    //   searchAstrologyRules(domain, queryText, SB_KEY),
    //   getDomainGuideline(domain, SB_KEY),
    //   getAnswerStyle(domain, SB_KEY)
    // ]);
    //
    // // 예외는 bazi 결과 나온 후 조회
    // const exceptions = await getRuleExceptions(baziRules, SB_KEY);
    //
    // // ── 프롬프트 주입 ───────────────────────────────────────
    // let enrichedPrompt = system_prompt || '';
    // const injection =
    //   buildGuidelineBlock(guideline, style) +
    //   buildRulesBlock(baziRules, astroRules, exceptions) +
    //   buildKnowledgeBlock(knowledgeDocs);
    //
    // if (injection) {
    //   const insertPoint = enrichedPrompt.indexOf('【추가 지침】');
    //   enrichedPrompt = insertPoint !== -1
    //     ? enrichedPrompt.slice(0, insertPoint) + injection + enrichedPrompt.slice(insertPoint)
    //     : enrichedPrompt + injection;
    // }
    //
    // console.log(`🔍 도메인:${domain} | 지식:${knowledgeDocs.length} 사주:${baziRules.length} 점성:${astroRules.length} 예외:${exceptions.length}`);

    // ── Claude Haiku 호출 ─────────────────────────────────────
    const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const todayKST = kstNow.toISOString().slice(0, 10);
    const tomorrowKST = new Date(kstNow.getTime() + 86400000).toISOString().slice(0, 10);
    const modeInstructions = {
      saju: '사주팔자 관점에서만 해석하세요. 다른 시스템은 언급하지 마세요.',
      astro: '서양점성술 관점에서만 해석하세요. 다른 시스템은 언급하지 마세요.',
      ziwei: '자미두수 관점에서만 해석하세요. 다른 시스템은 언급하지 마세요.',
      vedic: '베딕점성술 관점에서만 해석하세요. 다른 시스템은 언급하지 마세요.',
    };
    const modeAppend = modeInstructions[mode] ? `\n\n${modeInstructions[mode]}` : '';

    // ── 룰셋 조회 비활성화 (토큰 절감) ──────────────────────
    const rulesBlock = '';

    // ── 대화 히스토리 최근 10개 제한 + 요약 처리 ─────────────
    const HISTORY_LIMIT = 10;
    let trimmedMessages = messages;
    if (Array.isArray(messages) && messages.length > HISTORY_LIMIT) {
      const older = messages.slice(0, messages.length - HISTORY_LIMIT);
      const recent = messages.slice(messages.length - HISTORY_LIMIT);
      const summaryLines = older
        .filter(m => m.role === 'user')
        .map(m => typeof m.content === 'string' ? m.content.slice(0, 80) : '')
        .filter(Boolean)
        .join(' / ');
      const summaryMsg = {
        role: 'user',
        content: `[이전 대화 요약 (${older.length}개)] ${summaryLines}`
      };
      const summaryAck = { role: 'assistant', content: '이전 대화 내용을 파악했습니다. 계속 진행하겠습니다.' };
      trimmedMessages = [summaryMsg, summaryAck, ...recent];
    }

    const enrichedSystem = (system_prompt || '')
      + `\n\n[시스템 자동 주입 - 현재 기준값]\n오늘: ${todayKST}\n내일: ${tomorrowKST} (향후 일진 표 첫 번째 줄)\n오늘 일진은 위 【절대 규칙】의 값을 사용, 표의 첫 줄과 혼동 금지`
      + modeAppend;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: (body.max_tokens && Number(body.max_tokens) > 0 && Number(body.max_tokens) <= 4000) ? Number(body.max_tokens) : 2000,
        system: enrichedSystem,
        messages: trimmedMessages,
      })
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      console.error('[claude error]', claudeRes.status, err);
      return res.status(500).json({ error: 'claude_error', detail: err });
    }

    const claudeData = await claudeRes.json();
    const reply = claudeData.content?.[0]?.text || '';

    // ── Orb 차감 ──
    let newOrbBalance = orbBalance;
    if (!skipOrb && ORB_COST > 0) {
      newOrbBalance = orbBalance - ORB_COST;
      await fetch(`${SB_URL}/rest/v1/orb_balance?user_id=eq.${user_id}`, {
        method: 'PATCH',
        headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ balance: newOrbBalance, updated_at: new Date().toISOString() })
      });
      await fetch(`${SB_URL}/rest/v1/orb_transactions`, {
        method: 'POST',
        headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ user_id, type: 'chat', amount: -ORB_COST, description: mode === 'gunghap' ? '궁합 정밀분석' : 'AI 채팅', balance_after: newOrbBalance, created_at: new Date().toISOString() })
      });
    }

    return res.status(200).json({
      reply,
      orb_balance: newOrbBalance
    });

  } catch (e) {
    console.error('[chat error]', e);
    return res.status(500).json({ error: 'server_error', detail: e.message });
  }
}
