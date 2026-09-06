import type { Bead } from "./schema";

/** Links are review material, not a claim that a decision has been verified. */
export function reviewLinks(bead: Bead): string[] {
  const text = [bead.description, bead.notes, bead.design, ...(bead.comments ?? []).map(c => c.text)].filter(Boolean).join("\n");
  const candidates = text.match(/(?:https?:\/\/|attachment:\/\/|\/api\/p\/)[^\s<>"']+/gi) ?? [];
  const links = new Set<string>();
  for (const candidate of candidates) {
    let link = candidate.replace(/[.,;!?]+$/, "");
    // Remove Markdown/prose closing delimiters while retaining balanced URL parentheses.
    for (const [open, close] of [["(", ")"], ["[", "]"]]) {
      while (link.endsWith(close) && link.split(close).length > link.split(open).length) link = link.slice(0, -1);
    }
    link = link.replace(/[.,;!?]+$/, "");
    if (link.startsWith("attachment://")) {
      const parts = link.slice("attachment://".length).split("/");
      if (parts.length >= 2 && parts.every(p => p && p !== "." && p !== "..")) links.add(link);
      continue;
    }
    try {
      const url = new URL(link, "https://scotty.invalid");
      if (link.startsWith("/")) {
        if (/^\/api\/p\/[^/]+\/attachments\/[^/]+\/[^/]+$/.test(url.pathname)) links.add(link);
      } else if (["http:", "https:"].includes(url.protocol) && url.hostname) links.add(link);
    } catch { /* Ignore malformed text rather than rendering an unusable link. */ }
  }
  return [...links];
}
