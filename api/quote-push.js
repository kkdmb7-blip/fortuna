// fortuna-silk.vercel.app/api/quote-push.js
// Worker 크론에서 호출: 피코랩 사용자에게 일진 맞춤 명언 푸시 (매일 07:30 KST)
// 환경변수: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL, SB_SERVICE_KEY, CRON_SECRET

import webpush from 'web-push';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const quotes = require('./quotes.json');

const SB_URL = 'https://ymghmfkqctckxxysxkvy.supabase.co';

// ── 오늘 일진 천간 인덱스 계산 (Julian Day Number 기반) ──────────
// 기준: 2000-01-01 = JDN 2451545 = 경(庚) = 인덱스 6
function getTodayDayStemIdx(kstDate) {
  const y = kstDate.getUTCFullYear();
  const m = kstDate.getUTCMonth() + 1;
  const d = kstDate.getUTCDate();
  const a  = Math.floor((14 - m) / 12);
  const yr = y + 4800 - a;
  const mo = m + 12 * a - 3;
  const jdn = d + Math.floor((153 * mo + 2) / 5) + 365 * yr
            + Math.floor(yr / 4) - Math.floor(yr / 100)
            + Math.floor(yr / 400) - 32045;
  return ((jdn - 2451545 + 6) % 10 + 10) % 10;
  // 0=갑 1=을 2=병 3=정 4=무 5=기 6=경 7=신 8=임 9=계
}

// 천간 인덱스 → 오행
function stemIdxToOhang(idx) {
  return ['목','목','화','화','토','토','금','금','수','수'][idx];
}

// 천간 한자/한글 이름 → 인덱스
const STEM_NAMES = ['갑','을','병','정','무','기','경','신','임','계'];
function stemNameToIdx(name) {
  if (!name) return -1;
  // 한글 직접 매칭
  const idx = STEM_NAMES.indexOf(name);
  if (idx >= 0) return idx;
  // 천간 한자 첫 글자 매칭 (甲乙丙丁戊己庚辛壬癸)
  const hanja = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
  const h = hanja.indexOf(name[0]);
  if (h >= 0) return h;
  return -1;
}

// yongshin 영어→한국어 정규화 (DB에 'metal'/'wood' 등으로 저장된 경우)
const YS_KO = { metal:'금', wood:'목', fire:'화', water:'수', earth:'토' };
function toKoEl(v) { return YS_KO[v] || v; }

// 오늘 일진이 용신에 미치는 영향 → 길(good)/평(neutral)/흉(caution)
// 오행 상생: 목→화→토→금→수→목
// 오행 상극: 목克토, 화克금, 토克수, 금克목, 수克화
function getDayTone(todayOhang, yongshinRaw) {
  const yongshin = toKoEl(yongshinRaw);
  if (!yongshin || !todayOhang) return 'neutral';
  const 生Map = { 목:'화', 화:'토', 토:'금', 금:'수', 수:'목' };
  const 克Map = { 목:'토', 화:'금', 토:'수', 금:'목', 수:'화' };
  // 오늘 오행이 용신과 같거나 용신을 생함 → 길
  if (todayOhang === yongshin || 生Map[todayOhang] === yongshin) return 'good';
  // 오늘 오행이 용신을 극함 → 흉
  if (克Map[todayOhang] === yongshin) return 'caution';
  return 'neutral';
}

// 일간별 오늘 명언 선택 (10종 ilgan × 날짜 오프셋 → 각 유저마다 다른 명언)
function selectPersonalizedQuote(ilgan, baseDay) {
  const ilganIdx = stemNameToIdx(ilgan);
  const offset   = ilganIdx >= 0 ? ilganIdx * 10 : 0;
  return quotes[(baseDay + offset) % quotes.length];
}

