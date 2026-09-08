import type { CSSProperties } from "react";

export type IconName =
  | "home"
  | "compass"
  | "flask"
  | "chart"
  | "arrow"
  | "back"
  | "star"
  | "book"
  | "math"
  | "code"
  | "globe"
  | "pen"
  | "art"
  | "run"
  | "mic"
  | "mute"
  | "check"
  | "clock"
  | "search"
  | "close"
  | "headphones"
  | "sun"
  | "chevron"
  | "pause";
const paths: Record<IconName, React.ReactNode> = {
  home: (
    <>
      <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
      <path d="M9 21v-8h6v8" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m16 8-2 6-6 2 2-6Z" />
    </>
  ),
  flask: (
    <>
      <path d="M9 3h6M10 3v7L4 19a1.3 1.3 0 0 0 1 2h14a1.3 1.3 0 0 0 1-2l-6-9V3M7 15h10" />
      <path d="M10 18h.01M14 17h.01" />
    </>
  ),
  chart: (
    <>
      <path d="M4 3v18h17M8 16v-4M13 16V8M18 16V5" />
    </>
  ),
  arrow: (
    <>
      <path d="M4 12h16m-6-6 6 6-6 6" />
    </>
  ),
  back: (
    <>
      <path d="M20 12H4m6-6-6 6 6 6" />
    </>
  ),
  star: <path d="m12 2 2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6Z" />,
  book: (
    <>
      <path d="M12 5C8 2 3 3 3 3v16s5-1 9 2c4-3 9-2 9-2V3s-5-1-9 2Zm0 0v16" />
    </>
  ),
  math: (
    <>
      <path d="M5 6h6M8 3v6M15 6h6M5 15l6 6M5 21l6-6M15 16h6M15 20h6" />
    </>
  ),
  code: (
    <>
      <path d="m7 6-6 6 6 6m10-12 6 6-6 6M14 3l-4 18" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18" />
    </>
  ),
  pen: (
    <>
      <path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-4L4 15Z" />
    </>
  ),
  art: (
    <>
      <path d="M21 12a9 9 0 1 0-9 9h1a2 2 0 0 0 1-4 2 2 0 0 1 1-4h4a2 2 0 0 0 2-1Z" />
      <path d="M7 9h.01M11 6h.01M16 8h.01M6 14h.01" />
    </>
  ),
  run: (
    <>
      <circle cx="15" cy="4" r="2" />
      <path d="m5 11 5-4 4 3 5 1M12 9l-3 6 5 2-1 5M9 15l-4 5" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="2" width="6" height="13" rx="3" />
      <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
    </>
  ),
  mute: (
    <>
      <path d="M9 9v3a3 3 0 0 0 5 2M15 9V5a3 3 0 0 0-5-2M5 10v2a7 7 0 0 0 12 5M19 10v2M12 19v3M8 22h8M2 2l20 20" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  search: (
    <>
      <circle cx="10" cy="10" r="6" />
      <path d="m15 15 6 6" />
    </>
  ),
  close: <path d="m6 6 12 12M6 18 18 6" />,
  headphones: (
    <>
      <path d="M3 14v-2a9 9 0 0 1 18 0v2" />
      <rect x="3" y="12" width="4" height="8" rx="2" />
      <rect x="17" y="12" width="4" height="8" rx="2" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 1v2M12 21v2M1 12h2M21 12h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2" />
    </>
  ),
  chevron: <path d="m9 5 7 7-7 7" />,
  pause: (
    <>
      <path d="M8 5v14M16 5v14" />
    </>
  ),
};
export function Icon({
  name,
  size = 20,
  style,
}: {
  name: IconName;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {paths[name]}
    </svg>
  );
}
