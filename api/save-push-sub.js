import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SB_SERVICE_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { user_id, subscription } = req.body || {};
  if (!user_id || !subscription) return res.status(400).json({ error: 'missing fields' });

  const SB_KEY = process.env.SB_SERVICE_KEY;
  if (!SB_KEY) return res.status(500).json({ error: 'Server config error' });

  const resp = await fetch(`${process.env.SUPABASE_URL}/rest/v1/push_subscriptions`, {
    method: 'POST',
    headers: {
      'apikey': SB_KEY,
      'Authorization': `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal',
      'on-conflict': 'user_id'
    },
    body: JSON.stringify({ user_id, subscription, created_at: Date.now() })
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    return res.status(500).json({ error: err.message || 'upsert failed' });
  }
  res.json({ ok: true });
}
