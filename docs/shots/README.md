# 사용자 매뉴얼 화면 그림 (캡처 도구)

`web/public/manual.html`(현장용 사용자 매뉴얼)에 들어가는 실제 화면 캡처(PNG)를 자동 생성하는 도구입니다.
**결과 PNG는 `web/public/shots/` 에 저장**되며(이 폴더의 `capture.mjs` 가 생성), 매뉴얼은 **파일 이름**으로
그림을 찾으므로 같은 이름으로 덮어쓰면 매뉴얼을 고치지 않아도 새 그림이 표시됩니다.

> 이 폴더(`docs/shots/`)에는 이제 캡처 **도구**(`capture.mjs`)와 이 README만 둡니다 — PNG 결과물은 `web/public/shots/` 에 있습니다.

| 파일 | 매뉴얼 위치 | 화면 |
|---|---|---|
| `header.png` | 2장 | 상단 바(작업일·인쇄·결산서·스위치) |
| `nav.png` | 3장 | 하단 탭바 |
| `login.png` | 4장 | 로그인 화면 |
| `dashboard.png` | 5장 | 대시보드 전체 |
| `entry.png` | 7장 | 작성(입력) 화면 |
| `process-sheet.png` | 9장 | 공정 시트(작업중/완료) |
| `complete.png` | 12장 | 작업완료(집계) 창 |
| `split.png` | 12장 | 나누기 창 |
| `genealogy.png` | 13장 | 계보 추적 창 |
| `settlement.png` | 15장 | 결산서 입력 |
| `print.png` | 16장 | 인쇄 미리보기 |

## 다시 캡처하기 (UI가 바뀌었을 때)

자동 캡처 스크립트(`capture.mjs`)로 11장을 한 번에 새로 찍어 **`web/public/shots/`** 에 저장합니다.
화면을 **열어서 찍기만** 하고 저장·전송·삭제 같은 변경 동작은 누르지 않습니다(읽기 전용).
데이터가 있는 작업일을 자동으로 찾습니다.

```bash
# 1) dev 서버 실행
cd web && npm run dev           # → http://localhost:3000

# 2) Playwright 준비(최초 1회)
npm i -D playwright && npx playwright install chromium

# 3) 캡처 (비밀번호는 환경변수로만 전달 — 파일에 저장하지 않음)
DSQC_PW=비밀번호 node docs/shots/capture.mjs
```

## 손으로 바꾸고 싶을 때

원하는 화면을 직접 캡처(Windows: `Win`+`Shift`+`S`)해서 위 표의 **같은 파일 이름**으로
`web/public/shots/` 에 저장하면 됩니다.
