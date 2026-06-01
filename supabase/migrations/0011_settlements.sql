-- 품질관리부 일일 결산서: 날짜별 결산 데이터(입력칸 jsonb)
--  · 수식칸은 UI에서 계산, 입력칸·이월된 전일값·보존값만 저장
--  · 우리 일마감과 동일하게 날짜별 스냅샷 + 이월(전일값 복사) 패턴
create table if not exists settlements (
  work_date  date primary key,
  data       jsonb not null default '{}'::jsonb,  -- {"B5":123, "C9":4.5, ...}
  updated_at timestamptz not null default now()
);

alter table settlements enable row level security;
drop policy if exists settlements_all on settlements;
create policy settlements_all on settlements for all to authenticated using (true) with check (true);

-- 50일 보존 정책에 settlements도 포함(0010 함수 갱신)
create or replace function purge_old_data(retain_days int default 50)
returns int
language plpgsql
security definer
as $$
declare
  cutoff date := ((now() at time zone 'Asia/Seoul')::date) - retain_days;
  n int;
begin
  delete from lots
   where work_date is not null and work_date < cutoff;
  get diagnostics n = row_count;

  delete from periods p
   where p.kind = 'day'
     and p.label ~ '^\d{4}-\d{2}-\d{2}$'
     and p.label::date < cutoff
     and not exists (select 1 from lots l where l.period_id = p.id);

  delete from settlements where work_date < cutoff;

  delete from movements
   where ts < (now() - make_interval(days => retain_days));

  return n;
end;
$$;
