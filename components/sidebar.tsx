"use client";
import * as React from "react";
import { Icon } from "@/components/icons";
import { useTheme } from "@/components/theme-provider";
import { useApp, type View } from "@/components/app-context";
import { initials, avatarColor } from "@/lib/beads-view";
import { cn } from "@/lib/utils";

const NAV: { key: View; label: string; icon: string }[] = [
  { key: "board", label: "Board", icon: "board" },
  { key: "epics", label: "Epics", icon: "target" },
  { key: "graph", label: "Graph", icon: "graph" },
  { key: "settings", label: "Settings", icon: "settings" },
];

export function Sidebar({
  view,
  onView,
  kind,
}: {
  view: View;
  onView: (v: View) => void;
  kind?: "bd" | "demo";
}) {
  const { theme, toggle } = useTheme();
  const { meta, beads } = useApp();
  const actor = meta?.humanActor ?? "you";
  const epicCount = beads.filter((b) => b.issue_type === "epic").length;

  return (
    <aside className="flex w-[228px] flex-shrink-0 flex-col border-r border-border bg-[var(--surface)] p-[18px_14px]">
      <div className="flex items-center gap-[10px] px-2 pb-[18px] pt-1">
        <div
          className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-[9px] text-white"
          style={{ background: "var(--brand)", boxShadow: "0 2px 8px -2px var(--brand)" }}
        >
          <Icon name="logo" size={17} />
        </div>
        <div className="leading-[1.1]">
          <div className="text-sm font-[650] tracking-[-.01em]">Bead Me Up</div>
          <div className="font-mono text-[11px] text-[var(--text-3)]">scotty · bd</div>
        </div>
      </div>

      <nav className="flex flex-col gap-[2px]">
        {NAV.map((n) => {
          const active = view === n.key;
          return (
            <button
              key={n.key}
              onClick={() => onView(n.key)}
              className={cn(
                "flex w-full items-center gap-[10px] rounded-[9px] px-[10px] py-2 text-left text-[13.5px] transition-colors",
                active
                  ? "bg-[var(--brand-weak)] font-semibold text-[var(--brand)]"
                  : "font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
              )}
            >
              <Icon name={n.icon} size={17} className="flex-shrink-0" />
              <span className="flex-1">{n.label}</span>
              {n.key === "epics" && epicCount > 0 && (
                <span className="font-mono text-[11px] text-[var(--text-3)]">{epicCount}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-[10px]">
        <div className="flex flex-col gap-2 rounded-[11px] border border-border bg-[var(--surface-2)] p-3">
          <div className="text-[11px] font-[550] uppercase tracking-[.02em] text-[var(--text-3)]">
            Repo
          </div>
          <div className="flex items-center gap-[7px]">
            <span
              className="h-[7px] w-[7px] rounded-full"
              style={{
                background: kind === "demo" ? "#d97706" : "#22c55e",
                boxShadow: `0 0 0 3px ${kind === "demo" ? "#d9770622" : "#22c55e22"}`,
              }}
            />
            <span className="font-mono text-[12px] text-[var(--text-2)]">
              {kind === "demo" ? "demo · in-memory" : "~/.beads"}
            </span>
          </div>
          <div className="text-[11px] text-[var(--text-3)]">
            {kind === "demo" ? "seeded sample data" : "bd · embedded · Dolt"}
          </div>
        </div>

        <div className="flex items-center gap-2 px-1">
          <div
            className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold text-white"
            style={{ background: avatarColor(actor) }}
          >
            {initials(actor)}
          </div>
          <div className="flex-1 leading-[1.15]">
            <div className="text-[12.5px] font-[550]">{actor}</div>
            <div className="text-[11px] text-[var(--text-3)]">human actor</div>
          </div>
          <button
            onClick={toggle}
            title="Toggle theme"
            className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-border bg-[var(--surface)] text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          >
            <Icon name={theme === "dark" ? "sun" : "moon"} size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
}
