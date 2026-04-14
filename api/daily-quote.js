// fortuna-silk.vercel.app/api/daily-quote.js
// 오늘의 명언 반환 (날짜 기반)

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const quotes = require('./quotes.json');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const kst = new Date(Date.now() + 9 * 3600000);
  const idx = (kst.getUTCFullYear() * 365 + kst.getUTCMonth() * 30 + kst.getUTCDate()) % quotes.length;
  const item = quotes[idx];

  return res.json({
    id: item.id,
    quote: item.quote,
    source: item.source,
    message: item.message
  });
}
