"use client";
import * as React from "react";
import { ChevronsUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

const triggerClass =
  "mb-[6px] flex w-full items-center gap-[9px] rounded-[10px] border border-border bg-[var(--surface-2)] px-[11px] py-[9px] text-left hover:bg-[var(--surface-3)] focus:outline-none";

/** Shared sidebar dropdown chrome used by project and filter-set switchers. */
export function SidebarSwitcher({
  leading,
  title,
  subtitle,
  menuLabel,
  children,
}: {
  leading?: React.ReactNode;
  title: string;
  subtitle: string;
  menuLabel: string;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={triggerClass}>
        {leading}
        <div className="min-w-0 flex-1 leading-[1.15]">
          <div className="truncate text-[13px] font-[600] text-[var(--text)]">{title}</div>
          <div className="text-[10.5px] text-[var(--text-3)]">{subtitle}</div>
        </div>
        <ChevronsUpDown size={14} className="flex-shrink-0 text-[var(--text-3)]" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[210px]">
        <DropdownMenuLabel>{menuLabel}</DropdownMenuLabel>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
