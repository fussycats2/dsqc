-- 일마감: 마감 시점 현황(대시보드 집계)을 마감일 period에 박제 저장
alter table periods add column if not exists snapshot jsonb;

-- 활성/마감 필터 조회 가속(닫힌 period 제외용)
create index if not exists lots_period_idx on lots(period_id);
