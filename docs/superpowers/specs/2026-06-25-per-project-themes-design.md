# Per-project themes (`bead-me-up-scotty-81k`)

**Status:** approved · **Date:** 2026-06-25

## Problem

The app has a single global Light/Dark toggle stored in `localStorage["bmus-theme"]`.
When working across multiple beads projects in different browser tabs/windows, they
all look identical and are easy to confuse. The bead asks for two things:

1. **More themes** — Dracula plus several more, selectable in Settings.
2. **Per-project theming** — each project remembers its own theme, so different
   projects look visibly different and don't get mixed up.

## Decisions (locked with the user)

- **Storage:** per-device, keyed by project id in `localStorage` (not server
  `config.json`). Matches how theme/board/notification prefs already work in this
  codebase; the goal is visual distinction on the screen in front of you.
- **Quick toggle:** keep the existing Light↔Dark quick toggle (sidebar button,
  `T` shortcut, launcher). The full theme grid lives in Settings + command palette.
- **Theme set ("Dev classics", 9 total):** Light, Dark, Dracula, Nord,
  Solarized Dark, Gruvbox Dark, Tokyo Night, Catppuccin Mocha, Rosé Pine.
  All seven new themes are dark-mode; only **Light** is light-mode.

## Architecture

### 1. Theme registry — `lib/themes.ts` (new)

Single source of truth for theme metadata (the actual colors live in CSS):

```ts
export type ThemeMode = "light" | "dark";
export interface ThemeDef {
  id: string;        // "dracula"          — also the html[data-theme] value + storage value
  name: string;      // "Dracula"          — picker label
  mode: ThemeMode;   // drives the .dark class (Tailwind dark: + shadcn tokens)
  swatch: [string, string, string]; // 3 representative hexes for the picker preview
}
export const THEMES: ThemeDef[];
export const DEFAULT_THEME_ID = "light";
export function getTheme(id: string | null | undefined): ThemeDef; // validates → falls back to default
export function isThemeId(id: string): boolean;
```

`mode` is what decides whether `.dark` is applied; every non-Light theme is dark-mode,
so `.dark` (and thus all existing `dark:` Tailwind utilities + shadcn semantic tokens)
keeps working untouched. `swatch` powers the picker preview without parsing CSS.

### 2. Palettes — `app/globals.css`

The existing CSS already derives **every** shadcn semantic token from raw palette
vars (`--bg`, `--surface`, `--surface-2/3`, `--border`, `--border-strong`,
`--text`, `--text-2/3`, `--brand`, `--brand-2`, `--brand-weak`, `--shadow`,
`--shadow-lg`, `--drawer`) via `var(...)`. CSS custom-property substitution resolves
`var(--bg)` against the **computed value on the same element**, so overriding the raw
vars on `html` cascades into the semantic tokens automatically.

Each new theme is therefore one block:

```css
html[data-theme="dracula"] {
  --bg: #282a36; --surface: #2d2f3d; /* …all raw vars… */
  --brand: #bd93f9; /* … */
  --primary-foreground: #282a36;  /* literal (not derived) */
  --input: #44475a;               /* literal (not derived) */
}
```

`html[data-theme="…"]` (specificity 0,1,1) outranks `.dark` (0,1,0), so for a
dark-mode theme the `.dark` semantic base applies first and the theme's raw colors
win. **Light** uses `:root`; **Dark** uses the existing `.dark` palette — neither
needs a `data-theme` block (their id is still set on `data-theme` for the picker's
"active" highlight, but no CSS override is required).

Only two literals per theme aren't derived from raw vars and must be set explicitly:
`--primary-foreground` (button text on `--brand`) and `--input`. `--destructive`
stays the shared red unless a theme needs otherwise.

### 3. Project-aware provider — `components/theme-provider.tsx` (rewrite)

Preserves the `useTheme()` consumer contract (so sidebar/launcher/app-shell/settings
keep compiling), but becomes project-scoped:

- Derives `projectId` from `usePathname()`: `/p/<id>` → `<id>`; anything else
  (launcher `/`) → `null`.
- Storage key: `bmus.theme.<projectId>`, or `bmus.theme` when there's no project.
  On first read for a key with no stored value, fall back to the legacy
  `bmus-theme` value (migration), then to `DEFAULT_THEME_ID`. Unknown ids fall back
  to default via `getTheme`.
- Apply effect sets `document.documentElement.dataset.theme = id` and toggles
  `.dark` from `getTheme(id).mode`. Writes the id back to the active key.
- `useState` initializer computes the correct id at first render (pathname is
  available during render), so there's no extra flash beyond today's behavior.
- Re-reads + re-applies when `projectId` changes (navigating between projects
  re-skins the UI — the core requirement).

Exposed value:

```ts
{ theme: ThemeDef; mode: ThemeMode; setTheme: (id: string) => void; toggle: () => void; }
```

`toggle()` = quick Light↔Dark: if current `mode === "dark"` → set `"light"`, else
→ set `"dark"`. (From Dracula, toggling goes to Light; this is the documented
"quick switch" behavior — the picker is the real control.)

### 4. Settings picker — `components/settings-view.tsx`

Replace the single "Switch theme" row inside the **Freshness & theme** card with a
responsive grid of swatch cards: each shows the theme name and its 3 `swatch` chips,
with the active card ringed in `--brand`. Clicking calls `setTheme(id)`. Helper copy:
*"Saved per project — each project remembers its own theme on this device."*

### 5. Quick-toggle touch points

`components/sidebar.tsx` and `components/launcher.tsx` switch their sun/moon icon and
title off `theme.mode` (was `theme === "dark"`). `components/app-shell.tsx` `T`
shortcut keeps calling `toggle()`. No behavior change — just provider-backed.

### 6. Fold in stray `next-themes` wiring

`command-palette.tsx` and `ui/sonner.tsx` currently import `useTheme` from
**next-themes**, but no next-themes provider is mounted — dead wiring. Re-point both
at our provider:

- Palette: the "Toggle theme" command uses our `toggle()`, **plus** a new
  "Change theme…" submenu listing all 9 themes (parity with Settings), each calling
  `setTheme(id)`.
- Sonner: read `mode` from our provider so toast styling matches the active theme.

`next-themes` stays installed (harmless); no runtime dependency on it remains.

## Files touched

| File | Change |
|---|---|
| `lib/themes.ts` | **new** — registry + helpers |
| `app/globals.css` | +7 `html[data-theme]` palette blocks |
| `components/theme-provider.tsx` | rewrite: project-aware, multi-theme |
| `components/settings-view.tsx` | theme grid replaces toggle row |
| `components/sidebar.tsx` | icon/title off `theme.mode` |
| `components/launcher.tsx` | icon/title off `theme.mode` |
| `components/command-palette.tsx` | use our provider; add themes submenu |
| `components/ui/sonner.tsx` | use our provider `mode` |

## Verification

- `tsc` typecheck, `eslint`, and `next build` pass.
- Runtime smoke test (run skill / browser): in project A, pick Dracula in Settings →
  UI re-skins; reload → still Dracula. Switch to project B → its own theme (default
  or previously chosen), not Dracula. `T` shortcut flips Light↔Dark. Command palette
  "Change theme…" applies a theme. Toasts match the theme.

## Out of scope (YAGNI)

- Server/`config.json` persistence (per-device was chosen).
- User-defined custom themes.
- Per-theme light/dark pairs (each theme has one fixed mode).
- Pre-paint inline anti-FOUC script (keeps parity with current flash behavior).
