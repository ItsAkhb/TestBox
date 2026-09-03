import { forwardRef } from "react";

const Input = forwardRef(function Input(
  { label, error, helper, icon, className = "", ...props },
  ref
) {
  return (
    <div className={`input-group ${className}`}>
      {label && <label className="input-label">{label}</label>}
      <div className="input-wrapper">
        {icon && <span className="input-icon" aria-hidden="true">{icon}</span>}
        <input
          ref={ref}
          className={`input-field ${error ? "input-error" : ""}`}
          {...props}
        />
      </div>
      {error && <span className="input-error-text" role="alert">{error}</span>}
      {helper && !error && <span className="input-helper">{helper}</span>}
    </div>
  );
});

export default Input;
