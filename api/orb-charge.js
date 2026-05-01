// fortuna-silk.vercel.app/api/orb-charge
// PortOne 영수증 검증 → picolab DB orb_balance/orb_transactions 안전 갱신.
// 기존 charge.html 가 클라이언트에서 anon 키로 직접 UPSERT 하던 구멍을 차단.

const SB_URL = 'https://ymghmfkqctckxxysxkvy.supabase.co';

const _CORS_ALLOWED = ['https://picolab.kr','https://www.picolab.kr','https://kkdmb7-blip.github.io','https://fortuna-silk.vercel.app'];

// charge.html 의 PACKS 와 동기화 필요 (price → orb 매핑)
const PACKS = {
  'pack_first_1plus1': { price: 5500,  orb: 500,   bonus: 500, firstOnly: true },
  'pack_950':          { price: 9900,  orb: 950 },
  'pack_1650':         { price: 16500, orb: 1650 },
  'pack_2200':         { price: 22000, orb: 2200 },
  'pack_3300':         { price: 33000, orb: 3300 },
  'pack_5500':         { price: 49900, orb: 5500 },
  'pack_10000':        { price: 79900, orb: 10000 },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  const _origin = req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', _CORS_ALLOWED.includes(_origin) ? _origin : _CORS_ALLOWED[0]);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const { user_id, payment_id, pack_id } = req.body || {};
  if (!user_id || !payment_id || !pack_id) {
    return res.status(400).json({ error: 'missing_params' });
  }
  if (!UUID_RE.test(user_id)) return res.status(400).json({ error: 'invalid_user_id' });
  const pack = PACKS[pack_id];
  if (!pack) return res.status(400).json({ error: 'invalid_pack' });

  const PORTONE_SECRET = process.env.PORTONE_SECRET;
  const SB_KEY = process.env.SB_SERVICE_KEY;
  if (!PORTONE_SECRET) return res.status(500).json({ error: 'portone_not_configured' });
  if (!SB_KEY) return res.status(500).json({ error: 'sb_not_configured' });

  try {
    // 1. PortOne 영수증 검증
    const verifyRes = await fetch(`https://api.portone.io/payments/${encodeURIComponent(payment_id)}`, {
      headers: { 'Authorization': `PortOne ${PORTONE_SECRET}` }
    });
    if (!verifyRes.ok) {
      return res.status(402).json({ error: 'portone_verify_failed', status: verifyRes.status });
    }
    const payment = await verifyRes.json();
    if (payment.status !== 'PAID') {
      return res.status(402).json({ error: 'payment_not_paid', portone_status: payment.status });
    }
    const paidAmount = (payment.amount && (payment.amount.total || payment.amount.paid)) || 0;
    if (paidAmount !== pack.price) {
      return res.status(402).json({ error: 'amount_mismatch', expected: pack.price, got: paidAmount });
    }

    const sbHdr = { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` };

    // 2. 중복 체크 (orb_transactions 의 description 에 payment_id 가 이미 있나)
    const dupRes = await fetch(`${SB_URL}/rest/v1/orb_transactions?user_id=eq.${user_id}&description=ilike.*${encodeURIComponent(payment_id)}*&select=id&limit=1`, {
      headers: sbHdr
    });
    const dupData = await dupRes.json();
    if (Array.isArray(dupData) && dupData.length > 0) {
      // 이미 처리된 결제 — 동작상 멱등 처리
      const balRes2 = await fetch(`${SB_URL}/rest/v1/orb_balance?user_id=eq.${user_id}&select=balance`, { headers: sbHdr });
      const b2 = await balRes2.json();
      return res.status(200).json({ ok: true, duplicate: true, balance: (b2 && b2[0] && b2[0].balance) || 0 });
    }

    // 3. 현재 잔액 조회
    const balRes = await fetch(`${SB_URL}/rest/v1/orb_balance?user_id=eq.${user_id}&select=balance,free_balance,paid_balance,total_charged,is_first_charge`, { headers: sbHdr });
    const balData = await balRes.json();
    const oldBal = (Array.isArray(balData) && balData[0]) || { balance: 0, free_balance: 0, paid_balance: 0, total_charged: 0, is_first_charge: true };

    const isFirstChargeApplied = !!(pack.firstOnly && (oldBal.is_first_charge !== false));
    const totalOrb = pack.orb + (isFirstChargeApplied ? (pack.bonus || 0) : 0);
    const newBalance = (oldBal.balance || 0) + totalOrb;
    const newPaid = (oldBal.paid_balance || 0) + totalOrb;
    const newTotalCharged = (oldBal.total_charged || 0) + totalOrb;
    const now = new Date().toISOString();

    // 4. orb_balance UPSERT
    const upsertRes = await fetch(`${SB_URL}/rest/v1/orb_balance`, {
      method: 'POST',
      headers: { ...sbHdr, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        user_id,
        balance: newBalance,
        free_balance: oldBal.free_balance || 0,
        paid_balance: newPaid,
        total_charged: newTotalCharged,
        is_first_charge: false,
        updated_at: now
      })
    });
    if (!upsertRes.ok) {
      const txt = await upsertRes.text();
      return res.status(500).json({ error: 'upsert_failed', detail: txt.slice(0, 200) });
    }

    // 5. orb_transactions INSERT
    await fetch(`${SB_URL}/rest/v1/orb_transactions`, {
      method: 'POST',
      headers: { ...sbHdr, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        user_id,
        type: 'charge',
        amount: totalOrb,
        description: (isFirstChargeApplied ? '첫충전 1+1 ' : '') + pack_id + ' imp:' + payment_id,
        balance_after: newBalance,
        created_at: now
      })
    });

    return res.status(200).json({ ok: true, total_orb: totalOrb, new_balance: newBalance });
  } catch (e) {
    console.error('[orb-charge] error:', e);
    return res.status(500).json({ error: 'server_error', detail: e.message });
  }
}
