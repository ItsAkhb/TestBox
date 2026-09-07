import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useTranslation } from "../../i18n";
import Icon from "../ui/Icon";
import LogoMark from "../ui/LogoMark";

const NAV_ITEMS = [
  { path: "/", icon: "home", labelKey: "nav.home" },
  { path: "/folders", icon: "folder", labelKey: "nav.folders" },
  { path: "/subjects", icon: "book", labelKey: "nav.subjects" },
  { path: "/calendar", icon: "calendar", labelKey: "nav.calendar" },
  { path: "/marked", icon: "star", labelKey: "nav.marked" },
];

const BOTTOM_ITEMS = [
  { path: "/account", icon: "user", labelKey: "nav.account", authOnly: true },
  { path: "/login", icon: "login", labelKey: "nav.login", guestOnly: true },
  { path: "/friends", icon: "users", labelKey: "nav.friends" },
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

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`sidebar-nav-item ${isActive(item.path) ? "active" : ""}`}
          >
            <Icon name={item.icon} size={18} />
            <span>{t(item.labelKey)}</span>
          </Link>
        ))}
      </nav>

      <div className="sidebar-divider" />

      <nav className="sidebar-bottom">
        {BOTTOM_ITEMS.map((item) => {
          if (item.authOnly && !user) return null;
          if (item.guestOnly && user) return null;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`sidebar-nav-item ${isActive(item.path) ? "active" : ""}`}
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
