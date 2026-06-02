import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Supabase 세션 갱신 + 미인증 보호 (Next.js 16: middleware → proxy)
//  · 로그인 안 됨 + /login 외 경로 → /login 으로
//  · 로그인 됨 + /login → / 로
export async function updateSession(request: NextRequest) {
  // RSC prefetch(호버·라우터 prefetch)는 인증 게이트·토큰갱신 불필요 — 실제 클릭 네비게이션에서 검사.
  //  매 prefetch마다 Supabase Auth 서버로 가던 getUser() 네트워크 왕복을 제거(탭바 메뉴 prefetch 폭주 비용↓).
  //  미인증 사용자의 prefetch는 RLS가 데이터를 막으므로 안전(실 네비게이션은 아래 게이트로 /login 리다이렉트).
  if (request.headers.get("next-router-prefetch")) {
    return NextResponse.next({ request });
  }

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

  // 빠른 경로: getClaims()는 JWKS로 토큰을 로컬 검증(네트워크 0). 비대칭 서명키(ECC) 프로젝트에서 동작.
  //  토큰 만료/무효(≈1시간마다)·미인증이면 claims 없음 → getUser()로 폴백(네트워크 + 토큰 갱신까지 처리).
  //  → 평소(유효 토큰) 요청은 인증 네트워크 왕복 0, 갱신이 필요한 순간에만 1회.
  let user: unknown = null;
  try {
    const { data } = await supabase.auth.getClaims();
    user = data?.claims ?? null;
  } catch {
    user = null;
  }
  if (!user) {
    const { data } = await supabase.auth.getUser();
    user = data.user ?? null;
  }
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
