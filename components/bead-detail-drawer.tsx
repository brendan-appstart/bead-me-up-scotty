"use client";
import * as React from "react";
import { GateApproval } from "@/components/gate-approval";
import { AssigneeField } from "@/components/assignee-field";
import { DependencyEditor } from "@/components/dependency-editor";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Icon, typeIconName } from "@/components/icons";
import { OriginBadge, PriorityChip } from "@/components/board/bead-card";
import { CopyableId } from "@/components/copyable-id";
import { useApp, type DetailAction } from "@/components/app-context";
import { useImageDrop } from "@/hooks/use-image-drop";
import { useResizableWidth } from "@/hooks/use-resizable-width";
import { DescriptionContent } from "@/components/description-content";
import { MarkdownToolbar, applyTransform } from "@/components/markdown-toolbar";
import { bold, italic, link } from "@/lib/markdown-edit";
import { AiAssistPanel } from "@/components/ai-assist-panel";
import {
  useUpdateBead,
  useSetStatus,
  useAddComment,
  useRemoveDep,
  useArchiveBead,
  useDeleteBead,
  useCreateGate,
} from "@/hooks/use-beads";
import { beadOrigin, originOf, originTitle } from "@/lib/attribution";
import {
  catColor,
  statusLabel,
  typeColor,
  typeLabel,
  avatarColor,
  initials,
  parentOf,
  childrenOf,
  epicProgress,
  isHumanGate,
  relTime,
  fmtDate,
  fmtDateTime,
  checklistProgress,
  toggleTask,
  closeReasonOf,
} from "@/lib/beads-view";
import {
  BEAD_STATUSES,
  BLOCKING_DEP_TYPES,
  type Bead,
  type BlockingDepType,
  type Dependency,
} from "@/lib/schema";

const selectClass =
  "h-9 cursor-pointer rounded-[9px] border border-border bg-[var(--surface-2)] px-[9px] text-[13px] text-[var(--text)] outline-none";
const fieldLabel = "text-[11px] font-[550] uppercase tracking-[.03em] text-[var(--text-3)]";
const detailContentClass =
  "rounded-[10px] border border-border bg-[var(--surface-2)] p-[12px_13px] text-[13.5px] leading-[1.55] text-[var(--text-2)] [text-wrap:pretty]";
/**
 * `archived` is load-bearing state, not decoration: the board and list use it to
 * hide beads (board.tsx / list-view.tsx) and the archive button writes it. The
 * label editor keeps it out of the user's reach so a bead can't be silently
 * un-archived by deleting a chip that looks cosmetic.
 */
const ARCHIVED_LABEL = "archived";
/** Chip styling shared with the list rows (list-view.tsx) so labels read alike. */
const labelChipClass =
  "inline-flex items-center gap-[5px] rounded-md border border-border bg-[var(--surface-2)] px-[6px] py-[2px] font-mono text-[10.5px] text-[var(--text-3)]";

type DisplayedBlockingDepType = Exclude<BlockingDepType, "parent-child">;

type DependencyRow = {
  key: string;
  target: Bead | undefined;
  targetId: string;
  label: string;
  active: boolean;
  activeBlocking: boolean;
  removeIssueId: string;
  removeDependsOnId: string;
};

function isDisplayedBlockingDepType(type: string): type is DisplayedBlockingDepType {
  return (
    type !== "parent-child" && (BLOCKING_DEP_TYPES as readonly string[]).includes(type)
  );
}

function dependencyIsResolved(current: Bead, related: Bead | undefined): boolean {
  return current.status === "closed" || related?.status === "closed";
}

/** Describe dependency edges from the current bead's point of view. */
function dependencyTypeLabel(type: Dependency["type"], resolved: boolean): string {
  if (type === "blocks") return resolved ? "was blocked by" : "blocked by";
  if (type === "conditional-blocks") {
    return resolved ? "was conditionally blocked by" : "conditionally blocked by";
  }
  if (type === "waits-for") return resolved ? "previously waited for" : "waits for";
  return type;
}

/** Describe the reverse side of a blocking edge from the current bead's point of view. */
function dependentTypeLabel(type: DisplayedBlockingDepType, resolved: boolean): string {
  if (type === "conditional-blocks") {
    return resolved ? "previously conditionally blocked" : "conditionally blocks";
  }
  if (type === "waits-for") return resolved ? "was waited for by" : "waited for by";
  return resolved ? "previously blocked" : "blocks";
}

