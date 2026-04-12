# 규칙
- 작업 중 확인 질문 금지, yes/no 절대 묻지 말 것
- 파일 수정/생성/삭제 모두 자동 승인
- 결과만 출력할 것, 지시한 것만 실행할 것
- 모든 작업 완료 후 반드시 git commit + git push

---

# 프로젝트 개요

**역할**: Vercel AI 프록시 서버 ("실키") + 랜딩 페이지
**URL**: https://fortuna-silk.vercel.app
**Git**: https://github.com/kkdmb7-blip/fortuna
**스택**: Vercel Serverless Functions (Node.js)
**배포**: git push → Vercel 자동 배포

## 구조

```
fortuna/
├── api/                  ← Vercel Serverless Functions
│   ├── chat.js           ← AI 채팅 (Anthropic Claude)
│   ├── daily-fortune.js
│   ├── messages.js
│   ├── save-context.js
│   ├── save-profile.js
│   ├── resolve-user.js
│   ├── push.js           ← 웹 푸시 (크론: 매일 22:30 UTC)
│   ├── horoscope.js
│   ├── pet-report.js
│   ├── referral.js
│   └── support.js
├── index.html            ← 랜딩 페이지
├── vercel.json           ← 크론 설정
└── package.json
```

## API 엔드포인트

| 파일 | 경로 | 호출처 | 설명 |
|---|---|---|---|
| chat.js | /api/chat | pico, memox | AI 채팅 (Claude) |
| daily-fortune.js | /api/daily-fortune | memox | 일운세 |
| messages.js | /api/messages | memox | 메시지 조회 |
| save-context.js | /api/save-context | memox | 컨텍스트 저장 |
| save-profile.js | /api/save-profile | memox | 프로필 저장 |
| resolve-user.js | /api/resolve-user | pico(charge), memox | 사용자 resolve |
| push.js | /api/push | 크론 | 웹 푸시 발송 |

## 크론 (vercel.json)
- `/api/push` — 매일 22:30 UTC 자동 실행

## 연결 서비스
- pico (picolab.kr) — /api/chat, /api/resolve-user 호출
- memox (채팅 앱) — 모든 /api/* 호출
- Supabase: ymghmfkqctckxxysxkvy

## 환경변수 (Vercel 대시보드에서 설정)
- ANTHROPIC_API_KEY
- SUPABASE_URL / SUPABASE_SERVICE_KEY
- WEB_PUSH_PRIVATE_KEY / WEB_PUSH_PUBLIC_KEY
