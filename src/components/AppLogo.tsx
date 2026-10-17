// The ClubTermine app icon (same artwork as public/icons): a checklist with
// the second row picked. Drawn as SVG so it stays sharp at any size.
export function AppLogo({ size = 88, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 512 512"
      role="img"
      aria-label="ClubTermine"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#24376A" />
          <stop offset="1" stopColor="#14223F" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill="url(#logo-bg)" />
      <rect x="90" y="112" width="85" height="85" rx="15" fill="none" stroke="#F18CBE" strokeWidth="7" opacity="0.55" />
      <rect x="210" y="137" width="200" height="36" rx="9" fill="#F18CBE" opacity="0.55" />
      <rect x="90" y="213" width="85" height="85" rx="15" fill="#F18CBE" />
      <rect x="210" y="238" width="200" height="36" rx="9" fill="#F18CBE" />
      <rect x="90" y="314" width="85" height="85" rx="15" fill="none" stroke="#F18CBE" strokeWidth="7" opacity="0.55" />
      <rect x="210" y="339" width="200" height="36" rx="9" fill="#F18CBE" opacity="0.55" />
    </svg>
  );
}
