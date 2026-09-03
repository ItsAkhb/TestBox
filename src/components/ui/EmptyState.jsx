export default function EmptyState({ icon, title, description, action, children }) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-icon">{icon}</div>}
      {title && <h3>{title}</h3>}
      {description && <p>{description}</p>}
      {action && (
        <button
          type="button"
          className="primary-button"
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}
      {children}
    </div>
  );
}
