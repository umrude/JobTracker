// Whether the sidebar is collapsed: a per-device preference, like the theme,
// but kept in a cookie rather than localStorage so the layout (a Server
// Component) can render the right width on the first paint. Written by the
// toggle in app/(dashboard)/sidebar.tsx, read by the layout.
export const SIDEBAR_COOKIE = "sidebar-collapsed";
