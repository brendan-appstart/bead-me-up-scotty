"use client";
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Folder, FolderOpen, Home, ArrowUp, Check, Loader2, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { api } from "@/lib/api-client";

export function FolderBrowserModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="w-[580px] max-w-[100%] gap-0 overflow-hidden rounded-2xl border border-border bg-[var(--surface)] p-0 shadow-[var(--shadow-lg)]"
      >
        {open && <Browser onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function Browser({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  // undefined → let the server default to the home directory
  const [path, setPath] = React.useState<string | undefined>(undefined);

  const { data, isLoading, error } = useQuery({
    queryKey: ["fs", path ?? "~home"],
    queryFn: () => api.fs.browse(path),
  });

  const go = (p: string) => {
    const trimmed = p.trim();
    if (trimmed) setPath(trimmed);
  };

  const add = useMutation({
    mutationFn: (p: string) => api.projects.add(p),
    onSuccess: (entry) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success(`Added ${entry.name}`);
      onClose();
      router.push(`/p/${entry.id}`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const errMsg = error ? (error as Error).message : undefined;

  return (
    <>
      <div className="flex items-center gap-[10px] border-b border-border p-[17px_20px]">
        <div className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-[var(--brand-weak)] text-[var(--brand)]">
          <FolderOpen size={16} />
        </div>
        <div className="flex-1">
          <DialogTitle className="text-[15px] font-[650]">Add a project</DialogTitle>
          <DialogDescription className="text-[11.5px] text-[var(--text-3)]">
            Pick a folder that contains a <span className="font-mono">.beads</span> directory
          </DialogDescription>
        </div>
      </div>

      {/* Path bar */}
      <div className="flex items-center gap-2 border-b border-border bg-[var(--surface-2)] p-[10px_16px]">
        <button
          onClick={() => setPath(undefined)}
          title="Home"
          className="flex h-[28px] w-[28px] items-center justify-center rounded-lg border border-border bg-[var(--surface)] text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
        >
          <Home size={14} />
        </button>
        <button
          onClick={() => data?.parent && setPath(data.parent)}
          disabled={!data?.parent}
          title="Up one level"
          className="flex h-[28px] w-[28px] items-center justify-center rounded-lg border border-border bg-[var(--surface)] text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] disabled:opacity-40"
        >
          <ArrowUp size={14} />
        </button>
        <input
          // Re-mount on navigation so the field shows where we landed, while
          // still letting the user freely type/paste a path in between.
          key={data?.path ?? "home"}
          defaultValue={data?.path ?? ""}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              go((e.target as HTMLInputElement).value);
            }
          }}
          spellCheck={false}
          autoComplete="off"
          placeholder="Type or paste a path, then press Enter"
          aria-label="Folder path"
          className={`min-w-0 flex-1 rounded-lg border bg-[var(--surface)] px-[10px] py-[6px] font-mono text-[12px] text-[var(--text)] outline-none focus:border-[var(--brand)] ${
            errMsg ? "border-[#d97706]" : "border-border"
          }`}
        />
      </div>

      {/* Entries */}
      <div className="bd-scroll max-h-[340px] min-h-[200px] overflow-y-auto p-2">
        {isLoading ? (
          <div className="flex h-[180px] items-center justify-center text-[var(--text-3)]">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : errMsg ? (
          <div className="flex h-[180px] flex-col items-center justify-center gap-2 px-6 text-center">
            <AlertTriangle size={20} className="text-[#d97706]" />
            <p className="text-[12.5px] text-[var(--text-2)]">{errMsg}</p>
            <button
              onClick={() => setPath(undefined)}
              className="rounded-md border border-border px-2.5 py-1 text-[12px] hover:bg-[var(--surface-2)]"
            >
              Go home
            </button>
          </div>
        ) : data && data.entries.length === 0 ? (
          <div className="flex h-[180px] items-center justify-center text-[12.5px] text-[var(--text-3)]">
            No subfolders here
          </div>
        ) : (
          data?.entries.map((entry) => (
            <button
              key={entry.path}
              onDoubleClick={() => setPath(entry.path)}
              onClick={() => setPath(entry.path)}
              className="flex w-full items-center gap-[10px] rounded-[9px] px-[10px] py-2 text-left hover:bg-[var(--surface-2)]"
            >
              <Folder
                size={16}
                className={entry.hasBeads ? "text-[var(--brand)]" : "text-[var(--text-3)]"}
              />
              <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text)]">
                {entry.name}
              </span>
              {entry.hasBeads && (
                <span className="rounded-full bg-[var(--brand-weak)] px-2 py-0.5 font-mono text-[10.5px] font-[550] text-[var(--brand)]">
                  beads
                </span>
              )}
            </button>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-[10px] border-t border-border p-[14px_18px]">
        <div className="flex-1 text-[11.5px] text-[var(--text-3)]">
          {data?.hasBeads ? (
            <span className="flex items-center gap-1.5 text-[var(--text-2)]">
              <Check size={13} className="text-[#22c55e]" />
              This folder has a <span className="font-mono">.beads</span> repo
            </span>
          ) : (
            "Navigate into a folder that contains a .beads directory"
          )}
        </div>
        <button
          onClick={onClose}
          className="h-[36px] rounded-[9px] border border-border bg-[var(--surface-2)] px-4 text-[13px] font-[550] hover:bg-[var(--surface-3)]"
        >
          Cancel
        </button>
        <button
          onClick={() => data?.path && add.mutate(data.path)}
          disabled={!data?.hasBeads || add.isPending}
          className="flex h-[36px] items-center gap-[7px] rounded-[9px] px-4 text-[13px] font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--brand)" }}
        >
          {add.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={15} />}
          Add this folder
        </button>
      </div>
    </>
  );
}
