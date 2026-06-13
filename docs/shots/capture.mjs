// 사용자매뉴얼.html 의 화면 그림(스크린샷)을 실제 앱에서 자동 캡처한다.
//  · 화면을 "열어서 찍기만" 하고 저장·전송·삭제 등 변경 동작은 누르지 않는다(읽기 전용).
//  · 비밀번호는 코드에 두지 않고 실행 시 환경변수로 전달한다.
//
// 사용법:
//   1) dev 서버 실행:           cd web && npm run dev        (→ http://localhost:3000)
//   2) Playwright 준비(1회):     npm i -D playwright && npx playwright install chromium
//   3) 캡처:                     DSQC_PW=비밀번호 node docs/shots/capture.mjs
//   (다른 주소면 BASE=http://... 추가)
//
// 결과: web/public/shots/*.png 가 갱신됨 → 매뉴얼(web/public/manual.html)이 같은 파일명을 자동 표시(수정 불필요).

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const BASE = process.env.BASE || 'http://localhost:3000';
const PW = process.env.DSQC_PW || '';
// 출력 위치 = web/public/shots (앱이 /manual.html 에서 src="shots/NAME.png" 로 읽는 곳).
// capture.mjs 자체는 docs/shots 에 두고 결과 PNG만 public 으로 내보낸다.
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'public', 'shots');
fs.mkdirSync(OUT, { recursive: true });
if (!PW) { console.error('DSQC_PW 환경변수에 로그인 비밀번호를 넣어 실행하세요.'); process.exit(1); }

const results = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 2, locale: 'ko-KR' });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
const wait = (ms) => page.waitForTimeout(ms);
const file = (n) => path.join(OUT, n);
async function shot(name, fn) {
  try { await fn(); results.push(`OK    ${name}`); }
  catch (e) { results.push(`FAIL  ${name} — ${String(e.message).split('\n')[0]}`); }
}
async function closeNotice() {
  await page.locator('button:has-text("닫기")').first().click({ timeout: 3500 }).catch(() => {});
  await page.waitForSelector('[data-slot=dialog-overlay]', { state: 'hidden', timeout: 4000 }).catch(() => {});
  await wait(300);
}
async function dataCount() {
  return await page.evaluate(() => {
    for (const s of document.querySelectorAll('span')) {
      const t = (s.textContent || '').trim();
      if (t.startsWith('데이터 ·')) {
        const sib = s.parentElement?.querySelectorAll('span');
        const val = (sib && sib[sib.length - 1]?.textContent) || '';
        if (/없음/.test(val)) return 0;
        const m = val.match(/([\d,]+)/); return m ? +m[1].replace(/,/g, '') : 0;
      }
    }
    return -1;
  });
}

// 1) 로그인 화면(인증 전)
await shot('login.png', async () => {
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type=password]'); await wait(800);
  await page.screenshot({ path: file('login.png') });
});

// 로그인 → 업데이트 안내 닫기 → 데이터 있는 작업일 찾기
await page.fill('input[type=password]', PW);
await page.click('button:has-text("로그인")');
await page.waitForSelector('h1:has-text("대시보드")', { timeout: 25000 });
await wait(700); await closeNotice();
let tries = 0;
while (tries < 16) { const c = await dataCount(); if (c > 0 || c === -1) break; await page.click('header button[aria-label="이전 날짜"]'); await wait(1000); tries++; }
results.push(`info  데이터 작업일: ${tries}일 전, 건수=${await dataCount()}`);
await wait(400);

// 2~4) 헤더 / 탭바 / 대시보드
await shot('header.png', async () => { await page.locator('header').first().screenshot({ path: file('header.png') }); });
await shot('nav.png', async () => { await page.locator('nav', { has: page.locator('button:has-text("대시보드")') }).first().screenshot({ path: file('nav.png') }); });
await shot('dashboard.png', async () => { await page.screenshot({ path: file('dashboard.png') }); });

