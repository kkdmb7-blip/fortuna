import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SB_SERVICE_KEY);

// 시간대별 충전 슬롯 (KST 시각 기준)
const CHARGE_SLOTS = [
  { hour: 7,  field: 'last_charge_7'  },
  { hour: 12, field: 'last_charge_12' },
  { hour: 18, field: 'last_charge_18' },
];

const ORB_PER_SLOT = 20;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: 'missing user_id' });

  const kstNow  = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const todayKST = kstNow.toISOString().slice(0, 10);
  const kstHour  = kstNow.getUTCHours();

  const { data, error } = await sb.from('chat_users')
    .select('daily_count, paid_count, last_charge_7, last_charge_12, last_charge_18')
    .eq('id', user_id)
    .single();

  if (error || !data) return res.status(404).json({ error: 'user_not_found' });

  // 통과한 슬롯 중 오늘 아직 충전 안 한 슬롯만 Orb +20 충전
  let freeCount = data.daily_count || 0;
  const chatUpdates = {};
  let orbAdded = 0;

  for (const slot of CHARGE_SLOTS) {
    if (kstHour >= slot.hour && data[slot.field] !== todayKST && freeCount < 3) {
      freeCount = Math.min(3, freeCount + 1);
      chatUpdates[slot.field] = todayKST;
      orbAdded += ORB_PER_SLOT;
    }
  }

  if (Object.keys(chatUpdates).length > 0) {
    chatUpdates.daily_count = freeCount;
    await sb.from('chat_users').update(chatUpdates).eq('id', user_id);

    // Orb 충전
    const now = new Date().toISOString();
    const { data: orbRow } = await sb.from('orb_balance')
      .select('balance').eq('user_id', user_id).maybeSingle();

    if (orbRow) {
      const newBal = (orbRow.balance || 0) + orbAdded;
      await sb.from('orb_balance')
        .update({ balance: newBal, updated_at: now })
        .eq('user_id', user_id);
      await sb.from('orb_transactions').insert({
        user_id,
        type: 'daily_charge',
        amount: orbAdded,
        description: `일일 자동 충전 (+${orbAdded} Orb)`,
        balance_after: newBal,
        created_at: now,
      });
    }
  }

  const paidLeft = data.paid_count || 0;
  res.json({ free_left: freeCount, paid_left: paidLeft, total: freeCount + paidLeft, orb_added: orbAdded });
}
