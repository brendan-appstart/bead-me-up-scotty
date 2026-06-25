# Per-project Themes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a registry of named color themes (Dracula + 6 more, plus Light/Dark) selectable in Settings, with each project remembering its own theme per-device.

**Architecture:** A pure theme registry (`lib/themes.ts`) holds metadata; full palettes live as `html[data-theme]` CSS blocks that override the existing raw palette vars (semantic shadcn tokens derive from them automatically). A rewritten project-aware `ThemeProvider` derives the active project from the URL, reads/writes the chosen theme under a per-project `localStorage` key, and applies it to `<html>`. A Settings grid and a command-palette submenu let the user pick any theme; the existing Light↔Dark quick toggle stays.

**Tech Stack:** Next.js 16 (App Router) client components, React 19, Tailwind v4 + shadcn tokens, `localStorage`, `cmdk` command palette, `sonner` toasts.

## Global Constraints

- **No new dependencies.** Use the standard library / existing packages only.
- **No test runner exists** in this repo (no vitest/jest; Playwright is for the demo-video skill only). The verification loop per task is **typecheck + lint**, with a **build + runtime smoke test** at the end. This deliberately matches the repo's existing convention (build + lint are the only gates) — instruction priority: repo conventions override the skill's default TDD ritual.
- **Typecheck command:** `npx tsc --noEmit -p tsconfig.json` → expect no output (exit 0).
- **Lint command:** `npm run lint` → expect no errors.
- **Per-project storage key:** `bmus.theme.<projectId>`; no-project (launcher) key: `bmus.theme`. Legacy key `bmus-theme` is read-only fallback (migration).
- **Theme set (9, ids fixed):** `light`, `dark`, `dracula`, `nord`, `solarized-dark`, `gruvbox-dark`, `tokyo-night`, `catppuccin-mocha`, `rose-pine`. All seven new themes are `mode: "dark"`; only `light` is `mode: "light"`.
- **`useTheme()` contract (new):** `{ theme: ThemeDef; mode: ThemeMode; setTheme: (id: string) => void; toggle: () => void }`.
- Commit after every task.

## File Structure

| File | Responsibility |
|---|---|
| `lib/themes.ts` (new) | Theme metadata registry + `getTheme`/`isThemeId` helpers. Pure, no DOM. |
| `app/globals.css` | +7 `html[data-theme="…"]` palette blocks (raw vars only). |
| `components/theme-provider.tsx` | Project-aware provider: derive project from URL, read/write per-project key, apply `data-theme` + `.dark`. |
| `components/settings-view.tsx` | Theme picker grid (per-project copy). |
| `components/sidebar.tsx` | Quick-toggle icon keyed off `mode`. |
| `components/launcher.tsx` | Quick-toggle icon keyed off `mode`. |
| `components/command-palette.tsx` | Use our provider; "Change theme…" submenu. |
| `components/ui/sonner.tsx` | Toast theme from our provider `mode`. |
| `components/app-shell.tsx` | (No edit — uses `toggle()` only; verify it still compiles.) |

---

### Task 1: Theme registry (`lib/themes.ts`)

**Files:**
- Create: `lib/themes.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type ThemeMode = "light" | "dark"`
  - `interface ThemeDef { id: string; name: string; mode: ThemeMode; swatch: [string, string, string] }`
  - `const THEMES: ThemeDef[]` (9 entries, ids per Global Constraints)
  - `const DEFAULT_THEME_ID = "light"`
  - `function getTheme(id: string | null | undefined): ThemeDef` — returns the matching theme or the default
  - `function isThemeId(id: string): boolean`

- [ ] **Step 1: Create the registry**

Create `lib/themes.ts`:

