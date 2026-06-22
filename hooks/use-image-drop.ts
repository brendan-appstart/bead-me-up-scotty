"use client";
import * as React from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";

/**
 * Drag-drop + clipboard-paste image uploading for a description textarea.
 * Uploads each image to the project's attachments store and inserts a markdown
 * image ref at the cursor. Used by the create dialog (with a draft bead id) and
 * the detail drawer (with the real bead id).
 */
export function useImageDrop({
  projectId,
  beadId,
  disabled,
  disabledMessage,
  textareaRef,
  value,
  onChange,
}: {
  projectId: string;
  beadId: string;
  disabled?: boolean;
  disabledMessage?: string;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
}) {
  const [uploads, setUploads] = React.useState(0);
  const [dragOver, setDragOver] = React.useState(false);

  // Keep the latest value in a ref so async uploads always splice into current text.
  const valueRef = React.useRef(value);
  React.useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const uploadFiles = React.useCallback(
    async (files: File[]) => {
      const images = files.filter((f) => f.type.startsWith("image/"));
      if (images.length === 0) return;
      if (disabled) {
        toast.error(disabledMessage || "Attachments aren't available here.");
        return;
      }
      const el = textareaRef.current;
      const start = el?.selectionStart ?? valueRef.current.length;
      const end = el?.selectionEnd ?? valueRef.current.length;

      const refs: string[] = [];
      for (const f of images) {
        setUploads((n) => n + 1);
        try {
          const { ref, name } = await api.attachments.upload(projectId, beadId, f);
          refs.push(`![${name}](${ref})`);
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setUploads((n) => n - 1);
        }
      }
      if (refs.length === 0) return;

      const cur = valueRef.current;
      const needsLeadingNl = start > 0 && cur[start - 1] !== "\n";
      const snippet = (needsLeadingNl ? "\n" : "") + refs.join("\n") + "\n";
      const next = cur.slice(0, start) + snippet + cur.slice(end);
      onChange(next);
      requestAnimationFrame(() => {
        const node = textareaRef.current;
        if (node) {
          node.focus();
          const pos = start + snippet.length;
          node.setSelectionRange(pos, pos);
        }
      });
    },
    [projectId, beadId, disabled, disabledMessage, textareaRef, onChange],
  );

  const onDrop = React.useCallback(
    (e: React.DragEvent) => {
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length === 0) return;
      e.preventDefault();
      setDragOver(false);
      void uploadFiles(files);
    },
    [uploadFiles],
  );

  const onDragOver = React.useCallback((e: React.DragEvent) => {
    if (Array.from(e.dataTransfer?.types ?? []).includes("Files")) {
      e.preventDefault();
      setDragOver(true);
    }
  }, []);

  const onDragLeave = React.useCallback(() => setDragOver(false), []);

  const onPaste = React.useCallback(
    (e: React.ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length === 0) return;
      e.preventDefault();
      void uploadFiles(files);
    },
    [uploadFiles],
  );

  return { uploading: uploads > 0, dragOver, onDrop, onDragOver, onDragLeave, onPaste };
}
