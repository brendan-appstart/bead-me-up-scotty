import { expect, test } from "bun:test";
import { createInputSchema } from "@/lib/schema";
import {
  captureKeyAction,
  isQuickCaptureShortcut,
  todoCreateInput,
} from "@/components/quick-capture";

test("todo create payload is a task at P2, not backlog", () => {
  const payload = todoCreateInput("  Buy milk  ");
  expect(payload).toEqual({
    title: "Buy milk",
    issue_type: "task",
    priority: 2,
  });
  const parsed = createInputSchema.parse(payload);
  expect(parsed.issue_type).toBe("task");
  expect(parsed.priority).toBe(2);
  expect(parsed.backlog).toBe(false);
});

test("Escape cancels capture; Enter submits", () => {
  expect(captureKeyAction("Escape")).toBe("cancel");
  expect(captureKeyAction("Enter")).toBe("submit");
  expect(captureKeyAction("c")).toBe(null);
});

test("whitespace-only title is not a valid create payload", () => {
  expect(todoCreateInput("   ").title).toBe("");
  expect(() => createInputSchema.parse(todoCreateInput("   "))).toThrow();
});

test("C and Q are capture shortcuts without modifiers", () => {
  const none = { metaKey: false, ctrlKey: false, altKey: false };
  expect(isQuickCaptureShortcut({ key: "c", ...none })).toBe(true);
  expect(isQuickCaptureShortcut({ key: "Q", ...none })).toBe(true);
  expect(isQuickCaptureShortcut({ key: "c", metaKey: true, ctrlKey: false, altKey: false })).toBe(
    false,
  );
  expect(isQuickCaptureShortcut({ key: "n", ...none })).toBe(false);
});
