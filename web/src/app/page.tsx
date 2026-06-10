import { ClientLink } from "@/components/ClientLink";
import { createClient } from "@/lib/supabase/server";
import { envMissing, getProcesses } from "@/lib/getProcesses";
import { fetchAll } from "@/lib/fetchAll";
import { fmtWeight, round2, type Process } from "@/lib/types";
import { getWorkDate } from "@/lib/workDate";
import { DayClose } from "./DayClose";
import { Backup } from "./Backup";
import { UpdateNotice } from "@/components/UpdateNotice";

type Karat = "18K" | "14K";

// 공정별 집계 — lots를 직접 합산(v_process_balance는 locked/미작업/로스 구분 불가)
interface Agg {
  inW: number; // 입고(side=in) 중량 합
  outW: number; // 출고(side=out) 중량 합 = 작업후(Q) 합
  stock: number; // 재고 = 입고 중 잠금 안 된 것만 합산(미집계 재고)
  lossW: number; // 로스 = 출고행의 (작업전−작업후) 합
  outUnlocked: number; // 작업완료 후 미출고 = 완료(side=out) 중 잠금 안 된 건수
}
const EMPTY: Agg = { inW: 0, outW: 0, stock: 0, lossW: 0, outUnlocked: 0 };

function NameLink({ p }: { p: Process }) {
  const blue = p.karat === "14K";
  return (
    <ClientLink
      href={`/process/${p.id}`}
      className={`group inline-flex items-center gap-1 font-medium hover:underline ${blue ? "text-blue-600 dark:text-blue-400" : ""}`}
    >
      {p.name}
      <span className="text-slate-300 opacity-0 transition-opacity group-hover:opacity-100 dark:text-neutral-600">
        ›
      </span>
    </ClientLink>
  );
}

const cardCls =
  "overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900";
const thR =
  "px-2 py-1.5 text-right font-medium text-slate-400 dark:text-neutral-500";
const tdR = "px-2 py-1.5 text-right tabular-nums";

function CardHeader({
  title,
  accent,
  count,
  right,
}: {
  title: string;
  accent: string;
  count: number;
  right: string;
}) {
  return (
    <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 dark:border-neutral-800">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${accent}`} />
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-neutral-800 dark:text-neutral-400">
          {count}
        </span>
      </div>
      <span className="text-[11px] tabular-nums text-slate-400">{right}</span>
    </header>
  );
}

// 오차 셀: 0이면 흐림, 0 아니면 빨강 강조
function ErrCell({ v }: { v: number }) {
  const e = round2(v);
  return (
    <td className={tdR}>
      <span
        className={`rounded-md px-1.5 py-0.5 ${e !== 0 ? "bg-rose-50 font-semibold text-rose-600 dark:bg-rose-950/40 dark:text-rose-400" : "text-slate-300 dark:text-neutral-600"}`}
      >
        {fmtWeight(e)}
      </span>
    </td>
  );
}

