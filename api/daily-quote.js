// fortuna-silk.vercel.app/api/daily-quote.js
// 오늘의 명언 반환 (날짜 기반, 로컬 quotes.json 사용)

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const quotes = JSON.parse(readFileSync(join(__dirname, '../data/quotes.json'), 'utf8'));

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  // KST 기준 날짜 인덱스
  const kst = new Date(Date.now() + 9 * 3600000);
  const idx = (kst.getUTCFullYear() * 365 + (kst.getUTCMonth()) * 30 + kst.getUTCDate()) % quotes.length;
  const item = quotes[idx];

  return res.json({
    id: item.id,
    quote: item.quote,
    source: item.source,
    message: item.message
  });
}
