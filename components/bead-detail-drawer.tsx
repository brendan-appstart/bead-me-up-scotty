"use client";
import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Icon, typeIconName } from "@/components/icons";
import { OriginBadge } from "@/components/board/bead-card";
import { CopyableId } from "@/components/copyable-id";
import { useApp } from "@/components/app-context";
import { useImageDrop } from "@/hooks/use-image-drop";
import { useResizableWidth } from "@/hooks/use-resizable-width";
import { DescriptionContent } from "@/components/description-content";
import { AiAssistPanel } from "@/components/ai-assist-panel";
import {
  useUpdateBead,
  useSetStatus,
  useAddComment,
  useAddDep,
  useRemoveDep,
  useArchiveBead,
  useDeleteBead,
} from "@/hooks/use-beads";
import { beadOrigin, originOf, originTitle } from "@/lib/attribution";
import {
  catColor,
  statusLabel,
  typeColor,
  typeLabel,
  avatarColor,
  initials,
  epicOf,
  relTime,
  fmtDate,
  fmtDateTime,
  checklistProgress,
  toggleTask,
} from "@/lib/beads-view";
import { BEAD_STATUSES, BLOCKING_DEP_TYPES, type Bead, type DepType } from "@/lib/schema";

const selectClass =
  "h-9 cursor-pointer rounded-[9px] border border-border bg-[var(--surface-2)] px-[9px] text-[13px] text-[var(--text)] outline-none";
const fieldLabel = "text-[11px] font-[550] uppercase tracking-[.03em] text-[var(--text-3)]";

