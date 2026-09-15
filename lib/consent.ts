import "server-only";
import { query, withUser } from "@/lib/db";

/**
 * 약관·개인정보 동의.
 *
 * 문서 내용은 app/legal/ 아래에 있고, 여기에는 **버전과 목록**만 둡니다.
 * 문서를 고치면 반드시 아래 버전을 올리세요. 버전이 올라가면 기존 동의는
 * 옛 버전에 대한 것이 되므로, 재동의를 받아야 하는 상태가 됩니다.
 *
 * 기록은 db/003_consent.sql 의 user_consents 에 **쌓입니다.** 덮어쓰지
 * 않으므로 "언제 동의했는지" 와 "언제 철회했는지" 가 그대로 남습니다.
 */

/** 문서를 고치면 이 값을 올립니다. 날짜 문자열입니다. */
export const TERMS_VERSION = "2026-09-15";
export const PRIVACY_VERSION = "2026-09-15";

export type ConsentType = "terms" | "privacy" | "age14" | "marketing";

export type ConsentItem = {
  type: ConsentType;
  version: string;
  /** 필수 항목은 동의하지 않으면 가입이 진행되지 않습니다. */
  required: boolean;
  label: string;
  /** 전문을 볼 수 있는 화면. 없으면 링크를 걸지 않습니다. */
  href?: string;
  /** 체크박스 아래에 붙는 짧은 설명 */
  hint?: string;
};

/**
 * 가입 화면에 뜨는 순서 그대로입니다.
 *
 * 만 14세 확인이 별도 항목인 이유: 개인정보 보호법은 만 14세 미만의
 * 개인정보를 처리할 때 법정대리인 동의를 요구합니다. 1차 범위에서
 * 법정대리인 동의 절차를 만들지 않았으므로, 가입 자체를 만 14세 이상으로
 * 제한합니다. **나이나 생년월일은 받지 않습니다** — 확인했다는 사실만
 * 남깁니다.
 */
export const CONSENT_ITEMS: ConsentItem[] = [
  {
    type: "age14",
    version: TERMS_VERSION,
    required: true,
    label: "만 14세 이상입니다",
    hint: "만 14세 미만은 법정대리인 동의가 필요해 현재 가입할 수 없습니다.",
  },
  {
    type: "terms",
    version: TERMS_VERSION,
    required: true,
    label: "이용약관에 동의합니다",
    href: "/legal/terms",
  },
  {
    type: "privacy",
    version: PRIVACY_VERSION,
    required: true,
    label: "개인정보 수집·이용에 동의합니다",
    href: "/legal/privacy",
    hint: "이메일·아이디·검색 기록을 서비스 제공 목적으로 처리합니다.",
  },
  {
    type: "marketing",
    version: TERMS_VERSION,
    required: false,
    label: "마케팅 정보 수신에 동의합니다",
    hint: "선택 항목입니다. 동의하지 않아도 가입과 서비스 이용에 제한이 없습니다.",
  },
];

export const REQUIRED_CONSENTS = CONSENT_ITEMS.filter((item) => item.required);

/** 폼 필드 이름. 화면과 API 가 같은 값을 써야 하므로 여기서 만듭니다. */
export function consentField(type: ConsentType): string {
  return `consent_${type}`;
}

export type ConsentRecord = {
  doc_type: ConsentType;
  doc_version: string;
  agreed: boolean;
  agreed_at: string;
};

/**
 * 가입 시점 기록.
 *
 * 세션이 아직 없으므로 SECURITY DEFINER 함수를 씁니다. 함수가 "가입 직후
 * (10분 이내) 인 계정" 인지 확인하므로, 남의 계정에 동의를 심을 수 없습니다.
 */
export async function recordSignupConsents(
  userId: string,
  agreed: Record<ConsentType, boolean>,
): Promise<void> {
  const items = CONSENT_ITEMS.map((item) => ({
    type: item.type,
    version: item.version,
    agreed: agreed[item.type] === true,
  }));

  await query(`select record_user_consents($1::bigint, $2::jsonb)`, [
    userId,
    JSON.stringify(items),
  ]);
}

/**
 * 항목별 **가장 최근** 상태. 철회했다면 agreed=false 인 최신 행이 잡힙니다.
 * 회원정보 화면에서 "언제 동의했는지" 를 보여주는 데 씁니다.
 */
export async function readConsents(userId: string): Promise<ConsentRecord[]> {
  return withUser(userId, (q) =>
    q<ConsentRecord>(
      `select distinct on (doc_type)
              doc_type, doc_version, agreed, agreed_at
         from user_consents
        where user_id = $1::bigint
        order by doc_type, agreed_at desc`,
      [userId],
    ),
  );
}

/**
 * 선택 항목 동의·철회. 지우지 않고 **새 행을 넣습니다.**
 * 필수 항목은 여기로 바꿀 수 없습니다 — 철회하려면 탈퇴해야 합니다.
 */
export async function setOptionalConsent(
  userId: string,
  type: ConsentType,
  agreed: boolean,
): Promise<void> {
  const item = CONSENT_ITEMS.find((candidate) => candidate.type === type);
  if (!item || item.required) {
    throw new Error(`선택 항목이 아닙니다: ${type}`);
  }

  await withUser(userId, (q) =>
    q(
      `insert into user_consents (user_id, doc_type, doc_version, agreed)
       values ($1::bigint, $2, $3, $4)`,
      [userId, type, item.version, agreed],
    ),
  );
}
