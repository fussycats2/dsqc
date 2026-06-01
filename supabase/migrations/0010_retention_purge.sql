-- 데이터 보존 정책: 최근 N일(기본 50일)치만 DB에 유지, 그보다 오래된 건 매일 자동 삭제
--  · 월마감(파일 내보내기) 대신 단순 롤링 보존. 개별 저장 로직은 추후 별도 구현 예정.
--  · 기준 날짜 = 작업일(work_date, KST date). 매일 cron이 돌며 창이 하루씩 밀려 "하루하루 삭제".
--  · 삭제 순서/안전장치:
--      lots 삭제 → lot_links 는 on delete cascade 로 함께 삭제, movements.lot_id 는 set null.
--      day 스냅샷(periods)은 "남은 lot이 참조하지 않는" 오래된 것만 삭제(FK 위반 방지).

-- ───────── 보존 정리 함수 ─────────
create or replace function purge_old_data(retain_days int default 50)
returns int
language plpgsql
security definer
as $$
declare
  cutoff date := ((now() at time zone 'Asia/Seoul')::date) - retain_days;  -- 이 날짜 미만 삭제
  n int;
begin
  -- 1) 오래된 작업일 lots (lot_links cascade, movements.lot_id set null)
  delete from lots
   where work_date is not null and work_date < cutoff;
  get diagnostics n = row_count;

  -- 2) 오래된 day 스냅샷(periods) — 남은 lot이 참조하지 않는 것만
  delete from periods p
   where p.kind = 'day'
     and p.label ~ '^\d{4}-\d{2}-\d{2}$'
     and p.label::date < cutoff
     and not exists (select 1 from lots l where l.period_id = p.id);

  -- 3) 오래된 입출로그(movements, 현재 미사용이지만 DB 경량 유지)
  delete from movements
   where ts < (now() - make_interval(days => retain_days));

  return n;  -- 삭제된 lots 건수
end;
$$;

-- ───────── 매일 자동 실행(pg_cron) ─────────
-- Supabase는 pg_cron 지원. 잡 이름이 같으면 재스케줄(멱등).
create extension if not exists pg_cron;

-- 매일 KST 04:00 (= UTC 19:00) 실행 — 50일 지난 데이터 삭제
select cron.schedule('purge-old-data', '0 19 * * *', $$select public.purge_old_data(50)$$);

-- 참고: 즉시 1회 정리하려면 아래를 수동 실행
--   select public.purge_old_data(50);
-- 스케줄 해제: select cron.unschedule('purge-old-data');
