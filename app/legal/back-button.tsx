"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";

/**
 * 뒤로가기.
 *
 * 약관 화면은 가입 화면에서도 회원정보 화면에서도 들어옵니다. 링크를
 * /register 로 고정하면 로그인한 사람은 되돌아갈 때 홈으로 튕깁니다
 * (redirectIfSignedIn). 그래서 브라우저 기록을 씁니다.
 */
export function LegalBack() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.back()}
      aria-label="뒤로"
      data-log="legal.back"
      className="w-11 h-11 -ml-2 flex items-center justify-center rounded-lg text-on-surface hover:bg-surface-container-high"
    >
      <Icon name="arrow_back" size={22} />
    </button>
  );
}
