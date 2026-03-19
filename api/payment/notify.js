// fortuna-silk.vercel.app/api/payment/notify.js
// 포트원 V2 웹훅 수신 — 결제 완료 시 Supabase orders 테이블 상태 업데이트
// PortOne 콘솔에서 웹훅 URL: https://fortuna-silk.vercel.app/api/payment/notify

const PORTONE_SECRET = process.env.PORTONE_SECRET; // Vercel 환경변수에 설정 필요
const SB_URL = 'https://afktkixkbcirsknahbmx.supabase.co';
const SB_KEY = process.env.SB_SERVICE_KEY; // Supabase Service Role Key (환경변수)

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { type, data } = req.body;

    // 결제 완료 이벤트만 처리
    if (type !== 'Transaction.Paid') {
      return res.status(200).json({ ok: true, skipped: type });
    }

    const { paymentId, txId } = data;
    if (!paymentId) return res.status(400).json({ error: 'paymentId missing' });

    // PortOne API로 결제 검증
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
};
