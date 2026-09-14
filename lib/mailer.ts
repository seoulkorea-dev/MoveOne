import "server-only";

/**
 * 메일 발송 어댑터.
 *
 * 개발 중에는 실제로 보내지 않고 터미널에 출력합니다. 그래야 외부
 * 메일 서비스 계정 없이도 재설정 흐름을 끝까지 테스트할 수 있습니다.
 *
 * 운영에서 실제 발송이 필요해지면 sendViaSmtp 자리를 채우세요.
 * 호출부(app/api/auth/reset/*)는 바꾸지 않아도 됩니다.
 *
 * 발송 방식 선택은 MAIL_TRANSPORT 로 합니다.
 *   console (기본) — 터미널에 출력
 *   smtp           — SMTP_* 환경변수 사용 (nodemailer 등 추가 필요)
 */

export type Mail = {
  to: string;
  subject: string;
  text: string;
};

export async function sendMail(mail: Mail): Promise<void> {
  const transport = process.env.MAIL_TRANSPORT ?? "console";

  if (transport === "smtp") {
    await sendViaSmtp(mail);
    return;
  }

  // 개발용: 터미널에 그대로 찍습니다.
  console.log(
    [
      "",
      "──────────── 메일 (개발 모드, 실제 발송 안 됨) ────────────",
      `받는 사람 : ${mail.to}`,
      `제목      : ${mail.subject}`,
      "",
      mail.text,
      "────────────────────────────────────────────────────────",
      "",
    ].join("\n"),
  );
}

async function sendViaSmtp(_mail: Mail): Promise<void> {
  // 실제 발송을 붙일 자리입니다.
  //
  // 국내 서비스라면 선택지가 대략 이렇습니다.
  //   - AWS SES          저렴하고 안정적. 샌드박스 해제 신청 필요
  //   - Resend / Postmark 설정이 가장 간단. 무료 한도 있음
  //   - 네이버웍스·구글 SMTP  소규모 시연에는 충분하나 발송량 제한
  //
  // 어느 쪽이든 발신 도메인의 SPF·DKIM 설정을 해야 스팸함으로
  // 가지 않습니다. 이 설정 없이 보내면 대부분 차단됩니다.
  throw new Error(
    "MAIL_TRANSPORT=smtp 인데 발송 구현이 없습니다. lib/mailer.ts 의 sendViaSmtp 를 채우세요.",
  );
}

/** 재설정 메일 본문. 링크와 유효시간만 담고, 개인정보는 넣지 않습니다. */
export function passwordResetMail(to: string, resetUrl: string, ttlMinutes: number): Mail {
  return {
    to,
    subject: "[MoveOne] 비밀번호 재설정 안내",
    text: [
      "MoveOne 비밀번호 재설정 요청이 접수되었습니다.",
      "",
      "아래 주소에서 새 비밀번호를 설정하세요.",
      resetUrl,
      "",
      `이 링크는 ${ttlMinutes}분 동안만 유효하며 한 번만 사용할 수 있습니다.`,
      "",
      "본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.",
      "비밀번호는 변경되지 않습니다.",
    ].join("\n"),
  };
}
