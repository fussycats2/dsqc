-- ───────────────────────── lots+계보 원자 기록 RPC (성능·정합성) ─────────────────────────
-- 이동류(투입/이관/출고/타부서)·집계·분할이 "lots insert → lot_links insert" 2콜로 하던 것을
-- 단일 트랜잭션 1콜로 단축. 중간 실패 시 전체가 롤백되므로 코드의 '고아 행 회수' 수동 원복이
-- 필요 없어진다(선점유 해제는 기존대로 호출부가 수행).
--  · 행 매핑(VBA 1:1 계산, 그룹 일련번호)은 기존대로 서버 코드(actions.ts)에서 만들어
--    jsonb로 전달 — 이 함수에 도메인 로직 없음(기존 로직 무영향).
--  · RPC 미적용 환경에서는 코드가 기존 2콜 방식으로 자동 폴백(actions.ts insertLotsLinked).
--  · security invoker(기본) — authenticated RLS 정책 그대로 적용. updated_at/version/locked 등
--    명시하지 않은 컬럼은 테이블 기본값 사용(기존 insert와 동일).
create or replace function insert_lots_linked(p_lots jsonb, p_links jsonb)
returns void language plpgsql as $$
begin
  insert into lots (id, created_at, serial, process_id, side, status,
                    prev_process_id, prev_part_name, description, qty,
                    weight, weight_in, weight_before, tag, q,
                    due_date, raw_weight, note, work_date)
  select coalesce((r->>'id')::uuid, gen_random_uuid()),
         coalesce((r->>'created_at')::timestamptz, now()),
         r->>'serial',
         (r->>'process_id')::uuid,
         r->>'side',
         coalesce(r->>'status', '작업중'),
         (r->>'prev_process_id')::uuid,
         r->>'prev_part_name',
         r->>'description',
         (r->>'qty')::numeric,
         (r->>'weight')::numeric,
         (r->>'weight_in')::numeric,
         (r->>'weight_before')::numeric,
         (r->>'tag')::numeric,
         (r->>'q')::numeric,
         r->>'due_date',
         r->>'raw_weight',
         r->>'note',
         (r->>'work_date')::date
    from jsonb_array_elements(p_lots) r;

  insert into lot_links (from_lot, to_lot, relation)
  select (r->>'from_lot')::uuid, (r->>'to_lot')::uuid, r->>'relation'
    from jsonb_array_elements(p_links) r;
end $$;
