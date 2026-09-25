// TestBox logomark — an answered answer-bubble on a signature tile.
// Tile follows --primary, dot follows --warm; ring stays paper-white.
// Geometry matches public/brand/testbox-mark.svg (ring + orange answer dot
// sitting on the ring at the lower-right, with a tile-colored gap).
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
        rx="7.6"
        style={{ fill: "var(--primary)" }}
      />
      <circle
        cx="18"
        cy="18"
        r="8.91"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2.706"
      />
      <circle
        cx="24.3"
        cy="24.3"
        r="3.63"
        style={{ fill: "var(--primary)" }}
      />
      <circle
        cx="24.3"
        cy="24.3"
        r="2.805"
        style={{ fill: "var(--warm)" }}
      />
    </svg>
  );
}
