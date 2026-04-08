import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SB_SERVICE_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { referrer_id, referee_id } = req.body || {};
  if (!referrer_id || !referee_id) return res.status(400).json({ error: 'missing fields' });
  if (referrer_id === referee_id) return res.status(400).json({ error: 'self_referral' });

  // 중복 확인 (동일 referee가 이미 referral 완료한 경우)
  const { data: existing } = await sb.from('referrals')
    .select('id').eq('referee_id', referee_id).limit(1);
  if (existing && existing.length > 0) return res.status(409).json({ error: 'already_referred' });

  // referrals 기록
  const { data: inserted, error: e1 } = await sb.from('referrals').insert({
    referrer_id, referee_id, rewarded: true, created_at: Date.now()
  }).select('id').single();
  if (e1) return res.status(500).json({ error: e1.message });

  const now = new Date().toISOString();

  // referrer에게 50 Orb 지급 (paid_balance)
  const { data: refData } = await sb.from('orb_balance')
    .select('balance,paid_balance').eq('user_id', referrer_id).maybeSingle();
  if (!refData) {
    await sb.from('referrals').delete().eq('id', inserted.id);
    return res.status(404).json({ error: 'referrer_not_found' });
  }
  const refNewPaid = (refData.paid_balance || 0) + 50;
  const refNewBal = (refData.balance || 0) + 50;
  const { error: e2 } = await sb.from('orb_balance')
    .update({ balance: refNewBal, paid_balance: refNewPaid, updated_at: now })
    .eq('user_id', referrer_id);
  if (e2) {
    await sb.from('referrals').delete().eq('id', inserted.id);
    return res.status(500).json({ error: e2.message });
  }
  await sb.from('orb_transactions').insert({
    user_id: referrer_id, type: 'referral_reward', amount: 50,
    description: '친구 초대 보상', balance_after: refNewBal, created_at: now,
  });

  // referee에게 50 Orb 지급 (paid_balance)
  const { data: eeData } = await sb.from('orb_balance')
    .select('balance,paid_balance').eq('user_id', referee_id).maybeSingle();
  if (eeData) {
    const eeNewPaid = (eeData.paid_balance || 0) + 50;
    const eeNewBal = (eeData.balance || 0) + 50;
    await sb.from('orb_balance')
      .update({ balance: eeNewBal, paid_balance: eeNewPaid, updated_at: now })
      .eq('user_id', referee_id);
    await sb.from('orb_transactions').insert({
      user_id: referee_id, type: 'referral_bonus', amount: 50,
      description: '초대받기 보상', balance_after: eeNewBal, created_at: now,
    });
  }

  res.json({ ok: true, added: 50 });
}
