export default function Card({ hoverable, bordered = true, padding, className = "", children, ...props }) {
  const classes = [
    "ui-card",
    hoverable && "ui-card-hoverable",
    bordered && "ui-card-bordered",
    className,
  ].filter(Boolean).join(" ");

  return (
    <div className={classes} style={padding ? { padding } : undefined} {...props}>
      {children}
    </div>
  );
}
