import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SB_SERVICE_KEY);
const ADMIN_ID = '99f9f77a-2f2a-4055-ab44-421d1c070341';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET: 관리자 통계 / 문의 목록 / 본인 문의
  if (req.method === 'GET') {
    const { admin_id, user_id, action } = req.query;

    // 공개 통계 (총 상담수)
    if (action === 'public-stats') {
      const { count, error } = await sb.from('chat_messages').select('*', { count: 'exact', head: true }).eq('role', 'user');
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ total_consultations: count || 0 });
    }

    // 관리자 통계
    if (action === 'stats' && admin_id === ADMIN_ID) {
      const todayKST = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const [
        { count: totalUsers },
        { count: todayUsers },
        { count: totalMessages },
        { count: todayMessages },
        { count: totalPayers }
      ] = await Promise.all([
        sb.from('chat_users').select('*', { count: 'exact', head: true }),
        sb.from('chat_users').select('*', { count: 'exact', head: true }).eq('daily_reset_at', todayKST),
        sb.from('chat_messages').select('*', { count: 'exact', head: true }).eq('role', 'user'),
        sb.from('chat_messages').select('*', { count: 'exact', head: true }).eq('role', 'user').gte('created_at', new Date(todayKST).getTime()),
        sb.from('orb_balance').select('*', { count: 'exact', head: true }).gt('total_charged', 0)
      ]);
      return res.json({ totalUsers, todayUsers, totalMessages, todayMessages, totalPayers });
    }

    // 관리자 문의 목록
    if (admin_id === ADMIN_ID) {
      const { data, error } = await sb.from('support_tickets').select('*').order('created_at', { ascending: false }).limit(50);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ tickets: data });
    }

    // 본인 문의
    if (user_id) {
      const { data, error } = await sb.from('support_tickets').select('*').eq('user_id', user_id).order('created_at', { ascending: false }).limit(20);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ tickets: data });
    }

    return res.status(400).json({ error: 'admin_id 또는 user_id 필요' });
  }

  // POST: 문의 등록
  if (req.method === 'POST') {
    const { user_id, user_name, user_email, category, message } = req.body || {};
    if (!user_id || !message) return res.status(400).json({ error: 'user_id, message 필수' });

    const { data, error } = await sb.from('support_tickets').insert({
      user_id, user_name: user_name || null, user_email: user_email || null,
      category: category || '기타', message
    }).select().single();

    if (error) return res.status(500).json({ error: error.message });

    // 관리자에게 푸시 알림
    try {
      const { data: subs } = await sb.from('push_subscriptions').select('subscription').eq('user_id', ADMIN_ID);
      if (subs && subs.length > 0) {
        const webpush = await import('web-push');
        webpush.default.setVapidDetails(
          'mailto:admin@memox.app',
          process.env.VAPID_PUBLIC_KEY,
          process.env.VAPID_PRIVATE_KEY
        );
        const payload = JSON.stringify({
          title: '새 문의가 접수됐어요',
          body: (user_name || '익명') + ': ' + message.slice(0, 60),
          url: '/memox/'
        });
        for (const s of subs) {
          try { await webpush.default.sendNotification(JSON.parse(s.subscription), payload); } catch(e) {}
        }
      }
    } catch(e) { console.warn('push failed', e.message); }

    return res.json({ ok: true, ticket: data });
  }

  // PATCH: 관리자 답변
  if (req.method === 'PATCH') {
    const { admin_id, ticket_id, admin_reply, status } = req.body || {};
    if (admin_id !== ADMIN_ID) return res.status(403).json({ error: 'forbidden' });

    const update = { updated_at: new Date().toISOString() };
    if (admin_reply) update.admin_reply = admin_reply;
    if (status) update.status = status;

    const { error } = await sb.from('support_tickets').update(update).eq('id', ticket_id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'method not allowed' });
}
