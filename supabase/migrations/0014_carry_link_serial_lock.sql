-- ───────────────────────── 0014: 이월 계보 + 일련번호 발번 동시성 해결 ─────────────────────────
-- ① lot_links.relation에 'carry'(일마감 이월 복사) 추가.
--    일마감(closeDay)이 공정 미작업 재고를 이월일로 복사할 때 원본→복사본 링크를 남겨
--    날짜 경계에서 계보 추적(일련번호 클릭)이 끊기지 않게 한다.
--    ※ 이 마이그레이션 적용 전에 새 웹 버전으로 일마감을 실행하면
--      'carry' 체크 제약 위반으로 이월이 취소(원복)된다 — 배포 전에 먼저 실행할 것.
alter table lot_links drop constraint if exists lot_links_relation_check;
alter table lot_links add constraint lot_links_relation_check
  check (relation in ('move','merge','split','carry'));

-- ② 일련번호 발번 동시성 — 두 기기가 같은 공정으로 동시에 '보내기' 해도 중복 발번 차단.
--    기존 read-then-compute(max+1)는 'RPC 발번 → 클라이언트 insert' 사이 틈에서
--    다른 기기가 발번하면 같은 번호를 받을 수 있었다.
--    공정×일자 카운터 행을 원자적으로 선점(행 잠금)해 발번을 줄 세운다:
--      · 발번 즉시 카운터가 전진하므로 행이 아직 insert 되기 전이어도 중복 불가
--      · 발번 후 insert가 실패하면 그 번호는 건너뜀(빈 번호) — 중복보다 안전
--      · 백업 복원 등으로 카운터보다 큰 번호가 이미 있으면 max(기존행)부터 이어감
create table if not exists serial_counters (
  process_id uuid not null references processes(id) on delete cascade,
  day        text not null,             -- 'YYMMDD' (KST)
  last_seq   int  not null default 0,   -- 이 공정·일자에 마지막으로 발번된 순번
  primary key (process_id, day)
);
alter table serial_counters enable row level security;
do $$ begin
  create policy serial_counters_auth_all on serial_counters
    for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

create or replace function next_serials(p_process_id uuid, p_count int)
returns setof text language plpgsql as $$
declare
  v_code   text;
  v_day    text;
  v_prefix text;
  v_cnt    int;
  v_max    int;
  v_base   int;
  i        int;
begin
  if p_count is null or p_count < 1 then return; end if;
  select code into v_code from processes where id = p_process_id;
  if v_code is null then v_code := 'X'; end if;
  v_day := to_char(now() at time zone 'Asia/Seoul', 'YYMMDD');
  v_prefix := v_code || '_' || v_day || '_';

  -- 카운터 행 선점(upsert = 행 잠금, 트랜잭션 끝까지 보유) — 동시 호출은 여기서 줄을 선다
  insert into serial_counters (process_id, day) values (p_process_id, v_day)
  on conflict (process_id, day) do update set last_seq = serial_counters.last_seq
  returning last_seq into v_cnt;

  -- 기존 행 최대 순번(백업 복원·과거 데이터가 카운터보다 클 수 있음)
  select coalesce(max( (regexp_replace(serial, '^' || v_prefix, ''))::int ), 0)
    into v_max
    from lots
   where process_id = p_process_id
     and serial like v_prefix || '%'
     and regexp_replace(serial, '^' || v_prefix, '') ~ '^\d+$';

  v_base := greatest(v_cnt, v_max) + 1;
  update serial_counters set last_seq = v_base + p_count - 1
   where process_id = p_process_id and day = v_day;

  for i in 0 .. p_count - 1 loop
    return next v_prefix || lpad((v_base + i)::text, 3, '0');
  end loop;
end $$;

-- 단건 발번(폴백 경로)도 같은 카운터를 쓰도록 통일
create or replace function next_serial(p_process_id uuid)
returns text language sql as $$
  select s from next_serials(p_process_id, 1) as s;
$$;

-- 카운터 정리: 보존 정리(purge_old_data)와 함께 오래된 일자 카운터도 삭제
create or replace function purge_old_serial_counters(retain_days int default 50)
returns void language sql as $$
  delete from serial_counters
   where day ~ '^\d{6}$'
     and to_date(day, 'YYMMDD') < ((now() at time zone 'Asia/Seoul')::date - retain_days);
$$;
select cron.schedule('purge-serial-counters', '5 19 * * *', $$select public.purge_old_serial_counters(50)$$);
