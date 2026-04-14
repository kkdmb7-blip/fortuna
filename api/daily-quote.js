// fortuna-silk.vercel.app/api/daily-quote.js
// 오늘의 명언 반환 (날짜 기반, Make 데이터스토어에서 조회)
// 환경변수: MAKE_API_KEY

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const MAKE_API_KEY = process.env.MAKE_API_KEY;
  if (!MAKE_API_KEY) return res.status(500).json({ error: 'MAKE_API_KEY missing' });

  // 오늘 날짜(KST) 기준 quote id 계산
  const kst = new Date(Date.now() + 9 * 3600000);
  const dateNum = kst.getUTCFullYear() * 10000
    + (kst.getUTCMonth() + 1) * 100
    + kst.getUTCDate();
  const quoteIndex = dateNum % 50; // 0~49

  try {
    const makeRes = await fetch(
      'https://us2.make.com/api/v2/data-store-records?dataStoreId=85063&pg[limit]=100',
      { headers: { Authorization: `Token ${MAKE_API_KEY}`, 'Content-Type': 'application/json' } }
    );
    if (!makeRes.ok) {
      const err = await makeRes.text();
      return res.status(502).json({ error: 'Make API error', detail: err });
    }

    const makeData = await makeRes.json();

    // 레코드 배열 추출 (Make API 응답 형식 대응)
    const records = makeData.records || makeData.dataStoreRecords || [];

    let quotes = null;

    // fortuna_quotes_db 키에 배열 저장된 경우
    const mainRecord = records.find(r => r.key === 'fortuna_quotes_db');
    if (mainRecord) {
      const d = mainRecord.data;
      quotes = Array.isArray(d) ? d : (d && Array.isArray(d.items) ? d.items : null);
    }

    // 키별로 개별 레코드인 경우 (id: 1~50)
    if (!quotes && records.length > 1) {
      quotes = records
        .map(r => r.data || r)
        .filter(d => d && d.id && d.quote)
        .sort((a, b) => a.id - b.id);
    }

    if (!quotes || quotes.length === 0) {
      return res.status(404).json({ error: 'quotes not found' });
    }

    const item = quotes[quoteIndex % quotes.length];
    return res.json({
      id: item.id,
      quote: item.quote || '',
      source: item.source || '',
      message: item.message || ''
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
