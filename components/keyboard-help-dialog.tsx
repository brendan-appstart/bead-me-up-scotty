"use client";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { KEYBOARD_SHORTCUT_GROUPS } from "@/lib/keyboard-shortcuts";

export function ShortcutKeys({ keys, sequence }: { keys: string[]; sequence?: boolean }) {
  return (
    <span className="flex flex-shrink-0 items-center gap-1">
      {keys.map((key, index) => (
        <span key={`${key}-${index}`} className="contents">
          {index > 0 && (
            <span className="text-[10px] text-[var(--text-3)]">
              {sequence ? "then" : "+"}
            </span>
          )}
          <kbd className="min-w-7 rounded-md border border-border bg-[var(--surface-2)] px-2 py-1 text-center font-mono text-[11px] font-semibold text-[var(--text-2)] shadow-[var(--shadow)]">
            {key}
          </kbd>
        </span>
      ))}
    </span>
  );
}

export function KeyboardHelpDialog({
  open,
  onOpenChangeAction,
}: {
  open: boolean;
  onOpenChangeAction: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChangeAction}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden border border-border bg-[var(--surface)] p-0 shadow-[var(--shadow-lg)] sm:max-w-[760px]">
        <div className="border-b border-border px-6 py-5">
          <DialogTitle className="text-lg font-semibold">Keyboard shortcuts</DialogTitle>
          <DialogDescription className="mt-1 text-[12.5px] text-[var(--text-3)]">
            Vim-style navigation is disabled while typing. View and repository shortcuts are
            two-key sequences.
          </DialogDescription>
        </div>
        <div className="bd-scroll grid min-h-0 grid-cols-1 gap-6 overflow-y-auto px-6 py-5 md:grid-cols-2">
          {KEYBOARD_SHORTCUT_GROUPS.map((group) => (
            <section key={group.topic}>
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--text-3)]">
                {group.topic}
              </h2>
              <div className="flex flex-col gap-1">
                {group.shortcuts.map((shortcut) => (
                  <div
                    key={`${group.topic}-${shortcut.keys.join("-")}-${shortcut.label}`}
                    className="flex min-h-9 items-center justify-between gap-4 rounded-lg px-2 py-1.5 hover:bg-[var(--surface-2)]"
                  >
                    <span className="text-[12.5px] text-[var(--text-2)]">{shortcut.label}</span>
                    <ShortcutKeys keys={shortcut.keys} sequence={shortcut.sequence} />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
