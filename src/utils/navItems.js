export const NAV_ITEMS = [
  { path: "/", icon: "home", labelKey: "nav.home" },
  { path: "/folders", icon: "folder", labelKey: "nav.folders" },
  { path: "/subjects", icon: "book", labelKey: "nav.subjects" },
  { path: "/calendar", icon: "calendar", labelKey: "nav.calendar" },
  { path: "/marked", icon: "tag", labelKey: "nav.marked", mobileLabelKey: "nav.markedShort" },
];

export const BOTTOM_NAV_ITEMS = [
  { path: "/login", icon: "login", labelKey: "nav.login", guestOnly: true },
  { path: "/settings", icon: "settings", labelKey: "nav.settings" },
];

export function getMobileNavItems() {
  return [
    ...NAV_ITEMS.map((item) => ({
      ...item,
      labelKey: item.mobileLabelKey || item.labelKey,
    })),
    { path: "/settings", icon: "settings", labelKey: "nav.settings" },
  ];
}
