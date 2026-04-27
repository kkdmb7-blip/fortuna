// fortuna-silk.vercel.app/api/push.js
// Vercel Serverless Function + Cron Job
// 개인화 AI 푸시: chat_users.saju_data로 one-liner 생성 → 메모x 시드 채팅 진입
// 환경변수: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL, SB_SERVICE_KEY, ANTHROPIC_KEY

import webpush from 'web-push';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const quotes = require('./quotes.json');

const SB_URL = 'https://ymghmfkqctckxxysxkvy.supabase.co';
const DEDUP_HOURS = 44; // 하루 한 번 미만 보장 (오차 허용)

function getDailyQuote() {
  const kst = new Date(Date.now() + 9 * 3600000);
  const baseDay = kst.getUTCFullYear() * 365 + kst.getUTCMonth() * 30 + kst.getUTCDate();
  return quotes[baseDay % quotes.length];
}

function buildPersonalPrompt(name, saju) {
  const kst = new Date(Date.now() + 9 * 3600000);
  const dateStr = `${kst.getUTCFullYear()}-${String(kst.getUTCMonth()+1).padStart(2,'0')}-${String(kst.getUTCDate()).padStart(2,'0')}`;
  const dow = ['일','월','화','수','목','금','토'][kst.getUTCDay()];
  const pillars = typeof saju.saju_pillars === 'string' ? saju.saju_pillars : JSON.stringify(saju.saju_pillars || {});
  const facts = [
    pillars ? `사주기둥: ${pillars}` : null,
    saju.saju_strength ? `신강도: ${saju.saju_strength}` : null,
    saju.saju_geokguk ? `격국: ${saju.saju_geokguk}` : null,
    saju.saju_yongshin_primary ? `용신: ${saju.saju_yongshin_primary}` : null,
    saju.saju_twelve_growth ? `12운성 키워드: ${Array.isArray(saju.saju_twelve_growth) ? saju.saju_twelve_growth.slice(0,4).join(', ') : ''}` : null,
  ].filter(Boolean).join('\n');

  return {
    system: [
      '당신은 개인 운세 코치입니다.',
      '유저에게 오늘 한 줄 메시지를 보내세요.',
      '규칙:',
      '- 공백 포함 60~110자 사이',
      '- 이모지 1개 이내, 맨 앞엔 금지',
      '- 구체적 행동 1가지 제안 포함',
      '- 해시태그·목록·따옴표 금지',
      '- "안녕하세요" 인사말 금지',
      '- 용신/격국 직접 노출 금지 (내부 참고만)',
      '- 과도한 확정 예언 금지',
      '- 유저 이름을 자연스럽게 1회 호출'
    ].join('\n'),
    user: [
      `오늘 날짜: ${dateStr} (${dow}요일)`,
      `유저 이름: ${name || '당신'}`,
      facts || '(사주 데이터 미보유)',
      '',
      '오늘 이 유저에게 보낼 짧은 메시지를 한 줄로 만들어주세요. 앞 줄바꿈이나 라벨 없이 메시지만.'
    ].join('\n')
  };
}

async function generatePersonalMessage(apiKey, name, saju) {
  const prompt = buildPersonalPrompt(name, saju);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
      }),
    });
    const data = await res.json();
    const text = (data && data.content && data.content[0] && data.content[0].text || '').trim();
    if (!text) return null;
    // 앞뒤 따옴표 방어
    return text.replace(/^["'「『]+|["'」』]+$/g, '').slice(0, 140);
  } catch (e) {
    console.warn('[push] personalize fail', e.message);
    return null;
  }
}