// 일진 톤에 따른 알림 타이틀
function buildTitle(name, tone) {
  if (tone === 'good')    return '오늘 기운이 딱 맞아요';
  if (tone === 'caution') return '오늘은 조금 신중하게';
  return '오늘의 우주 메시지';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'];
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const body = req.body || {};

  // ── 범용 커스텀 푸시 모드 (pico-push 통합): user_ids + title + body ──
  if (Array.isArray(body.user_ids)) {
    const { user_ids, title: pushTitle, body: pushBody, url: pushUrl } = body;
    if (!pushTitle || !pushBody) {
      return res.status(400).json({ error: 'title, body 필요' });
    }
    const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY;
    const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
    const VAPID_EMAIL       = process.env.VAPID_EMAIL || 'mailto:kkdmb@naver.com';
    const SB_KEY            = process.env.SB_SERVICE_KEY;
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !SB_KEY) {
      return res.status(500).json({ error: 'Missing env vars' });
    }
    webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    const sbH = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };
    let subMap2 = {};
    try {
      const sr = await fetch(
        `${SB_URL}/rest/v1/pico_push_subscriptions?user_id=in.(${user_ids.join(',')})&select=user_id,subscription`,
        { headers: sbH }
      );
      const subs2 = await sr.json();
      if (Array.isArray(subs2)) subs2.forEach(s => { if (s.user_id) subMap2[s.user_id] = s.subscription; });
    } catch (e) {
      return res.status(500).json({ error: 'Supabase 조회 실패', detail: e.message });
    }
    const payload2 = JSON.stringify({ title: pushTitle, body: pushBody, url: pushUrl || 'https://picolab.kr' });
    const r2 = { sent: 0, failed: 0, skipped: 0, expired: [] };
    await Promise.allSettled(user_ids.map(async (uid) => {
      const sub = subMap2[uid];
      if (!sub) { r2.skipped++; return; }
      const ps = typeof sub === 'string' ? JSON.parse(sub) : sub;
      try {
        await webpush.sendNotification(ps, payload2);
        r2.sent++;
      } catch (e) {
        r2.failed++;
        if (e.statusCode === 410 || e.statusCode === 404) {
          r2.expired.push(uid);
          await fetch(`${SB_URL}/rest/v1/pico_push_subscriptions?user_id=eq.${uid}`,
            { method: 'DELETE', headers: sbH }).catch(() => {});
        }
      }
    }));
    return res.status(200).json({ ok: true, total: user_ids.length, ...r2 });
  }

  // ── 기문둔갑 대길 푸시 모드 (qimen-push 통합): users[].next_shi 존재 시 ──
  if (Array.isArray(body.users) && body.users.length > 0 && body.users[0].next_shi !== undefined) {
    const { users: qUsers } = body;
    const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY;
    const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
    const VAPID_EMAIL       = process.env.VAPID_EMAIL || 'mailto:kkdmb@naver.com';
    const SB_KEY            = process.env.SB_SERVICE_KEY;
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !SB_KEY) return res.status(500).json({ error: 'Missing env vars' });
    webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    const qIds = qUsers.map(u => u.user_id).filter(Boolean);
    let qSubMap = {};
    try {
      const qr = await fetch(`${SB_URL}/rest/v1/push_subscriptions?user_id=in.(${qIds.join(',')})&select=user_id,subscription`,
        { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
      const qSubs = await qr.json();
      if (Array.isArray(qSubs)) qSubs.forEach(s => { if (s.user_id) qSubMap[s.user_id] = s.subscription; });
    } catch(e) { return res.status(500).json({ error: 'Supabase 조회 실패', detail: e.message }); }
    const qRes = { sent:0, failed:0, skipped:0, expired:[] };
    await Promise.allSettled(qUsers.map(async (u) => {
      const sub = qSubMap[u.user_id];
      if (!sub) { qRes.skipped++; return; }
      const ps = typeof sub === 'string' ? JSON.parse(sub) : sub;
      const name = u.name || '', shiName = u.next_shi || '다음 시간', keyword = u.keyword || '대길의 기운';
      const payload = JSON.stringify({ title:'🔯 기문둔갑 대길 알림', body: name ? `${name}님, 30분 후 ${shiName}이 대길입니다 ✨ ${keyword}` : `30분 후 ${shiName}이 대길입니다 ✨ ${keyword}`, url:'/memox/' });
      try { await webpush.sendNotification(ps, payload); qRes.sent++; }
      catch(e) {
        qRes.failed++;
        if (e.statusCode === 410 || e.statusCode === 404) {
          qRes.expired.push(u.user_id);
          await fetch(`${SB_URL}/rest/v1/push_subscriptions?user_id=eq.${u.user_id}`,
            { method:'DELETE', headers:{ apikey:SB_KEY, Authorization:`Bearer ${SB_KEY}` } }).catch(()=>{});
        }
      }
    }));
    return res.status(200).json({ ok:true, total:qUsers.length, ...qRes });
  }

  const { users } = body;
  if (!Array.isArray(users) || users.length === 0) {
    return res.status(400).json({ error: 'users 배열 필요' });
  }

  const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY;
  const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
  const VAPID_EMAIL       = process.env.VAPID_EMAIL || 'mailto:kkdmb@naver.com';
  const SB_KEY            = process.env.SB_SERVICE_KEY;

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !SB_KEY) {
    return res.status(500).json({ error: 'Missing env vars' });
  }

  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  // 오늘 일진 계산 (KST 기준)
  const kst          = new Date(Date.now() + 9 * 3600000);
  const todayStemIdx = getTodayDayStemIdx(kst);
  const todayOhang   = stemIdxToOhang(todayStemIdx);
  const baseDay      = kst.getUTCFullYear() * 365 + kst.getUTCMonth() * 30 + kst.getUTCDate();

  // 구독 엔드포인트 조회
  const userIds = users.map(u => u.user_id).filter(Boolean);
  let subMap = {};
  try {
    const sbRes = await fetch(
      `${SB_URL}/rest/v1/pico_push_subscriptions?user_id=in.(${userIds.join(',')})&select=user_id,subscription`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    if (!sbRes.ok) {
      const errText = await sbRes.text();
      console.error('[quote-push] pico_push_subscriptions 조회 실패:', sbRes.status, errText);
      return res.status(500).json({ error: 'Supabase 조회 실패', detail: errText });
    }
    const subs = await sbRes.json();
    if (Array.isArray(subs)) {
      subs.forEach(s => { if (s.user_id) subMap[s.user_id] = s.subscription; });
    }
  } catch (e) {
    return res.status(500).json({ error: 'Supabase 조회 실패', detail: e.message });
  }

  const results = { sent: 0, failed: 0, skipped: 0, expired: [] };

  await Promise.allSettled(
    users.map(async (u) => {
      const sub = subMap[u.user_id];
      if (!sub) { results.skipped++; return; }

      // ── 개인화 처리 ──
      // 1. 오늘 일진 × 용신 → 길/평/흉 판정
      const tone  = getDayTone(todayOhang, u.yongshin);
      // 2. 일간 기반 오늘의 명언 선택 (같은 날 ilgan별로 다른 명언)
      const quote = selectPersonalizedQuote(u.ilgan, baseDay);
      // 3. 타이틀 + 본문 구성
      const title = buildTitle(u.name, tone);
      const body  = quote.message;

      const parsedSub = typeof sub === 'string' ? JSON.parse(sub) : sub;
      const payload = JSON.stringify({ title, body, url: 'https://picolab.kr' });

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
