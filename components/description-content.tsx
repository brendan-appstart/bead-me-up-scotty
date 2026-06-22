"use client";
import * as React from "react";
import { api } from "@/lib/api-client";

/**
 * Minimal description renderer. The app has no full markdown renderer, so this
 * only does the one thing bead descriptions need beyond plain text: turn image
 * references into <img> tags. Everything else renders verbatim with preserved
 * whitespace. Supported image forms:
 *   ![alt](attachment://<beadId>/<file>)   → served by the attachments API
 *   ![alt](http(s)://…)                    → external image
 */
const IMG_PATTERN = "!\\[([^\\]]*)\\]\\((attachment:\\/\\/[^)\\s]+|https?:\\/\\/[^)\\s]+)\\)";

export function DescriptionContent({
  text,
  projectId,
  className,
}: {
  text: string;
  projectId: string;
  className?: string;
}) {
  const nodes = React.useMemo(() => {
    const re = new RegExp(IMG_PATTERN, "g");
    const out: React.ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    let key = 0;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) {
        out.push(
          <span key={key++} className="whitespace-pre-wrap">
            {text.slice(last, m.index)}
          </span>,
        );
      }
      const alt = m[1];
      const raw = m[2];
      const src = raw.startsWith("attachment://") ? api.attachments.urlFor(projectId, raw) : raw;
      out.push(
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={key++}
          src={src}
          alt={alt}
          className="my-2 block max-h-[320px] max-w-full rounded-[8px] border border-border"
        />,
      );
      last = m.index + m[0].length;
    }
    if (last < text.length) {
      out.push(
        <span key={key++} className="whitespace-pre-wrap">
          {text.slice(last)}
        </span>,
      );
    }
    return out;
  }, [text, projectId]);

  return <div className={className}>{nodes}</div>;
}

/** Whether a description contains at least one renderable image ref. */
export function hasImageRef(text: string): boolean {
  return new RegExp(IMG_PATTERN).test(text);
}
