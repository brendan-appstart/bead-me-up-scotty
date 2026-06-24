"use client";
import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Icon } from "@/components/icons";
import { useApp } from "@/components/app-context";
import { api, type AssistResult } from "@/lib/api-client";
import { useUpdateBead } from "@/hooks/use-beads";
import { DescriptionContent } from "@/components/description-content";
import type { Bead } from "@/lib/schema";

/**
 * In-UI version of the /refine-beads workflow: ask the local Claude CLI to
 * suggest a refined description (with acceptance criteria + a checklist),
 * labels, and likely duplicates. Read-only until the user confirms — only the
 * description is written, via the normal update path.
 */
export function AiAssistPanel({ bead }: { bead: Bead }) {
  const { projectId, openDetail } = useApp();
  const update = useUpdateBead();
  const [result, setResult] = React.useState<AssistResult | null>(null);

  const assist = useMutation({
    mutationFn: () => api.assist(projectId, bead.id),
    onSuccess: (r) => setResult(r),
    onError: (e) => toast.error((e as Error).message),
  });

  const applyDescription = () => {
    if (!result) return;
    update.mutate(
      { id: bead.id, patch: { description: result.description } },
      {
        onSuccess: () => {
          toast.success("Applied AI description");
          setResult(null);
        },
      },
    );
  };

  return (
    <div className="mt-2">
      <button
        onClick={() => assist.mutate()}
        disabled={assist.isPending}
        className="inline-flex h-8 items-center gap-[6px] rounded-lg border border-border bg-[var(--surface-2)] px-3 text-[12.5px] font-[550] text-[var(--text-2)] hover:bg-[var(--surface-3)] disabled:opacity-50"
      >
        <Icon name="feature" size={14} style={{ color: "var(--brand)" }} />
        {assist.isPending ? "Refining with AI…" : "Refine with AI"}
      </button>

      {result && (
        <div className="mt-2 rounded-[10px] border bg-[var(--surface-2)] p-3" style={{ borderColor: "var(--brand)" }}>
          <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-[var(--brand)]">
            <Icon name="feature" size={14} /> AI suggestion
            <span className="flex-1" />
            <button
              onClick={() => setResult(null)}
              className="text-[var(--text-3)] hover:text-[var(--text)]"
              title="Dismiss"
            >
              <Icon name="x" size={13} />
            </button>
          </div>

          <div className="mb-1 text-[11px] uppercase tracking-[.03em] text-[var(--text-3)]">
            Refined description
          </div>
          <DescriptionContent
            text={result.description}
            projectId={projectId}
            className="rounded-[8px] border border-border bg-[var(--surface)] p-[10px_11px] text-[13px] text-[var(--text-2)]"
          />

          {result.labels.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-[6px] text-[11px]">
              <span className="text-[var(--text-3)]">Suggested labels:</span>
              {result.labels.map((l) => (
                <span key={l} className="rounded-md border border-border bg-[var(--surface)] px-[7px] py-px font-mono">
                  {l}
                </span>
              ))}
            </div>
          )}

          {result.duplicates.length > 0 && (
            <div className="mt-2 text-[11px]">
              <div className="text-[var(--text-3)]">Possible duplicates:</div>
              {result.duplicates.map((d) => (
                <button
                  key={d.id}
                  onClick={() => openDetail(d.id)}
                  className="mt-1 block text-left hover:underline"
                >
                  <span className="font-mono text-[var(--text-3)]">{d.id}</span>{" "}
                  <span className="text-[var(--text-2)]">{d.title}</span>
                  {d.reason ? <span className="text-[var(--text-3)]"> — {d.reason}</span> : null}
                </button>
              ))}
            </div>
          )}

          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => setResult(null)}
              className="h-8 rounded-lg border border-border bg-[var(--surface)] px-3 text-[12.5px] font-[550] hover:bg-[var(--surface-2)]"
            >
              Reject
            </button>
            <button
              onClick={applyDescription}
              disabled={update.isPending}
              className="flex h-8 items-center gap-[6px] rounded-lg px-3 text-[12.5px] font-[550] text-white disabled:opacity-50"
              style={{ background: "var(--brand)" }}
            >
              <Icon name="check" size={14} /> Apply description
            </button>
          </div>
          <div className="mt-1 text-[10.5px] text-[var(--text-3)]">
            Labels and duplicates are advisory — only the description is written, on confirm.
          </div>
        </div>
      )}
    </div>
  );
}
