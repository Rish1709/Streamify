// Generated cover art: a gradient + soft waveform from the track's hue. Avoids
// shipping or hot-linking third-party artwork.
export function Cover({ hue = 260, size = 48, label, className = '', rounded = 8 }) {
  const h2 = (hue + 50) % 360;
  return (
    <div
      className={`cover ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: rounded,
        background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${h2} 75% 30%))`,
      }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg viewBox="0 0 40 40" width="60%" height="60%" aria-hidden="true">
        {[6, 12, 18, 24, 30].map((x, i) => {
          const h = [10, 20, 26, 16, 8][(i + Math.round(hue / 40)) % 5];
          return (
            <rect
              key={x}
              x={x}
              y={20 - h / 2}
              width="3.5"
              height={h}
              rx="1.75"
              fill="rgba(255,255,255,0.55)"
            />
          );
        })}
      </svg>
    </div>
  );
}

export const hueFromId = (id = '') => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