export function BeadDetailDrawer({
  openId,
  onClose,
}: {
  openId: string | null;
  onClose: () => void;
}) {
  const { index } = useApp();
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
            <DrawerBody key={bead.id} bead={bead} onClose={onClose} />
          ) : (
            <SheetTitle className="sr-only">Bead details</SheetTitle>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({ bead, onClose }: { bead: Bead; onClose: () => void }) {
  const { index, beads, humanAllowlist, meta, projectId, openDetail } = useApp();
  const actor = meta?.humanActor ?? "you";
  const isDemo = meta?.kind === "demo";

  const update = useUpdateBead();
  const setStatus = useSetStatus();
  const addComment = useAddComment();
  const addDep = useAddDep();
  const removeDep = useRemoveDep();
  const archive = useArchiveBead();
  const del = useDeleteBead();

  const [draft, setDraft] = React.useState("");
  const [addingDep, setAddingDep] = React.useState(false);
  const [depTarget, setDepTarget] = React.useState("");
  const [depType, setDepType] = React.useState<DepType>("blocks");

  // Inline edit of title + description (with image drop/paste on the textarea).
  const [editing, setEditing] = React.useState(false);
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
    setTitleDraft(bead.title);
    setDescDraft(bead.description ?? "");
    setEditing(true);
  };
  const cancelEdit = () => setEditing(false);
  const saveEdit = () => {
    const t = titleDraft.trim();
    if (!t) return;
    update.mutate(
      { id: bead.id, patch: { title: t, description: descDraft } },
      { onSuccess: () => setEditing(false) },
    );
  };

  const o = beadOrigin(bead, humanAllowlist);
  const ep = epicOf(bead, index);
  const deps = (bead.dependencies ?? []).filter((d) => d.type !== "parent-child");
  const comments = bead.comments ?? [];
  const activity = [
    { label: `Created by ${bead.created_by || "unknown"}`, time: fmtDate(bead.created_at) },
    bead.updated_at ? { label: "Last updated", time: fmtDate(bead.updated_at) } : null,
    bead.closed_at ? { label: "Closed", time: fmtDate(bead.closed_at) } : null,
  ].filter(Boolean) as { label: string; time: string }[];

  const otherBeads = beads.filter(
    (b) => b.id !== bead.id && !deps.some((d) => d.depends_on_id === b.id),
  );

  return (
    <>
      <SheetDescription className="sr-only">Bead details for {bead.id}</SheetDescription>

      <div className="sticky top-0 z-[2] flex items-center gap-[10px] border-b border-border bg-[var(--drawer)] p-[15px_20px]">
        <span className="h-[9px] w-[9px] rounded-full" style={{ background: catColor(bead.status) }} />
        <CopyableId id={bead.id} className="font-mono text-[13px] text-[var(--text-2)]" />
        <StatusChip status={bead.status} />
        <span className="flex-1" />
        <IconBtn
          title={editing ? "Stop editing" : "Edit title & description"}
          onClick={editing ? cancelEdit : startEdit}
        >
          <Icon name="pencil" size={15} />
        </IconBtn>
        <IconBtn title="Archive (close + label)" onClick={() => archive.mutate(bead.id)}>
          <Icon name="archive" size={15} />
        </IconBtn>
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
        <IconBtn title="Close" onClick={onClose}>
          <Icon name="x" size={15} />
        </IconBtn>
      </div>

      <div className="p-5">
        <div className="mb-[10px] flex items-center gap-2">
          <span className="inline-flex items-center gap-[6px] rounded-[7px] border border-border bg-[var(--surface-2)] px-[9px] py-[3px] text-[12px] text-[var(--text-2)]">
            <Icon name={typeIconName(bead.issue_type)} size={13} style={{ color: typeColor(bead.issue_type) }} />
            {typeLabel(bead.issue_type)}
          </span>
          <OriginBadge origin={o} title={originTitle(bead.created_by, o)} withLabel />
        </div>

        {editing ? (
          <>
            <SheetTitle className="sr-only">Edit {bead.id}</SheetTitle>
            <input
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
              className={selectClass}
              value={bead.status}
              onChange={(e) => setStatus.mutate({ id: bead.id, status: e.target.value })}
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
          <div className="flex flex-col gap-[5px]">
            <span className={fieldLabel}>Assignee</span>
            <div className="flex h-9 items-center gap-[7px] rounded-[9px] border border-border bg-[var(--surface-2)] px-[10px]">
              <span
                className="flex h-[18px] w-[18px] items-center justify-center rounded-full text-[9px] font-semibold text-white"
                style={{ background: avatarColor(bead.assignee ?? "") }}
              >
                {initials(bead.assignee ?? "")}
              </span>
              <span className="text-[13px]">{bead.assignee || "Unassigned"}</span>
            </div>
          </div>
          <div className="flex flex-col gap-[5px]">
            <span className={fieldLabel}>Epic</span>
            {ep ? (
              <button
                type="button"
                onClick={() => openDetail(ep.id)}
                title={`Open ${ep.id}`}
                className="flex h-9 items-center gap-[7px] rounded-[9px] border border-border bg-[var(--surface-2)] px-[10px] text-left text-[var(--brand)] hover:border-[var(--brand)] hover:bg-[var(--brand-weak)]"
              >
                <Icon name="target" size={14} className="flex-shrink-0" />
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

        <Section>
          <div className={`${fieldLabel} mb-[6px] flex items-center gap-2`}>
            <span>Description</span>
            {progress.total > 0 && (
              <span className="rounded-full border border-border bg-[var(--surface-2)] px-[7px] py-px font-normal normal-case tracking-normal text-[var(--text-2)]">
                {progress.done}/{progress.total} done
              </span>
            )}
            {editing && !isDemo && !previewEdit && (
              <span className="font-normal normal-case tracking-normal text-[var(--text-3)]">
                · drop or paste images
              </span>
            )}
            {editing && (
              <button
                onClick={() => setPreviewEdit((p) => !p)}
                className="ml-auto rounded-md border border-border bg-[var(--surface-2)] px-[8px] py-[2px] text-[11px] font-normal normal-case tracking-normal text-[var(--text-2)] hover:bg-[var(--surface-3)]"
              >
                {previewEdit ? "Write" : "Preview"}
              </button>
            )}
          </div>
          {editing ? (
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
              onToggleTask={(idx) =>
                update.mutate({
                  id: bead.id,
                  patch: { description: toggleTask(bead.description ?? "", idx) },
                })
              }
              className="rounded-[10px] border border-border bg-[var(--surface-2)] p-[12px_13px] text-[13.5px] leading-[1.55] text-[var(--text-2)] [text-wrap:pretty]"
            />
          ) : (
            <div className="rounded-[10px] border border-border bg-[var(--surface-2)] p-[12px_13px] text-[13.5px] leading-[1.55] text-[var(--text-3)]">
              No description.
            </div>
          )}
          {!editing && <AiAssistPanel bead={bead} />}
        </Section>

        {/* Dependencies */}
        <Section>
          <Header icon="link" label="Dependencies" count={deps.length} />
          <div className="flex flex-col gap-[7px]">
            {deps.map((d) => {
              const t = index.get(d.depends_on_id);
              const blocking = BLOCKING_DEP_TYPES.includes(d.type as DepType);
              const c = blocking ? "#ef4444" : "var(--text-2)";
              return (
                <div
                  key={d.depends_on_id}
                  className="flex items-center gap-[9px] rounded-[9px] border border-border bg-[var(--surface)] p-[9px_11px]"
                >
                  <span
                    className="flex-shrink-0 rounded-[5px] px-[7px] py-[2px] font-mono text-[10px] font-semibold"
                    style={{
                      color: c,
                      background: blocking ? "#ef444418" : "var(--surface-2)",
                      border: `1px solid ${blocking ? "#ef444433" : "var(--border)"}`,
                    }}
                  >
                    {d.type}
                  </span>
                  <span className="flex-shrink-0 font-mono text-[11px] text-[var(--text-3)]">
                    {d.depends_on_id}
                  </span>
                  <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[12.5px]">
                    {t?.title ?? "(unknown)"}
                  </span>
                  <span
                    className="h-[7px] w-[7px] flex-shrink-0 rounded-full"
                    style={{ background: catColor(t?.status ?? "open") }}
                    title={statusLabel(t?.status ?? "open")}
                  />
                  <button
                    title="remove"
                    onClick={() => removeDep.mutate({ id: bead.id, dependsOnId: d.depends_on_id })}
                    className="flex h-[22px] w-[22px] items-center justify-center rounded-md text-[var(--text-3)] hover:bg-[#ef444415] hover:text-[#ef4444]"
                  >
                    <Icon name="x" size={12} />
                  </button>
                </div>
              );
            })}
            {deps.length === 0 && !addingDep && (
              <div className="px-[2px] py-1 text-[12px] text-[var(--text-3)]">
                No dependencies. This bead is unblocked.
              </div>
            )}

            {addingDep ? (
              <div className="flex items-center gap-[7px] rounded-[9px] border border-border bg-[var(--surface)] p-[9px_11px]">
                <select
                  className={`${selectClass} h-8 flex-1`}
                  value={depTarget}
                  onChange={(e) => setDepTarget(e.target.value)}
                >
                  <option value="">Select bead…</option>
                  {otherBeads.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.id} · {b.title.slice(0, 40)}
                    </option>
                  ))}
                </select>
                <select
                  className={`${selectClass} h-8`}
                  value={depType}
                  onChange={(e) => setDepType(e.target.value as DepType)}
                >
                  <option value="blocks">blocks</option>
                  <option value="related">related</option>
                  <option value="parent-child">parent-child</option>
                </select>
                <button
                  disabled={!depTarget}
                  onClick={() => {
                    addDep.mutate({ id: bead.id, dependsOnId: depTarget, type: depType });
                    setAddingDep(false);
                    setDepTarget("");
                  }}
                  className="flex h-8 items-center rounded-md px-3 text-[12px] font-[550] text-white disabled:opacity-50"
                  style={{ background: "var(--brand)" }}
                >
                  Add
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAddingDep(true)}
                className="flex items-center gap-[7px] rounded-[9px] border border-dashed border-[var(--border-strong)] p-[8px_11px] text-[12.5px] font-medium text-[var(--text-2)] hover:border-[var(--brand)] hover:text-[var(--brand)]"
              >
                <Icon name="plus" size={14} />
                <span>Add dependency</span>
              </button>
            )}
          </div>
        </Section>

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
                    <div className="text-[13px] leading-[1.5] text-[var(--text-2)] [text-wrap:pretty]">
                      {c.text}
                    </div>
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
                rows={2}
                className="w-full resize-y rounded-[10px] border border-border bg-[var(--surface-2)] p-[9px_11px] text-[13px] leading-[1.5] text-[var(--text)] outline-none"
              />
              <div className="flex justify-end">
                <button
                  disabled={!draft.trim()}
                  onClick={() => {
                    addComment.mutate({ id: bead.id, text: draft.trim() });
                    setDraft("");
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

function Header({ icon, label, count }: { icon: string; label: string; count: number }) {
  return (
    <div className="mb-[9px] flex items-center gap-2">
      <Icon name={icon} size={15} className="text-[var(--text-2)]" />
      <span className="text-[13px] font-semibold">{label}</span>
      <span className="font-mono text-[11px] text-[var(--text-3)]">{count}</span>
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
