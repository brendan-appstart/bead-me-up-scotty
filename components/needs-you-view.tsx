"use client";
import * as React from "react";
import { useApp } from "@/components/app-context";
import { useRespondHuman, useDismissHuman, useSetStatus } from "@/hooks/use-beads";
import { Icon, typeIconName } from "@/components/icons";
import { OriginBadge } from "@/components/board/bead-card";
import { beadOrigin } from "@/lib/attribution";
import {
  needsHuman,
  readyHumanGate,
  gateBlocks,
  typeColor,
  relTime,
  fmtDateTime,
} from "@/lib/beads-view";
import type { Bead } from "@/lib/schema";

/**
 * Mission Control — "Needs You" decision inbox. Surfaces two kinds of items
 * waiting on a person:
 *   1. Beads an agent flagged for a decision (the `human` label, via `bd human`)
 *      — answered inline (comment + clear the flag) or dismissed.
 *   2. Human-approval gates (`bd gate create --type human`) whose blockers are
 *      resolved — approved (closed, which unblocks dependents) from here so they
 *      don't sit invisibly waiting on the board (bead 8qc / gh-6).
 */
export function NeedsYouView() {
  const { beads, index } = useApp();
  const inbox = React.useMemo(() => beads.filter(needsHuman), [beads]);
  const gates = React.useMemo(
    () => beads.filter((b) => readyHumanGate(b, index)),
    [beads, index],
  );
  const total = inbox.length + gates.length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-6 py-4">
        <Icon name="user" size={18} className="text-[var(--text-2)]" />
        <h1 className="text-[15px] font-[650]">Needs You</h1>
        <span className="text-[12px] text-[var(--text-3)]">
          · {total === 0 ? "nothing waiting" : `${total} waiting on you`}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {total === 0 ? (
          <div className="p-10 text-center text-[13px] text-[var(--text-3)]">
            🎉 Nothing needs you right now. Agents flag beads here with{" "}
            <span className="font-mono">bd human</span>, and human-approval gates
            (<span className="font-mono">bd gate create --type human</span>) show
            up once their blockers clear.
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            {gates.map((g) => (
              <GateCard key={g.id} gate={g} />
            ))}
            {inbox.map((b) => (
              <NeedsYouCard key={b.id} bead={b} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * A ready human-approval gate. "Approve" closes the gate (via `bd close`), which
 * resolves it and unblocks every bead depending on it.
 */
function GateCard({ gate }: { gate: Bead }) {
  const { beads, openDetail } = useApp();
  const setStatus = useSetStatus();
  const blocks = React.useMemo(() => gateBlocks(gate.id, beads), [gate.id, beads]);
  const busy = setStatus.isPending;

  return (
    <div className="rounded-[12px] border border-border bg-[var(--surface)] p-4">
      <div className="mb-1 flex items-center gap-2">
        <Icon name="gate" size={15} style={{ color: "var(--brand)" }} />
        <button
          onClick={() => openDetail(gate.id)}
          className="font-mono text-[11px] text-[var(--text-3)] hover:text-[var(--text)]"
        >
          {gate.id}
        </button>
        <span className="rounded-full border border-border bg-[var(--surface-2)] px-2 py-[1px] text-[10px] font-[650] uppercase tracking-wide text-[var(--text-2)]">
          Approval gate
        </span>
        <span className="flex-1" />
        <span title={fmtDateTime(gate.updated_at)} className="text-[11px] text-[var(--text-3)]">
          {relTime(gate.updated_at)}
        </span>
      </div>
      <button
        onClick={() => openDetail(gate.id)}
        className="mb-2 block text-left text-[14px] font-[600] leading-snug text-[var(--text)] hover:underline"
      >
        {gate.title}
      </button>
      {gate.description && (
        <p className="mb-3 line-clamp-3 whitespace-pre-wrap text-[12.5px] leading-[1.5] text-[var(--text-2)]">
          {gate.description}
        </p>
      )}
      {blocks.length > 0 && (
        <p className="mb-3 text-[12px] leading-[1.5] text-[var(--text-2)]">
          Approving unblocks{" "}
          {blocks.map((b, i) => (
            <React.Fragment key={b.id}>
              {i > 0 && ", "}
              <button
                onClick={() => openDetail(b.id)}
                className="font-mono text-[var(--text)] hover:underline"
              >
                {b.id}
              </button>
            </React.Fragment>
          ))}
          .
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <button
          disabled={busy}
          onClick={() => setStatus.mutate({ id: gate.id, status: "closed" })}
          className="flex h-8 items-center gap-[6px] rounded-lg px-3 text-[12.5px] font-[550] text-white disabled:opacity-50"
          style={{ background: "var(--brand)" }}
        >
          <Icon name="check" size={14} /> Approve
        </button>
      </div>
    </div>
  );
}

function NeedsYouCard({ bead }: { bead: Bead }) {
  const { humanAllowlist, openDetail } = useApp();
  const respond = useRespondHuman();
  const dismiss = useDismissHuman();
  const [text, setText] = React.useState("");
  const o = beadOrigin(bead, humanAllowlist);
  const busy = respond.isPending || dismiss.isPending;

  return (
    <div className="rounded-[12px] border border-border bg-[var(--surface)] p-4">
      <div className="mb-1 flex items-center gap-2">
        <Icon name={typeIconName(bead.issue_type)} size={14} style={{ color: typeColor(bead.issue_type) }} />
        <button
          onClick={() => openDetail(bead.id)}
          className="font-mono text-[11px] text-[var(--text-3)] hover:text-[var(--text)]"
        >
          {bead.id}
        </button>
        <OriginBadge origin={o} title={o === "human" ? "Human" : "Agent"} />
        <span className="flex-1" />
        <span title={fmtDateTime(bead.updated_at)} className="text-[11px] text-[var(--text-3)]">
          {relTime(bead.updated_at)}
        </span>
      </div>
      <button
        onClick={() => openDetail(bead.id)}
        className="mb-2 block text-left text-[14px] font-[600] leading-snug text-[var(--text)] hover:underline"
      >
        {bead.title}
      </button>
      {bead.description && (
        <p className="mb-3 line-clamp-3 whitespace-pre-wrap text-[12.5px] leading-[1.5] text-[var(--text-2)]">
          {bead.description}
        </p>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder="Answer the agent's question… (posts a comment; the bead stays open)"
        className="mb-2 w-full resize-y rounded-[9px] border border-border bg-[var(--surface-2)] p-[9px_11px] text-[13px] leading-[1.5] text-[var(--text)] outline-none focus:border-[var(--brand)]"
      />
      <div className="flex items-center justify-end gap-2">
        <button
          disabled={busy}
          onClick={() => dismiss.mutate({ id: bead.id })}
          className="h-8 rounded-lg border border-border bg-[var(--surface-2)] px-3 text-[12.5px] font-[550] text-[var(--text-2)] hover:bg-[var(--surface-3)] disabled:opacity-50"
        >
          Dismiss
        </button>
        <button
          disabled={busy || !text.trim()}
          onClick={() => respond.mutate({ id: bead.id, text: text.trim() })}
          className="flex h-8 items-center gap-[6px] rounded-lg px-3 text-[12.5px] font-[550] text-white disabled:opacity-50"
          style={{ background: "var(--brand)" }}
        >
          <Icon name="check" size={14} /> Respond
        </button>
      </div>
    </div>
  );
}
