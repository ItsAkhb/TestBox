import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useTranslation } from "../../i18n";
import { NAV_ITEMS } from "../../utils/navItems";
import Icon from "../ui/Icon";
import LogoMark from "../ui/LogoMark";

const BOTTOM_ITEMS = [
  { path: "/login", icon: "login", labelKey: "nav.login", guestOnly: true },
  { path: "/settings", icon: "settings", labelKey: "nav.settings" },
];

export default function Sidebar() {
  const location = useLocation();
  const { user } = useAuth();
  const { t } = useTranslation();

  const isActive = (path) => location.pathname === path;

  return (
    <aside className="sidebar">
      <Link to="/" className="sidebar-brand">
        <LogoMark size={36} />
        <span className="sidebar-brand-name">TestBox</span>
      </Link>

      <nav className="sidebar-nav" aria-label="Primary navigation">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`sidebar-nav-item ${isActive(item.path) ? "active" : ""}`}
            aria-current={isActive(item.path) ? "page" : undefined}
          >
            <Icon name={item.icon} size={18} />
            <span>{t(item.labelKey)}</span>
          </Link>
        ))}
      </nav>

      <div className="sidebar-divider" />

      <nav className="sidebar-bottom" aria-label="Primary navigation">
        {BOTTOM_ITEMS.map((item) => {
          if (item.authOnly && !user) return null;
          if (item.guestOnly && user) return null;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`sidebar-nav-item ${isActive(item.path) ? "active" : ""}`}
              aria-current={isActive(item.path) ? "page" : undefined}
            >
              <Icon name={item.icon} size={18} />
              <span>{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
