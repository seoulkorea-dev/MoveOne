import "server-only";
import { Pool, type PoolClient } from "pg";

/**
 * 개발 중에는 Next.js가 모듈을 자주 다시 불러오므로,
 * 풀을 globalThis에 보관해 커넥션이 무한히 늘어나는 것을 막습니다.
 */
const globalForDb = globalThis as unknown as { __pgPool?: Pool };

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL이 없습니다. .env.local을 확인하세요.");
  }
  return new Pool({ connectionString, max: 10 });
}

export const pool: Pool = globalForDb.__pgPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__pgPool = pool;
}

/**
 * 사용자 컨텍스트가 필요 없는 질의.
 *
 * 주의: RLS가 걸린 테이블(users, user_auth, user_preferences, searches)을
 * 이 함수로 조회하면 "아무것도 안 보입니다". 그게 정상입니다 —
 * 사용자 컨텍스트가 없으니 볼 권한이 없는 것이죠.
 * 사용자 데이터는 withUser() 를 쓰세요.
 */
export async function query<T extends Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

/** withUser 안에서 쓰는 질의 함수. 같은 커넥션·같은 트랜잭션을 씁니다. */
export type TxQuery = <T extends Record<string, unknown>>(
  text: string,
  params?: unknown[],
) => Promise<T[]>;

/**
 * 사용자 컨텍스트를 심고 실행합니다. RLS 정책이 이 값을 봅니다.
 *
 *   const rows = await withUser(session.uid, (q) =>
 *     q("select * from searches order by created_at desc limit 20")
 *   );
 *
 * 왜 트랜잭션이 필요한가:
 *   SET LOCAL 은 트랜잭션 안에서만 유효합니다. 풀에서 아무 커넥션이나
 *   빌려 쓰면 설정이 다른 요청으로 새거나 사라집니다. 커넥션을 잡고
 *   트랜잭션으로 감싸야 컨텍스트가 이 요청에만 적용됩니다.
 *
 * userId 에 null 을 주면 익명 컨텍스트입니다 — RLS가 걸린 테이블은
 * 보이지 않고, 익명 삽입이 허용된 곳만 쓸 수 있습니다.
 */
export async function withUser<R>(
  userId: string | null,
  fn: (q: TxQuery) => Promise<R>,
): Promise<R> {
  const client: PoolClient = await pool.connect();

  try {
    await client.query("begin");
    // set_config 의 세 번째 인자 true = SET LOCAL (트랜잭션 범위)
    await client.query("select set_config('app.user_id', $1, true)", [userId ?? ""]);

    const q: TxQuery = async <T extends Record<string, unknown>>(
      text: string,
      params: unknown[] = [],
    ) => {
      const result = await client.query(text, params);
      return result.rows as T[];
    };

    const out = await fn(q);
    await client.query("commit");
    return out;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
