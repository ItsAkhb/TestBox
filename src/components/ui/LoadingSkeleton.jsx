export default function LoadingSkeleton({ type = "list", count = 3 }) {
  if (type === "stat") {
    return (
      <div className="stats">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="stat-card skeleton-card">
            <div className="skeleton skeleton-icon" />
            <div className="skeleton-text-group">
              <div className="skeleton skeleton-text-lg" />
              <div className="skeleton skeleton-text-sm" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (type === "card") {
    return (
      <div className="folder-grid">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="skeleton-card">
            <div className="skeleton skeleton-icon" />
            <div className="skeleton skeleton-text-lg" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="skeleton-list">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-card">
          <div className="skeleton skeleton-icon" />
          <div className="skeleton-text-group">
            <div className="skeleton skeleton-text-lg" />
            <div className="skeleton skeleton-text-sm" />
          </div>
        </div>
      ))}
    </div>
  );
}
