// 타입 검사용 최소 스텁. 의존성을 설치할 수 없는 환경에서 내 코드의 타입만
// 확인하려고 둔 파일입니다. 패치에는 포함하지 않습니다.
declare namespace JSX { interface IntrinsicElements { [k: string]: any } }
declare module "react" {
  export function useState<S>(initial: S | (() => S)): [S, (v: S | ((p: S) => S)) => void];
  export function useEffect(fn: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useMemo<T>(fn: () => T, deps?: readonly unknown[]): T;
  export function useSyncExternalStore<T>(
    subscribe: (onStoreChange: () => void) => () => void,
    getSnapshot: () => T,
    getServerSnapshot?: () => T,
  ): T;
  export function useCallback<T extends (...a: any[]) => any>(fn: T, deps?: readonly unknown[]): T;
  export function useRef<T>(v: T): { current: T };
  export const Suspense: any;
  export type ReactNode = any;
  export interface InputHTMLAttributes<T> { [k: string]: any }
  export interface HTMLAttributes<T> { [k: string]: any }
  const React: any; export default React;
}
declare module "react/jsx-runtime" { export const jsx: any, jsxs: any, Fragment: any; }
declare module "next/link" { const L: any; export default L; }
declare module "next/navigation" {
  export function useRouter(): { push(u: string): void; replace(u: string): void; back(): void };
  export function useSearchParams(): { get(k: string): string | null };
  export function redirect(u: string): never;
}
declare module "next/headers" { export function cookies(): Promise<any>; }
declare module "next/server" { export const NextResponse: any; }
declare module "next" { export type Metadata = any; export type Viewport = any; }
declare module "*.css";
declare module "pg" { const x: any; export = x; }
declare const process: { env: Record<string, string | undefined> };
declare const console: any;
