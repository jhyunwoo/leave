import { imageUrl } from "../api/client";

const PALETTE = ["#e2f6d5", "#c5edab", "#ffe08a", "#cde8ff", "#ffd6c2"];

export function Avatar(props: {
  name: string;
  imageKey?: string | null;
  size?: number;
}) {
  const size = props.size ?? 36;
  const url = imageUrl(props.imageKey);
  const bg = PALETTE[props.name.charCodeAt(0) % PALETTE.length];

  const style = {
    width: size,
    height: size,
    borderRadius: "50%",
    flexShrink: 0,
  } as const;

  if (url) {
    return (
      <img
        src={url}
        alt={props.name}
        style={{ ...style, objectFit: "cover" }}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      style={{
        ...style,
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
