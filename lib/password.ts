import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * 비밀번호 저장 방식에 대하여
 *
 * 비밀번호는 "암호화"하지 않고 "해시"한다. 둘은 다르다.
 *   - 암호화(AES 등): 키가 있으면 원문으로 되돌릴 수 있다 → 서버가 털리면 전원 유출
 *   - 해시: 되돌릴 수 없다. 로그인할 때마다 같은 방식으로 다시 계산해 비교만 한다
 *
 * 그리고 SHA-256 같은 일반 해시도 쓰지 않는다. 너무 빨라서 공격자가 초당 수십억 개를
 * 시도할 수 있기 때문이다. 비밀번호에는 "의도적으로 느린" 전용 해시를 쓴다.
 * 대표적으로 Argon2id, scrypt, bcrypt가 있고, 여기서는 Node에 내장된 scrypt를 쓴다
 * (추가 패키지가 필요 없다).
 *
 * 저장 형식: scrypt$<N>$<r>$<p>$<salt(base64)>$<hash(base64)>
 * 파라미터를 함께 저장해 두면, 나중에 보안 강도를 올려도 예전 비밀번호를 계속 검증할 수 있다.
 */

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const N = 16384; // CPU/메모리 비용. 2배로 올리면 계산 시간도 2배
const R = 8;
const P = 1;
const KEY_LENGTH = 32;
const MAX_MEM = 64 * 1024 * 1024;

/** 사용자 이름이 존재하지 않을 때도 같은 시간을 쓰도록 비교용으로만 쓰는 더미 해시. */
export const DUMMY_HASH =
  "scrypt$16384$8$1$4DMRXy9tOjoN5Mcm74U/XA==$YXPhb45c8AxmO1jfboQ+ibcwy85An7mMOWgL5U4/Tmg=";

/** salt는 사용자마다 새로 만든다. 같은 비밀번호라도 저장값이 달라진다. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, {
    N,
    r: R,
    p: P,
    maxmem: MAX_MEM,
  });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

/**
 * 저장값이 깨졌거나 형식이 다르면 예외 대신 false를 돌려준다.
 * 비교는 timingSafeEqual로 한다 — 앞부분이 몇 글자 맞았는지가 응답 시간으로 새어나가지 않게.
 */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;

  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
  const costN = Number(nRaw);
  const costR = Number(rRaw);
  const costP = Number(pRaw);
  if (!Number.isInteger(costN) || !Number.isInteger(costR) || !Number.isInteger(costP)) {
    return false;
  }

  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  if (salt.length === 0 || expected.length === 0) return false;

  try {
    const derived = await scrypt(password.normalize("NFKC"), salt, expected.length, {
      N: costN,
      r: costR,
      p: costP,
      maxmem: MAX_MEM,
    });
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** 아이디 규칙: 영소문자·숫자·. _ - 만, 3~30자. */
export function validateUsername(value: string): string | null {
  if (value.length < 3) return "아이디는 3자 이상이어야 합니다.";
  if (value.length > 30) return "아이디는 30자 이하여야 합니다.";
  if (!/^[a-z0-9._-]+$/.test(value)) {
    return "아이디는 영문 소문자, 숫자, . _ - 만 쓸 수 있습니다.";
  }
  return null;
}

/** 비밀번호 규칙: 8자 이상. 길이가 복잡도보다 중요하다. */
export function validatePassword(value: string): string | null {
  if (value.length < 8) return "비밀번호는 8자 이상이어야 합니다.";
  if (value.length > 200) return "비밀번호가 너무 깁니다.";
  return null;
}
