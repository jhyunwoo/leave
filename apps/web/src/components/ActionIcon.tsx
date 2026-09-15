/** Decorative action icons; the adjacent button text supplies its accessible name. */
const paths = {
  plus: "M12 5v14M5 12h14",
  edit: "m16 3 5 5-12 12-6 1 1-6Z M14 5l5 5",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7",
  save: "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2ZM7 3v6h9V3M7 21v-8h10v8",
  check: "m5 12 4 4L19 6",
  close: "m6 6 12 12M6 18 18 6",
  calendar:
    "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2ZM7 14h3M14 14h3M7 17h3",
  calendarAdd:
    "M8 2v4M16 2v4M3 10h18M11 21H3V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5M17 13v8M13 17h8",
  userAdd:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM20 6v6M17 9h6",
  userRemove:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM17 9h6",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM17 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-4",
  share: "M12 16V3m-4 4 4-4 4 4M6 11H3v10h18V11h-3",
  copy: "M9 9h12v12H9ZM5 15H3V3h12v2",
  refresh: "M20 7A9 9 0 0 0 5 5L2 8M2 3v5h5M4 17a9 9 0 0 0 15 2l3-3M17 16h5v5",
  key: "M14 7a5 5 0 1 1-3 5L3 20H1v-4l8-8a5 5 0 0 1 5-6M16 6h.01",
  login: "M14 3h7v18h-7M3 12h13m-4-4 4 4-4 4",
  logout: "M10 3H3v18h7M8 12h13m-4-4 4 4-4 4",
  flag: "M4 22V3c6-4 10 4 16 0v11c-6 4-10-4-16 0",
  block: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM6 6l12 12",
  settings: "M4 7h16M4 17h16M8 4v6M16 14v6",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M10 21h4",
  left: "m14 6-6 6 6 6",
  right: "m10 6 6 6-6 6",
  up: "m6 14 6-6 6 6",
  down: "m6 10 6 6 6-6",
} as const;

export function ActionIcon({ name }: { name: keyof typeof paths }) {
  return (
    <svg
      className="action-icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
