import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Supabase 세션 갱신 + 미인증 보호 (Next.js 16: middleware → proxy)
//  · 로그인 안 됨 + /login 외 경로 → /login 으로
//  · 로그인 됨 + /login → / 로
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser()는 항상 Supabase Auth 서버에 토큰을 재검증 — 이 호출을 제거하면 세션이 끊길 수 있음
  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  // ── 유휴 자동 로그아웃 (Supabase Pro 세션 타임아웃 대체) ──
  //  last_seen(마지막 활동 시각) 쿠키를 매 요청마다 갱신하는 슬라이딩 윈도.
  //  활동(페이지 이동·전송·클릭)이 이어지면 계속 갱신되므로 작업 중에는 끊기지 않고,
  //  5시간 동안 아무 요청·활동이 없을 때만 만료시킨다.
  const IDLE_MS = 5 * 60 * 60 * 1000;
  if (user) {
    const seen = Number(request.cookies.get("last_seen")?.value);
    if (seen && Date.now() - seen > IDLE_MS) {
      // 만료 → Supabase 인증 쿠키 정리 후 로그인 화면으로
      let res: NextResponse;
      if (path === "/login") {
        res = NextResponse.next({ request });
      } else {
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        url.search = "?reason=timeout";
        res = NextResponse.redirect(url);
      }
      for (const c of request.cookies.getAll()) {
        if (c.name.startsWith("sb-") && c.name.includes("-auth-token"))
          res.cookies.delete(c.name);
      }
      res.cookies.delete("last_seen");
      return res;
    }
    // 활동 시각 갱신(없으면 지금부터 시작). 쿠키 수명은 넉넉히 — 만료 판정은 타임스탬프로만.
    response.cookies.set("last_seen", String(Date.now()), {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }

  if (!user && path !== "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}
