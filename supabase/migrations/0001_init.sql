-- dsqc 초기 스키마 — 귀금속 제조공정 중량추적 시스템
-- docs/02_리팩토링계획.md 3장 데이터 모델 기반
-- 단일 공용 계정 전제(RLS는 "로그인 사용자 전체 접근")

create extension if not exists "pgcrypto";

-- ───────────────────────── 공정 마스터 (44 시트 → 행) ─────────────────────────
create table processes (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,          -- '기계','빠우(할로우)','검수(기계)'
  code          text,                           -- 일련번호 약어: M,Y,C,G,T,A,QM…
  karat         text check (karat in ('18K','14K')),
  schema_type   text not null check (schema_type in ('io','work','entry')),
  --   io   : 일반 공정 + 검수 (실중량/Tag수정/Tag중량/Tag로스/출고중량)
  --   work : 연마/뻥/빠우 (작업전/작업후/로스/로스율)
  --   entry: 작성
  is_inspection boolean not null default false,
  is_blue       boolean not null default false, -- 14K 파란색 표기
  category      text[] not null default '{}',
  sort_order    int not null default 0
);

-- ───────────────────────── 마감 구분 (일/월) ─────────────────────────
create table periods (
  id         uuid primary key default gen_random_uuid(),
  label      text not null,                     -- '2026-05' or '2026-05-29'
  kind       text not null check (kind in ('day','month')),
  status     text not null default 'open' check (status in ('open','closed')),
  opened_at  timestamptz not null default now(),
  closed_at  timestamptz
);

-- ───────────────────────── 작업 단위 (공정 시트 한 행) ─────────────────────────
create table lots (
  id              uuid primary key default gen_random_uuid(),
  serial          text,                          -- 'M_260521_001'
  process_id      uuid not null references processes(id),
  side            text not null check (side in ('in','out')),  -- 입고/작업중 vs 출고/완료
  description     text,
  qty             numeric,
  weight          numeric,                       -- 입고:입중량 / 출고: io=실중량, work=작업후
  weight_before   numeric,                       -- work형 전용: 작업전
  tag             numeric,                        -- 1 tag = 0.035g
  tag_fixed       numeric,                        -- io: Tag수정
  tag_weight      numeric,                        -- io: Tag중량
  tag_loss        numeric,                        -- io: Tag로스
  q               numeric,
  due_date        date,
  raw_weight      numeric,                        -- 원중량
  note            text,
  prev_process_id uuid references processes(id),  -- 이전파트(빠른 참조; 정식 계보는 lot_links)
  status          text not null default '대기' check (status in ('대기','작업중','완료')),
  period_id       uuid references periods(id),
  created_at      timestamptz not null default now(),
  completed_at    timestamptz,
  updated_at      timestamptz not null default now(),
  version         int not null default 1
);
create index lots_process_idx on lots(process_id, side);
create index lots_serial_idx  on lots(serial);
create index lots_status_idx  on lots(status);

-- ───────────────────────── 계보 (병합/분할/이동) ─────────────────────────
create table lot_links (
  id        uuid primary key default gen_random_uuid(),
  from_lot  uuid not null references lots(id) on delete cascade,
  to_lot    uuid not null references lots(id) on delete cascade,
  relation  text not null check (relation in ('move','merge','split')),
  created_at timestamptz not null default now()
);
create index lot_links_from_idx on lot_links(from_lot);
create index lot_links_to_idx   on lot_links(to_lot);

-- ───────────────────────── 입출로그 (사람이 읽는 감사 기록) ─────────────────────────
create table movements (
  id                uuid primary key default gen_random_uuid(),
  ts                timestamptz not null default now(),
  type              text not null,               -- 입고/출고/투입/이관/타부서투입/집계/분할
  source_process_id uuid references processes(id),
  target_process_id uuid references processes(id),
  lot_id            uuid references lots(id) on delete set null,
  qty numeric, weight numeric, tag numeric, q numeric,
  due_date date, raw_weight numeric, note text,
  actor_name        text
);
create index movements_ts_idx on movements(ts desc);

-- ───────────────────────── 부가 ─────────────────────────
create table holidays ( date date primary key, name text not null );
create table settings ( key text primary key, value jsonb not null );
insert into settings(key, value) values ('TAG_PER_GRAM', '0.035'::jsonb);

-- ───────────────────────── 계산 뷰 (schema_type별 로스/출고중량) ─────────────────────────
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

-- 파트별 입고/출고 집계 (raw/sum 대체)
create view v_process_balance as
select p.id as process_id, p.name, p.karat,
  sum(l.qty)    filter (where l.side='in')  as in_qty,
  sum(l.weight) filter (where l.side='in')  as in_weight,
  sum(l.qty)    filter (where l.side='out') as out_qty,
  sum(l.weight) filter (where l.side='out') as out_weight
from processes p left join lots l on l.process_id = p.id
group by p.id, p.name, p.karat;

-- ───────────────────────── 일련번호 생성 RPC: 약어_YYMMDD_일별순번 ─────────────────────────
create or replace function next_serial(p_process_id uuid)
returns text language plpgsql as $$
declare
  v_code   text;
  v_prefix text;
  v_seq    int;
begin
  select code into v_code from processes where id = p_process_id;
  if v_code is null then v_code := 'X'; end if;
  v_prefix := v_code || '_' || to_char(now() at time zone 'Asia/Seoul', 'YYMMDD') || '_';
  select coalesce(max( (regexp_replace(serial, '^' || v_prefix, ''))::int ), 0) + 1
    into v_seq
    from lots
   where process_id = p_process_id
     and serial like v_prefix || '%'
     and regexp_replace(serial, '^' || v_prefix, '') ~ '^\d+$';
  return v_prefix || lpad(v_seq::text, 3, '0');
end $$;

-- ───────────────────────── updated_at/version 자동 갱신 (낙관적 동시성) ─────────────────────────
create or replace function bump_version() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end $$;
create trigger lots_bump before update on lots
  for each row execute function bump_version();

-- ───────────────────────── RLS (단일 공용 계정) ─────────────────────────
alter table processes enable row level security;
alter table periods   enable row level security;
alter table lots      enable row level security;
alter table lot_links enable row level security;
alter table movements enable row level security;
alter table holidays  enable row level security;
alter table settings  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['processes','periods','lots','lot_links','movements','holidays','settings']
  loop
    execute format('create policy %I_auth_all on %I for all to authenticated using (true) with check (true);', t, t);
  end loop;
end $$;
