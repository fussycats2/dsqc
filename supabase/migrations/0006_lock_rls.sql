-- RLS 잠금: 임시로 열어둔 anon 접근을 제거하고 authenticated 전용으로 정리
--  · 그동안 대시보드에서 추가했을 수 있는 anon/public 정책을 포함해 각 테이블의 모든 정책을 비우고
--    'for all to authenticated' 단일 정책만 재생성(멱등) → 로그인(공용 계정) 세션만 읽기/쓰기 가능
do $$
declare
  t   text;
  pol record;
begin
  foreach t in array array['processes','periods','lots','lot_links','movements','holidays','settings']
  loop
    for pol in
      select policyname from pg_policies where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I;', pol.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy %I_auth_all on public.%I for all to authenticated using (true) with check (true);', t, t);
  end loop;
end $$;
