"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, LayoutGrid, ChevronsUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useProjects } from "@/hooks/use-projects";
import { FolderBrowserModal } from "@/components/folder-browser-modal";

export function ProjectSwitcher({
  projectId,
  kind,
}: {
  projectId: string;
  kind?: "bd" | "demo";
}) {
  const router = useRouter();
  const { data } = useProjects();
  const [addOpen, setAddOpen] = React.useState(false);

  const projects = data?.projects ?? [];
  const demo = projects.find((p) => p.id === "demo");
  const recents = projects.filter((p) => p.id !== "demo");
  const current = projects.find((p) => p.id === projectId);
  const currentName = current?.name ?? (projectId === "demo" ? "Demo" : projectId);

  const dot = (
    <span
      className="h-[7px] w-[7px] flex-shrink-0 rounded-full"
      style={{
        background: kind === "demo" ? "#d97706" : "#22c55e",
        boxShadow: `0 0 0 3px ${kind === "demo" ? "#d9770622" : "#22c55e22"}`,
      }}
    />
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="mb-[6px] flex w-full items-center gap-[9px] rounded-[10px] border border-border bg-[var(--surface-2)] px-[11px] py-[9px] text-left hover:bg-[var(--surface-3)] focus:outline-none">
          {dot}
          <div className="min-w-0 flex-1 leading-[1.15]">
            <div className="truncate text-[13px] font-[600] text-[var(--text)]">{currentName}</div>
            <div className="text-[10.5px] text-[var(--text-3)]">
              {kind === "demo" ? "sample data" : "bd · project"}
            </div>
          </div>
          <ChevronsUpDown size={14} className="flex-shrink-0 text-[var(--text-3)]" />
        </DropdownMenuTrigger>

        <DropdownMenuContent className="w-[210px]">
          <DropdownMenuLabel>Switch project</DropdownMenuLabel>

          {demo && (
            <DropdownMenuItem onClick={() => router.push("/p/demo")}>
              <span className="flex-1 truncate">Demo</span>
              {projectId === "demo" && <Check size={14} />}
            </DropdownMenuItem>
          )}

          {recents.length > 0 && <DropdownMenuSeparator />}
          {recents.map((p) => (
            <DropdownMenuItem key={p.id} onClick={() => router.push(`/p/${p.id}`)}>
              <span
                className="h-[6px] w-[6px] flex-shrink-0 rounded-full"
                style={{ background: p.hasBeads ? "#22c55e" : "#ef4444" }}
              />
              <span className="flex-1 truncate">{p.name}</span>
              {p.id === projectId && <Check size={14} />}
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setAddOpen(true)}>
            <Plus size={14} />
            <span>Add project…</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push("/")}>
            <LayoutGrid size={14} />
            <span>All projects</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <FolderBrowserModal open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}
