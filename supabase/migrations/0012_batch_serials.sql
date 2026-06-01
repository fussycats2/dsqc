-- ───────────────────────── 일련번호 일괄 발번 RPC (성능) ─────────────────────────
-- 보내기(sendRows)가 N건마다 next_serial 을 호출(=N 라운드트립)하던 것을 1콜로 단축.
-- 기존 next_serial 과 동일한 규칙(약어_YYMMDD_일별순번)으로 base(=max+1)부터 연속 N개를 반환.
-- 단일 공용계정·저동시성 환경이라 next_serial 과 동일한 read-then-compute 방식 유지.
create or replace function next_serials(p_process_id uuid, p_count int)
returns setof text language plpgsql as $$
declare
  v_code   text;
  v_prefix text;
  v_base   int;
  i        int;
begin
  if p_count is null or p_count < 1 then return; end if;
  select code into v_code from processes where id = p_process_id;
  if v_code is null then v_code := 'X'; end if;
  v_prefix := v_code || '_' || to_char(now() at time zone 'Asia/Seoul', 'YYMMDD') || '_';
  select coalesce(max( (regexp_replace(serial, '^' || v_prefix, ''))::int ), 0) + 1
    into v_base
    from lots
   where process_id = p_process_id
     and serial like v_prefix || '%'
     and regexp_replace(serial, '^' || v_prefix, '') ~ '^\d+$';
  for i in 0 .. p_count - 1 loop
    return next v_prefix || lpad((v_base + i)::text, 3, '0');
  end loop;
end $$;
