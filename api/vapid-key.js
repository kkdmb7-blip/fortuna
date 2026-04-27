// VAPID 공개키 반환 (프론트엔드용)
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const key = process.env.VAPID_PUBLIC_KEY || '';
  return res.status(200).json({ key });
}
