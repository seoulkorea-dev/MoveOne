/**
 * 로그인 화면 상단 배너와 브랜드 문구.
 *
 * 둘로 나눈 이유
 *   배너는 화면 맨 위, 브랜드 문구는 맨 아래입니다. 한 덩어리로 두면 로그인
 *   폼이 한참 아래로 밀립니다. 로그인 화면에 온 사람의 목적은 로그인이고,
 *   브랜드 이야기는 그다음입니다.
 *
 *   회원가입·비밀번호 재설정 화면에도 같은 배너를 쓸 수 있습니다. 그때
 *   브랜드 문구는 빼고 배너만 넣으면 됩니다.
 */

/**
 * 상단 배너.
 *
 * ★ 이미지 처리
 *   - <picture> 로 화면 폭에 맞는 파일만 받습니다. 모바일에서 1376짜리를
 *     받게 하면 44KB 로 끝날 일을 85KB 로 합니다.
 *   - WebP 가 먼저, JPEG 이 폴백입니다. 원본 PNG 1,165KB 가 WebP 85KB 입니다.
 *   - next/image 를 쓰지 않았습니다. 고정 배너라 잘라내기·지연 로딩이 필요
 *     없고, 첫 화면이라 오히려 즉시 떠야 합니다. fetchPriority 로 우선순위만
 *     올립니다.
 *   - width/height 를 적어 둡니다. 없으면 이미지가 도착할 때 아래 내용이
 *     밀려 내려갑니다(레이아웃 이동).
 */
export function LoginBanner() {
  return (
    <div className="overflow-hidden rounded-xl bg-surface-container-low shadow-sm">
      <picture>
        <source
          type="image/webp"
          media="(min-width: 768px)"
          srcSet="/banner/hero-1376.webp"
        />
        <source type="image/webp" srcSet="/banner/hero-768.webp" />
        <img
          src="/banner/hero-1376.jpg"
          alt="MoveOne — 지하철, KTX, 버스, 따릉이, 킥보드, 택시로 도시를 이동하는 사람들"
          width={1376}
          height={768}
          fetchPriority="high"
          decoding="async"
          className="block h-auto w-full"
        />
      </picture>
    </div>
  );
}

/**
 * 배너 바로 아래 브랜드 문구. 로그인 폼 위에 놓습니다.
 *
 * 이 화면의 주 제목 자리입니다. 예전에는 "다시 오신 것을 환영합니다"가
 * 여기 있었는데, 처음 오는 사람에게는 맞지 않는 말이라 뺐습니다.
 *
 * 줄바꿈(<br />)을 그대로 둔 이유: 끊기는 위치가 문구의 일부입니다.
 * 한 줄로 합치면 화면 폭에 따라 엉뚱한 곳에서 끊깁니다.
 */
export function BrandHeadline() {
  return (
    <section className="flex flex-col gap-space-xs pt-space-sm">
      <p className="font-label-lg text-label-lg text-secondary tracking-normal">
        모든 이동을 한 번에
      </p>

      <h2 className="font-headline-lg text-headline-lg text-primary">
        이동의 경험을
        <br />
        새롭게 만듭니다
      </h2>
    </section>
  );
}

/**
 * 회원가입 버튼 아래 브랜드 설명.
 *
 * ★ "모든 이동을 한 번에" 와 "이동의 경험을 새롭게 만듭니다" 는 여기 있다가
 *   BrandHeadline 으로 올라갔습니다. 같은 말이 한 화면에 두 번 나오면
 *   안 되므로 여기서는 뺐습니다. 설명 두 문단만 남깁니다.
 */
export function BrandStory() {
  return (
    <section className="flex flex-col gap-space-sm border-t border-outline-variant pt-space-lg">
      {/*
        두 문단을 하나로 합치지 않은 이유: 줄바꿈 위치가 문구의 일부입니다.
        합치면 화면 폭에 따라 엉뚱한 곳에서 끊깁니다.
      */}
      <p className="font-body-md text-body-md text-on-surface-variant">
        모빌리티 플랫폼의 새로운 방향을 제시하여
        <br />
        편리한 이동의 가치를 만듭니다
      </p>

      <p className="font-body-md text-body-md text-on-surface-variant">
        다양한 이동수단을 통합하고 사용자에게
        <br />
        합리적 이동경험을 제공합니다
      </p>
    </section>
  );
}