// ───────── 공정 카드: 입고 / 재고 / 출고 / 로스 / 오차 ─────────
//  오차 = 입고 − 재고 − 출고 − 로스 (정상이면 0)
function ProcessCard({
  title,
  accent,
  procs,
  agg,
}: {
  title: string;
  accent: string;
  procs: Process[];
  agg: Map<string, Agg>;
}) {
  const A = (id: string) => agg.get(id) ?? EMPTY;
  const tIn = round2(procs.reduce((a, p) => a + A(p.id).inW, 0));
  const tStock = round2(procs.reduce((a, p) => a + A(p.id).stock, 0));
  const tOut = round2(procs.reduce((a, p) => a + A(p.id).outW, 0));
  const tLoss = round2(procs.reduce((a, p) => a + A(p.id).lossW, 0));
  return (
    // flex 컬럼 + 표 flex-1 + spacer 행 → 18K/14K 공정 카드 높이가 맞춰지고 "계"가 같은 라인에 정렬
    <section className={`${cardCls} flex min-w-[360px] flex-1 flex-col`}>
      <CardHeader
        title={title}
        accent={accent}
        count={procs.length}
        right={`재고 ${fmtWeight(tStock)}`}
      />
      <table className="w-full flex-1 text-xs">
        <thead>
          <tr className="border-b border-slate-100 dark:border-neutral-800">
            <th className="px-2 py-1.5 text-center font-medium text-slate-400 dark:text-neutral-500">
              공정
            </th>
            <th className={thR}>입고</th>
            <th className={thR}>재고</th>
            <th className={thR}>출고</th>
            <th className={thR}>로스</th>
            <th className={thR}>오차</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50 dark:divide-neutral-800/60">
          {procs.length === 0 ? (
            <tr>
              <td
                colSpan={6}
                className="px-2 py-6 text-center text-slate-300 dark:text-neutral-600"
              >
                데이터 없음
              </td>
            </tr>
          ) : (
            procs.map((p) => {
              const a = A(p.id);
              const stock = round2(a.stock);
              return (
                <tr
                  key={p.id}
                  className="hover:bg-slate-50 dark:hover:bg-neutral-800/50"
                >
                  <td className="px-2 py-1.5 text-center">
                    <NameLink p={p} />
                  </td>
                  <td className={tdR}>{fmtWeight(a.inW)}</td>
                  <td className={tdR}>
                    <span
                      className={
                        stock > 0
                          ? "text-emerald-700 dark:text-emerald-300"
                          : "text-slate-400"
                      }
                    >
                      {fmtWeight(stock)}
                    </span>
                  </td>
                  <td className={tdR}>{fmtWeight(a.outW)}</td>
                  <td className={`${tdR} text-slate-500 dark:text-neutral-400`}>
                    {fmtWeight(a.lossW)}
                  </td>
                  <ErrCell v={a.inW - a.stock - a.outW - a.lossW} />
                </tr>
              );
            })
          )}
          {/* 남는 세로 공간 흡수 → 계 행을 바닥으로 밀어 18K/14K 카드 간 정렬 */}
          <tr aria-hidden className="h-full">
            <td colSpan={6} />
          </tr>
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-200 bg-slate-50/60 font-semibold dark:border-neutral-700 dark:bg-neutral-800/40">
            <td className="px-2 py-1.5 text-center">계</td>
            <td className={tdR}>{fmtWeight(tIn)}</td>
            <td className={tdR}>{fmtWeight(tStock)}</td>
            <td className={tdR}>{fmtWeight(tOut)}</td>
            <td className={tdR}>{fmtWeight(tLoss)}</td>
            <ErrCell v={tIn - tStock - tOut - tLoss} />
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

// ───────── 부서·검수 카드: 입고중량 / 출고중량 (재고 개념 없음, 좁게) ─────────
function FlowCard({
  title,
  accent,
  label,
  procs,
  agg,
}: {
  title: string;
  accent: string;
  label: string;
  procs: Process[];
  agg: Map<string, Agg>;
}) {
  const A = (id: string) => agg.get(id) ?? EMPTY;
  const tIn = round2(procs.reduce((a, p) => a + A(p.id).inW, 0));
  const tOut = round2(procs.reduce((a, p) => a + A(p.id).outW, 0));
  return (
    // flex 컬럼 + 표 flex-1 + spacer 행 → 같은 줄 카드끼리 높이가 맞춰지고 "계"가 바닥에 정렬
    <section className={`${cardCls} flex min-w-[230px] flex-1 flex-col`}>
      <CardHeader
        title={title}
        accent={accent}
        count={procs.length}
        right={`입 ${fmtWeight(tIn)}`}
      />
      <table className="w-full flex-1 text-xs">
        <thead>
          <tr className="border-b border-slate-100 dark:border-neutral-800">
            <th className="px-2 py-1.5 text-center font-medium text-slate-400 dark:text-neutral-500">
              {label}
            </th>
            <th className={thR}>입고중량</th>
            <th className={thR}>출고중량</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50 dark:divide-neutral-800/60">
          {procs.length === 0 ? (
            <tr>
              <td
                colSpan={3}
                className="px-2 py-6 text-center text-slate-300 dark:text-neutral-600"
              >
                데이터 없음
              </td>
            </tr>
          ) : (
            procs.map((p) => {
              const a = A(p.id);
              return (
                <tr
                  key={p.id}
                  className="hover:bg-slate-50 dark:hover:bg-neutral-800/50"
                >
                  <td className="px-2 py-1.5 text-center">
                    <NameLink p={p} />
                  </td>
                  <td className={tdR}>{fmtWeight(a.inW)}</td>
                  <td className={tdR}>{fmtWeight(a.outW)}</td>
                </tr>
              );
            })
          )}
          {/* 남는 세로 공간 흡수 → 계 행을 바닥으로 밀어 카드 간 정렬 */}
          <tr aria-hidden className="h-full">
            <td colSpan={3} />
          </tr>
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-200 bg-slate-50/60 font-semibold dark:border-neutral-700 dark:bg-neutral-800/40">
            <td className="px-2 py-1.5 text-center">계</td>
            <td className={tdR}>{fmtWeight(tIn)}</td>
            <td className={tdR}>{fmtWeight(tOut)}</td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500">
        {title}
      </h2>
      <div className="flex flex-wrap gap-4">{children}</div>
    </div>
  );
}

export default async function Home() {
  if (envMissing()) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <h1 className="mb-4 text-2xl font-bold">dsqc — 제조공정 관리</h1>
        <div className="rounded-xl border border-amber-400 bg-amber-50 p-4 text-sm dark:bg-amber-950/40">
          <p className="mb-2 font-semibold">
            ⚙️ Supabase 연결이 아직 설정되지 않았습니다.
          </p>
          <ol className="ml-5 list-decimal space-y-1">
            <li>supabase.com에서 무료 프로젝트 생성</li>
            <li>
              SQL Editor에 <code>0001_init.sql</code> → <code>seed.sql</code>{" "}
              실행
            </li>
            <li>
              <code>web/.env.local</code>에 URL/anon key 입력 후 재시작
            </li>
          </ol>
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const workDate = await getWorkDate();
  // processes는 getProcesses()(레이아웃과 React cache로 dedupe + 모듈 캐시)로 — 자체 중복 쿼리 제거
  const [{ data: lotData }, procAll] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("lots")
        .select("process_id, side, weight, weight_before, locked")
        .eq("work_date", workDate)
        .order("id")
        .range(from, to),
    ),
    getProcesses(),
  ]);

  // 선택 작업일에 실제로 들어온 lot 행 수 — "데이터 없음"인지 "아직 안 불러왔는지" 구분용(0이면 진짜 없음)
  const lotCount = (lotData ?? []).length;

  // lots → 공정별 집계 (선택 작업일)
  const agg = new Map<string, Agg>();
  const getA = (id: string) => {
    let a = agg.get(id);
    if (!a) {
      a = { inW: 0, outW: 0, stock: 0, lossW: 0, outUnlocked: 0 };
      agg.set(id, a);
    }
    return a;
  };
  for (const l of (lotData ?? []) as {
    process_id: string;
    side: string;
    weight: number | null;
    weight_before: number | null;
    locked: boolean;
  }[]) {
    if (!l.process_id) continue;
    const a = getA(l.process_id);
    const w = Number(l.weight) || 0;
    if (l.side === "in") {
      a.inW += w;
      if (!l.locked) a.stock += w;
    } else {
      a.outW += w;
      a.lossW += (Number(l.weight_before) || 0) - w; // 로스 = 작업전 − 작업후
      if (!l.locked) a.outUnlocked += 1;
    }
  }

  // 분류: 부서(io 비검수) / 공정(work) / 검수(inspection), 각각 18K·14K
  const procList = procAll.filter((p) => p.schema_type !== "entry");
  const dept = (k: Karat) =>
    procList.filter(
      (p) => p.schema_type === "io" && !p.is_inspection && p.karat === k,
    );
  const work = (k: Karat) =>
    procList.filter((p) => p.schema_type === "work" && p.karat === k);
  const insp = (k: Karat) =>
    procList.filter((p) => p.is_inspection && p.karat === k);

  const sumStock = (procs: Process[]) =>
    round2(procs.reduce((a, p) => a + (agg.get(p.id)?.stock ?? 0), 0));

  // 작업완료 후 미출고(완료 미잠금) — 공정(work)만 해당, 부서·검수 제외
  const pending = procList
    .filter((p) => p.schema_type === "work")
    .map((p) => ({ p, cnt: agg.get(p.id)?.outUnlocked ?? 0 }))
    .filter((x) => x.cnt > 0);
  const pendingTotal = pending.reduce((a, x) => a + x.cnt, 0);

  // 공정(work) 중량오차 — 오차 = 입고 − 재고 − 출고 − 로스 (정상이면 0). 18K·14K 공정만.
  const errs = procList
    .filter((p) => p.schema_type === "work")
    .map((p) => {
      const a = agg.get(p.id) ?? EMPTY;
      return { p, err: round2(a.inW - a.stock - a.outW - a.lossW) };
    })
    .filter((x) => x.err !== 0);

  return (
    <main className="space-y-5 p-6">
      {/* 로그인(새 세션) 시 신규 업데이트 안내 모달 — 평소엔 아무것도 렌더 안 함 */}
      <UpdateNotice />

      {/* 상단 제목 — 설명은 제목 오른쪽에 인라인 */}
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-bold tracking-tight">대시보드</h1>
        <p className="text-xs text-slate-400 dark:text-neutral-500">
          파트별 현황 — 이름을 누르면 해당 시트로 이동
        </p>
      </div>

      {/* 일마감 박스 + 알림(미출고·중량오차)을 하나의 sticky 컨테이너로 묶어 함께 상단 고정.
          스크롤해도 둘 다 헤더 바로 아래에 붙어 따라오고, 내부 space-y-2로 둘 사이 간격을 좁게 유지. */}
      <div className="sticky top-[49px] z-10 -mx-6 -mt-2 space-y-2 border-b border-slate-100 bg-white/90 px-6 py-2 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
        {/* 일마감 + 날짜 변경 (18K·14K 재고는 이 박스 오른쪽에 표시) */}
        <DayClose
          workDate={workDate}
          lotCount={lotCount}
          stock18={fmtWeight(sumStock(work("18K")))}
          stock14={fmtWeight(sumStock(work("14K")))}
        />

        {/* 알림은 있을 때만 렌더 — 일마감 박스 바로 아래에 좁은 간격으로 표시 */}
        {(pendingTotal > 0 || errs.length > 0) && (
          <div className="space-y-2">
            {pendingTotal > 0 && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-800/60 dark:bg-amber-950/30">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
                  ⚠️ 작업완료 후 미출고 {pendingTotal}건 — 출고/이관이 필요합니다
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {pending.map(({ p, cnt }) => (
                    <ClientLink
                      key={p.id}
                      href={`/process/${p.id}`}
                      className="rounded-full border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-neutral-900 dark:text-amber-200 dark:hover:bg-neutral-800"
                    >
                      {p.name} <b className="tabular-nums">{cnt}</b>건
                    </ClientLink>
                  ))}
                </div>
              </div>
            )}
            {errs.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-rose-300 bg-rose-50 p-3 dark:border-rose-800/60 dark:bg-rose-950/30">
                <div className="flex items-center gap-2 text-sm font-semibold text-rose-700 dark:text-rose-300">
                  ⚠️ 공정 중량오차 {errs.length}건 — 집계 불일치 확인 필요
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {errs.map(({ p, err }) => (
                    <ClientLink
                      key={p.id}
                      href={`/process/${p.id}`}
                      className="rounded-full border border-rose-300 bg-white px-2.5 py-1 text-xs font-medium text-rose-900 hover:bg-rose-100 dark:border-rose-700 dark:bg-neutral-900 dark:text-rose-200 dark:hover:bg-neutral-800"
                    >
                      {p.name}{" "}
                      <b className="tabular-nums">
                        {err > 0 ? "+" : ""}
                        {fmtWeight(err)}
                      </b>
                    </ClientLink>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <Section title="공정 (연마·뻥·빠우)">
        <ProcessCard
          title="18K 공정"
          accent="bg-rose-500"
          procs={work("18K")}
          agg={agg}
        />
        <ProcessCard
          title="14K 공정"
          accent="bg-blue-500"
          procs={work("14K")}
          agg={agg}
        />
      </Section>

      <Section title="부서 · 검수">
        <FlowCard
          title="18K 부서"
          accent="bg-rose-500"
          label="부서"
          procs={dept("18K")}
          agg={agg}
        />
        <FlowCard
          title="14K 부서"
          accent="bg-blue-500"
          label="부서"
          procs={dept("14K")}
          agg={agg}
        />
        <FlowCard
          title="18K 검수"
          accent="bg-rose-500"
          label="검수"
          procs={insp("18K")}
          agg={agg}
        />
        <FlowCard
          title="14K 검수"
          accent="bg-blue-500"
          label="검수"
          procs={insp("14K")}
          agg={agg}
        />
      </Section>

      <Backup
        workDate={workDate}
        procs={procList.map((p) => ({ name: p.name, schema_type: p.schema_type }))}
      />

      <div className="space-y-0.5 text-[11px] leading-relaxed text-slate-400 dark:text-neutral-500">
        <p>
          · 공정 오차 = 입고 − 재고 − 출고 − 로스 (정상이면 0,{" "}
          <span className="text-rose-500">빨강</span>은 집계가 안 맞는다는 표시)
        </p>
        <p>· 재고 = 입고분 중 아직 작업이 안 끝난(작업중) 중량 합</p>
        <p>· 미출고 = 작업완료된 것 중 아직 출고·이관하지 않은 건수</p>
      </div>
    </main>
  );
}
