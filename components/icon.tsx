/**
 * Material Symbols 아이콘.
 *
 * 시안(Stitch)이 쓰는 아이콘 세트라 그대로 따릅니다.
 * 아이콘은 장식이므로 스크린리더에서 감춥니다. 아이콘만 있는 버튼에는
 * 반드시 버튼 쪽에 aria-label 을 붙이세요.
 */
export function Icon({
  name,
  size = 20,
  className = "",
  filled = false,
}: {
  name: string;
  size?: number;
  className?: string;
  filled?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={`material-symbols-outlined shrink-0 ${className}`}
      style={{
        fontSize: `${size}px`,
        ...(filled ? { fontVariationSettings: "'FILL' 1" } : {}),
      }}
    >
      {name}
    </span>
  );
}
