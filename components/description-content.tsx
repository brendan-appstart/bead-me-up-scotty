"use client";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { api } from "@/lib/api-client";

/**
 * Renders a bead description as GitHub-flavored markdown (headings, lists,
 * tables, code blocks, links, and task lists) via react-markdown + remark-gfm.
 *
 * Two bead-specific behaviors layered on top:
 *  - Image refs `![alt](attachment://<beadId>/<file>)` resolve to the
 *    attachments API; external `http(s)` images pass through.
 *  - Task-list checkboxes (`- [ ]` / `- [x]`) are interactive when `onToggleTask`
 *    is provided; toggling reports the checkbox's document-order index so the
 *    caller can rewrite the source markdown (see lib/beads-view toggleTask).
 */
const IMG_PATTERN = "!\\[([^\\]]*)\\]\\((attachment:\\/\\/[^)\\s]+|https?:\\/\\/[^)\\s]+)\\)";
const SAFE_URL_PATTERN = /^(https?:|mailto:|attachment:\/\/)/i;

function safeUrlTransform(url: string): string {
  return SAFE_URL_PATTERN.test(url) ? url : "";
}

export function DescriptionContent({
  text,
  projectId,
  className,
  onToggleTask,
}: {
  text: string;
  projectId: string;
  className?: string;
  onToggleTask?: (index: number) => void;
}) {
  // Fresh per render; react-markdown renders checkboxes in document order, so
  // this counter assigns each the index of its source task marker.
  const counter = { i: 0 };

  const components: Components = {
    a: ({ children, ...props }) => (
      <a {...props} target="_blank" rel="noopener noreferrer" className="text-[var(--brand)] underline">
        {children}
      </a>
    ),
    img: ({ src, alt }) => {
      const raw = typeof src === "string" ? src : "";
      const resolved = raw.startsWith("attachment://") ? api.attachments.urlFor(projectId, raw) : raw;
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolved}
          alt={alt ?? ""}
          className="my-2 block max-h-[320px] max-w-full rounded-[8px] border border-border"
        />
      );
    },
    input: ({ type, checked }) => {
      if (type !== "checkbox") return null;
      const idx = counter.i++;
      return (
        // The label is the tap target on a phone (self-eui); the box keeps its drawn size.
        <label className="mr-[6px] inline-flex cursor-pointer items-center align-middle has-[:disabled]:cursor-default">
          <input
            type="checkbox"
            checked={!!checked}
            disabled={!onToggleTask}
            onChange={() => onToggleTask?.(idx)}
            className="cursor-pointer disabled:cursor-default"
            style={{ accentColor: "var(--brand)" }}
          />
        </label>
      );
    },
    // A link that is all of its paragraph stands alone on its line, so it is a 44px tap
    // target on a phone. A link inside a sentence stays inline (WCAG 2.5.8). Self-eui.
    p: ({ node, children }) => {
      const kids = (node?.children ?? []).filter((c) => !(c.type === "text" && !c.value.trim()));
      const solo = kids.length === 1 && kids[0].type === "element" && kids[0].tagName === "a";
      return <p className={solo ? "bd-md-solo-link" : undefined}>{children}</p>;
    },
    // A wide table scrolls inside its own box and never moves the page (self-eui).
    table: ({ children }) => (
      <div className="bd-md-scroll">
        <table>{children}</table>
      </div>
    ),
  };

  return (
    <div className={className}>
      <div className="bd-md">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          // Colorize fenced code blocks; `ignoreMissing` keeps unknown languages
          // from throwing (they fall back to plain text). Themed via .hljs CSS.
          rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }]]}
          // Preserve attachment:// refs for local images, but reject executable
          // or local-file schemes when comments/descriptions render user text.
          // NB: the syntax-highlighting branch had swapped this for a pass-through
          // `(url) => url` so that attachment:// would resolve — but
          // safeUrlTransform already allows attachment://, so the swap bought
          // nothing and silently re-opened javascript:/file: URLs in rendered
          // user text. Keep the guard.
          urlTransform={safeUrlTransform}
          components={components}
        >
          {text}
        </ReactMarkdown>
      </div>
    </div>
  );
}

/** Whether a description contains at least one renderable image ref. */
export function hasImageRef(text: string): boolean {
  return new RegExp(IMG_PATTERN).test(text);
}
