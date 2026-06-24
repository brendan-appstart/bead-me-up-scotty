"use client";
import { useNotificationWatcher } from "@/hooks/use-notifications";

/** Side-effect-only: raises opt-in notifications. Must render inside AppProvider. */
export function NotificationWatcher({ projectId }: { projectId: string }) {
  useNotificationWatcher(projectId);
  return null;
}
