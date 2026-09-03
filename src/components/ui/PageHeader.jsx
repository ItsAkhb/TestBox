import Icon from "./Icon";

// Shared page header: icon tile + title/subtitle + optional
// trailing meta and/or actions. Replaces the various bespoke
// `.page-title` / `*-page-heading` blocks for one rhythm.
export default function PageHeader({
  icon,
  iconSize = 20,
  iconFilled = false,
  tone = "primary",
  title,
  subtitle,
  meta,
  actions,
  className = "",
}) {
  return (
    <div className={`page-head tone-${tone} ${className}`}>
      {icon && (
        <span className="page-head-icon" aria-hidden="true">
          <Icon name={icon} size={iconSize} fill={iconFilled ? "currentColor" : "none"} />
        </span>
      )}
      <div className="page-head-text">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {meta && <div className="page-head-meta">{meta}</div>}
      {actions && <div className="page-head-actions">{actions}</div>}
    </div>
  );
}