// 5) 인쇄 미리보기
await shot('print.png', async () => {
  await page.locator('header button:has-text("인쇄")').click(); await wait(300);
  await page.getByRole('menuitem', { name: '입고', exact: true }).click();
  await page.waitForSelector('text=인쇄 미리보기', { timeout: 15000 }); await wait(1600);
  await page.screenshot({ path: file('print.png') });
  await page.keyboard.press('Escape'); await wait(400);
});

// 6) 작성
await shot('entry.png', async () => {
  await page.locator('nav button:has-text("작성")').click();
  await page.waitForSelector('text=입고/출고 전송', { timeout: 15000 }); await wait(700);
  await page.screenshot({ path: file('entry.png') });
});

// 공정(재고>0) 이름 버튼 클릭 → 그 공정 시트로 (ClientLink는 <a>가 아닌 button)
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1:has-text("대시보드")'); await closeNotice(); await wait(400);
let opened = false, procName = '';
{
  const rows = page.locator('table tbody tr');
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    const tds = rows.nth(i).locator('td');
    if (await tds.count() < 6) continue;                      // 공정 카드(6열)만
    const stock = parseFloat((await tds.nth(2).innerText()).replace(/[^\d.]/g, '')) || 0;
    if (stock > 0) { procName = (await rows.nth(i).locator('button').first().innerText()).trim(); await rows.nth(i).locator('button').first().click(); opened = true; break; }
  }
}
results.push(`info  진입 공정: ${procName || '없음'}`);

if (opened) {
  await page.waitForSelector('text=작업중', { timeout: 15000 }).catch(() => {}); await wait(900);
  // 7) 공정 시트
  await shot('process-sheet.png', async () => { await page.screenshot({ path: file('process-sheet.png') }); });

  // 잠금 아닌 작업중(왼쪽 표) 첫 행 선택
  async function selectWorkingRow() {
    const rows = page.locator('table').first().locator('tbody tr');
    const n = await rows.count();
    for (let i = 0; i < n; i++) {
      const row = rows.nth(i);
      if (await row.locator('.lucide-lock').count()) continue;
      const cb = row.getByRole('checkbox');
      if (await cb.count()) { await cb.first().click(); return true; }
      await row.locator('td').nth(3).click(); return true;
    }
    return false;
  }
  await selectWorkingRow().catch(() => {}); await wait(300);

  // 8) 작업완료(집계)
  await shot('complete.png', async () => {
    await page.locator('button:has-text("작업완료(집계)")').click();
    await page.waitForSelector('[role=dialog]:has-text("작업완료(집계)")', { timeout: 8000 }); await wait(700);
    await page.screenshot({ path: file('complete.png') });
    await page.keyboard.press('Escape'); await wait(400);
  });
  // 9) 나누기 (같은 1행 유지)
  await shot('split.png', async () => {
    await page.locator('button:has-text("나누기")').first().click();
    await page.waitForSelector('[role=dialog]:has-text("나누기")', { timeout: 8000 }); await wait(700);
    await page.screenshot({ path: file('split.png') });
    await page.keyboard.press('Escape'); await wait(400);
  });
  // 10) 계보 추적
  await shot('genealogy.png', async () => {
    await page.getByText(/[A-Z]_\d{6}_/).first().click();
    await page.waitForSelector('[role=dialog]:has-text("계보 추적")', { timeout: 8000 }); await wait(1200);
    await page.screenshot({ path: file('genealogy.png') });
    await page.keyboard.press('Escape'); await wait(400);
  });
}

// 11) 결산서
await shot('settlement.png', async () => {
  await page.goto(BASE + '/settlement', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=결산', { timeout: 15000 }).catch(() => {}); await wait(1000);
  await page.screenshot({ path: file('settlement.png'), fullPage: true });
});

await browser.close();
console.log('\n===== 캡처 결과 =====\n' + results.join('\n'));
