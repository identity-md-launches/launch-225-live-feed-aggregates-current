import type { CSSProperties } from "react";
const paths: Record<string, React.ReactNode> = {
  arrow: (
    <>
      <path d="M7 17 17 7M7 7h10v10" />
    </>
  ),
  down: <path d="m6 9 6 6 6-6" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  feed: (
    <>
      <path d="M5 5h14M5 12h14M5 19h9" />
      <circle cx="19" cy="19" r="1" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  compact: (
    <>
      <path d="M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01" />
    </>
  ),
  bookmark: <path d="M6 3h12v18l-6-4-6 4z" />,
  hide: (
    <>
      <path d="m3 3 18 18M10 5.2A11 11 0 0 1 22 12a15 15 0 0 1-3 4M6.5 6.5A17 17 0 0 0 2 12s4 7 10 7a10 10 0 0 0 4-1" />
      <path d="M10 10a3 3 0 0 0 4 4" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1" />
    </>
  ),
  dusk: (
    <>
      <path d="M3 17h18M5 21h14M6 13a6 6 0 0 1 12 0M12 2v2M3 6l2 2M21 6l-2 2" />
    </>
  ),
  moon: <path d="M20.8 14.3A9 9 0 0 1 9.7 3.2 9 9 0 1 0 20.8 14.3Z" />,
  filter: (
    <>
      <path d="M3 6h18M3 18h18M3 12h18" />
      <circle cx="8" cy="6" r="2" />
      <circle cx="16" cy="12" r="2" />
      <circle cx="9" cy="18" r="2" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  refresh: (
    <>
      <path d="M20 7v5h-5M4 17v-5h5" />
      <path d="M5.5 7a8 8 0 0 1 13-1L20 9M4 15l1.5 3a8 8 0 0 0 13-1" />
    </>
  ),
  shield: (
    <>
      <path d="m12 3 8 3v6c0 5-8 9-8 9S4 17 4 12V6z" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18" />
    </>
  ),
  play: <path d="m9 5 11 7-11 7z" />,
  post: (
    <>
      <path d="M21 11a9 9 0 0 1-9 9H4l-2 2V11a9 9 0 0 1 19 0Z" />
      <path d="M7 8h10M7 13h6" />
    </>
  ),
  article: (
    <>
      <path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8" cy="8" r="1.5" />
      <path d="m3 18 6-6 4 4 3-5 5 6" />
    </>
  ),
  spark: <path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7h.01" />
    </>
  ),
};
export function Icon({
  name,
  size = 18,
  style,
}: {
  name: string;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      style={style}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.globe}
    </svg>
  );
}
export function SourceIcon({ source }: { source: string }) {
  if (source === "X")
    return (
      <span className="source-logo x-logo" aria-hidden="true">
        𝕏
      </span>
    );
  if (source === "Bluesky")
    return (
      <svg
        className="source-logo blue-logo"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M5 3c3 2 6 6 7 8 1-2 4-6 7-8 2-1 4-1 4 2 0 1-1 7-2 8-1 2-4 2-6 1 4 1 5 4 2 6-3 3-4-1-5-3-1 2-2 6-5 3-3-2-2-5 2-6-2 1-5 1-6-1C2 12 1 6 1 5c0-3 2-3 4-2Z" />
      </svg>
    );
  if (source === "YouTube")
    return (
      <span className="source-logo youtube-logo" aria-hidden="true">
        <Icon name="play" size={16} />
      </span>
    );
  if (source === "Reddit")
    return (
      <span className="source-logo reddit-logo" aria-hidden="true">
        r/
      </span>
    );
  return <Icon name="globe" size={17} />;
}
