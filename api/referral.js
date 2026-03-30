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

  // referrer의 chat_users.paid_count += 3
  const { data: referrer } = await sb.from('chat_users')
    .select('paid_count').eq('id', referrer_id).single();
  if (!referrer) {
    // 롤백: referrals 레코드 삭제
    await sb.from('referrals').delete().eq('id', inserted.id);
    return res.status(404).json({ error: 'referrer_not_found' });
  }

  const { error: e2 } = await sb.from('chat_users')
    .update({ paid_count: (referrer.paid_count || 0) + 3 })
    .eq('id', referrer_id);
  if (e2) {
    // 롤백: referrals 레코드 삭제
    await sb.from('referrals').delete().eq('id', inserted.id);
    return res.status(500).json({ error: e2.message });
  }

  res.json({ ok: true, added: 3 });
}
