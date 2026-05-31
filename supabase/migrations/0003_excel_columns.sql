-- 0003: 엑셀 원본 열과 1:1 정합 (docs/05_정밀스펙.md 기준)
-- io/work × in/out 4가지 행 형태를 그대로 담기 위한 누락 컬럼 보강.
--
-- 컬럼 매핑(최종):
--  공통(4형 모두): serial, description, qty, tag, q, due_date, raw_weight, note
--  io-in   (중량 D)        : weight=중량,            moved_at=투입시간(J), moved_to_name=투입부서(K)
--  io-out  (실중량 O)      : weight=실중량, tag_fixed=Tag수정(V), tag_weight=Tag중량(W),
--                            tag_loss=Tag로스(X), prev_part_name=이전파트(U)  [출고중량 Y=계산]
--  work-in (입중량 E,중량 K): weight=중량(K, 집계 작업전 소스), weight_in=입중량(E),
--                            prev_part_name=이전파트(L), status=현황(A)
--  work-out(작업전 P,작업후 Q): weight_before=작업전(P), weight=작업후(Q),
--                            moved_at=이관/출고시간(Y), moved_to_name=이관파트(Z)  [로스 R·로스율 S=계산]

alter table lots add column if not exists weight_in      numeric;  -- work 작업중 입중량(E)
alter table lots add column if not exists prev_part_name text;     -- 이전파트 표시 텍스트(io출고 U / work작업중 L)
alter table lots add column if not exists moved_at       timestamptz; -- 투입시간(io입고 J) / 이관·출고시간(work완료 Y)
alter table lots add column if not exists moved_to_name  text;      -- 투입부서(io입고 K) / 이관파트(work완료 Z)

comment on column lots.weight        is 'io입고:중량D / io출고:실중량O / work입고:중량K / work완료:작업후Q';
comment on column lots.weight_in     is 'work 작업중 입중량(E) — 표시용, 집계 작업전은 weight(중량K) 사용';
comment on column lots.weight_before is 'work 완료 작업전(P) = 집계 시 선택행 weight(중량K) 합';
comment on column lots.prev_part_name is '이전파트 표시 텍스트(자유입력 가능). 정식 계보는 lot_links/prev_process_id';
comment on column lots.moved_at      is '소비/이동 시각: io입고 투입시간(J) / work완료 이관·출고시간(Y)';
comment on column lots.moved_to_name is '이동 대상명: io입고 투입부서(K) / work완료 이관파트(Z)';