```ts
/**
 * Theme registry — metadata only. The actual colors live in app/globals.css as
 * `html[data-theme="<id>"]` blocks; this module is what the provider and pickers
 * use to enumerate themes, validate ids, and render swatches. `mode` decides
 * whether the `.dark` class is applied (so Tailwind `dark:` + shadcn tokens work).
 */
export type ThemeMode = "light" | "dark";

export interface ThemeDef {
  /** Stable id — also the html[data-theme] value and the localStorage value. */
  id: string;
  /** Human label for the picker. */
  name: string;
  /** Drives the `.dark` class. All custom themes here are dark; only Light is light. */
  mode: ThemeMode;
  /** Three representative hexes [bg, surface, accent] for the picker preview. */
  swatch: [string, string, string];
}

export const THEMES: ThemeDef[] = [
  { id: "light", name: "Light", mode: "light", swatch: ["#f6f6f8", "#ffffff", "#6d5ef0"] },
  { id: "dark", name: "Dark", mode: "dark", swatch: ["#0c0c0f", "#1d1d22", "#8b7cf8"] },
  { id: "dracula", name: "Dracula", mode: "dark", swatch: ["#282a36", "#44475a", "#bd93f9"] },
  { id: "nord", name: "Nord", mode: "dark", swatch: ["#2e3440", "#3b4252", "#88c0d0"] },
  { id: "solarized-dark", name: "Solarized Dark", mode: "dark", swatch: ["#002b36", "#073642", "#268bd2"] },
  { id: "gruvbox-dark", name: "Gruvbox Dark", mode: "dark", swatch: ["#282828", "#3c3836", "#fabd2f"] },
  { id: "tokyo-night", name: "Tokyo Night", mode: "dark", swatch: ["#1a1b26", "#24283b", "#7aa2f7"] },
  { id: "catppuccin-mocha", name: "Catppuccin Mocha", mode: "dark", swatch: ["#1e1e2e", "#313244", "#cba6f7"] },
  { id: "rose-pine", name: "Rosé Pine", mode: "dark", swatch: ["#191724", "#26233a", "#c4a7e7"] },
];

export const DEFAULT_THEME_ID = "light";

const BY_ID = new Map(THEMES.map((t) => [t.id, t]));

export function isThemeId(id: string): boolean {
  return BY_ID.has(id);
}

/** Returns the theme for `id`, or the default theme for unknown/empty ids. */
export function getTheme(id: string | null | undefined): ThemeDef {
  return (id ? BY_ID.get(id) : undefined) ?? BY_ID.get(DEFAULT_THEME_ID)!;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no output (exit 0).

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/themes.ts
git commit -m "feat(themes): theme registry (bead-me-up-scotty-81k)"
```

---

### Task 2: Theme palettes (`app/globals.css`)

**Files:**
- Modify: `app/globals.css` — insert after the closing `}` of the `.dark { … }` block (before `@layer base`).

**Interfaces:**
- Consumes: the raw palette var names already defined in `:root`/`.dark` (`--bg`, `--surface`, `--surface-2`, `--surface-3`, `--border`, `--border-strong`, `--text`, `--text-2`, `--text-3`, `--brand`, `--brand-2`, `--brand-weak`, `--drawer`, `--primary-foreground`, `--input`).
- Produces: 7 `html[data-theme]` blocks. Shadow vars intentionally inherit from `.dark`; only colors are overridden.

- [ ] **Step 1: Add the palette blocks**

In `app/globals.css`, immediately after the `.dark { … }` block closes, insert:

