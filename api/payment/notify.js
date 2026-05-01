// fortuna-silk.vercel.app/api/payment/notify.js
// 포트원 V2 웹훅 수신 — 결제 완료 시 Supabase orders 테이블 상태 업데이트
// PortOne 콘솔에서 웹훅 URL: https://fortuna-silk.vercel.app/api/payment/notify
//
// 보안 layer (이중 방어):
//   1) PortOne webhook signature 검증 (env.PORTONE_WEBHOOK_SECRET) — 위조 차단
//   2) PortOne API 재조회로 status:PAID 확인 — webhook 우회 시도 차단

import { Webhook } from '@portone/server-sdk';

const PORTONE_SECRET = process.env.PORTONE_SECRET; // PortOne API 인증 키
const PORTONE_WEBHOOK_SECRET = process.env.PORTONE_WEBHOOK_SECRET; // PortOne webhook 시그니처 검증용
const SB_URL = 'https://afktkixkbcirsknahbmx.supabase.co';
const SB_KEY = process.env.SB_SERVICE_KEY;

// Vercel 함수에서 raw body 받기 — webhook signature 검증에는 raw body 가 필요
export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // ── raw body 수신 ───────────────────────────────────
    const rawBody = await readRawBody(req);
    let body;
    try { body = JSON.parse(rawBody); } catch(e) {
      return res.status(400).json({ error: 'invalid_json' });
    }

    // ── webhook signature 검증 ─────────────────────────
    // PORTONE_WEBHOOK_SECRET 환경변수 미설정 시 검증 skip (PortOne 콘솔 등록 후
    // Vercel env 추가하면 자동 활성화 — 그 전까지는 PortOne API 재조회만으로 보호).
    if (PORTONE_WEBHOOK_SECRET) {
      const headers = {
        'webhook-id':        req.headers['webhook-id'],
        'webhook-timestamp': req.headers['webhook-timestamp'],
        'webhook-signature': req.headers['webhook-signature'],
      };
      try {
        await Webhook.verify(PORTONE_WEBHOOK_SECRET, rawBody, headers);
      } catch (vErr) {
        console.warn('[notify] signature verify failed:', vErr && vErr.message);
        return res.status(401).json({ error: 'invalid_signature' });
      }
    }

    const { type, data } = body || {};

    // 결제 완료 이벤트만 처리
    if (type !== 'Transaction.Paid') {
      return res.status(200).json({ ok: true, skipped: type });
    }

    const { paymentId, txId } = data || {};
    if (!paymentId) return res.status(400).json({ error: 'paymentId missing' });

    // PortOne API로 결제 검증 (이중 방어)
    const verifyRes = await fetch(`https://api.portone.io/payments/${encodeURIComponent(paymentId)}`, {
      headers: { 'Authorization': `PortOne ${PORTONE_SECRET}` },
    });
    const payment = await verifyRes.json();

    if (payment.status !== 'PAID') {
      console.warn('[notify] payment not PAID:', payment.status, paymentId);
      return res.status(200).json({ ok: false, status: payment.status });
    }

    // Supabase orders 테이블 status 업데이트
    if (SB_KEY) {
      await fetch(`${SB_URL}/rest/v1/orders?order_id=eq.${encodeURIComponent(paymentId)}`, {
        method: 'PATCH',
        headers: {
          'apikey': SB_KEY,
          'Authorization': `Bearer ${SB_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          status: 'paid',
          payment_key: txId || paymentId,
        }),
      });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[payment/notify] error:', e);
    return res.status(200).json({ ok: false, error: e.message }); // 200 반환 (PortOne 재시도 방지)
  }
}
