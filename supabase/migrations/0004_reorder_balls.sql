-- 빠우(양장볼)을 빠우(기계) 다음 순서로 이동 (현재 sort_order=1로 맨 앞에 있던 것 정정)
-- 22번 이상을 한 칸씩 밀고, 양장볼을 22로.
update processes set sort_order = sort_order + 1 where sort_order >= 22;
update processes set sort_order = 22 where name = '빠우(양장볼)';
