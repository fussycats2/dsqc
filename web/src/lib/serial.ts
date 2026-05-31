// 일련번호 병합 표기 (VBA Module7 BuildBOutput_Grouped 포팅)
//  - "부서_날짜_접미" 형식: 접미는 3자리 숫자 + (-숫자) 반복
//  - 같은 접두부 접미 1개 → 원본 그대로(M_260521_001)
//  - 2개 이상 → M_260521_(001,004)
//  - 형식 불일치 값은 그대로, 전체는 ';'로 연결
//  ※ 단건이면 원본 일련번호가 그대로 유지됨

function validSuffix(suf: string): boolean {
  if (suf.length < 3) return false;
  if (!/^\d{3}/.test(suf)) return false;
  let i = 3;
  while (i < suf.length) {
    if (suf[i] !== "-") return false;
    if (i + 1 >= suf.length) return false;
    if (!/\d/.test(suf[i + 1])) return false;
    i += 2;
  }
  return true;
}

function extract(s: string): { prefix: string; suffix: string } | null {
  s = s.trim();
  const p = s.lastIndexOf("_");
  if (p < 0) return null;
  const suffix = s.slice(p + 1);
  if (!validSuffix(suffix)) return null;
  return { prefix: s.slice(0, p + 1), suffix };
}

function sortSuffixes(arr: string[]): string[] {
  return [...arr].sort((a, b) => {
    const pa = parseInt(a.slice(0, 3), 10);
    const pb = parseInt(b.slice(0, 3), 10);
    if (pa !== pb) return pa - pb;
    return a.slice(3).localeCompare(b.slice(3));
  });
}

export function buildGroupedSerial(serials: (string | null)[]): string {
  const groups = new Map<string, Set<string>>();
  const others = new Set<string>();
  for (const s of serials) {
    if (!s) continue;
    const e = extract(s);
    if (e) {
      if (!groups.has(e.prefix)) groups.set(e.prefix, new Set());
      groups.get(e.prefix)!.add(e.suffix);
    } else {
      others.add(s);
    }
  }
  const parts: string[] = [];
  for (const pf of [...groups.keys()].sort()) {
    const sufs = [...groups.get(pf)!];
    parts.push(
      sufs.length === 1 ? pf + sufs[0] : pf + "(" + sortSuffixes(sufs).join(",") + ")",
    );
  }
  for (const o of [...others].sort()) parts.push(o);
  return parts.join(";");
}
