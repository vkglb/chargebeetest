// A polished shield-with-keyhole security icon (blue gradient), used on the
// two-factor screens instead of a flat emoji.
export default function ShieldIcon({ size = 64 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Security shield"
      className="shield-icon"
    >
      <defs>
        <linearGradient id="shieldGrad" x1="14" y1="4" x2="50" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5AB0FF" />
          <stop offset="1" stopColor="#2F6BD6" />
        </linearGradient>
      </defs>
      {/* outer shield */}
      <path
        d="M32 3.5l23 8.2v17.4c0 15-9.8 24.9-23 29.4C18.8 53.9 9 44 9 29.1V11.7L32 3.5z"
        fill="url(#shieldGrad)"
      />
      {/* inner highlight ring */}
      <path
        d="M32 9.8l17.4 6.2v12.9c0 11.6-7.3 19.4-17.4 23-10.1-3.6-17.4-11.4-17.4-23V16L32 9.8z"
        fill="none"
        stroke="#CFE8FF"
        strokeOpacity="0.75"
        strokeWidth="1.7"
      />
      {/* keyhole */}
      <circle cx="32" cy="28" r="5.6" fill="#fff" />
      <path d="M29.9 30.4h4.2L32.7 40a0.9 0.9 0 01-1.4 0l-1.4-9.6z" fill="#fff" />
    </svg>
  );
}
