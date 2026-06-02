-- 공정 화면 핵심 쿼리(process/[id]/page.tsx)는 lots를 process_id = ? AND work_date = ? 로 필터한다.
-- 기존 인덱스는 (process_id, side)·(work_date)가 따로라 Postgres가 하나만 쓰고 나머지는 필터링한다.
-- 두 컬럼을 한 번에 좁히는 복합 인덱스로 정확 매칭(공정×작업일 조회 가속).
create index if not exists lots_proc_workdate_idx on lots(process_id, work_date);
