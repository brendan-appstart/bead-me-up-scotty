"use client";
import { useApp } from "@/components/app-context";
import { Icon } from "@/components/icons";
import { api } from "@/lib/api-client";

/**
 * Chips for the links and attachments found across a bead's text (see
 * lib/review-links). Links in comments or notes are easy to miss when reading,
 * so surfacing them together saves digging. Renders nothing when empty so each
 * caller chooses its own heading and empty state.
 */
export function ReviewLinkChips({ links }: { links: string[] }) {
  const { projectId } = useApp();
  if (!links.length) return null;
  return (
    <div data-review-links className="flex flex-wrap gap-[6px]">
      {links.map(link => {
        const attachment = link.startsWith("attachment://");
        const href = attachment ? api.attachments.urlFor(projectId, link) : link;
        const label = attachment || link.startsWith("/api/p/")
          ? `Attachment: ${link.split("/").at(-1)}` : link.replace(/^https?:\/\//i, "");
        return (
          <a key={link} href={href} target="_blank" rel="noopener noreferrer" title={href}
            className="flex h-8 max-w-[300px] items-center gap-[6px] rounded-[9px] border border-border bg-[var(--surface-2)] px-[11px] text-[12px] text-[var(--brand)] hover:underline">
            <Icon name="link" size={13} className="flex-shrink-0" />
            <span className="truncate">{label}</span>
          </a>
        );
      })}
    </div>
  );
}