```css
/* ------------------------------------------------------------------ */
/* Named themes (bead-me-up-scotty-81k). Each overrides only the raw   */
/* palette vars; shadcn semantic tokens derive from them via var().    */
/* All are dark-mode, so the .dark class is also applied by the         */
/* provider and supplies shadow + dark semantic literals; these blocks  */
/* outrank .dark on specificity (html[data-theme] = 0,1,1 > .dark).     */
/* ------------------------------------------------------------------ */

html[data-theme="dracula"] {
  --bg: #282a36;
  --surface: #2d2f3d;
  --surface-2: #343746;
  --surface-3: #3c3f52;
  --border: #44475a;
  --border-strong: #565972;
  --text: #f8f8f2;
  --text-2: #b9bcd0;
  --text-3: #6272a4;
  --brand: #bd93f9;
  --brand-2: #caa9fa;
  --brand-weak: #343352;
  --drawer: #21222c;
  --primary-foreground: #282a36;
  --input: #44475a;
}

html[data-theme="nord"] {
  --bg: #2e3440;
  --surface: #353c4a;
  --surface-2: #3b4252;
  --surface-3: #434c5e;
  --border: #434c5e;
  --border-strong: #4c566a;
  --text: #eceff4;
  --text-2: #d8dee9;
  --text-3: #7b8493;
  --brand: #88c0d0;
  --brand-2: #8fbcbb;
  --brand-weak: #2f3b41;
  --drawer: #2b303b;
  --primary-foreground: #2e3440;
  --input: #3b4252;
}

html[data-theme="solarized-dark"] {
  --bg: #002b36;
  --surface: #073642;
  --surface-2: #0a4150;
  --surface-3: #0e4d5e;
  --border: #0e4d5e;
  --border-strong: #586e75;
  --text: #93a1a1;
  --text-2: #839496;
  --text-3: #586e75;
  --brand: #268bd2;
  --brand-2: #2aa198;
  --brand-weak: #073642;
  --drawer: #002129;
  --primary-foreground: #002b36;
  --input: #0e4d5e;
}

html[data-theme="gruvbox-dark"] {
  --bg: #282828;
  --surface: #32302f;
  --surface-2: #3c3836;
  --surface-3: #504945;
  --border: #504945;
  --border-strong: #665c54;
  --text: #ebdbb2;
  --text-2: #d5c4a1;
  --text-3: #a89984;
  --brand: #fabd2f;
  --brand-2: #fe8019;
  --brand-weak: #3c3530;
  --drawer: #1d2021;
  --primary-foreground: #282828;
  --input: #504945;
}

html[data-theme="tokyo-night"] {
  --bg: #1a1b26;
  --surface: #1f2335;
  --surface-2: #24283b;
  --surface-3: #292e42;
  --border: #292e42;
  --border-strong: #3b4261;
  --text: #c0caf5;
  --text-2: #a9b1d6;
  --text-3: #565f89;
  --brand: #7aa2f7;
  --brand-2: #bb9af7;
  --brand-weak: #24283b;
  --drawer: #16161e;
  --primary-foreground: #1a1b26;
  --input: #292e42;
}

html[data-theme="catppuccin-mocha"] {
  --bg: #1e1e2e;
  --surface: #282839;
  --surface-2: #313244;
  --surface-3: #45475a;
  --border: #313244;
  --border-strong: #45475a;
  --text: #cdd6f4;
  --text-2: #bac2de;
  --text-3: #6c7086;
  --brand: #cba6f7;
  --brand-2: #b4befe;
  --brand-weak: #2b2640;
  --drawer: #181825;
  --primary-foreground: #1e1e2e;
  --input: #313244;
}

html[data-theme="rose-pine"] {
  --bg: #191724;
  --surface: #1f1d2e;
  --surface-2: #26233a;
  --surface-3: #2f2b43;
  --border: #26233a;
  --border-strong: #403d52;
  --text: #e0def4;
  --text-2: #908caa;
  --text-3: #6e6a86;
  --brand: #c4a7e7;
  --brand-2: #ebbcba;
  --brand-weak: #2a2440;
  --drawer: #16141f;
  --primary-foreground: #191724;
  --input: #26233a;
}
```

- [ ] **Step 2: Verify CSS compiles via build**

