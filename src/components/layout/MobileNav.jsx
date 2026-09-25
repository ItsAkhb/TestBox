import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "../../i18n";
import { NAV_ITEMS } from "../../utils/navItems";
import Icon from "../ui/Icon";

const SETTINGS_ITEM = {
  to: "/settings",
  path: "/settings",
  icon: "settings",
  labelKey: "nav.settings",
};

export default function MobileNav() {
  const location = useLocation();
  const { t } = useTranslation();

  const items = [
    ...NAV_ITEMS.map((item) => ({
      to: item.path,
      path: item.path,
      icon: item.icon,
      labelKey: item.mobileLabelKey || item.labelKey,
    })),
    SETTINGS_ITEM,
  ];

  const isActive = (path) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  return (
    <nav className="mobile-nav" aria-label="Primary navigation">
      {items.map((item) => (
        <Link
          key={item.path}
          to={item.path}
          className={`mobile-nav-item ${isActive(item.path) ? "active" : ""}`}
          aria-current={isActive(item.path) ? "page" : undefined}
        >
          <Icon name={item.icon} size={20} />
          <span>{t(item.labelKey)}</span>
        </Link>
      ))}
    </nav>
  );
}
