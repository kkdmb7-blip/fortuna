// fortuna-silk.vercel.app/api/payment/return.js
// 포트원 V2 결제 결과 수신 (redirect 모드 + 팝업 성공 후 경유)
// PortOne이 redirect 시 전달: paymentId, txId, code(에러시), message
// 팝업 성공 후 클라이언트가 직접 이 URL로 redirect하기도 함

const PORTONE_SECRET = process.env.PORTONE_SECRET; // Vercel 환경변수에 설정 필요

module.exports = async function handler(req, res) {
  const { paymentId, txId, code, message, type } = req.query;
  const reportType = type || 'light';

  // 결제 실패 또는 취소
  if (code) {
    const errMsg = code === 'USER_CANCEL' ? '결제가 취소되었습니다' : (message || '결제 오류');
    return res.redirect(`/success.html?error=${encodeURIComponent(errMsg)}&type=${reportType}`);
  }

  if (!paymentId) {
    return res.redirect(`/success.html?error=${encodeURIComponent('결제 정보를 찾을 수 없습니다')}&type=${reportType}`);
  }

  try {
    // PortOne API로 결제 검증
    const verifyRes = await fetch(`https://api.portone.io/payments/${encodeURIComponent(paymentId)}`, {
      headers: { 'Authorization': `PortOne ${PORTONE_SECRET}` },
    });
    const payment = await verifyRes.json();

    if (payment.status !== 'PAID') {
      const msg = payment.statusDetails || payment.message || '결제 미완료';
      return res.redirect(`/success.html?error=${encodeURIComponent(msg)}&type=${reportType}`);
    }

    // success.html이 기존에 사용하는 파라미터 형식으로 redirect
    // MOID = orderId(paymentId), TID = txId, resultCode 0000 = 성공
    const successUrl =
      `/success.html` +
      `?MOID=${encodeURIComponent(paymentId)}` +
      `&TID=${encodeURIComponent(txId || paymentId)}` +
      `&resultCode=0000` +
      `&type=${encodeURIComponent(reportType)}`;

    return res.redirect(successUrl);
  } catch (e) {
    console.error('[payment/return] verify error:', e);
    return res.redirect(`/success.html?error=${encodeURIComponent('결제 검증 중 오류가 발생했습니다')}&type=${reportType}`);
  }
};
