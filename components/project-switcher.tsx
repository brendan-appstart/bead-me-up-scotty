"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, LayoutGrid } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useProjects } from "@/hooks/use-projects";
import { FolderBrowserModal } from "@/components/folder-browser-modal";
import { SidebarSwitcher } from "@/components/sidebar-switcher";

export function ProjectSwitcher({
  projectId,
  kind,
  live,
}: {
  projectId: string;
  kind?: "bd" | "demo";
  /** Whether the SSE change stream is connected (real projects only). */
  live?: boolean;
}) {
  const router = useRouter();
  const { data } = useProjects();
  const [addOpen, setAddOpen] = React.useState(false);

  const projects = data?.projects ?? [];
  const demo = projects.find((p) => p.id === "demo");
  const recents = projects.filter((p) => p.id !== "demo");
  const current = projects.find((p) => p.id === projectId);
  const currentName = current?.name ?? (projectId === "demo" ? "Demo" : projectId);

  const isDemo = kind === "demo";
  const isLive = !isDemo && !!live;
  const dot = (
    <span
      title={isLive ? "Live — changes stream in instantly" : undefined}
      className={
        "h-[7px] w-[7px] flex-shrink-0 rounded-full" + (isLive ? " animate-pulse" : "")
      }
      style={{
        background: isDemo ? "#d97706" : "#22c55e",
        boxShadow: `0 0 0 3px ${isDemo ? "#d9770622" : "#22c55e22"}`,
      }}
    />
  );

  return (
    <>
      <SidebarSwitcher
        leading={dot}
        title={currentName}
        subtitle={isDemo ? "sample data" : isLive ? "bd · live" : "bd · project"}
        menuLabel="Switch project"
      >
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
      </SidebarSwitcher>

      <FolderBrowserModal open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}
