export const VIEWS = ["board", "focus", "list", "epics", "graph", "insights", "activity", "needsyou", "achievements", "publish", "settings"] as const;
export type View = (typeof VIEWS)[number];
export function isView(value: string | null | undefined): value is View {
  return typeof value === "string" && (VIEWS as readonly string[]).includes(value);
}

export interface ViewNavItem {
  key: View;
  label: string;
  icon: string;
}

const VIEW_NAV: ViewNavItem[] = [
  { key: "focus", label: "Focus", icon: "bolt" },
  { key: "board", label: "Board", icon: "board" },
  { key: "list", label: "List", icon: "list" },
  { key: "epics", label: "Epics", icon: "target" },
  { key: "graph", label: "Graph", icon: "graph" },
  { key: "insights", label: "Insights", icon: "milestone" },
  { key: "activity", label: "Activity", icon: "comment" },
  { key: "needsyou", label: "Needs You", icon: "user" },
  { key: "achievements", label: "Achievements", icon: "feature" },
  { key: "publish", label: "Publish", icon: "rocket" },
  { key: "settings", label: "Settings", icon: "settings" },
];

// Shared by the sidebar and the command palette so both offer the same views.
export function navViews(gamification: boolean): ViewNavItem[] {
  return VIEW_NAV.filter((view) => view.key !== "achievements" || gamification);
}
