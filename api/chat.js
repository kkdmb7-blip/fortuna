// fortuna-silk.vercel.app/api/chat.js
// Vercel Serverless Function - Claude Haiku 채팅 중계

const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
const SB_URL = 'https://ymghmfkqctckxxysxkvy.supabase.co';
const FREE_DAILY = 999; // 현재 무제한

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { user_id, messages, system_prompt, sb_key } = req.body;

  if (!user_id || !messages) {
    return res.status(400).json({ error: 'missing params' });
  }

  const SB_KEY = sb_key || process.env.SB_SERVICE_KEY;

  try {
    // ── 카운트 체크 ──
    const userRes = await fetch(
      `${SB_URL}/rest/v1/chat_users?id=eq.${user_id}&select=daily_count,daily_reset_at,paid_count`,
      { headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` } }
    );
    const users = await userRes.json();
    const user = users && users[0];

    if (!user) return res.status(404).json({ error: 'user not found' });

    // KST 오늘 날짜
    const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const todayKST = kstNow.toISOString().slice(0, 10);

    let dailyCount = user.daily_count || 0;
    let paidCount  = user.paid_count  || 0;

    if ((user.daily_reset_at || '') !== todayKST) dailyCount = 0;

    const freeLeft = Math.max(0, FREE_DAILY - dailyCount);
    const canUse   = freeLeft > 0 || paidCount > 0;

    if (!canUse) {
      return res.status(429).json({
        error: 'limit_exceeded',
        free_left: 0,
        paid_left: paidCount
      });
    }

    // ── Claude Haiku 호출 ──
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: system_prompt || '',
        messages: messages,
      })
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      console.error('[claude error]', claudeRes.status, err);
      return res.status(500).json({ error: 'claude_error', detail: err });
    }

    const claudeData = await claudeRes.json();
    const reply = claudeData.content?.[0]?.text || '';

    // ── 카운트 업데이트 ──
    const newDailyCount = freeLeft > 0 ? dailyCount + 1 : dailyCount;
    const newPaidCount  = freeLeft > 0 ? paidCount : paidCount - 1;

    await fetch(`${SB_URL}/rest/v1/chat_users?id=eq.${user_id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        daily_count: newDailyCount,
        daily_reset_at: todayKST,
        paid_count: newPaidCount,
        updated_at: Date.now()
      })
    });

    return res.status(200).json({
      reply,
      free_left: Math.max(0, FREE_DAILY - newDailyCount),
      paid_left: newPaidCount
    });

  } catch (e) {
    console.error('[chat error]', e);
    return res.status(500).json({ error: 'server_error', detail: e.message });
  }
}
