"use client";
import * as React from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * A bead id rendered as click-to-copy: copies the FULL id to the clipboard and
 * shows a toast (bead 2sc). Stops propagation so clicking the id inside a board
 * card or list row doesn't also open the bead. Falls back gracefully when the
 * clipboard API isn't available (e.g. a non-secure context).
 */
export function CopyableId({ id, className }: { id: string; className?: string }) {
  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!navigator.clipboard) {
      toast.error("Clipboard unavailable in this context");
      return;
    }
    navigator.clipboard.writeText(id).then(
      () => toast.success(`Copied ${id}`),
      () => toast.error("Couldn’t copy to clipboard"),
    );
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={`Copy ${id}`}
      className={cn(
        "cursor-pointer text-left underline-offset-2 hover:text-[var(--brand)] hover:underline",
        className,
      )}
    >
      {id}
    </button>
  );
}
