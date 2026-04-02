import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SB_SERVICE_KEY);

// 시간대별 충전 슬롯 (KST 시각 기준)
const CHARGE_SLOTS = [
  { hour: 7,  field: 'last_charge_7'  },
  { hour: 12, field: 'last_charge_12' },
  { hour: 18, field: 'last_charge_18' },
];

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
  const kstHour  = kstNow.getUTCHours(); // UTC+9 이미 적용됐으므로 getUTCHours() = KST 시

  const { data, error } = await sb.from('chat_users')
    .select('daily_count, paid_count, last_charge_7, last_charge_12, last_charge_18')
    .eq('id', user_id)
    .single();

  if (error || !data) return res.status(404).json({ error: 'user_not_found' });

  // 시간대 충전: 통과한 슬롯 중 오늘 아직 충전 안 한 슬롯만 +1 (최대 3개)
  let freeCount = data.daily_count || 0;
  const updates = {};

  for (const slot of CHARGE_SLOTS) {
    if (kstHour >= slot.hour && data[slot.field] !== todayKST && freeCount < 3) {
      freeCount = Math.min(3, freeCount + 1);
      updates[slot.field] = todayKST;
    }
  }

  if (Object.keys(updates).length > 0) {
    updates.daily_count = freeCount;
    await sb.from('chat_users').update(updates).eq('id', user_id);
  }

  const paidLeft = data.paid_count || 0;
  res.json({ free_left: freeCount, paid_left: paidLeft, total: freeCount + paidLeft });
}
