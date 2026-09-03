// EmptyArt — bubble-sheet spot illustrations for empty states.
// Variants: "sheets" (default), "search", "star". Decorative (aria-hidden).
export default function EmptyArt({ variant = "sheets" }) {
  return (
    <span className={`empty-art empty-art-${variant}`} aria-hidden="true">
      <svg width="120" height="92" viewBox="0 0 120 92" fill="none">
        {variant === "search" && (
          <>
            <circle cx="52" cy="38" r="24" className="art-stroke" strokeWidth="5" />
            <line x1="70" y1="56" x2="88" y2="74" className="art-stroke" strokeWidth="7" strokeLinecap="round" />
            <circle cx="45" cy="31" r="5" className="art-fill-warm" />
            <circle cx="60" cy="44" r="3.5" className="art-fill-soft" />
          </>
        )}
        {variant === "star" && (
          <>
            <path
              d="M60 10 L70.5 34.5 L96 36.5 L76.5 53.5 L82 79 L60 65.5 L38 79 L43.5 53.5 L24 36.5 L49.5 34.5 Z"
              className="art-stroke"
              strokeWidth="5"
              strokeLinejoin="round"
            />
            <circle cx="60" cy="50" r="5.5" className="art-fill-warm" />
            <circle cx="26" cy="18" r="3.5" className="art-fill-soft" />
            <circle cx="94" cy="22" r="3.5" className="art-fill-soft" />
          </>
        )}
        {variant !== "search" && variant !== "star" && (
          <>
            <rect x="30" y="14" width="66" height="60" rx="10" className="art-stroke" strokeWidth="5" />
            <rect x="22" y="24" width="66" height="60" rx="10" className="art-paper" strokeWidth="5" />
            <circle cx="44" cy="46" r="6" className="art-fill" />
            <circle cx="62" cy="46" r="6" className="art-stroke" strokeWidth="4" />
            <circle cx="44" cy="64" r="6" className="art-stroke" strokeWidth="4" />
            <circle cx="62" cy="64" r="6" className="art-fill-warm" />
          </>
        )}
      </svg>
    </span>
  );
}
