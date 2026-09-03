export default function Toggle({ checked, onChange, label, description, disabled }) {
  return (
    <div className="toggle-row">
      <div className="toggle-info">
        {label && <strong>{label}</strong>}
        {description && <span>{description}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        className={`toggle-switch ${checked ? "active" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span className="toggle-knob" />
      </button>
    </div>
  );
}
