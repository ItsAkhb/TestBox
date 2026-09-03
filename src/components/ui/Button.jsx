import { forwardRef } from "react";

const Button = forwardRef(function Button(
  {
    variant = "primary",
    size = "md",
    icon,
    loading,
    fullWidth,
    iconOnly,
    className = "",
    children,
    disabled,
    ...props
  },
  ref
) {
  const variantClass = {
    primary: "primary-button",
    secondary: "secondary-button",
    danger: "danger-button",
    ghost: "ghost-button",
  }[variant] || "primary-button";

  const classes = [
    variantClass,
    size === "sm" && "btn-sm",
    size === "lg" && "btn-lg",
    fullWidth && "btn-full",
    iconOnly && "btn-icon-only",
    loading && "btn-loading",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      ref={ref}
      className={classes}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <span className="btn-spinner" aria-hidden="true">⟳</span>}
      {icon && !loading && <span className="btn-icon" aria-hidden="true">{icon}</span>}
      {children}
    </button>
  );
});

export default Button;