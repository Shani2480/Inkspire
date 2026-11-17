/**
 * The splash screen's drawings: the app mark (the app icon's page, orbit and spark) and the picture on the card's
 * right. Colours come from the splash's CSS variables, so both follow the system's light or dark theme.
 */

const stop = (offset: string, color: string, opacity?: number) => (
  <stop offset={offset} style={{ stopColor: color, stopOpacity: opacity ?? 1 }} />
)

/** The spark: a white four-pointed star on a rounded diamond. */
function Spark({ x, y, size, gradient }: { x: number; y: number; size: number; gradient: string }) {
  const half = size / 2
  const arm = size * 0.39
  const waist = size * 0.045
  const star =
    `M${x} ${y - arm} C${x + waist} ${y - waist * 2} ${x + waist * 2} ${y - waist} ${x + arm} ${y} ` +
    `C${x + waist * 2} ${y + waist} ${x + waist} ${y + waist * 2} ${x} ${y + arm} ` +
    `C${x - waist} ${y + waist * 2} ${x - waist * 2} ${y + waist} ${x - arm} ${y} ` +
    `C${x - waist * 2} ${y - waist} ${x - waist} ${y - waist * 2} ${x} ${y - arm}Z`
  return (
    <g>
      <rect
        x={x - half}
        y={y - half}
        width={size}
        height={size}
        rx={size * 0.28}
        transform={`rotate(45 ${x} ${y})`}
        fill={`url(#${gradient})`}
      />
      <path d={star} fill="#ffffff" />
    </g>
  )
}

/** The app mark, as on the app icon. */
export function SplashMark({ size = 48 }: { size?: number }) {
  return (
    <svg className="splash-mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="splash-tile" x1="0" y1="0" x2="1" y2="1">
          {stop("0", "#3d74f7")}
          {stop("1", "#4a2bcf")}
        </linearGradient>
        <linearGradient id="splash-orbit" x1="0" y1="0" x2="1" y2="0">
          {stop("0", "#62e6ff", 0)}
          {stop("0.35", "#62e6ff")}
          {stop("1", "#4f8dff")}
        </linearGradient>
        <linearGradient id="splash-gem" x1="0" y1="0" x2="1" y2="1">
          {stop("0", "#4f8dff")}
          {stop("1", "#8a5cff")}
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#splash-tile)" />
      <path d="M19 11h17l10 10v29a3 3 0 0 1-3 3H19a3 3 0 0 1-3-3V14a3 3 0 0 1 3-3Z" fill="#f5f8ff" />
      <path d="M36 11v7a3 3 0 0 0 3 3h7Z" fill="#c8d4f6" />
      {[23, 28.5, 34, 39.5].map((y, index) => (
        <rect key={y} x="21" y={y} width={[18, 15, 18, 11][index]} height="2.6" rx="1.3" fill="#8b9fd9" />
      ))}
      <path d="M8 41c3 9 24 13 41 4" fill="none" stroke="url(#splash-orbit)" strokeWidth="3.2" strokeLinecap="round" />
      <Spark x={47} y={44} size={17} gradient="splash-gem" />
    </svg>
  )
}

/** The picture on the card's right: a page over a page, circled by the orbit, with the spark. */
export function SplashPicture() {
  return (
    <svg className="splash-picture" viewBox="0 0 300 360" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="splash-wash" x1="0" y1="1" x2="1" y2="0">
          {stop("0", "var(--splash-wash-a)", 0)}
          {stop("0.55", "var(--splash-wash-a)")}
          {stop("1", "var(--splash-wash-b)")}
        </linearGradient>
        <linearGradient id="splash-ring" x1="0" y1="0" x2="1" y2="0">
          {stop("0", "#62e6ff", 0)}
          {stop("0.4", "#62e6ff", 0.9)}
          {stop("1", "#6d6bff")}
        </linearGradient>
        <linearGradient id="splash-gem-large" x1="0" y1="0" x2="1" y2="1">
          {stop("0", "#4f8dff")}
          {stop("1", "#8a5cff")}
        </linearGradient>
      </defs>
      <path d="M300 0V360H40C140 330 210 250 236 150C250 96 270 40 300 0Z" fill="url(#splash-wash)" />
      <g transform="rotate(9 205 150)">
        <rect
          x="150"
          y="70"
          width="112"
          height="146"
          rx="9"
          fill="var(--splash-page-back)"
          stroke="var(--splash-page-edge)"
        />
        {[96, 110, 124, 138].map((y) => (
          <rect key={y} x="166" y={y} width="76" height="5" rx="2.5" fill="var(--splash-line-back)" />
        ))}
      </g>
      <g transform="rotate(-5 170 190)">
        <rect x="116" y="112" width="124" height="160" rx="9" fill="var(--splash-shadow)" transform="translate(4 8)" />
        <rect
          x="116"
          y="112"
          width="124"
          height="160"
          rx="9"
          fill="var(--splash-page)"
          stroke="var(--splash-page-edge)"
        />
        {[138, 153, 168, 183, 198].map((y, index) => (
          <rect
            key={y}
            x="134"
            y={y}
            width={[88, 74, 88, 80, 52][index]}
            height="5.5"
            rx="2.75"
            fill="var(--splash-line)"
          />
        ))}
        <rect x="134" y="216" width="40" height="34" rx="5" fill="var(--splash-line)" opacity="0.55" />
      </g>
      <path
        d="M70 262C92 296 214 296 288 234"
        fill="none"
        stroke="url(#splash-ring)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <Spark x={246} y={246} size={44} gradient="splash-gem-large" />
    </svg>
  )
}