export function BeadDetailDrawer({
  openId,
  canGoBack,
  backTo,
  onBack,
  onClose,
  initialAction = "view",
  actionNonce = 0,
}: {
  openId: string | null;
  /** True when a trail exists behind the current bead (GH #15). */
  canGoBack?: boolean;
  /** Id the back control returns to — used to NAME the destination. */
  backTo?: string | null;
  onBack?: () => void;
  onClose: () => void;
  initialAction?: DetailAction;
  actionNonce?: number;
}) {
  const { index, readOnly } = useApp();
  const bead = openId ? index.get(openId) : undefined;
  // ~50% wider than the old 480px default; drag the left edge to resize (persisted).
  const { width, startResize } = useResizableWidth({
    storageKey: "bmus.width.drawer",
    defaultWidth: 720,
    min: 480,
    max: 1200,
    deltaFactor: -1,
  });
  return (
    <Sheet open={!!openId && !!bead} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        showCloseButton={false}
        style={{ width, maxWidth: "96vw" }}
        className="flex gap-0 overflow-hidden border-l border-border bg-[var(--drawer)] p-0"
      >
        {/* Left-edge resize handle (drawer is anchored right, so it grows leftward). */}
        <div
          onPointerDown={startResize}
          title="Drag to resize"
          className="absolute left-0 top-0 z-20 h-full w-1.5 cursor-ew-resize hover:bg-[var(--brand)]/40"
        />
        <div className="bd-scroll min-w-0 flex-1 overflow-y-auto">
          {bead ? (
            <DrawerBody
              key={`${bead.id}-${actionNonce}`}
              bead={bead}
              initialAction={readOnly ? "view" : initialAction}
              canGoBack={!!canGoBack}
              backTo={backTo ?? null}
              onBack={onBack}
              onClose={onClose}
            />
          ) : (
            <SheetTitle className="sr-only">Bead details</SheetTitle>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({
  bead,
  initialAction,
  canGoBack,
  backTo,
  onBack,
  onClose,
}: {
  bead: Bead;
  initialAction: DetailAction;
  canGoBack: boolean;
  backTo: string | null;
  onBack?: () => void;
  onClose: () => void;
}) {
  const { index, beads, humanAllowlist, meta, projectId, pushDetail, openCreate, readOnly } =
    useApp();
  const actor = meta?.humanActor ?? "you";
  const isDemo = meta?.kind === "demo";

  const update = useUpdateBead();
  const setStatus = useSetStatus();
  const addComment = useAddComment();
  const removeDep = useRemoveDep();
  const archive = useArchiveBead();
  const del = useDeleteBead();
  const createGate = useCreateGate();

  const copyLink = () => {
    const url = `${window.location.origin}/p/${encodeURIComponent(projectId)}?bead=${encodeURIComponent(bead.id)}`;
    if (!navigator.clipboard) {
      toast.error("Clipboard unavailable in this context");
      return;
    }
    navigator.clipboard.writeText(url).then(
      () => toast.success(`Copied link to ${bead.id}`),
      () => toast.error("Couldn’t copy to clipboard"),
    );
  };

  const [draft, setDraft] = React.useState("");
  const [addingDep, setAddingDep] = React.useState(false);
  const [addingGate, setAddingGate] = React.useState(false);
  const [gateReason, setGateReason] = React.useState("");
  const gateBead = isHumanGate(bead);

  // Closing is the only moment a reason can be recorded — bd offers no way to
  // attach one afterwards — so picking "Closed" opens a skippable composer
  // instead of firing the mutation straight away.
  const [closing, setClosing] = React.useState(!readOnly && initialAction === "close");
  const [closeDraft, setCloseDraft] = React.useState("");
  const closeRef = React.useRef<HTMLTextAreaElement>(null);

  const startClosing = () => {
    if (readOnly) return;
    setCloseDraft("");
    setClosing(true);
  };
  const cancelClosing = () => {
    setClosing(false);
    setCloseDraft("");
  };
  const confirmClose = () => {
    if (readOnly) return;
    setStatus.mutate(
      { id: bead.id, status: "closed", reason: closeDraft.trim() || undefined },
      { onSuccess: cancelClosing },
    );
  };

  React.useEffect(() => {
    if (closing) closeRef.current?.focus();
  }, [closing]);

  // Inline edit of title + description (with image drop/paste on the textarea).
  const [editing, setEditing] = React.useState(!readOnly && initialAction === "edit");
  const [previousReadOnly, setPreviousReadOnly] = React.useState(readOnly);
  if (previousReadOnly !== readOnly) {
    setPreviousReadOnly(readOnly);
    if (readOnly) {
      setClosing(false);
      setEditing(false);
    }
  }
  const [previewEdit, setPreviewEdit] = React.useState(false);
  const [titleDraft, setTitleDraft] = React.useState(bead.title);
  const [descDraft, setDescDraft] = React.useState(bead.description ?? "");
  const progress = checklistProgress(bead.description);
  const descRef = React.useRef<HTMLTextAreaElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const drop = useImageDrop({
    projectId,
    beadId: bead.id,
    disabled: isDemo,
    disabledMessage: "Attachments aren't available for the Demo project.",
    textareaRef: descRef,
    value: descDraft,
    onChange: setDescDraft,
  });

  const startEdit = () => {
    if (readOnly) return;
    setTitleDraft(bead.title);
    setDescDraft(bead.description ?? "");
    setEditing(true);
  };
  const cancelEdit = () => setEditing(false);
  const saveEdit = () => {
    if (readOnly) return;
    const t = titleDraft.trim();
    if (!t) return;
    update.mutate(
      { id: bead.id, patch: { title: t, description: descDraft } },
      { onSuccess: () => setEditing(false) },
    );
  };

  const o = beadOrigin(bead, humanAllowlist);
  const ep = parentOf(bead, index);
  // Children come from the parent-child dependency EDGE, never `bead.parent` —
  // `bd export --json` (the source for the list cache) omits the parent field,
  // so an edge-based lookup is the only one correct in every context.
  const kids = childrenOf(bead.id, beads);
  // epicProgress is parent-agnostic despite the name (worth renaming later).
  const kidProgress = epicProgress(bead.id, beads);
  const deps = React.useMemo(
    () => (bead.dependencies ?? []).filter((d) => d.type !== "parent-child"),
    [bead.dependencies],
  );
  const dependencyRows = React.useMemo<DependencyRow[]>(() => {
    const outgoingRows: DependencyRow[] = deps.map((dependency) => {
      const target = index.get(dependency.depends_on_id);
      const resolved = dependencyIsResolved(bead, target);
      return {
        key: `dependency:${dependency.depends_on_id}:${dependency.type}`,
        target,
        targetId: dependency.depends_on_id,
        label: dependencyTypeLabel(dependency.type, resolved),
        active: !resolved,
        activeBlocking: isDisplayedBlockingDepType(dependency.type) && !resolved,
        removeIssueId: bead.id,
        removeDependsOnId: dependency.depends_on_id,
      };
    });
    const incomingRows = beads.flatMap<DependencyRow>((dependent) =>
      (dependent.dependencies ?? []).flatMap<DependencyRow>((dependency) => {
        if (
          dependency.depends_on_id !== bead.id ||
          !isDisplayedBlockingDepType(dependency.type)
        ) {
          return [];
        }
        const resolved = dependencyIsResolved(bead, dependent);
        return [
          {
            key: `dependent:${dependent.id}:${dependency.type}`,
            target: dependent,
            targetId: dependent.id,
            label: dependentTypeLabel(dependency.type, resolved),
            active: !resolved,
            activeBlocking: !resolved,
            removeIssueId: dependent.id,
            removeDependsOnId: bead.id,
          },
        ];
      }),
    );
    return [...outgoingRows, ...incomingRows].sort(
      (left, right) => Number(right.active) - Number(left.active),
    );
  }, [bead, beads, deps, index]);
  const notes = bead.notes?.trim() ?? "";
  const design = bead.design?.trim() ?? "";
  const acceptance = bead.acceptance_criteria?.trim() ?? "";
  const closeReason = closeReasonOf(bead);
  const comments = bead.comments ?? [];
  const activity = [
    { label: `Created by ${bead.created_by || "unknown"}`, time: fmtDate(bead.created_at) },
    bead.updated_at ? { label: "Last updated", time: fmtDate(bead.updated_at) } : null,
    bead.closed_at ? { label: "Closed", time: fmtDate(bead.closed_at) } : null,
  ].filter(Boolean) as { label: string; time: string }[];

  // Every label already in use across the project, offered as datalist
  // suggestions so labels converge instead of sprouting near-duplicates.
  // `archived` is state (see LabelsField), not a tag, so it never appears.
  const labelSuggestions = React.useMemo(() => {
    const s = new Set<string>();
    for (const b of beads) for (const l of b.labels ?? []) if (l !== ARCHIVED_LABEL) s.add(l);
    return [...s].sort();
  }, [beads]);

  return (
    <>
      <SheetDescription className="sr-only">Bead details for {bead.id}</SheetDescription>

      <div className="sticky top-0 z-[2] flex items-center gap-[10px] border-b border-border bg-[var(--drawer)] p-[15px_20px]">
        {/* Naming the destination rather than saying "Back" — you arrive here
            from a subtask and need to know what you're returning to (GH #15).
            No left-arrow icon exists; the drawer already rotates `chevron`. */}
        {canGoBack && (
          <IconBtn title={backTo ? `Back to ${backTo}` : "Back"} onClick={() => onBack?.()}>
            <Icon name="chevron" size={15} className="rotate-90" />
          </IconBtn>
        )}
        <span className="h-[9px] w-[9px] rounded-full" style={{ background: catColor(bead.status) }} />
        <CopyableId id={bead.id} className="font-mono text-[13px] text-[var(--text-2)]" />
        <StatusChip status={bead.status} />
        <span className="flex-1" />
        <IconBtn title="Copy link" onClick={copyLink}>
          <Icon name="link" size={15} />
        </IconBtn>
        {!readOnly && (
          <IconBtn
            title={editing ? "Stop editing" : "Edit title & description"}
            onClick={editing ? cancelEdit : startEdit}
          >
            <Icon name="pencil" size={15} />
          </IconBtn>
        )}
        {!readOnly && (
          <IconBtn title="Archive (close + label)" onClick={() => archive.mutate(bead.id)}>
            <Icon name="archive" size={15} />
          </IconBtn>
        )}
        {!readOnly && (
          <IconBtn
            title="Delete"
            danger
            onClick={() => {
              if (confirm(`Delete ${bead.id}? This calls bd delete.`)) {
                del.mutate(bead.id);
                onClose();
              }
            }}
          >
            <Icon name="trash" size={15} />
          </IconBtn>
        )}
        <IconBtn title="Close" onClick={onClose}>
          <Icon name="x" size={15} />
        </IconBtn>
      </div>

      <div className="p-5 [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-50 [&_select:disabled]:opacity-60 [&_textarea:disabled]:opacity-60 [&_input:disabled]:opacity-60">
        <div className="mb-[10px] flex items-center gap-2">
          <span className="inline-flex items-center gap-[6px] rounded-[7px] border border-border bg-[var(--surface-2)] px-[9px] py-[3px] text-[12px] text-[var(--text-2)]">
            <Icon name={typeIconName(bead.issue_type)} size={13} style={{ color: typeColor(bead.issue_type) }} />
            {typeLabel(bead.issue_type)}
          </span>
          <OriginBadge origin={o} title={originTitle(bead.created_by, o)} withLabel />
        </div>

        {gateBead && bead.status !== "closed" && (
          <div className="mb-4 flex items-center gap-3 rounded-[10px] border border-[var(--brand)]/40 bg-[var(--brand-weak)] p-[11px_13px]">
            <Icon name="gate" size={16} style={{ color: "var(--brand)" }} className="flex-shrink-0" />
            <span className="flex-1 text-[12.5px] leading-[1.45] text-[var(--text-2)]">
              Human approval gate. Approving closes it and unblocks everything waiting on it.
            </span>
            <GateApproval id={bead.id} />
          </div>
        )}

        {editing && !readOnly ? (
          <>
            <SheetTitle className="sr-only">Edit {bead.id}</SheetTitle>
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              placeholder="Title"
              className="mb-[14px] w-full rounded-[9px] border border-border bg-[var(--surface-2)] px-[11px] py-[9px] text-[18px] font-[650] leading-[1.25] tracking-[-.02em] text-[var(--text)] outline-none focus:border-[var(--brand)]"
            />
          </>
        ) : (
          <SheetTitle className="mb-[14px] text-[20px] font-[650] leading-[1.25] tracking-[-.02em] [text-wrap:pretty]">
            {bead.title}
          </SheetTitle>
        )}

        <div className="mb-4 grid grid-cols-2 gap-[10px]">
          <label className="flex flex-col gap-[5px]">
            <span className={fieldLabel}>Status</span>
            <select
              disabled={readOnly}
              className={selectClass}
              value={closing && !readOnly ? "closed" : bead.status}
              onChange={(e) => {
                const next = e.target.value;
                if (next === "closed" && bead.status !== "closed") startClosing();
                else {
                  cancelClosing();
                  setStatus.mutate({ id: bead.id, status: next });
                }
              }}
            >
              {BEAD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-[5px]">
            <span className={fieldLabel}>Priority</span>
            <select
              disabled={readOnly}
              className={selectClass}
              value={String(bead.priority)}
              onChange={(e) =>
                update.mutate({ id: bead.id, patch: { priority: Number(e.target.value) } })
              }
            >
              {[0, 1, 2, 3, 4].map((p) => (
                <option key={p} value={String(p)}>
                  {p} · {["Critical", "High", "Medium", "Low", "Backlog"][p]}
                </option>
              ))}
            </select>
          </label>
          <AssigneeField bead={bead} />
          <div className="flex flex-col gap-[5px]">
            {/* Labelled by what the parent actually IS. Only epics get routed to
                the Epics screen — it renders issue_type === "epic" only, so
                sending a task/feature parent there used to land the user on an
                empty screen with nothing highlighted. */}
            <span className={fieldLabel}>{ep && ep.issue_type !== "epic" ? "Parent" : "Epic"}</span>
            {ep ? (
              <button
                type="button"
                onClick={() => pushDetail(ep.id)}
                title={`Open ${ep.id}`}
                className="flex h-9 items-center gap-[7px] rounded-[9px] border border-border bg-[var(--surface-2)] px-[10px] text-left text-[var(--brand)] hover:border-[var(--brand)] hover:bg-[var(--brand-weak)]"
              >
                <Icon
                  name={ep.issue_type === "epic" ? "target" : typeIconName(ep.issue_type)}
                  size={14}
                  className="flex-shrink-0"
                />
                <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[12.5px]">
                  {ep.title}
                </span>
                <span className="flex-1" />
                <Icon name="chevron" size={13} className="-rotate-90 flex-shrink-0 text-[var(--text-3)]" />
              </button>
            ) : (
              <div className="flex h-9 items-center gap-[7px] rounded-[9px] border border-border bg-[var(--surface-2)] px-[10px] text-[var(--text-3)]">
                <Icon name="target" size={14} />
                <span className="text-[12.5px]">—</span>
              </div>
            )}
          </div>
        </div>

        <LabelsField
          bead={bead}
          suggestions={labelSuggestions}
          onChange={(labels) => update.mutate({ id: bead.id, patch: { labels } })}
        />


        {closing && !readOnly && (
          <div className="mb-4 rounded-[10px] border border-border bg-[var(--surface-2)] p-[11px_13px]">
            <div className={`${fieldLabel} mb-[7px]`}>Close reason — optional</div>
            <textarea
              ref={closeRef}
              value={closeDraft}
              onChange={(e) => setCloseDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") cancelClosing();
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) confirmClose();
              }}
              rows={3}
              placeholder="Why is this done? A commit, a PR link, or a one-liner. Markdown and bead IDs render."
              className="w-full resize-y rounded-[9px] border border-border bg-[var(--surface)] p-[9px_11px] text-[13px] leading-[1.5] text-[var(--text)] outline-none focus:border-[var(--brand)]"
            />
            <div className="mt-[9px] flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={readOnly || setStatus.isPending}
                onClick={confirmClose}
                className="flex h-8 items-center gap-[6px] rounded-lg px-3 text-[12.5px] font-[550] text-white disabled:opacity-50"
                style={{ background: "var(--brand)" }}
              >
                <Icon name="check" size={14} />
                {closeDraft.trim() ? "Close with reason" : "Close without a reason"}
              </button>
              <button
                type="button"
                disabled={readOnly || setStatus.isPending}
                onClick={cancelClosing}
                className="h-8 rounded-lg border border-border px-3 text-[12.5px] text-[var(--text-2)] hover:bg-[var(--surface-3)] disabled:opacity-50"
              >
                Cancel
              </button>
              <span className="text-[11.5px] text-[var(--text-3)]">
                bd can&rsquo;t attach a reason later — this is the only chance to record one.
              </span>
            </div>
          </div>
        )}

        <Section>
          <div className={`${fieldLabel} mb-[6px] flex items-center gap-2`}>
            <span>Description</span>
            {progress.total > 0 && (
              <span className="rounded-full border border-border bg-[var(--surface-2)] px-[7px] py-px font-normal normal-case tracking-normal text-[var(--text-2)]">
                {progress.done}/{progress.total} done
              </span>
            )}
            {editing && !readOnly && !isDemo && !previewEdit && (
              <span className="font-normal normal-case tracking-normal text-[var(--text-3)]">
                · drop or paste images
              </span>
            )}
            {editing && !readOnly && (
              <button
                onClick={() => setPreviewEdit((p) => !p)}
                className="ml-auto rounded-md border border-border bg-[var(--surface-2)] px-[8px] py-[2px] text-[11px] font-normal normal-case tracking-normal text-[var(--text-2)] hover:bg-[var(--surface-3)]"
              >
                {previewEdit ? "Write" : "Preview"}
              </button>
            )}
          </div>
          {editing && !readOnly ? (
            <>
              {previewEdit ? (
                <DescriptionContent
                  text={descDraft.trim() ? descDraft : "_Nothing to preview yet._"}
                  projectId={projectId}
                  className="rounded-[10px] border border-border bg-[var(--surface-2)] p-[12px_13px] text-[13.5px] leading-[1.55] text-[var(--text-2)]"
                />
              ) : (
              <div
                className="relative"
                onDrop={drop.onDrop}
                onDragOver={drop.onDragOver}
                onDragLeave={drop.onDragLeave}
              >
                <MarkdownToolbar textareaRef={descRef} value={descDraft} onChange={setDescDraft} />
                <textarea
                  ref={descRef}
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  onPaste={drop.onPaste}
                  onKeyDown={(e) => {
                    // Cmd/Ctrl+Enter saves the edit, mirroring the create modal.
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault();
                      saveEdit();
                      return;
                    }
                    // Formatting shortcuts while the textarea is focused.
                    if (e.metaKey || e.ctrlKey) {
                      const fn =
                        e.key === "b" ? bold : e.key === "i" ? italic : e.key === "k" ? link : null;
                      if (fn) {
                        e.preventDefault();
                        applyTransform(descRef.current, descDraft, setDescDraft, fn);
                      }
                    }
                  }}
                  rows={6}
                  placeholder="Describe this bead…"
                  className={`w-full resize-y rounded-[10px] border bg-[var(--surface-2)] p-[12px_13px] text-[13.5px] leading-[1.55] text-[var(--text)] outline-none ${
                    drop.dragOver ? "border-[var(--brand)] ring-1 ring-[var(--brand)]" : "border-border"
                  }`}
                />
                {drop.uploading && (
                  <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-[var(--surface)] px-2 py-0.5 text-[11px] text-[var(--text-3)]">
                    <Icon name="image" size={12} /> Uploading…
                  </span>
                )}
              </div>
              )}
              <div className="mt-2 flex items-center gap-2">
                {!isDemo && !previewEdit && (
                  <>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={drop.pickFiles}
                    />
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="inline-flex h-8 items-center gap-[6px] rounded-lg border border-border bg-[var(--surface-2)] px-3 text-[12.5px] font-[550] text-[var(--text-2)] hover:bg-[var(--surface-3)]"
                    >
                      <Icon name="image" size={14} /> Attach image
                    </button>
                  </>
                )}
                <span className="flex-1" />
                <button
                  onClick={cancelEdit}
                  className="h-8 rounded-lg border border-border bg-[var(--surface-2)] px-3 text-[12.5px] font-[550] hover:bg-[var(--surface-3)]"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEdit}
                  disabled={!titleDraft.trim() || update.isPending}
                  className="flex h-8 items-center gap-[6px] rounded-lg px-3 text-[12.5px] font-[550] text-white disabled:opacity-50"
                  style={{ background: "var(--brand)" }}
                >
                  <Icon name="check" size={14} /> Save
                </button>
              </div>
            </>
          ) : bead.description ? (
            <DescriptionContent
              text={bead.description}
              projectId={projectId}
              onToggleTask={readOnly ? undefined : (idx) =>
                update.mutate({
                  id: bead.id,
                  patch: { description: toggleTask(bead.description ?? "", idx) },
                })
              }
              className={detailContentClass}
            />
          ) : (
            <div className="rounded-[10px] border border-border bg-[var(--surface-2)] p-[12px_13px] text-[13.5px] leading-[1.55] text-[var(--text-3)]">
              No description.
            </div>
          )}
          {!editing && !readOnly && <AiAssistPanel bead={bead} />}
        </Section>

        {/* Dependencies */}
        <Section>
          <Header icon="link" label="Dependencies" count={dependencyRows.length} />
          <div className="flex flex-col gap-[7px]">
            {dependencyRows.map((row) => {
              const c = row.activeBlocking ? "#ef4444" : "var(--text-2)";
              return (
                <div
                  key={row.key}
                  className="flex items-center gap-[9px] rounded-[9px] border border-border bg-[var(--surface)] p-[9px_11px]"
                >
                  <button
                    type="button"
                    disabled={!row.target}
                    title={row.target ? `Open ${row.target.id}` : undefined}
                    onClick={() => pushDetail(row.targetId)}
                    className="flex min-w-0 flex-1 items-center gap-[9px] text-left disabled:cursor-default"
                  >
                    <span
                      className="flex-shrink-0 rounded-[5px] px-[7px] py-[2px] font-mono text-[10px] font-semibold"
                      style={{
                        color: c,
                        background: row.activeBlocking ? "#ef444418" : "var(--surface-2)",
                        border: `1px solid ${row.activeBlocking ? "#ef444433" : "var(--border)"}`,
                      }}
                    >
                      {row.label}
                    </span>
                    <span className="flex-shrink-0 font-mono text-[11px] text-[var(--text-3)]">
                      {row.targetId}
                    </span>
                    <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[12.5px]">
                      {row.target?.title ?? "(unknown)"}
                    </span>
                    <span
                      className="h-[7px] w-[7px] flex-shrink-0 rounded-full"
                      style={{ background: catColor(row.target?.status ?? "open") }}
                      title={statusLabel(row.target?.status ?? "open")}
                    />
                  </button>
                  <button
                    title="remove"
                    disabled={readOnly}
                    onClick={() =>
                      removeDep.mutate({
                        id: row.removeIssueId,
                        dependsOnId: row.removeDependsOnId,
                      })
                    }
                    className="flex h-[22px] w-[22px] items-center justify-center rounded-md text-[var(--text-3)] hover:bg-[#ef444415] hover:text-[#ef4444]"
                  >
                    <Icon name="x" size={12} />
                  </button>
                </div>
              );
            })}
            {dependencyRows.length === 0 && !addingDep && (
              <div className="px-[2px] py-1 text-[12px] text-[var(--text-3)]">
                No dependency relationships.
              </div>
            )}

            {addingDep ? (
              <DependencyEditor bead={bead} onDone={() => setAddingDep(false)} />
            ) : (
              <button
                disabled={readOnly}
                onClick={() => setAddingDep(true)}
                className="flex items-center gap-[7px] rounded-[9px] border border-dashed border-[var(--border-strong)] p-[8px_11px] text-[12.5px] font-medium text-[var(--text-2)] hover:border-[var(--brand)] hover:text-[var(--brand)]"
              >
                <Icon name="plus" size={14} />
                <span>Add dependency</span>
              </button>
            )}

            {/* Require a human approval gate before this bead can proceed
                (bd gate create --type human --blocks <this>). Resolved from the
                gate's own drawer or the Needs You inbox. */}
            {!readOnly && !gateBead && bead.status !== "closed" &&
              (addingGate ? (
                <div className="flex items-center gap-[7px] rounded-[9px] border border-border bg-[var(--surface)] p-[9px_11px]">
                  <input
                    autoFocus
                    value={gateReason}
                    onChange={(e) => setGateReason(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !createGate.isPending) {
                        createGate.mutate({ id: bead.id, reason: gateReason.trim() || undefined });
                        setAddingGate(false);
                        setGateReason("");
                      }
                      if (e.key === "Escape") setAddingGate(false);
                    }}
                    placeholder="Reason (optional) — e.g. needs design sign-off"
                    className="h-8 flex-1 rounded-[9px] border border-border bg-[var(--surface-2)] px-[9px] text-[12.5px] text-[var(--text)] outline-none focus:border-[var(--brand)]"
                  />
                  <button
                    disabled={createGate.isPending}
                    onClick={() => {
                      createGate.mutate({ id: bead.id, reason: gateReason.trim() || undefined });
                      setAddingGate(false);
                      setGateReason("");
                    }}
                    className="flex h-8 flex-shrink-0 items-center rounded-md px-3 text-[12px] font-[550] text-white disabled:opacity-50"
                    style={{ background: "var(--brand)" }}
                  >
                    Create gate
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingGate(true)}
                  title="Block this bead on a human approval gate"
                  className="flex items-center gap-[7px] rounded-[9px] border border-dashed border-[var(--border-strong)] p-[8px_11px] text-[12.5px] font-medium text-[var(--text-2)] hover:border-[var(--brand)] hover:text-[var(--brand)]"
                >
                  <Icon name="gate" size={14} />
                  <span>Require approval</span>
                </button>
              ))}
          </div>
        </Section>

        {/* Subtasks — one level deep, deliberately not recursive. */}
        <Section>
          <Header icon="target" label="Subtasks" count={kids.length} />
          {kids.length > 0 && (
            <div className="mb-[9px] flex items-center gap-[9px]">
              <div className="h-[6px] flex-1 overflow-hidden rounded-full bg-[var(--surface-3)]">
                <div
                  className="h-full rounded-full transition-[width]"
                  style={{
                    width: `${kidProgress.pct}%`,
                    background: kidProgress.pct === 100 ? "#16a34a" : "var(--brand)",
                  }}
                />
              </div>
              <span className="flex-shrink-0 font-mono text-[11px] text-[var(--text-3)]">
                {kidProgress.closed}/{kidProgress.total} · {kidProgress.pct}%
              </span>
            </div>
          )}
          <div className="flex flex-col gap-[7px]">
            {kids.map((k) => (
              <div
                key={k.id}
                role="button"
                tabIndex={0}
                onClick={() => pushDetail(k.id)}
                onKeyDown={(ev) => {
                  if (ev.target !== ev.currentTarget) return;
                  if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    pushDetail(k.id);
                  }
                }}
                className="flex cursor-pointer items-center gap-[9px] rounded-[9px] border border-border bg-[var(--surface)] p-[9px_11px] hover:border-[var(--border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
              >
                <span
                  className="h-[7px] w-[7px] flex-shrink-0 rounded-full"
                  style={{ background: catColor(k.status) }}
                  title={statusLabel(k.status)}
                />
                <span className="flex-shrink-0 font-mono text-[11px] text-[var(--text-3)]">
                  {k.id}
                </span>
                <Icon
                  name={typeIconName(k.issue_type)}
                  size={14}
                  className="flex-shrink-0"
                  style={{ color: typeColor(k.issue_type) }}
                />
                <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[12.5px]">
                  {k.title}
                </span>
                <PriorityChip p={k.priority} />
                <OriginBadge
                  origin={beadOrigin(k, humanAllowlist)}
                  title={originTitle(k.created_by, beadOrigin(k, humanAllowlist))}
                />
                <span
                  className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[9.5px] font-semibold text-white"
                  style={{ background: avatarColor(k.assignee ?? "") }}
                  title={k.assignee || "Unassigned"}
                >
                  {initials(k.assignee ?? "")}
                </span>
                <button
                  title={`Detach ${k.id} from this bead`}
                  aria-label={`Detach ${k.id}`}
                  disabled={readOnly}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    update.mutate({ id: k.id, patch: { parent: "" } });
                  }}
                  className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-md text-[var(--text-3)] hover:bg-[#ef444415] hover:text-[#ef4444]"
                >
                  <Icon name="x" size={12} />
                </button>
              </div>
            ))}
            {kids.length === 0 && (
              <div className="px-[2px] py-1 text-[12px] text-[var(--text-3)]">No subtasks yet.</div>
            )}
            {!readOnly && (
              <button
                onClick={() => openCreate({ parent: bead.id })}
                className="flex items-center gap-[7px] rounded-[9px] border border-dashed border-[var(--border-strong)] p-[8px_11px] text-[12.5px] font-medium text-[var(--text-2)] hover:border-[var(--brand)] hover:text-[var(--brand)]"
              >
                <Icon name="plus" size={14} />
                <span>Add subtask</span>
              </button>
            )}
          </div>
        </Section>

        {design && (
          <Section>
            <Header icon="pencil" label="Design" />
            <DescriptionContent
              text={design}
              projectId={projectId}
              className={detailContentClass}
            />
          </Section>
        )}

        {acceptance && (
          <Section>
            <Header icon="target" label="Acceptance criteria" />
            <DescriptionContent
              text={acceptance}
              projectId={projectId}
              className={detailContentClass}
            />
          </Section>
        )}

        {notes && (
          <Section>
            <Header icon="list" label="Notes" />
            <DescriptionContent
              text={notes}
              projectId={projectId}
              className={detailContentClass}
            />
          </Section>
        )}

        {closeReason && (
          <Section>
            <Header icon="check" label="Close reason" />
            <DescriptionContent
              text={closeReason}
              projectId={projectId}
              className={detailContentClass}
            />
          </Section>
        )}

        {/* Comments */}
        <Section>
          <Header icon="comment" label="Comments" count={comments.length} />
          <div className="mb-3 flex flex-col gap-3">
            {comments.map((c, i) => {
              const co = originOf(c.author, humanAllowlist);
              return (
                <div key={c.id ?? i} className="flex gap-[10px]">
                  <span
                    className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                    style={{ background: avatarColor(c.author) }}
                  >
                    {initials(c.author)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-[3px] flex items-center gap-[7px]">
                      <span className="text-[12.5px] font-semibold">{c.author}</span>
                      <OriginBadge origin={co} title={co === "human" ? "Human" : "Agent"} />
                      <span title={fmtDateTime(c.created_at)} className="text-[11px] text-[var(--text-3)]">
                        {relTime(c.created_at)}
                      </span>
                    </div>
                    <DescriptionContent
                      text={c.text}
                      projectId={projectId}
                      className="text-[13px] leading-[1.5] text-[var(--text-2)] [text-wrap:pretty]"
                    />
                  </div>
                </div>
              );
            })}
            {comments.length === 0 && (
              <div className="text-[12px] text-[var(--text-3)]">No comments yet.</div>
            )}
          </div>
          <div className="flex items-start gap-[9px]">
            <span
              className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
              style={{ background: "var(--brand)" }}
            >
              {initials(actor)}
            </span>
            <div className="flex flex-1 flex-col gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={`Comment as ${actor}…`}
                disabled={readOnly}
                rows={2}
                className="w-full resize-y rounded-[10px] border border-border bg-[var(--surface-2)] p-[9px_11px] text-[13px] leading-[1.5] text-[var(--text)] outline-none"
              />
              <div className="flex justify-end">
                <button
                  disabled={readOnly || !draft.trim() || addComment.isPending}
                  onClick={() => {
                    const submitted = draft;
                    addComment.mutate({ id: bead.id, text: submitted.trim() }, {
                      onSuccess: () => setDraft((current) => current === submitted ? "" : current),
                    });
                  }}
                  className="h-8 rounded-lg px-[14px] text-[12.5px] font-[550] text-white disabled:opacity-50"
                  style={{ background: "var(--brand)" }}
                >
                  Comment
                </button>
              </div>
            </div>
          </div>
        </Section>

        {/* Activity */}
        <div>
          <div className={`${fieldLabel} mb-[9px]`}>Activity</div>
          <div className="flex flex-col gap-2">
            {activity.map((a, i) => (
              <div key={i} className="flex items-center gap-[9px] text-[12px] text-[var(--text-2)]">
                <span className="h-[6px] w-[6px] flex-shrink-0 rounded-full bg-[var(--text-3)]" />
                <span className="flex-1">{a.label}</span>
                <span className="font-mono text-[11px] text-[var(--text-3)]">{a.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <div className="mb-[18px]">{children}</div>;
}

/**
 * Add/remove labels on a bead. Every mutation sends the FULL desired set (the
 * update path is replace-all), and `archived` — if present — is always carried
 * through untouched so editing labels can never un-archive a bead.
 */
function LabelsField({
  bead,
  suggestions,
  onChange,
}: {
  bead: Bead;
  suggestions: string[];
  onChange: (labels: string[]) => void;
}) {
  const { readOnly } = useApp();
  const [draft, setDraft] = React.useState("");
  const listId = `labels-${bead.id}`;
  const all = bead.labels ?? [];
  const isArchived = all.includes(ARCHIVED_LABEL);
  const visible = all.filter((l) => l !== ARCHIVED_LABEL);

  // Re-attach `archived` to whatever the user ended up with before sending.
  const commitVisible = (next: string[]) =>
    !readOnly && onChange(isArchived ? [...next, ARCHIVED_LABEL] : next);

  const add = () => {
    if (readOnly) return;
    const v = draft.trim().replace(/,+$/, "").trim();
    setDraft("");
    // Ignore empties, duplicates, and any attempt to hand-type the archive flag.
    if (!v || v === ARCHIVED_LABEL || visible.includes(v)) return;
    commitVisible([...visible, v]);
  };

  return (
    <fieldset disabled={readOnly} className="mb-4 flex min-w-0 flex-col gap-[5px]">
      <span className={fieldLabel}>Labels</span>
      <div className="flex flex-wrap items-center gap-[6px] rounded-[9px] border border-border bg-[var(--surface-2)] p-[7px_9px]">
        {visible.map((l) => (
          <span key={l} className={labelChipClass}>
            {l}
            <button
              type="button"
              onClick={() => commitVisible(visible.filter((x) => x !== l))}
              title={`Remove label “${l}”`}
              aria-label={`Remove label ${l}`}
              className="text-[var(--text-3)] hover:text-[var(--danger,#ef4444)]"
            >
              <Icon name="x" size={11} />
            </button>
          </span>
        ))}
        {isArchived && (
          <span
            className={`${labelChipClass} opacity-70`}
            title="This bead is archived. Use the archive button in the header to change that."
          >
            <Icon name="archive" size={10} />
            {ARCHIVED_LABEL}
          </span>
        )}
        <input
          value={draft}
          onChange={(e) => {
            // A typed comma commits, so pasting "a,b" adds both.
            if (e.target.value.includes(",")) {
              const [head, ...rest] = e.target.value.split(",");
              const v = head.trim();
              if (v && v !== ARCHIVED_LABEL && !visible.includes(v)) {
                commitVisible([...visible, v]);
              }
              setDraft(rest.join(",").trim());
              return;
            }
            setDraft(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setDraft("");
            } else if (e.key === "Backspace" && !draft && visible.length) {
              // Backspace on an empty input removes the last chip, as in most tag inputs.
              commitVisible(visible.slice(0, -1));
            }
          }}
          onBlur={add}
          list={listId}
          placeholder={visible.length ? "Add label…" : "Add a label…"}
          aria-label="Add label"
          className="min-w-[110px] flex-1 border-none bg-transparent text-[12.5px] text-[var(--text)] outline-none placeholder:text-[var(--text-3)]"
        />
        <datalist id={listId}>
          {suggestions
            .filter((s) => !visible.includes(s))
            .map((s) => (
              <option key={s} value={s} />
            ))}
        </datalist>
      </div>
    </fieldset>
  );
}

function Header({ icon, label, count }: { icon: string; label: string; count?: number }) {
  return (
    <div className="mb-[9px] flex items-center gap-2">
      <Icon name={icon} size={15} className="text-[var(--text-2)]" />
      <span className="text-[13px] font-semibold">{label}</span>
      {count !== undefined && (
        <span className="font-mono text-[11px] text-[var(--text-3)]">{count}</span>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const c = catColor(status);
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-px text-[10.5px] font-semibold tracking-[.01em]"
      style={{ color: c, background: `${c}1c`, border: `1px solid ${c}33` }}
    >
      {statusLabel(status)}
    </span>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={
        danger
          ? "flex h-8 w-8 items-center justify-center rounded-lg border border-border text-[var(--text-2)] hover:border-[#ef444433] hover:bg-[#ef444415] hover:text-[#ef4444]"
          : "flex h-8 w-8 items-center justify-center rounded-lg border border-border text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
      }
    >
      {children}
    </button>
  );
}
