"use client";
import * as React from "react";
import { useApp } from "@/components/app-context";
import { useActivity } from "@/hooks/use-beads";
import { OriginBadge } from "@/components/board/bead-card";
import { Icon } from "@/components/icons";
import { avatarColor, initials, relTime } from "@/lib/beads-view";

/**
 * Mission Control — live activity feed. A newest-first stream of what humans and
 * agents did (created / claimed / closed / re-prioritized / commented), each
 * stamped 👤/🤖 and linking to the bead. Data comes from /activity, refreshed
 * live by the SSE change stream (see useBeadsStream).
 */
export function ActivityView() {
  const { projectId, openDetail } = useApp();
  const { data, isLoading } = useActivity(projectId);
  const items = data?.items ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-6 py-4">
        <Icon name="comment" size={18} className="text-[var(--text-2)]" />
        <h1 className="text-[15px] font-[650]">Activity</h1>
        <span className="text-[12px] text-[var(--text-3)]">
          · what humans and agents did, newest first
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {isLoading && items.length === 0 ? (
          <div className="p-8 text-center text-[13px] text-[var(--text-3)]">Loading activity…</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-[13px] text-[var(--text-3)]">No activity yet.</div>
        ) : (
          <ol className="mx-auto flex max-w-3xl flex-col">
            {items.map((it) => (
              <li key={it.id}>
                <button
                  onClick={() => openDetail(it.issueId)}
                  className="flex w-full items-start gap-3 rounded-[10px] px-3 py-[10px] text-left hover:bg-[var(--surface-2)]"
                >
                  <span
                    className="mt-[1px] flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                    style={{ background: avatarColor(it.actor) }}
                  >
                    {initials(it.actor)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-[6px] gap-y-1 text-[13px]">
                      <span className="font-semibold">{it.actor}</span>
                      <OriginBadge origin={it.origin} title={it.origin === "human" ? "Human" : "Agent"} />
                      <span className="text-[var(--text-2)]">{it.action}</span>
                      <span className="font-mono text-[11px] text-[var(--text-3)]">{it.issueId}</span>
                    </div>
                    <div className="truncate text-[12.5px] text-[var(--text-2)]">{it.title}</div>
                    {it.detail && (
                      <div className="truncate text-[12px] text-[var(--text-3)]">{it.detail}</div>
                    )}
                  </div>
                  <span className="flex-shrink-0 whitespace-nowrap text-[11px] text-[var(--text-3)]">
                    {relTime(it.at)}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
