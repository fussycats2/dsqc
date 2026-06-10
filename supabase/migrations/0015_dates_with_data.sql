-- 달력 강조용 RPC: [p_from, p_to] 기간 안에서 데이터가 존재하는 작업일(distinct) 목록.
--  · 기존엔 lots 행을 통째로 받아 JS에서 중복 제거했는데, PostgREST 응답이 최대 1000행으로
--    잘리면서 데이터가 많은 달엔 일부 날짜가 누락됐다(달력에 초록 표시 안 됨). DB에서
--    distinct로 모아 날짜만 반환하면 결과가 최대 31+α행이라 잘릴 일이 없다.
--  · lots(공정검수 입력)·settlements(결산서) 어느 쪽이든 행이 있으면 "데이터 있는 날".
--    union이 두 테이블 합치며 중복 제거까지 해준다.
--  · 인덱스: lots_work_date_idx · settlements PK(work_date) 범위 스캔.
--  · security invoker(기본값) — 호출자 RLS 그대로 적용(authenticated만 조회 가능).
create or replace function dates_with_data(p_from date, p_to date)
returns setof date language sql stable as $$
  select work_date from lots
   where work_date between p_from and p_to
  union
  select work_date from settlements
   where work_date between p_from and p_to;
$$;
