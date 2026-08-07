/**
 * 별칭 이니셜 아바타.
 * 사용처: 출타 명단, 구성원 목록, 상단바.
 */

const PALETTE = ["#ffedd5", "#fce7f3", "#ede9fe", "#d1fae5", "#dbeafe"];

/**
 * 별칭 이니셜만 그린다. 사진 업로드·열람 경로를 없앴으므로 이미지 분기도 없다.
 * 군사시설 촬영 위험과 사진 권한 요구를 애초에 만들지 않기 위한 선택이다.
 */
export function Avatar(props: { name: string; size?: number }) {
  const size = props.size ?? 36;
  const bg = PALETTE[props.name.charCodeAt(0) % PALETTE.length];

  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        background: bg,
        color: "var(--ink-deep)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 600,
        fontSize: size * 0.42,
      }}
    >
      {props.name.slice(0, 1)}
    </div>
  );
}
