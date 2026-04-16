// restyle.js — fortuna 전체 HTML을 pico 디자인 시스템으로 치환
const fs = require('fs');
const path = require('path');

const dir = __dirname;

// HTML 파일 목록 (재귀 탐색, node_modules 제외)
function findHtmlFiles(dir) {
  const result = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) result.push(...findHtmlFiles(full));
    else if (e.isFile() && e.name.endsWith('.html')) result.push(full);
  }
  return result;
}
const files = findHtmlFiles(dir);

console.log(`처리 대상: ${files.length}개 파일`);

let totalChanged = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  const original = content;

  // ── 폰트 치환 ──
  // Pretendard CDN → Noto Sans KR
  content = content.replace(
    /<link[^>]*cdn\.jsdelivr\.net\/gh\/orioncactus\/pretendard[^>]*>/gi,
    '<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;700&family=Noto+Sans+KR:wght@300;400;500;700&display=swap" rel="stylesheet">'
  );
  // @import pretendard
  content = content.replace(
    /@import\s+url\(['"]?https:\/\/cdn\.jsdelivr\.net\/gh\/orioncactus\/pretendard[^)'"]+['"]?\);?\s*/gi,
    "@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;700&family=Noto+Sans+KR:wght@300;400;500;700&display=swap');\n"
  );
  content = content.replace(/'Pretendard',\s*sans-serif/g, "'Noto Sans KR',sans-serif");
  content = content.replace(/'Pretendard'/g, "'Noto Sans KR'");
  content = content.replace(/Pretendard/g, 'Noto Sans KR');

  // ── :root 변수 치환 ──
  // --void 정의
  content = content.replace(/--void\s*:\s*#[0-9a-fA-F]{3,8};/g, '--bg:#0a0a0f;');
  // --gold 구버전
  content = content.replace(/--gold\s*:\s*#c9a84c;/g, '--gold:#d4af37;');
  content = content.replace(/--gold\s*:\s*#C9A84C;/g, '--gold:#d4af37;');
  // --golddim 구버전
  content = content.replace(/--golddim\s*:\s*rgba\(201,\s*168,\s*76,\s*0\.18\);/g, '--golddim:rgba(212,175,55,0.18);');
  // --blue → --accent
  content = content.replace(/--blue\s*:\s*#8ab4ff;/g, '--accent:#7b5ea7;');
  content = content.replace(/--blue\s*:\s*#8AB4FF;/g, '--accent:#7b5ea7;');
  // --dim → --muted
  content = content.replace(/--dim\s*:/g, '--muted:');
  content = content.replace(/--muted\s*:\s*#9b8fb0;/g, '--muted:#8b8ba8;');
  content = content.replace(/--muted\s*:\s*#9B8FB0;/g, '--muted:#8b8ba8;');
  // --fn 변수
  content = content.replace(/--fn\s*:\s*'[^']*',\s*sans-serif;/g, "--fn:'Noto Sans KR',sans-serif;");

  // ── var() 참조 치환 ──
  content = content.replace(/var\(--void\)/g, 'var(--bg)');
  content = content.replace(/var\(--blue\)/g, 'var(--accent)');
  content = content.replace(/var\(--dim\)/g, 'var(--muted)');

  // ── 배경색 치환 ──
  const bgReplace = ['#05020e','#06030f','#0d0b14','#07030e','#05020E','#06030F','#0D0B14','#07030E'];
  for (const c of bgReplace) {
    content = content.split(c).join('#0a0a0f');
  }
  // theme-color meta
  content = content.replace(/content="#[0-9a-fA-F]{6}"(\s*>?\s*<!--.*?-->)?\s*(<!--.*?-->)?\s*(?=<meta name="mobile|<meta name="apple|<link)/g,
    (m) => m.replace(/#[0-9a-fA-F]{6}/, '#0a0a0f')
  );
  content = content.replace(/<meta name="theme-color" content="#[0-9a-fA-F]{6}">/g,
    '<meta name="theme-color" content="#0a0a0f">');

  // 서피스 치환
  content = content.split('#16132a').join('#13131a');
  content = content.split('#16132A').join('#13131a');
  content = content.split('#1a0f38').join('#13131a');
  content = content.split('#1A0F38').join('#13131a');

  // ── 색상 치환 ──
  // 골드
  content = content.split('#c9a84c').join('#d4af37');
  content = content.split('#C9A84C').join('#d4af37');
  content = content.split('#c9A84c').join('#d4af37');

  // rgba 골드
  content = content.replace(/rgba\(\s*201\s*,\s*168\s*,\s*76\s*,/g, 'rgba(212,175,55,');

  // 파랑 → 보라
  content = content.split('#8ab4ff').join('#c4a7f0');
  content = content.split('#8AB4FF').join('#c4a7f0');
  content = content.replace(/rgba\(\s*138\s*,\s*180\s*,\s*255\s*,/g, 'rgba(123,94,167,');
  content = content.replace(/rgba\(\s*138\s*,\s*100\s*,\s*255\s*,/g, 'rgba(123,94,167,');

  // 구 서피스 rgba
  content = content.replace(/rgba\(\s*36\s*,\s*22\s*,\s*63\s*,/g, 'rgba(28,28,40,');
  content = content.replace(/rgba\(\s*38\s*,\s*24\s*,\s*68\s*,/g, 'rgba(28,28,40,');
  content = content.replace(/rgba\(\s*46\s*,\s*24\s*,\s*7\s*,/g, 'rgba(19,19,26,');
  content = content.replace(/rgba\(\s*48\s*,\s*18\s*,\s*95\s*,/g, 'rgba(40,20,80,');
  content = content.replace(/rgba\(\s*70\s*,\s*25\s*,\s*110\s*,/g, 'rgba(50,25,90,');
  content = content.replace(/rgba\(\s*45\s*,\s*31\s*,\s*78\s*,/g, 'rgba(28,28,40,');

  // muted 색상
  content = content.split('#9b8fb0').join('#8b8ba8');
  content = content.split('#9B8FB0').join('#8b8ba8');

  // nav 배경 rgba(5,2,14,...) → rgba(10,10,15,...)
  content = content.replace(/rgba\(\s*5\s*,\s*2\s*,\s*14\s*,/g, 'rgba(10,10,15,');
  content = content.replace(/rgba\(\s*6\s*,\s*3\s*,\s*15\s*,/g, 'rgba(10,10,15,');
  content = content.replace(/rgba\(\s*7\s*,\s*3\s*,\s*14\s*,/g, 'rgba(10,10,15,');
  content = content.replace(/rgba\(\s*13\s*,\s*11\s*,\s*20\s*,/g, 'rgba(10,10,15,');

  // ── 카드 border-radius 통일 ──
  content = content.replace(/border-radius\s*:\s*28px/g, 'border-radius:20px');
  content = content.replace(/border-radius\s*:\s*24px/g, 'border-radius:16px');
  content = content.replace(/border-radius\s*:\s*22px/g, 'border-radius:16px');
  content = content.replace(/border-radius\s*:\s*20px/g, 'border-radius:16px');
  content = content.replace(/border-radius\s*:\s*18px/g, 'border-radius:14px');

  // ── gradient 버튼 통일 ──
  // 골드 gradient → 보라
  content = content.replace(/background\s*:\s*linear-gradient\s*\(\s*135deg\s*,\s*#c9a84c\s*,\s*#e8cc7a\s*,\s*#c9a84c\s*\)/gi,
    'background:linear-gradient(135deg,#7b5ea7,#a07fd4)');
  content = content.replace(/background\s*:\s*linear-gradient\s*\(\s*135deg\s*,\s*#d4af37\s*,\s*#e8cc7a\s*,\s*#d4af37\s*\)/gi,
    'background:linear-gradient(135deg,#7b5ea7,#a07fd4)');
  content = content.replace(/background\s*:\s*linear-gradient\s*\(\s*135deg\s*,\s*#6c3fa0\s*,\s*#b482ff\s*\)/gi,
    'background:linear-gradient(135deg,#7b5ea7,#a07fd4)');
  // 골드 버튼 텍스트 색상
  content = content.replace(/color\s*:\s*#0a0612\s*;/g, 'color:#fff;');
  content = content.replace(/color\s*:\s*#0a0612\b/g, 'color:#fff');
  // shimmer animation 제거
  content = content.replace(/animation\s*:\s*shimmer\s+3s\s+ease\s+infinite\s*;?\s*/g, '');
  // background-size:200% (shimmer 전용)
  content = content.replace(/background-size\s*:\s*200%\s*;?\s*/g, '');

  // ── 배경 애니메이션 제거 ──

  // 1) <canvas id="stars"> 엘리먼트 제거
  content = content.replace(/<canvas\s+id=["']stars["'][^>]*><\/canvas>/gi, '');
  content = content.replace(/<canvas\s+id=["']stars["'][^>]*>/gi, '');

  // 2) .neb/.nebula CSS 블록 제거 (개별 선택자)
  // .n1, .n2, .n3, .neb, .nebula, .bg-nebula CSS 규칙 제거
  content = content.replace(/\.(neb|nebula|bg-nebula|n1|n2|n3)\s*\{[^}]*\}/g, '');

  // 3) .star CSS 제거
  content = content.replace(/\.star\s*\{[^}]*background\s*:\s*white[^}]*\}/gi, '');
  content = content.replace(/\.star\s*\{[^}]*border-radius\s*:\s*50%[^}]*\}/gi, '');

  // 4) @keyframes twinkle 제거
  content = content.replace(/@keyframes\s+twinkle\s*\{[^}]*\}/g, '');
  content = content.replace(/@keyframes\s+shimmer\s*\{[\s\S]*?\}\s*\}/g, '');
  content = content.replace(/@keyframes\s+shimmer\s*\{[^}]*\}/g, '');

  // 5) 별 그리는 JS 루프 제거 (stars canvas 관련 스크립트 블록)
  // <script> 블록 내에 stars/canvas 관련 코드 제거
  content = content.replace(/<script>\s*\/\/ ?stars[\s\S]*?<\/script>/gi, '');
  content = content.replace(/<script>\s*const\s+cvs\s*=\s*document\.getElementById\(['"]stars['"]\)[\s\S]*?<\/script>/gi, '');

  // 별 생성 for 루프 (인라인 script 내) - 광범위 패턴
  content = content.replace(/\/\/ ?stars[\s\S]{0,2000}?requestAnimationFrame\(draw\);/g, '');
  content = content.replace(/const\s+cvs\s*=\s*document\.getElementById\(['"]stars['"]\);[\s\S]{0,3000}?requestAnimationFrame\(draw\);/g, '');

  // .bg div (성운 div 구조) 제거
  content = content.replace(/<div class="bg">[\s\S]*?<\/div>\s*<!--?\s*\/bg\s*--?>/gi, '');
  content = content.replace(/<div class="bg">\s*(<div class="neb[^"]*">\s*<\/div>\s*)*(<canvas[^>]*>\s*<\/canvas>)?\s*<\/div>/gi, '');
  content = content.replace(/<div class="bg">[^<]*(<div[^>]*>[^<]*<\/div>\s*)*<canvas[^>]*><\/canvas>\s*<\/div>/gi, '');

  // .stars div (planet 파일 패턴)
  content = content.replace(/<div class="stars"[^>]*><\/div>/gi, '');
  content = content.replace(/<div class="stars"[^>]*id=["']stars["'][^>]*><\/div>/gi, '');

  // .stars CSS 제거
  content = content.replace(/\.stars\s*\{[^}]*pointer-events[^}]*\}/g, '');

  // 별 생성 JS (starsEl 패턴 - CRLF/LF 모두 처리)
  content = content.replace(/const\s+starsEl\s*=\s*document\.getElementById\(['"]stars['"]\);[\s\S]{0,500}?starsEl\.appendChild\(s\);\}/g, '');

  // 별 생성 JS (bg 패턴, 루프)
  content = content.replace(/\/\/\s*별\s*생성[\s\S]{0,600}?\.appendChild\(s\);\s*\}/g, '');

  // shimmer animation 다양한 패턴
  content = content.replace(/animation\s*:\s*shimmer\s+\d+s[^;]*;?\s*/g, '');

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    totalChanged++;
    console.log(`  변경됨: ${path.relative(dir, file)}`);
  } else {
    console.log(`  변경없음: ${path.relative(dir, file)}`);
  }
}

console.log(`\n완료: ${totalChanged}/${files.length}개 파일 변경됨`);
