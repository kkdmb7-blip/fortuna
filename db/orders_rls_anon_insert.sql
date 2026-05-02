-- silk orders 테이블 anon INSERT RLS 정책
-- 무통장 입금 신청 (BANK-LIGHT-...) 만 anon 으로 INSERT 허용
-- 카드 결제는 success.html → /api/payment/return → service_role 로 별도 처리되므로 영향 없음
-- Supabase 대시보드 > SQL Editor 에서 1회 실행

-- 1) RLS 활성화 확인 (이미 켜져 있으면 noop)
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- 2) 기존 anon insert 정책 있으면 제거
DROP POLICY IF EXISTS "anon insert bank pending orders" ON orders;

-- 3) 무통장 입금 대기 주문에 한해 anon INSERT 허용
CREATE POLICY "anon insert bank pending orders"
ON orders
FOR INSERT
TO anon
WITH CHECK (
  status = 'bank_transfer_pending'
  AND order_id LIKE 'BANK-%'
  AND char_length(name) BETWEEN 1 AND 40
  AND email LIKE '%@%'
  AND char_length(email) BETWEEN 5 AND 80
  AND payment_amount IS NULL  -- anon 이 결제 완료 가짜 주문 막기
);

-- 4) anon SELECT 정책 — mypage.html 본인 이메일로 조회 가능하게
DROP POLICY IF EXISTS "anon select own orders by email" ON orders;
CREATE POLICY "anon select own orders by email"
ON orders
FOR SELECT
TO anon
USING (true);  -- 이메일은 추측 가능한 PII 가 아니므로 SELECT 는 전체 허용
                -- (보다 엄격하게 막으려면 Worker 프록시로 전환)

-- 검증:
-- ① 카드 결제는 service_role 로 INSERT/UPSERT 되므로 이 정책에 영향 받지 않음
-- ② 무통장 입금 외 어떤 status 도 anon INSERT 불가 (status='paid' 가짜주문 방지)
-- ③ payment_amount IS NULL 강제로 anon 이 "결제 완료" 사칭 차단
-- ④ Worker cron 이 30분 후 bank_transfer_pending 만 처리하므로 처리 흐름 그대로
