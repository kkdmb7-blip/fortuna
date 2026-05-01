// fortuna-silk.vercel.app/api/save-profile
// 카카오 유저 프로필 저장 + 이벤트 로깅 + 구독 관리 (12함수 한도 통합)

const SB_URL = 'https://ymghmfkqctckxxysxkvy.supabase.co';
const PO_API = 'https://api.portone.io';
const CHANNEL_KEY = 'channel-key-c7608d6b-f758-4bbb-a0ad-252c5141c50c';
const PLANS = {
  monthly_5000:  { name: '포르투나 월정액 Basic', price: 9900,  orb: 5000 },
  monthly_12000: { name: '포르투나 월정액 Pro',   price: 19900, orb: 12000 },
};

const _CORS_ALLOWED = ['https://picolab.kr','https://www.picolab.kr','https://kkdmb7-blip.github.io','https://fortuna-silk.vercel.app'];
export default async function handler(req, res) {
  const _origin = req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', _CORS_ALLOWED.includes(_origin) ? _origin : _CORS_ALLOWED[0]);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SB_KEY = process.env.SB_SERVICE_KEY;
  if (!SB_KEY) return res.status(500).json({ error: 'Server config error' });
  const sbH = { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };

  // ── GET ?action=subscription: 구독 상태 조회 ──
  if (req.method === 'GET' && req.query.action === 'subscription') {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    try {
      const r = await fetch(`${SB_URL}/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(user_id)}&status=eq.active&order=created_at.desc&limit=1`, { headers: sbH });
      const data = await r.json();
      return res.status(200).json(Array.isArray(data) && data[0] ? data[0] : null);
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // ── DELETE ?action=subscription: 구독 취소 ──
  if (req.method === 'DELETE' && req.query.action === 'subscription') {
    const { user_id } = req.body || {};
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    try {
      await fetch(`${SB_URL}/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(user_id)}&status=eq.active`, { method: 'PATCH', headers: sbH, body: JSON.stringify({ status: 'cancelled', cancelled_at: new Date().toISOString() }) });
      return res.status(200).json({ ok: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── POST ?action=charge: PortOne 영수증 검증 + Orb 안전 충전 ──
  // (charge.html 의 anon UPSERT 위협 차단 — Vercel 12 함수 한도 내 통합)
  if (req.query.action === 'charge') {
    const PACKS_CHARGE = {
      'pack_first_1plus1': { price: 5500,  orb: 500,   bonus: 500, firstOnly: true },
      'pack_950':          { price: 9900,  orb: 950 },
      'pack_1650':         { price: 16500, orb: 1650 },
      'pack_2200':         { price: 22000, orb: 2200 },
      'pack_3300':         { price: 33000, orb: 3300 },
      'pack_5500':         { price: 49900, orb: 5500 },
      'pack_10000':        { price: 79900, orb: 10000 },
    };
    const UUID_RE_C = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const { user_id, payment_id, pack_id } = req.body || {};
    if (!user_id || !payment_id || !pack_id) return res.status(400).json({ error: 'missing_params' });
    if (!UUID_RE_C.test(user_id)) return res.status(400).json({ error: 'invalid_user_id' });
    const pack = PACKS_CHARGE[pack_id];
    if (!pack) return res.status(400).json({ error: 'invalid_pack' });

    const PORTONE_SECRET = process.env.PORTONE_SECRET;
    if (!PORTONE_SECRET) return res.status(500).json({ error: 'portone_not_configured' });
    try {
      const verifyRes = await fetch(`${PO_API}/payments/${encodeURIComponent(payment_id)}`, {
        headers: { 'Authorization': `PortOne ${PORTONE_SECRET}` }
      });
      if (!verifyRes.ok) return res.status(402).json({ error: 'portone_verify_failed' });
      const payment = await verifyRes.json();
      if (payment.status !== 'PAID') return res.status(402).json({ error: 'payment_not_paid', portone_status: payment.status });
      const paidAmount = (payment.amount && (payment.amount.total || payment.amount.paid)) || 0;
      if (paidAmount !== pack.price) return res.status(402).json({ error: 'amount_mismatch', expected: pack.price, got: paidAmount });

      // 중복 체크
      const dupRes = await fetch(`${SB_URL}/rest/v1/orb_transactions?user_id=eq.${user_id}&description=ilike.*${encodeURIComponent(payment_id)}*&select=id&limit=1`, { headers: sbH });
      const dupData = await dupRes.json();
      if (Array.isArray(dupData) && dupData.length > 0) {
        const balR = await fetch(`${SB_URL}/rest/v1/orb_balance?user_id=eq.${user_id}&select=balance`, { headers: sbH });
        const b = await balR.json();
        return res.status(200).json({ ok: true, duplicate: true, balance: (b && b[0] && b[0].balance) || 0 });
      }

      // 잔액 조회 + 갱신
      const balRes = await fetch(`${SB_URL}/rest/v1/orb_balance?user_id=eq.${user_id}&select=balance,free_balance,paid_balance,total_charged,is_first_charge`, { headers: sbH });
      const balData = await balRes.json();
      const oldBal = (Array.isArray(balData) && balData[0]) || { balance: 0, free_balance: 0, paid_balance: 0, total_charged: 0, is_first_charge: true };
      const isFirstChargeApplied = !!(pack.firstOnly && (oldBal.is_first_charge !== false));
      const totalOrb = pack.orb + (isFirstChargeApplied ? (pack.bonus || 0) : 0);
      const newBalance = (oldBal.balance || 0) + totalOrb;
      const newPaid = (oldBal.paid_balance || 0) + totalOrb;
      const newTotalCharged = (oldBal.total_charged || 0) + totalOrb;
      const now = new Date().toISOString();

      const upRes = await fetch(`${SB_URL}/rest/v1/orb_balance`, {
        method: 'POST',
        headers: { ...sbH, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ user_id, balance: newBalance, free_balance: oldBal.free_balance || 0, paid_balance: newPaid, total_charged: newTotalCharged, is_first_charge: false, updated_at: now })
      });
      if (!upRes.ok) {
        const txt = await upRes.text();
        return res.status(500).json({ error: 'upsert_failed', detail: txt.slice(0,200) });
      }
      await fetch(`${SB_URL}/rest/v1/orb_transactions`, {
        method: 'POST',
        headers: { ...sbH, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ user_id, type: 'charge', amount: totalOrb, description: (isFirstChargeApplied ? '첫충전 1+1 ' : '') + pack_id + ' imp:' + payment_id, balance_after: newBalance, created_at: now })
      });
      return res.status(200).json({ ok: true, total_orb: totalOrb, new_balance: newBalance });
    } catch (e) {
      console.error('[save-profile charge] error:', e);
      return res.status(500).json({ error: 'server_error', detail: e.message });
    }
  }

  // ── POST ?action=log: 이벤트 로깅 ──
  if (req.query.action === 'log') {
    const { user_id, event_type, properties } = req.body || {};
    if (!event_type) return res.status(400).json({ error: 'event_type required' });
    try {
      await fetch(`${SB_URL}/rest/v1/user_events`, { method: 'POST', headers: { ...sbH, 'Prefer': 'return=minimal' }, body: JSON.stringify({ user_id: user_id || null, event_type, properties: properties || {} }) });
      return res.status(200).json({ ok: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // ── POST ?action=subscription: 구독 신청 ──
  if (req.query.action === 'subscription') {
    const { user_id, plan, billing_key, user_name, user_email } = req.body || {};
    if (!user_id || !plan || !billing_key) return res.status(400).json({ error: 'user_id, plan, billing_key required' });
    const planInfo = PLANS[plan];
    if (!planInfo) return res.status(400).json({ error: 'invalid plan' });
    const PO_SECRET = process.env.PORTONE_SECRET_KEY;
    if (!PO_SECRET) return res.status(500).json({ error: 'Payment config error' });

    const paymentId = `SUB-${plan}-${String(user_id).slice(0, 8)}-${Date.now()}`;
    const poResp = await fetch(`${PO_API}/payments/${encodeURIComponent(paymentId)}/billing-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `PortOne ${PO_SECRET}` },
      body: JSON.stringify({ billingKey: billing_key, channelKey: CHANNEL_KEY, orderName: planInfo.name, amount: { total: planInfo.price }, currency: 'KRW', customer: { customerId: user_id, fullName: user_name || '포르투나 회원', email: user_email || 'user@fortuna.app', phoneNumber: '01000000000' } }),
    });
    const poData = await poResp.json();
    if (!poResp.ok || (poData.status && poData.status !== 'PAID')) return res.status(400).json({ error: poData.message || '첫 결제 실패' });

    await fetch(`${SB_URL}/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(user_id)}&status=eq.active`, { method: 'PATCH', headers: sbH, body: JSON.stringify({ status: 'cancelled', cancelled_at: new Date().toISOString() }) });
    const nextBilling = new Date(); nextBilling.setMonth(nextBilling.getMonth() + 1);
    await fetch(`${SB_URL}/rest/v1/subscriptions`, { method: 'POST', headers: { ...sbH, 'Prefer': 'return=minimal' }, body: JSON.stringify({ user_id, plan, billing_key, status: 'active', price: planInfo.price, orb_per_month: planInfo.orb, next_billing_at: nextBilling.toISOString(), created_at: new Date().toISOString() }) });

    try {
      const orbR = await fetch(`${SB_URL}/rest/v1/orb_balance?user_id=eq.${encodeURIComponent(user_id)}&select=balance,free_balance,paid_balance`, { headers: sbH });
      const orbData = await orbR.json();
      const ex = Array.isArray(orbData) && orbData[0];
      const newBalance = (ex ? ex.balance || 0 : 0) + planInfo.orb;
      const newPaid    = (ex ? ex.paid_balance || 0 : 0) + planInfo.orb;
      const newFree    = ex ? ex.free_balance || 0 : 0;
      await fetch(`${SB_URL}/rest/v1/orb_balance`, { method: 'POST', headers: { ...sbH, 'Prefer': 'resolution=merge-duplicates' }, body: JSON.stringify({ user_id, balance: newBalance, free_balance: newFree, paid_balance: newPaid, updated_at: new Date().toISOString() }) });
      await fetch(`${SB_URL}/rest/v1/orb_transactions`, { method: 'POST', headers: { ...sbH, 'Prefer': 'return=minimal' }, body: JSON.stringify({ user_id, type: 'subscription', amount: planInfo.orb, description: `구독 첫 결제 ${plan}`, balance_after: newBalance }) });
      return res.status(200).json({ ok: true, orb: planInfo.orb, balance: newBalance });
    } catch (e) { return res.status(200).json({ ok: true, orb: planInfo.orb, warn: 'Orb 지급 오류: ' + e.message }); }
  }

  // ── POST 기본: 프로필 저장 ──
  const profile = req.body;
  if (!profile || !profile.id) return res.status(400).json({ error: 'profile.id required' });
  try {
    const resp = await fetch(`${SB_URL}/rest/v1/chat_users`, {
      method: 'POST',
      headers: { ...sbH, 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(profile)
    });
    const data = await resp.json();
    return res.status(200).json({ ok: true, data });
  } catch (e) { return res.status(500).json({ error: e.message }); }
}
