// Inline SVG icon set (stroke icons, 24x24). Decorative by default: callers put the
// accessible name on the surrounding button.
const PATHS = {
  play: <path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none" />,
  pause: (
    <g fill="currentColor" stroke="none">
      <rect x="6" y="4.5" width="4" height="15" rx="1" />
      <rect x="14" y="4.5" width="4" height="15" rx="1" />
    </g>
  ),
  next: (
    <g>
      <path d="M5 5l10 7-10 7z" fill="currentColor" stroke="none" />
      <path d="M19 5v14" />
    </g>
  ),
  prev: (
    <g>
      <path d="M19 5L9 12l10 7z" fill="currentColor" stroke="none" />
      <path d="M5 5v14" />
    </g>
  ),
  volume: (
    <g>
      <path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" stroke="none" />
      <path d="M16 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12" />
    </g>
  ),
  mute: (
    <g>
      <path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" stroke="none" />
      <path d="M17 9l5 6M22 9l-5 6" />
    </g>
  ),
  heart: (
    <path d="M12 20s-7-4.4-9.2-8.6C1.2 8.2 3 4.5 6.6 4.5c2.1 0 3.6 1.2 5.4 3.2 1.8-2 3.3-3.2 5.4-3.2 3.6 0 5.4 3.7 3.8 6.9C19 15.6 12 20 12 20z" />
  ),
  heartFilled: (
    <path
      d="M12 20s-7-4.4-9.2-8.6C1.2 8.2 3 4.5 6.6 4.5c2.1 0 3.6 1.2 5.4 3.2 1.8-2 3.3-3.2 5.4-3.2 3.6 0 5.4 3.7 3.8 6.9C19 15.6 12 20 12 20z"
      fill="currentColor"
    />
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  queue: <path d="M4 6h12M4 12h12M4 18h8M18 14v6l4-3z" />,
  search: (
    <g>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </g>
  ),
  home: <path d="M4 11l8-6.5 8 6.5V20h-5v-5.5H9V20H4z" />,
  library: <path d="M5 4v16M10 4v16M15 4.5l4.5 15" />,
  users: (
    <g>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.8a3.5 3.5 0 010 6.4M18 14.8c2 .7 3.2 2.5 3.5 5.2" />
    </g>
  ),
  x: <path d="M6 6l12 12M18 6L6 18" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
  more: (
    <g fill="currentColor" stroke="none">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </g>
  ),
  logout: <path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10" />,
  music: (
    <g>
      <path d="M9 18V5l11-2v13" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="17.5" cy="16" r="2.5" />
    </g>
  ),
  send: <path d="M4 12l16-8-6 16-2.5-6.5z" />,
  copy: (
    <g>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V4H4v12h4" />
    </g>
  ),
  crown: <path d="M4 18h16M4 15L3 7l5 4 4-6 4 6 5-4-1 8z" />,
  radio: (
    <g>
      <circle cx="12" cy="12" r="2" />
      <path d="M7.8 7.8a6 6 0 000 8.4M16.2 7.8a6 6 0 010 8.4M5 5a10 10 0 000 14M19 5a10 10 0 010 14" />
    </g>
  ),
  alert: <path d="M12 3l10 18H2zM12 10v4M12 17.5v.5" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  info: (
    <g>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.5" />
    </g>
  ),
  up: <path d="M6 15l6-6 6 6" />,
  left: <path d="M15 6l-6 6 6 6" />,
  right: <path d="M9 6l6 6-6 6" />,
  down: <path d="M6 9l6 6 6-6" />,
  lock: (
    <g>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </g>
  ),
  globe: (
    <g>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" />
    </g>
  ),
  refresh: <path d="M20 11a8 8 0 10-2.3 5.7M20 5v6h-6" />,
};

export function Icon({ name, size = 20, className = '', title }) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {PATHS[name]}
    </svg>
  );
}
