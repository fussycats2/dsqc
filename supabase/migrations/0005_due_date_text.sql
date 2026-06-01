-- 납기(due_date)를 자유 텍스트로 전환
--  · 현장에서 "4/5", "4/5,4/12"처럼 날짜 형식이 아닌 값/복수 납기를 입력 → date 타입은 거부됨
--  · 기존 date 값은 입력 스타일과 동일한 '월/일'(예: 2026-05-22 → 5/22)로 변환(연도 제거)
--    FM = 앞자리 0 제거 → "05/22"가 아니라 "5/22"
--  · v_lots_calc 뷰가 l.*(due_date 포함)에 의존 → 컬럼 타입 변경 전 뷰를 내리고, 변경 후 동일 정의로 재생성

drop view if exists v_lots_calc;

alter table lots
  alter column due_date type text using to_char(due_date, 'FMMM/FMDD');

-- 입출로그 테이블도 동일하게 맞춤(컬럼 일관성)
alter table movements
  alter column due_date type text using to_char(due_date, 'FMMM/FMDD');

-- 0001_init.sql 의 정의 그대로 재생성
create view v_lots_calc as
select l.*,
  case when l.side='out' and p.schema_type='io'
       then coalesce(l.weight,0) + coalesce(l.tag,0) - coalesce(l.tag_weight,0)
  end as ship_weight,                                         -- io 출고중량 = 실중량+Tag-Tag중량
  case when l.side='out' and p.schema_type='io'  then l.tag_loss
       when l.side='out' and p.schema_type='work' then coalesce(l.weight_before,0) - coalesce(l.weight,0)
  end as loss,                                                -- io: Tag로스, work: 작업전-작업후
  case when l.side='out' and p.schema_type='work' and coalesce(l.weight_before,0) <> 0
       then 1 - (coalesce(l.weight,0) / l.weight_before)
  end as loss_rate
from lots l join processes p on p.id = l.process_id;
