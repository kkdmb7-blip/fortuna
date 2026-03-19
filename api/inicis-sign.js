// fortuna-silk.vercel.app/api/inicis-sign.js
// KG이니시스 서명 생성 (SHA-256)

const crypto = require('crypto');

const SIGN_KEY = 'cDl0K0Z1aXhHeWZlUFQ3N0NnZlNtdz09';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { mid, oid, price, timestamp } = req.body;

    const signStr = `oid=${oid}&price=${price}&timestamp=${timestamp}&signKey=${SIGN_KEY}`;
    const signature = crypto.createHash('sha256').update(signStr).digest('hex');
    const mKey = crypto.createHash('sha256').update(SIGN_KEY).digest('hex');

    res.status(200).json({ signature, mKey });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
