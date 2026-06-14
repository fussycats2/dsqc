// iOS 'Liquid Glass' 풍 표면 효과 — 헤더·탭바·모달 오버레이·스크림·토스트가 공유.
//  · backdrop-filter 에 SVG 굴절 필터(feTurbulence→feDisplacementMap)를 url()로 걸어
//    표면 뒤로 비치는 본문을 유리 너머처럼 일렁이게 함.
//  · Safari/iOS 는 url() backdrop 필터 미지원 → 표준 선언이 무시되고 앞의 -webkit-(blur만)로
//    폴백(=글래스모피즘). Chrome/Edge 는 표준 선언(뒤)이 이겨 굴절까지 적용.
//  · 전역 토글 LIQUID_GLASS=false 한 줄로 모든 표면이 즉시 원래(불투명) 스타일로 롤백.
import type { CSSProperties } from "react";

export const LIQUID_GLASS = true;

type GlassOpts = {
  blur?: number; // Chrome(굴절 동반) blur — 굴절이 있어 작게
  webkitBlur?: number; // Safari 폴백 blur — 굴절이 없어 더 크게 보상
  saturate?: number;
  refract?: boolean; // false면 SVG 굴절 생략(작은 표면·가독성 우선 표면용)
};

// backdrop-filter 인라인 스타일. LIQUID_GLASS=false면 undefined(=효과 없음).
export function glassStyle(opts: GlassOpts = {}): CSSProperties | undefined {
  if (!LIQUID_GLASS) return undefined;
  const { blur = 3, webkitBlur = 10, saturate = 1.6, refract = true } = opts;
  const url = refract ? " url(#dsqc-liquid-glass)" : "";
  return {
    WebkitBackdropFilter: `blur(${webkitBlur}px) saturate(${saturate})`,
    backdropFilter: `blur(${blur}px) saturate(${saturate})${url}`,
  };
}

// SVG 굴절 필터 정의 — 앱 셸(Chrome)에 한 번만 마운트. 화면엔 안 보이는 정의용.
//  url(#dsqc-liquid-glass) 로 여러 표면이 공유 참조한다.
export function LiquidGlassFilter() {
  if (!LIQUID_GLASS) return null;
  return (
    <svg aria-hidden className="pointer-events-none absolute h-0 w-0">
      <filter
        id="dsqc-liquid-glass"
        x="-20%"
        y="-20%"
        width="140%"
        height="140%"
        colorInterpolationFilters="sRGB"
      >
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.012 0.014"
          numOctaves={2}
          seed={7}
          result="noise"
        />
        <feGaussianBlur in="noise" stdDeviation="1.4" result="soft" />
        <feDisplacementMap
          in="SourceGraphic"
          in2="soft"
          scale={16}
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
    </svg>
  );
}
