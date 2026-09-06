export const VIEWS = ["board", "focus", "list", "epics", "graph", "insights", "activity", "needsyou", "achievements", "publish", "settings"] as const;
export type View = (typeof VIEWS)[number];
export function isView(value: string | null | undefined): value is View {
  return typeof value === "string" && (VIEWS as readonly string[]).includes(value);
}
