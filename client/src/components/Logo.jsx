export function Logo({ size = 48 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="lg-gold" x1="40" y1="10" x2="40" y2="76" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fde68a"/>
          <stop offset="45%" stopColor="#f59e0b"/>
          <stop offset="100%" stopColor="#92400e"/>
        </linearGradient>
        <linearGradient id="lg-gold-h" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fde68a"/>
          <stop offset="50%" stopColor="#f59e0b"/>
          <stop offset="100%" stopColor="#fde68a"/>
        </linearGradient>
        <linearGradient id="lg-globe" x1="33" y1="2" x2="47" y2="16" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#93c5fd"/>
          <stop offset="100%" stopColor="#2563eb"/>
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="1.5" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* ── Base ── */}
      <rect x="21" y="69" width="38" height="6" rx="3" fill="url(#lg-gold)"/>
      <rect x="27" y="61" width="26" height="9" rx="2.5" fill="url(#lg-gold)"/>

      {/* ── Stem ── */}
      <rect x="33" y="46" width="14" height="16" rx="2.5" fill="url(#lg-gold)"/>

      {/* ── Handles ── */}
      <path d="M21 22 Q7 30 10 41 Q12 49 21 45"
            stroke="url(#lg-gold-h)" strokeWidth="5" strokeLinecap="round" fill="none"/>
      <path d="M59 22 Q73 30 70 41 Q68 49 59 45"
            stroke="url(#lg-gold-h)" strokeWidth="5" strokeLinecap="round" fill="none"/>

      {/* ── Cup body ── */}
      <path d="M20 16 C18 34 30 46 33 46 L47 46 C50 46 62 34 60 16 Z"
            fill="url(#lg-gold)"/>

      {/* ── Cup rim ── */}
      <rect x="16" y="13" width="48" height="6" rx="3" fill="#f59e0b"/>

      {/* ── Inner cup shine ── */}
      <path d="M28 19 Q31 17 34 19 Q32 30 27 37" fill="white" opacity="0.15"/>

      {/* ── Globe ── */}
      <circle cx="40" cy="9" r="9" fill="url(#lg-globe)" filter="url(#glow)"/>
      {/* Latitude lines */}
      <path d="M31.2 6 Q40 4 48.8 6"  fill="none" stroke="white" strokeWidth="0.7" opacity="0.55"/>
      <path d="M31.2 12 Q40 14 48.8 12" fill="none" stroke="white" strokeWidth="0.7" opacity="0.55"/>
      {/* Equator */}
      <line x1="31" y1="9" x2="49" y2="9" stroke="white" strokeWidth="0.7" opacity="0.55"/>
      {/* Meridian */}
      <ellipse cx="40" cy="9" rx="4" ry="9" fill="none" stroke="white" strokeWidth="0.7" opacity="0.45"/>
      {/* Globe shine */}
      <circle cx="37" cy="6" r="2.5" fill="white" opacity="0.25"/>
    </svg>
  )
}
