import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useTranslation } from "../../i18n";
import Icon from "../ui/Icon";

const NAV_ITEMS = [
  { to: "/", icon: "home", labelKey: "nav.home" },
  { to: "/folders", icon: "folder", labelKey: "nav.folders" },
  { to: "/subjects", icon: "book", labelKey: "nav.subjects" },
  { to: "/calendar", icon: "calendar", labelKey: "nav.calendar" },
  { to: "/marked", icon: "star", labelKey: "nav.markedShort" },
];

export default function MobileNav() {
  const location = useLocation();
  const { user } = useAuth();
  const { t } = useTranslation();

  const isActive = (to) =>
    to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);

  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className={`mobile-nav-item ${isActive(item.to) ? "active" : ""}`}
          aria-current={isActive(item.to) ? "page" : undefined}
        >
          <Icon name={item.icon} size={20} />
          <span>{t(item.labelKey)}</span>
        </Link>
      ))}

      <Link
        to={user ? "/account" : "/login"}
        className={`mobile-nav-item ${isActive(user ? "/account" : "/login") ? "active" : ""}`}
      >
        <Icon name={user ? "user" : "login"} size={20} />
        <span>{user ? t("nav.accountShort") : t("nav.login")}</span>
      </Link>
    </nav>
  );
}