Run: `npm run build`
Expected: build succeeds (Tailwind compiles globals.css with no errors). (Provider not wired yet, so the themes aren't reachable in the UI — that's fine; this step only proves the CSS is valid.)

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat(themes): palette blocks for dracula + 6 themes (bead-me-up-scotty-81k)"
```

---

### Task 3: Project-aware provider + consumer compile fixes

Rewrite the provider to be multi-theme + per-project, and update every consumer so the app still typechecks. The Settings grid (Task 4) and palette submenu (Task 5) come after; here Settings only gets the minimal change needed to compile.

**Files:**
- Modify (rewrite): `components/theme-provider.tsx`
- Modify: `components/sidebar.tsx:177`
- Modify: `components/launcher.tsx:42` (+ destructure)
- Modify: `components/settings-view.tsx:44,148,154` (minimal compile fix)
- Modify: `components/ui/sonner.tsx`
- Verify only (no edit): `components/app-shell.tsx`

**Interfaces:**
- Consumes: `getTheme`, `DEFAULT_THEME_ID`, `ThemeDef`, `ThemeMode` from `@/lib/themes` (Task 1).
- Produces: `useTheme(): { theme: ThemeDef; mode: ThemeMode; setTheme: (id: string) => void; toggle: () => void }`.

- [ ] **Step 1: Rewrite the provider**

Replace the entire contents of `components/theme-provider.tsx` with:

```tsx
"use client";
import * as React from "react";
import { usePathname } from "next/navigation";
import {
  getTheme,
  DEFAULT_THEME_ID,
  type ThemeDef,
  type ThemeMode,
} from "@/lib/themes";

/**
 * Per-project theme (bead-me-up-scotty-81k). The chosen theme is stored per-device
 * in localStorage, keyed by the active project so different projects look different
 * and don't get confused. Project identity comes from the /p/<projectId> URL; the
 * launcher (no project) uses a shared key.
 */
const LEGACY_KEY = "bmus-theme";

function storageKey(projectId: string | null): string {
  return projectId ? `bmus.theme.${projectId}` : "bmus.theme";
}