async function fetchRecentLogUserIds(SB_KEY) {
  const cutoff = new Date(Date.now() - DEDUP_HOURS * 3600 * 1000).toISOString();
  try {
    const r = await fetch(`${SB_URL}/rest/v1/push_logs?select=user_id&created_at=gte.${encodeURIComponent(cutoff)}`, {
      headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` }
    });
    const rows = await r.json();
    return new Set((Array.isArray(rows) ? rows : []).map(x => x.user_id));
  } catch { return new Set(); }
}

async function insertLog(SB_KEY, user_id, message, meta) {
  const r = await fetch(`${SB_URL}/rest/v1/push_logs`, {
    method: 'POST',
    headers: {
      'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({ user_id, message, meta: meta || {} })
  });
  if (!r.ok) return null;
  const rows = await r.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET ?action=vapid-key: VAPID 공개키 반환 (picolab 프론트용)
  if (req.method === 'GET' && req.query.action === 'vapid-key') {
    return res.status(200).json({ key: process.env.VAPID_PUBLIC_KEY || '' });
  }

  // GET ?seed=<log_id>&user_id=<uid>: push_logs 시드 조회 + opened_at 기록
  if (req.method === 'GET' && req.query.seed) {
    const SB_KEY0 = process.env.SB_SERVICE_KEY;
    if (!SB_KEY0) return res.status(500).json({ error: 'no service key' });
    const headers0 = { 'apikey': SB_KEY0, 'Authorization': `Bearer ${SB_KEY0}`, 'Content-Type': 'application/json' };
    const seedId = req.query.seed;
    const reqUid = req.query.user_id;
    try {
      const r = await fetch(
        `${SB_URL}/rest/v1/push_logs?id=eq.${encodeURIComponent(seedId)}&select=*&limit=1`,
        { headers: headers0 }
      );
      const rows = await r.json();
      const row = Array.isArray(rows) && rows[0];
      if (!row) return res.status(404).json({ error: 'not found' });
      if (reqUid && row.user_id !== reqUid) return res.status(403).json({ error: 'forbidden' });
      if (!row.opened_at) {
        await fetch(
          `${SB_URL}/rest/v1/push_logs?id=eq.${encodeURIComponent(seedId)}`,
          { method: 'PATCH', headers: headers0, body: JSON.stringify({ opened_at: new Date().toISOString() }) }
        ).catch(() => {});
      }
      return res.status(200).json({ ok: true, row });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // POST
  if (req.method === 'POST') {
    const body = req.body || {};
    const SB_KEY0 = process.env.SB_SERVICE_KEY;
    const headers0 = { 'apikey': SB_KEY0, 'Authorization': `Bearer ${SB_KEY0}`, 'Content-Type': 'application/json' };

    // picolab 웹 푸시 (Worker 크론 → Authorization: Bearer FORTUNA_CONTEXT_TOKEN)
    if (body.action === 'pico-push' || body.action === 'quote-push') {
      const ctxSecret = process.env.FORTUNA_CONTEXT_TOKEN;
      if (ctxSecret && req.headers['authorization'] !== `Bearer ${ctxSecret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY;
      const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
      const VAPID_EMAIL       = process.env.VAPID_EMAIL || 'mailto:kkdmb@naver.com';
      if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return res.status(500).json({ error: 'VAPID not set' });
      webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
      const sbH = { apikey: SB_KEY0, Authorization: `Bearer ${SB_KEY0}` };

      let rows = [];
      if (body.action === 'pico-push') {
        // 단순 푸시: user_ids + title/body/url
        const ids = (body.user_ids || []).map(id => `"${id}"`).join(',');
        if (!ids) return res.status(400).json({ error: 'user_ids required' });
        const r = await fetch(`${SB_URL}/rest/v1/pico_push_subscriptions?select=user_id,subscription&user_id=in.(${ids})`, { headers: sbH });
        rows = await r.json().catch(() => []);
        let sent = 0;
        for (const row of (Array.isArray(rows) ? rows : [])) {
          try {
            const sub = typeof row.subscription === 'string' ? JSON.parse(row.subscription) : row.subscription;
            if (!sub || !sub.endpoint) continue;
            await webpush.sendNotification(sub, JSON.stringify({ title: body.title || '✦ 피코랩', body: body.body || '오늘의 운세가 도착했어요.', url: body.url || 'https://picolab.kr' }));
            sent++;
          } catch (e) {
            if (e.statusCode === 410 || e.statusCode === 404) {
              await fetch(`${SB_URL}/rest/v1/pico_push_subscriptions?user_id=eq.${encodeURIComponent(row.user_id)}`, { method: 'DELETE', headers: sbH }).catch(() => {});
            }
          }
        }
        return res.status(200).json({ sent });
      }

      if (body.action === 'quote-push') {
        // 개인화 푸시: users [{user_id, name, ilgan, geokguk, yongshin}]
        const users = body.users || [];
        if (!users.length) return res.status(400).json({ error: 'users required' });
        const ids2 = users.map(u => `"${u.user_id}"`).join(',');
        const r2 = await fetch(`${SB_URL}/rest/v1/pico_push_subscriptions?select=user_id,subscription&user_id=in.(${ids2})`, { headers: sbH });
        const rows2 = await r2.json().catch(() => []);
        const FALLBACK = ['오늘 하루도 내 흐름을 믿어봐.', '서두르지 않아도 돼. 때가 되면 온다.', '지금 한 가지만 집중해봐.'];
        const AKEY = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_KEY;
        const dow = ['일','월','화','수','목','금','토'][new Date(Date.now()+9*3600000).getUTCDay()];
        const userMap = {};
        users.forEach(u => { userMap[u.user_id] = u; });
        let sent = 0;
        for (const row of (Array.isArray(rows2) ? rows2 : [])) {
          try {
            const sub = typeof row.subscription === 'string' ? JSON.parse(row.subscription) : row.subscription;
            if (!sub || !sub.endpoint) continue;
            const u = userMap[row.user_id] || {};
            let msg = null;
            if (AKEY) {
              try {
                const ar = await fetch('https://api.anthropic.com/v1/messages', {
                  method: 'POST', headers: { 'x-api-key': AKEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
                  body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 120,
                    system: '사주 운세 코치. 60~100자 한 줄만 반환. 이모지 1개 이내. 확정 예언 금지.',
                    messages: [{ role: 'user', content: `오늘:${dow}요일 이름:${u.name||'유저'} 일간:${u.ilgan||''} 격국:${u.geokguk||''} 용신:${u.yongshin||''}\n한 줄 메시지:` }] })
                });
                const ad = await ar.json();
                msg = (ad?.content?.[0]?.text || '').trim().replace(/^["'「]+|["'」]+$/g, '').slice(0, 120) || null;
              } catch {}
            }
            if (!msg) msg = (u.name ? `${u.name}님, ` : '') + FALLBACK[Math.floor(Math.random() * FALLBACK.length)];
            await webpush.sendNotification(sub, JSON.stringify({ title: '✦ 오늘의 운세', body: msg, url: 'https://picolab.kr' }));
            sent++;
          } catch (e) {
            if (e.statusCode === 410 || e.statusCode === 404) {
              await fetch(`${SB_URL}/rest/v1/pico_push_subscriptions?user_id=eq.${encodeURIComponent(row.user_id)}`, { method: 'DELETE', headers: sbH }).catch(() => {});
            }
          }
        }
        return res.status(200).json({ sent });
      }
    }

    // dismiss 액션: push_logs.dismissed_at 기록
    if (body.action === 'dismissed' && body.id) {
      try {
        await fetch(
          `${SB_URL}/rest/v1/push_logs?id=eq.${encodeURIComponent(body.id)}`,
          { method: 'PATCH', headers: headers0, body: JSON.stringify({ dismissed_at: new Date().toISOString() }) }
        );
        return res.status(200).json({ ok: true });
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

    // 구독 저장
    const { user_id, subscription } = body;
    if (!user_id || !subscription) return res.status(400).json({ error: 'missing fields' });
    await fetch(`${SB_URL}/rest/v1/push_subscriptions?user_id=eq.${user_id}`, { method: 'DELETE', headers: headers0 });
    const resp = await fetch(`${SB_URL}/rest/v1/push_subscriptions`, {
      method: 'POST',
      headers: { ...headers0, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ user_id, subscription })
    });
    if (!resp.ok) { const err = await resp.json().catch(() => ({})); return res.status(500).json({ error: err.message || 'insert failed' }); }
    return res.json({ ok: true });
  }

  // Cron 인증
  const authHeader = req.headers['authorization'];
  const querySecret = req.query.secret;
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const headerOk = authHeader === `Bearer ${cronSecret}`;
    const queryOk  = querySecret === cronSecret;
    if (!headerOk && !queryOk) return res.status(401).json({ error: 'Unauthorized' });
  }

  const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY;
  const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
  const VAPID_EMAIL       = process.env.VAPID_EMAIL || 'mailto:kkdmb@naver.com';
  const SB_KEY            = process.env.SB_SERVICE_KEY;
  const ANTHROPIC_KEY     = process.env.ANTHROPIC_KEY;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !SB_KEY) {
    return res.status(500).json({ error: 'Missing env vars' });
  }
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  // 구독 조회
  let subscriptions = [];
  try {
    const sbRes = await fetch(
      `${SB_URL}/rest/v1/push_subscriptions?select=user_id,subscription`,
      { headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` } }
    );
    subscriptions = await sbRes.json();
    if (!Array.isArray(subscriptions)) subscriptions = [];
  } catch (e) {
    return res.status(500).json({ error: 'Supabase 조회 실패', detail: e.message });
  }

  // 유저 프로필 조회 (이름 + 사주)
  const userIds = [...new Set(subscriptions.map(s => s.user_id).filter(Boolean))];
  const userMap = {};
  if (userIds.length > 0) {
    try {
      const profileRes = await fetch(
        `${SB_URL}/rest/v1/chat_users?select=id,name,saju_data&id=in.(${userIds.join(',')})`,
        { headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` } }
      );
      const profiles = await profileRes.json();
      if (Array.isArray(profiles)) profiles.forEach(p => { userMap[p.id] = p; });
    } catch {}
  }

  // 최근 발송 유저 제외
  const recentUids = await fetchRecentLogUserIds(SB_KEY);

  const todayQuote = getDailyQuote();
  const results = { total: subscriptions.length, sent: 0, skipped_recent: 0, skipped_expired: 0, failed: 0, personalized: 0, fallback: 0 };

  for (const row of subscriptions) {
    try {
      if (recentUids.has(row.user_id)) { results.skipped_recent++; continue; }

      const sub = typeof row.subscription === 'string' ? JSON.parse(row.subscription) : row.subscription;
      if (!sub || !sub.endpoint) { results.skipped_expired++; continue; }

      const prof = userMap[row.user_id];
      const name = (prof && prof.name) || '';
      const saju = (prof && prof.saju_data) || null;

      // 메시지 생성
      let message = null;
      let meta = { model: null, fallback: false };
      if (saju && ANTHROPIC_KEY) {
        message = await generatePersonalMessage(ANTHROPIC_KEY, name, saju);
        if (message) { meta.model = 'claude-haiku-4-5'; results.personalized++; }
      }
      if (!message) {
        message = name ? `${name}님, ${todayQuote.message}` : todayQuote.message;
        meta.fallback = true;
        results.fallback++;
      }

      // 로그 먼저 저장해서 id 확보
      const logRow = await insertLog(SB_KEY, row.user_id, message, meta);
      const seedId = logRow && logRow.id ? logRow.id : '';

      const payload = JSON.stringify({
        title: '🔮 포르투나',
        body: message,
        url: seedId ? `/memox/?seed=${seedId}` : '/memox/'
      });

      try {
        await webpush.sendNotification(sub, payload);
        results.sent++;
      } catch (e) {
        results.failed++;
        console.error('push 실패', e.statusCode, e.message);
        if (e.statusCode === 410 || e.statusCode === 404) {
          await fetch(
            `${SB_URL}/rest/v1/push_subscriptions?user_id=eq.${row.user_id}`,
            { method: 'DELETE', headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` } }
          ).catch(() => {});
        }
      }
    } catch (e) {
      results.failed++;
      console.error('[push] row fail', e.message);
    }
  }

  return res.status(200).json({ ok: true, ...results });
}
