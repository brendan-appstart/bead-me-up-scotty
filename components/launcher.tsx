"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, FlaskConical, FolderGit2, Loader2 } from "lucide-react";
import { Icon } from "@/components/icons";
import { useTheme } from "@/components/theme-provider";
import { useProjects } from "@/hooks/use-projects";
import { FolderBrowserModal } from "@/components/folder-browser-modal";
import { api, type ProjectInfo } from "@/lib/api-client";

export function Launcher() {
  const { data, isLoading } = useProjects();
  const [addOpen, setAddOpen] = React.useState(false);
  const { mode, toggle } = useTheme();

  const projects = data?.projects ?? [];
  const demo = projects.find((p) => p.id === "demo");
  const real = projects.filter((p) => p.id !== "demo");

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-background text-foreground">
      <header className="flex items-center gap-[12px] border-b border-border p-[20px_28px]">
        <div
          className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] text-white"
          style={{ background: "var(--brand)", boxShadow: "0 2px 8px -2px var(--brand)" }}
        >
          <Icon name="logo" size={19} />
        </div>
        <div className="flex-1 leading-[1.15]">
          <div className="text-[16px] font-[680] tracking-[-.01em]">Bead Me Up, Scotty</div>
          <div className="text-[12px] text-[var(--text-3)]">
            Choose a beads project to view and manage
          </div>
        </div>
        <button
          onClick={toggle}
          title="Toggle theme"
          className="flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-border bg-[var(--surface)] text-[var(--text-2)] hover:bg-[var(--surface-2)]"
        >
          <Icon name={mode === "dark" ? "sun" : "moon"} size={15} />
        </button>
      </header>

      <div className="mx-auto w-full max-w-[860px] flex-1 p-[28px]">
        <div className="mb-[14px] flex items-center justify-between">
          <h2 className="text-[13px] font-[650] uppercase tracking-[.03em] text-[var(--text-3)]">
            Projects
          </h2>
          <button
            onClick={() => setAddOpen(true)}
            className="flex h-[36px] items-center gap-[7px] rounded-[9px] px-[14px] text-[13px] font-semibold text-white"
            style={{ background: "var(--brand)", boxShadow: "0 2px 8px -2px var(--brand)" }}
          >
            <Plus size={15} />
            Add project
          </button>
        </div>

        {isLoading ? (
          <div className="flex h-[200px] items-center justify-center text-[var(--text-3)]">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(248px,1fr))] gap-[14px]">
            {demo && <DemoCard />}
            {real.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
            {real.length === 0 && (
              <button
                onClick={() => setAddOpen(true)}
                className="flex min-h-[112px] flex-col items-center justify-center gap-2 rounded-[13px] border border-dashed border-[var(--border-strong)] p-5 text-[var(--text-3)] hover:border-[var(--brand)] hover:text-[var(--brand)]"
              >
                <Plus size={20} />
                <span className="text-[12.5px] font-[550]">Add your first project</span>
              </button>
            )}
          </div>
        )}
      </div>

      <FolderBrowserModal open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

function CardShell({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
      className="group relative flex min-h-[112px] cursor-pointer flex-col gap-[10px] rounded-[13px] border border-border bg-[var(--surface)] p-[16px_18px] transition-colors hover:border-[var(--brand)] hover:bg-[var(--surface-2)]"
    >
      {children}
    </div>
  );
}

function DemoCard() {
  const router = useRouter();
  return (
    <CardShell onClick={() => router.push("/p/demo")}>
      <div className="flex items-center gap-[10px]">
        <div className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-[#d9770618] text-[#d97706]">
          <FlaskConical size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-[620]">Demo</div>
          <div className="text-[11px] text-[var(--text-3)]">built-in</div>
        </div>
      </div>
      <div className="text-[12px] text-[var(--text-3)]">
        Seeded sample data — explore every view without bd installed.
      </div>
    </CardShell>
  );
}

function ProjectCard({ project }: { project: ProjectInfo }) {
  const router = useRouter();
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: () => api.projects.remove(project.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success(`Removed ${project.name}`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <CardShell onClick={() => router.push(`/p/${project.id}`)}>
      <div className="flex items-center gap-[10px]">
        <div className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-[var(--brand-weak)] text-[var(--brand)]">
          <FolderGit2 size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-[620]">{project.name}</div>
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-3)]">
            <span
              className="h-[6px] w-[6px] rounded-full"
              style={{ background: project.hasBeads ? "#22c55e" : "#ef4444" }}
            />
            {project.hasBeads ? "bd repo" : "no .beads found"}
          </div>
        </div>
        <button
          title="Remove from list"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Remove "${project.name}" from the list? This does not delete any files.`)) {
              remove.mutate();
            }
          }}
          className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-lg text-[var(--text-3)] opacity-0 transition-opacity hover:bg-[var(--surface-3)] hover:text-[#ef4444] group-hover:opacity-100"
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="truncate font-mono text-[11px] text-[var(--text-3)]" dir="rtl" title={project.path ?? ""}>
        {project.path}
      </div>
    </CardShell>
  );
}
