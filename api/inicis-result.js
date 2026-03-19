// fortuna-silk.vercel.app/api/inicis-result.js
// KG이니시스 결제 결과 수신 (POST) → success.html로 redirect

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // 이니시스는 application/x-www-form-urlencoded 로 POST
  const reportType = req.query.type || 'light';

  let resultCode = '';
  let resultMsg  = '';
  let MOID       = '';
  let TID        = '';
  let applDate   = '';

  if (req.method === 'POST') {
    // Vercel은 application/x-www-form-urlencoded body를 자동 파싱하지 않으므로 직접 처리
    const body = await getRawBody(req);
    const params = new URLSearchParams(body);
    resultCode = params.get('resultCode') || '';
    resultMsg  = params.get('resultMsg')  || '';
    MOID       = params.get('MOID')       || '';
    TID        = params.get('TID')        || '';
    applDate   = params.get('applDate')   || '';
  } else {
    // GET fallback (테스트용)
    resultCode = req.query.resultCode || '';
    resultMsg  = req.query.resultMsg  || '';
    MOID       = req.query.MOID       || '';
    TID        = req.query.TID        || '';
    applDate   = req.query.applDate   || '';
  }

  const redirectUrl =
    `https://fortuna-silk.vercel.app/success.html` +
    `?type=${encodeURIComponent(reportType)}` +
    `&resultCode=${encodeURIComponent(resultCode)}` +
    `&resultMsg=${encodeURIComponent(resultMsg)}` +
    `&MOID=${encodeURIComponent(MOID)}` +
    `&TID=${encodeURIComponent(TID)}` +
    `&applDate=${encodeURIComponent(applDate)}`;

  res.writeHead(302, { Location: redirectUrl });
  res.end();
};

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
