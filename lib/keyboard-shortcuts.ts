import type { View } from "@/components/app-context";

export interface KeyboardShortcut {
  keys: string[];
  label: string;
  sequence?: boolean;
}

export interface KeyboardShortcutGroup {
  topic: string;
  shortcuts: KeyboardShortcut[];
}

export const VIEW_KEY_BINDINGS: Record<string, View> = {
  f: "focus",
  b: "board",
  l: "list",
  e: "epics",
  g: "graph",
  i: "insights",
  a: "activity",
  y: "needsyou",
  h: "achievements",
  p: "publish",
  s: "settings",
};

export const KEYBOARD_SHORTCUT_GROUPS: KeyboardShortcutGroup[] = [
  {
    topic: "Global",
    shortcuts: [
      { keys: ["?"], label: "Show keyboard shortcuts" },
      { keys: ["⌘/Ctrl", "K"], label: "Open the command palette" },
      { keys: ["/"], label: "Focus search" },
      { keys: ["N"], label: "Create an issue" },
      { keys: ["T"], label: "Toggle light / dark theme" },
      { keys: ["Esc"], label: "Close the active drawer or dialog" },
    ],
  },
  {
    topic: "Issues",
    shortcuts: [
      { keys: ["J"], label: "Select next visible issue" },
      { keys: ["K"], label: "Select previous visible issue" },
      { keys: ["H"], label: "Select issue to the left" },
      { keys: ["L"], label: "Select issue to the right" },
      { keys: ["Enter"], label: "Open selected issue" },
      { keys: ["O"], label: "Open selected issue" },
      { keys: ["E"], label: "Edit selected issue" },
      { keys: ["C"], label: "Close selected issue with optional reason" },
      { keys: ["S"], label: "Set selected issue status" },
      { keys: ["P"], label: "Set selected issue priority" },
    ],
  },
  {
    topic: "Views",
    shortcuts: [
      { keys: ["G", "F"], label: "Focus", sequence: true },
      { keys: ["G", "B"], label: "Board", sequence: true },
      { keys: ["G", "L"], label: "List", sequence: true },
      { keys: ["G", "E"], label: "Epics", sequence: true },
      { keys: ["G", "G"], label: "Graph", sequence: true },
      { keys: ["G", "I"], label: "Insights", sequence: true },
      { keys: ["G", "A"], label: "Activity", sequence: true },
      { keys: ["G", "Y"], label: "Needs You", sequence: true },
      { keys: ["G", "H"], label: "Achievements", sequence: true },
      { keys: ["G", "P"], label: "Publish", sequence: true },
      { keys: ["G", "S"], label: "Settings", sequence: true },
    ],
  },
  {
    topic: "Repositories",
    shortcuts: [
      { keys: ["G", "R"], label: "Choose a repository", sequence: true },
      { keys: ["G", "["], label: "Previous repository", sequence: true },
      { keys: ["G", "]"], label: "Next repository", sequence: true },
    ],
  },
];
