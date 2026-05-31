-- 이동/완료 처리된 원본 행 잠금(흐리게 + 재처리 불가)
alter table lots add column if not exists locked boolean not null default false;
