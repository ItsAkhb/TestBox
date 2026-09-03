// TestBox logomark — an answered answer-bubble on a signature tile.
// Tile follows --primary, dot follows --warm; ring stays paper-white.
export default function LogoMark({ size = 36 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      aria-hidden="true"
      className="logo-mark"
    >
      <rect
        x="1.5"
        y="1.5"
        width="33"
        height="33"
        rx="10.5"
        style={{ fill: "var(--primary)" }}
      />
      <circle
        cx="18"
        cy="18"
        r="7.75"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2.75"
      />
      <circle
        cx="18"
        cy="18"
        r="3.1"
        style={{ fill: "var(--warm)" }}
      />
    </svg>
  );
}
