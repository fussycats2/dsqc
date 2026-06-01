-- 원중량(raw_weight)을 자유 텍스트로 전환
--  · 집계(작업완료, Module7)에서 원중량(원본 I열)은 숫자 합산이 아니라
--    내역/납기/비고와 함께 "텍스트 중복제거-결합"으로 처리됨(VBA textAlways(8)=I)
--    → "5.2,3.1" 같은 복수값을 담아야 하므로 numeric → text 로 변경
--  · 기존 numeric 값은 그대로 문자열화(예: 5.20 → '5.2')
--  · 투입(중량K)·출고(실중량) 계산은 단일 숫자값일 때만 더해지고(코드 Number()||0),
--    콤마결합 텍스트는 0으로 취급 → VBA ToDbl(비숫자=0)과 동일
--  · v_lots_calc 뷰가 l.*(raw_weight 포함)에 의존 → 뷰 내리고 변경 후 동일 정의로 재생성
--    (v_lots_calc 계산식은 raw_weight 미사용이라 의미 변화 없음)

drop view if exists v_lots_calc;

alter table lots
  alter column raw_weight type text using raw_weight::text;

-- 입출로그 테이블도 동일하게 맞춤(컬럼 일관성)
alter table movements
  alter column raw_weight type text using raw_weight::text;

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
