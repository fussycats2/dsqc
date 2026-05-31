#!/usr/bin/env python3
"""업로드.xlsm의 시트 목록에서 공정 마스터 시드 SQL을 생성.
출력: supabase/seed.sql (processes INSERT)."""
import openpyxl, os, re

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLSM = os.path.join(HERE, "업로드.xlsm")
OUT  = os.path.join(HERE, "supabase", "seed.sql")

NON_PROCESS = {"메뉴", "raw", "sum", "입출로그"}

# 일련번호 약어 (VBA Module2 GetSheetAbbrev 그대로)
ABBREV = {
    "기계": "M", "양장": "Y", "캐스팅": "C", "개발": "G", "컷팅": "T",
    "조립14K": "A", "캐스팅14K": "C", "컷팅14K": "T",
    "검수(기계)": "QM", "검수(볼)": "QB", "검수(양장)": "QY", "검수(캐스팅)": "QC",
    "검수(조립)14K": "QA", "검수(캐스팅)14K": "QC",
}
BLUE = {"조립14K", "캐스팅14K", "컷팅14K", "검수(조립)14K", "검수(캐스팅)14K"}


def schema_type(name: str) -> str:
    if name == "작성":
        return "entry"
    if name.startswith(("연마", "뻥", "빠우")):
        return "work"          # 작업중/완료형
    return "io"                # 일반 공정 + 검수


def sql_str(v):
    return "'" + v.replace("'", "''") + "'" if v is not None else "null"


def main():
    wb = openpyxl.load_workbook(XLSM, read_only=True, data_only=True)
    rows = []
    order = 0
    for name in wb.sheetnames:
        if name in NON_PROCESS:
            continue
        order += 1
        st = schema_type(name)
        karat = "14K" if "14K" in name else ("18K" if st != "entry" else None)
        code = ABBREV.get(name)
        is_insp = name.startswith("검수")
        is_blue = name in BLUE
        # 카테고리: 공정군 라벨 추출(빠우/뻥/연마/검수/14K)
        cats = []
        for kw in ("빠우", "뻥", "연마", "검수"):
            if name.startswith(kw):
                cats.append(kw)
        if "14K" in name:
            cats.append("14K")
        cats_sql = "array[" + ",".join(sql_str(c) for c in cats) + "]::text[]" if cats else "'{}'::text[]"
        rows.append(
            f"  ({sql_str(name)}, {sql_str(code)}, "
            f"{sql_str(karat)}, {sql_str(st)}, {str(is_insp).lower()}, "
            f"{str(is_blue).lower()}, {cats_sql}, {order})"
        )

    body = ",\n".join(rows)
    sql = (
        "-- 자동 생성: tools/gen_seed.py (업로드.xlsm 시트 기반)\n"
        "-- 공정 마스터 시드\n"
        "insert into processes (name, code, karat, schema_type, is_inspection, is_blue, category, sort_order) values\n"
        f"{body}\n"
        "on conflict (name) do nothing;\n\n"
        "-- 최초 기간(현재 월) 생성\n"
        "insert into periods (label, kind, status) values "
        "(to_char(now() at time zone 'Asia/Seoul','YYYY-MM'), 'month', 'open');\n"
    )
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(sql)
    print(f"wrote {OUT} ({len(rows)} processes)")


if __name__ == "__main__":
    main()
