"use client";
import * as React from "react";
import { Icon } from "@/components/icons";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export interface FilterOption {
  value: string;
  label: string;
}

/** A dropdown of checkboxes for one multi-select filter facet. */
export function MultiSelectFilter({
  label,
  options,
  selected,
  onToggle,
  onClear,
}: {
  label: string;
  options: FilterOption[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
}) {
  const active = selected.length > 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex h-9 items-center gap-[6px] rounded-[9px] border px-[11px] text-[12.5px] font-medium focus:outline-none"
        style={{
          borderColor: active ? "var(--brand)" : "var(--border)",
          background: active ? "var(--brand-weak)" : "var(--surface-2)",
          color: active ? "var(--brand)" : "var(--text-2)",
        }}
      >
        <span>{label}</span>
        {active && (
          <span className="rounded-full bg-[var(--brand)] px-[6px] text-[10.5px] font-semibold leading-[16px] text-white">
            {selected.length}
          </span>
        )}
        <Icon name="chevron" size={13} className="opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[190px]">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={selected.includes(o.value)}
            onCheckedChange={() => onToggle(o.value)}
            closeOnClick={false}
          >
            {o.label}
          </DropdownMenuCheckboxItem>
        ))}
        {active && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onClear}>Clear {label.toLowerCase()}</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
