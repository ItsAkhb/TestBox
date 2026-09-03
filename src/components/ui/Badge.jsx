export default function Badge({ variant = "primary", size = "md", dot, className = "", children }) {
  const classes = [
    "ui-badge",
    `ui-badge-${variant}`,
    size === "sm" && "ui-badge-sm",
    dot && "ui-badge-dot",
    className,
  ].filter(Boolean).join(" ");

  return (
    <span className={classes}>
      {dot && <span className="ui-badge-dot-indicator" aria-hidden="true" />}
      {children}
    </span>
  );
}
