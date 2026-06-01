-- 작업일(work_date): 데이터를 날짜별로 관리(과거 날짜 조회·수정, 날짜별 마감)
alter table lots add column if not exists work_date date;

-- 기존 lot 백필: 생성 시각(KST) 날짜로
update lots
set work_date = (created_at at time zone 'Asia/Seoul')::date
where work_date is null;

create index if not exists lots_work_date_idx on lots(work_date);