function projectIdFromPath(pathname: string | null): string | null {
  const m = pathname?.match(/^\/p\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Reads the saved theme id for a project, falling back to the legacy key, then default. */
function readThemeId(projectId: string | null): string {
  if (typeof window === "undefined") return DEFAULT_THEME_ID;
  const stored = localStorage.getItem(storageKey(projectId)) ?? localStorage.getItem(LEGACY_KEY);
  return getTheme(stored).id;
}

interface ThemeContextValue {
  theme: ThemeDef;
  mode: ThemeMode;
  setTheme: (id: string) => void;
  toggle: () => void;
}

const ThemeContext = React.createContext<ThemeContextValue>({
  theme: getTheme(DEFAULT_THEME_ID),
  mode: "light",
  setTheme: () => {},
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const projectId = projectIdFromPath(pathname);
  const [themeId, setThemeId] = React.useState<string>(() => readThemeId(projectId));

  // When the active project changes, load that project's saved theme. Setting
  // state during render (React's recommended pattern for deriving from a changed
  // value) avoids the extra-commit flash a useEffect would cause.
  const lastProject = React.useRef(projectId);
  if (lastProject.current !== projectId) {
    lastProject.current = projectId;
    const next = readThemeId(projectId);
    if (next !== themeId) setThemeId(next);
  }

  // Keep a ref of the current id so toggle() can read it without a stale closure.
  const themeIdRef = React.useRef(themeId);
  themeIdRef.current = themeId;

  // Apply to <html>: data-theme drives the palette; .dark drives Tailwind/shadcn.
  React.useEffect(() => {
    const theme = getTheme(themeId);
    document.documentElement.dataset.theme = theme.id;
    document.documentElement.classList.toggle("dark", theme.mode === "dark");
  }, [themeId]);

  const persist = React.useCallback(
    (id: string) => {
      if (typeof window !== "undefined") localStorage.setItem(storageKey(projectId), id);
    },
    [projectId],
  );

  const setTheme = React.useCallback(
    (id: string) => {
      const next = getTheme(id).id;
      setThemeId(next);
      persist(next);
    },
    [persist],
  );

  // Quick Light<->Dark switch (sidebar button, T shortcut, launcher).
  const toggle = React.useCallback(() => {
    const next = getTheme(themeIdRef.current).mode === "dark" ? "light" : "dark";
    setThemeId(next);
    persist(next);
  }, [persist]);

  const theme = getTheme(themeId);
  const value = React.useMemo<ThemeContextValue>(
    () => ({ theme, mode: theme.mode, setTheme, toggle }),
    [theme, setTheme, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => React.useContext(ThemeContext);
```

- [ ] **Step 2: Fix `components/sidebar.tsx`**

At line 64, change the destructure:

```tsx
  const { theme, toggle } = useTheme();
```
to:
```tsx
  const { mode, toggle } = useTheme();
```

At line 177, change:
```tsx
            <Icon name={theme === "dark" ? "sun" : "moon"} size={15} />
```
to:
```tsx
            <Icon name={mode === "dark" ? "sun" : "moon"} size={15} />
```

(If `theme` is referenced anywhere else in sidebar.tsx, replace those reads too — grep `theme` in the file. As of this plan, line 177 is the only use.)

- [ ] **Step 3: Fix `components/launcher.tsx`**

At line 16, change the destructure:
```tsx
  const { theme, toggle } = useTheme();
```
to:
```tsx
  const { mode, toggle } = useTheme();
```

At line 42, change:
```tsx
          <Icon name={theme === "dark" ? "sun" : "moon"} size={15} />
```
to:
```tsx
          <Icon name={mode === "dark" ? "sun" : "moon"} size={15} />
```

- [ ] **Step 4: Minimal fix in `components/settings-view.tsx`**

At line 44, change:
```tsx
  const { theme, toggle } = useTheme();
```
to:
```tsx
  const { theme, mode, toggle } = useTheme();
```

At line 148, change:
```tsx
            <div className="text-[11.5px] text-[var(--text-3)]">Currently {theme}</div>
```
to:
```tsx
            <div className="text-[11.5px] text-[var(--text-3)]">Currently {theme.name}</div>
```

At line 154, change:
```tsx
            <Icon name={theme === "dark" ? "sun" : "moon"} size={14} />
```
to:
```tsx
            <Icon name={mode === "dark" ? "sun" : "moon"} size={14} />
```

(This keeps the existing single toggle row working; Task 4 replaces it with the grid.)

- [ ] **Step 5: Switch Sonner to our provider — `components/ui/sonner.tsx`**

Change the import line:
```tsx
import { useTheme } from "next-themes"
```
to:
```tsx
import { useTheme } from "@/components/theme-provider"
```

Change the hook usage:
```tsx
  const { theme = "system" } = useTheme()
```
to:
```tsx
  const { mode } = useTheme()
```

Change the `<Sonner>` prop:
```tsx
      theme={theme as ToasterProps["theme"]}
```
to:
```tsx
      theme={mode}
```

- [ ] **Step 6: Verify app-shell still compiles (no edit expected)**

`components/app-shell.tsx` uses only `const { toggle: toggleTheme } = useTheme();` — still valid under the new contract. Confirm by grepping: `grep -n "useTheme" components/app-shell.tsx` shows only the toggle destructure.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no output. (If `settings-view.tsx` or any consumer still references `theme` as a string, fix that read to use `theme.name`/`mode`.)

- [ ] **Step 8: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add components/theme-provider.tsx components/sidebar.tsx components/launcher.tsx components/settings-view.tsx components/ui/sonner.tsx
git commit -m "feat(themes): project-aware multi-theme provider + consumer updates (bead-me-up-scotty-81k)"
```

---

### Task 4: Settings theme picker grid (`components/settings-view.tsx`)

Replace the single Light/Dark toggle row with a per-project theme grid.

**Files:**
- Modify: `components/settings-view.tsx`

**Interfaces:**
- Consumes: `useTheme()` (`theme`, `setTheme`) from Task 3; `THEMES` from `@/lib/themes`.
- Produces: nothing for other tasks.

- [ ] **Step 1: Import the registry**

Near the top of `components/settings-view.tsx`, add to the imports:
```tsx
import { THEMES } from "@/lib/themes";
```

- [ ] **Step 2: Replace the Theme row with the grid**

In the `SettingsForm` component, find the **"Theme"** sub-block inside the `Card title="Freshness & theme"` — currently:

```tsx
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[13px]">Theme</div>
            <div className="text-[11.5px] text-[var(--text-3)]">Currently {theme.name}</div>
          </div>
          <button
            onClick={toggle}
            className="flex h-[34px] items-center gap-[7px] rounded-[9px] border border-border bg-[var(--surface-2)] px-[13px] text-[12.5px] hover:bg-[var(--surface-3)]"
          >
            <Icon name={mode === "dark" ? "sun" : "moon"} size={14} />
            <span>Switch theme</span>
          </button>
        </div>
```

Replace that block with:

```tsx
        <div className="flex flex-col gap-[10px]">
          <div>
            <div className="text-[13px]">Theme</div>
            <div className="text-[11.5px] text-[var(--text-3)]">
              Saved per project — each project remembers its own theme on this device.
              Currently <span className="font-[550] text-[var(--text-2)]">{theme.name}</span>.
            </div>
          </div>
          <div className="grid grid-cols-2 gap-[8px] sm:grid-cols-3">
            {THEMES.map((t) => {
              const active = t.id === theme.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className="flex items-center gap-[9px] rounded-[10px] border p-[9px] text-left transition-colors hover:bg-[var(--surface-3)]"
                  style={{
                    background: "var(--surface-2)",
                    borderColor: active ? "var(--brand)" : "var(--border)",
                    boxShadow: active ? "0 0 0 1px var(--brand)" : "none",
                  }}
                >
                  <span className="flex h-[24px] w-[24px] flex-shrink-0 overflow-hidden rounded-[7px] border border-border">
                    {t.swatch.map((c, i) => (
                      <span key={i} style={{ background: c, width: "33.34%" }} />
                    ))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-[550] text-[var(--text)]">
                      {t.name}
                    </span>
                    <span className="block text-[10.5px] capitalize text-[var(--text-3)]">
                      {t.mode}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
```

Note: `toggle` may now be unused in `SettingsForm`. If `npx tsc`/lint flags `toggle` (or `mode`) as unused, remove it from the destructure at line 44 so it reads `const { theme, setTheme } = useTheme();`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no output.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no errors (resolve any unused-var warning per the note above).

- [ ] **Step 5: Commit**

```bash
git add components/settings-view.tsx
git commit -m "feat(themes): per-project theme picker grid in Settings (bead-me-up-scotty-81k)"
```

---

### Task 5: Command-palette theme submenu (`components/command-palette.tsx`)

Switch the palette off the unmounted `next-themes` and onto our provider, and add a "Change theme…" submenu listing all 9 themes.

**Files:**
- Modify: `components/command-palette.tsx`

**Interfaces:**
- Consumes: `useTheme()` (`mode`, `setTheme`, `toggle`) from Task 3; `THEMES` from `@/lib/themes`.

- [ ] **Step 1: Swap the import**

Change:
```tsx
import { useTheme } from "next-themes";
```
to:
```tsx
import { useTheme } from "@/components/theme-provider";
import { THEMES } from "@/lib/themes";
```

- [ ] **Step 2: Update the hook usage**

Change:
```tsx
  const { resolvedTheme, setTheme } = useTheme();
```
to:
```tsx
  const { mode, setTheme, toggle } = useTheme();
```

- [ ] **Step 3: Add `"theme"` to the Page union**

Change:
```tsx
type Page = "root" | "bead" | "status" | "priority" | "projects";
```
to:
```tsx
type Page = "root" | "bead" | "status" | "priority" | "projects" | "theme";
```

- [ ] **Step 4: Add the placeholder for the theme page**

In the `Command.Input` `placeholder` prop, add a branch for `theme`. Change:
```tsx
                    : page === "projects"
                      ? "Switch project…"
                      : "Search beads or run a command…"
```
to:
```tsx
                    : page === "projects"
                      ? "Switch project…"
                      : page === "theme"
                        ? "Pick a theme…"
                        : "Search beads or run a command…"
```

- [ ] **Step 5: Replace the Toggle-theme command + add the submenu entry**

In the `Command.Group heading="Actions"`, replace the existing toggle item:
```tsx
              <Item
                icon={resolvedTheme === "dark" ? "sun" : "moon"}
                value="toggle theme dark light"
                onSelect={() => run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))}
              >
                Toggle theme · {resolvedTheme === "dark" ? "light" : "dark"}
              </Item>
```
with:
```tsx
              <Item
                icon={mode === "dark" ? "sun" : "moon"}
                value="toggle theme dark light"
                onSelect={() => run(() => toggle())}
              >
                Toggle theme · {mode === "dark" ? "light" : "dark"}
              </Item>
              <Item
                icon="settings"
                value="change theme palette dracula nord"
                onSelect={() => { setSearch(""); setPage("theme"); }}
              >
                Change theme…
              </Item>
```

- [ ] **Step 6: Render the theme page**

Immediately after the `{page === "projects" && ( … )}` block (just before the closing `</Command.List>`), add:

```tsx
        {page === "theme" && (
          <Command.Group heading="Theme">
            {THEMES.map((t) => (
              <Item
                key={t.id}
                dotColor={t.swatch[2]}
                value={`theme ${t.name} ${t.id}`}
                onSelect={() => run(() => setTheme(t.id))}
              >
                {t.name}
              </Item>
            ))}
          </Command.Group>
        )}
```

(The `goBack` helper already routes any non-`status`/`priority` page back to `"root"`, so the back button and empty-query Backspace work for `"theme"` with no change.)

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no output. (No remaining reference to `resolvedTheme`.)

- [ ] **Step 8: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add components/command-palette.tsx
git commit -m "feat(themes): command-palette theme submenu, drop next-themes wiring (bead-me-up-scotty-81k)"
```

---

### Task 6: Build, runtime smoke test, close bead

**Files:** none (verification + bead close).

- [ ] **Step 1: Production build**

Run: `npm run build`
Expected: build succeeds with no type or lint errors.

- [ ] **Step 2: Runtime smoke test**

Start the app (`npm run dev`) and, via the `run` skill or a browser at the dev URL, verify:
1. Open a real project (or `/p/demo`). Open **Settings → Theme**, click **Dracula** → the whole UI re-skins immediately.
2. Reload the page → still Dracula (persisted under `bmus.theme.<projectId>`).
3. Switch to a different project (project menu or `/p/<other>`), set it to **Nord**. Switch back to the first project → it's still **Dracula**; the second stays **Nord** (per-project isolation — the core requirement).
4. Press `T` (not focused in a field) → flips Light↔Dark for the current project.
5. `⌘K → Change theme… → Tokyo Night` applies it; toasts (trigger one by saving Settings) match the theme.

Capture a screenshot of two projects on different themes as evidence.

- [ ] **Step 3: Close the bead**

```bash
bd close bead-me-up-scotty-81k
```

- [ ] **Step 4: Final commit (if the smoke test required any fix)**

```bash
git add -A
git commit -m "chore(themes): smoke-test fixups (bead-me-up-scotty-81k)"
```

---

## Self-Review

**Spec coverage:**
- "More themes incl. Dracula + half a dozen" → Task 1 (registry, 9 total) + Task 2 (palettes). ✓
- "Theme attached to the project / different per project" → Task 3 (per-project `localStorage` key, re-skin on project change). ✓
- "In Settings" → Task 4 (Settings grid). ✓
- Quick Light↔Dark toggle preserved → Task 3 (`toggle()`, sidebar/launcher/app-shell `T`). ✓
- Fold stray `next-themes` usage → Task 3 (sonner) + Task 5 (palette). ✓
- Verification (typecheck/lint/build + runtime) → per-task gates + Task 6. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type consistency:** `getTheme`/`isThemeId`/`THEMES`/`DEFAULT_THEME_ID`/`ThemeDef`/`ThemeMode` defined in Task 1 and consumed with identical names/signatures in Tasks 3–5. Provider contract `{ theme, mode, setTheme, toggle }` used consistently across sidebar, launcher, settings, palette, sonner. ✓
