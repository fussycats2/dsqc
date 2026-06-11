// fetch 기반 파일 다운로드 — location.href 내비게이션 방식은 서버가 파일을 만드는 동안
//  브라우저에 아무 표시가 없어 무응답처럼 느껴진다. fetch로 받으면 호출부가 시작/완료/실패를
//  알 수 있어 버튼 스피너·에러 안내가 가능하다. (백업 파일은 수 MB 수준 — 메모리 버퍼링 무방)
export async function downloadFile(url: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    // export 라우트는 실패 시 { error } JSON을 반환
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(j?.error ?? `다운로드 실패 (HTTP ${res.status})`);
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") ?? "";
  const m = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  const name = m ? decodeURIComponent(m[1]) : "download.xlsx";
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a); // Firefox는 DOM에 붙어 있어야 click이 동작
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}
