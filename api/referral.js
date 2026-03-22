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

  const { error: e1 } = await sb.from('referrals').insert({
    referrer_id, referee_id, rewarded: false, created_at: Date.now()
  });
  if (e1) return res.status(500).json({ error: e1.message });

  const { error: e2 } = await sb.from('question_charges').insert({
    user_id: referrer_id, amount: 3,
    payment_id: 'referral_' + referee_id,
    type: 'referral', created_at: Date.now()
  });
  if (e2) return res.status(500).json({ error: e2.message });

  res.json({ ok: true });
}
