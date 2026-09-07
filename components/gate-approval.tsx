"use client";
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApp } from "@/components/app-context";
import { Icon } from "@/components/icons";
import { toastError } from "@/components/error-toast";
import { api } from "@/lib/api-client";
import { beadsKey, activityKey } from "@/hooks/use-beads";

/** Shared by both human-gate surfaces; approval records an explicit decision. */
export function GateApproval({ id }: { id: string }) {
  const { projectId, meta, readOnly } = useApp();
  const qc = useQueryClient();
  const [showNote, setShowNote] = React.useState(false);
  const [note, setNote] = React.useState("");
  const submitting = React.useRef(false);
  const noteId = React.useId();
  const approval = useMutation({
    mutationFn: (reason: string) => api.setStatus(projectId, id, "closed", reason),
    // Keep the gate mounted until success so a failed request preserves its note.
    onSuccess: async () => {
      setNote("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: beadsKey(projectId) }),
        qc.invalidateQueries({ queryKey: activityKey(projectId) }),
      ]);
    },
    onError: toastError,
    onSettled: () => { submitting.current = false; },
  });
  const approve = () => {
    if (readOnly || submitting.current) return;
    submitting.current = true;
    const actor = meta?.humanActor?.trim() || "human reviewer";
    const decision = `Approved by ${actor} via Scotty at ${new Date().toISOString()}`;
    approval.mutate(note.trim() ? `${decision}\n\n${note.trim()}` : decision);
  };
  return (
    <div className="flex min-w-0 flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={readOnly || approval.isPending}
          aria-expanded={showNote}
          aria-controls={noteId}
          onClick={() => setShowNote(!showNote)}
          className="text-[11.5px] text-[var(--text-3)] hover:text-[var(--text)] disabled:opacity-50"
        >
          {showNote ? "Hide approval note" : "Add approval note"}
        </button>
        <button
          type="button"
          disabled={readOnly || approval.isPending}
          onClick={approve}
          className="flex h-8 flex-shrink-0 items-center gap-[6px] rounded-lg px-3 text-[12.5px] font-[550] text-white disabled:opacity-50"
          style={{ background: "var(--brand)" }}
        >
          <Icon name="check" size={14} /> Approve
        </button>
      </div>
      {showNote && (
        <textarea
          id={noteId}
          aria-label="Approval note"
          placeholder="Optional approval note"
          value={note}
          onChange={event => setNote(event.target.value)}
          disabled={readOnly || approval.isPending}
          maxLength={8000}
          rows={2}
          className="w-full min-w-[180px] rounded-lg border border-border bg-[var(--surface)] p-2 text-[12px] text-[var(--text)] disabled:opacity-50"
        />
      )}
    </div>
  );
}
