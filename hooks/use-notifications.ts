"use client";
import * as React from "react";
import { toast } from "sonner";
import { useActivity } from "@/hooks/use-beads";
import { useApp } from "@/components/app-context";
import { needsHuman } from "@/lib/beads-view";

/**
 * Opt-in desktop/toast notifications for Mission Control. Fires when an agent
 * finishes a bead, a bead becomes blocked, or a new bead is escalated for a
 * human decision. Built on the existing activity feed + beads (SSE-driven), so
 * no extra stream is opened. Preferences are per-device, so they live in
 * localStorage rather than the server-side app config.
 */

const PREFS_KEY = "bmus.notifications";

export interface NotifPrefs {
  enabled: boolean;
  finished: boolean;
  blocked: boolean;
  escalation: boolean;
}
const DEFAULTS: NotifPrefs = { enabled: false, finished: true, blocked: true, escalation: true };

export function loadPrefs(): NotifPrefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") as Partial<NotifPrefs>) };
  } catch {
    return DEFAULTS;
  }
}
function savePrefs(p: NotifPrefs) {
  if (typeof window !== "undefined") localStorage.setItem(PREFS_KEY, JSON.stringify(p));
}

type Permission = NotificationPermission | "unsupported";

export function useNotificationPrefs() {
  // This hook only runs in the Settings view, which is reached via client-side
  // view switching (never server-rendered), so reading localStorage in the lazy
  // initializer is safe and avoids a setState-in-effect.
  const [prefs, setPrefsState] = React.useState<NotifPrefs>(() => loadPrefs());
  const [permission, setPermission] = React.useState<Permission>(() =>
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "unsupported",
  );

  const setPrefs = React.useCallback((p: NotifPrefs) => {
    setPrefsState(p);
    savePrefs(p);
  }, []);

  const requestPermission = React.useCallback(async (): Promise<Permission> => {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    const res = await Notification.requestPermission();
    setPermission(res);
    return res;
  }, []);

  return { prefs, setPrefs, permission, requestPermission };
}

function fire(title: string, body: string) {
  // Always show an in-app toast; raise a desktop Notification when granted.
  toast(title, { description: body });
  if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
    try {
      new Notification(title, { body });
    } catch {
      /* some browsers throw if called outside a user gesture — ignore */
    }
  }
}

/**
 * Side-effect-only hook (mount once inside the app). Watches the activity feed
 * and the beads list and fires notifications for new agent-finished / blocked /
 * human-escalation events. Reads prefs fresh from localStorage on each tick so
 * Settings changes apply without shared state.
 */
export function useNotificationWatcher(projectId: string) {
  const { data } = useActivity(projectId);
  const { beads } = useApp();
  const items = data?.items;

  const lastSeenRef = React.useRef<string | null>(null);
  const seenHumanRef = React.useRef<Set<string> | null>(null);

  // Agent-finished / blocked, from the activity feed.
  React.useEffect(() => {
    if (!items) return;
    const newest = items[0]?.at ?? "";
    // First tick: establish a baseline so existing history doesn't all fire.
    if (lastSeenRef.current === null) {
      lastSeenRef.current = newest;
      return;
    }
    const prevSeen = lastSeenRef.current;
    lastSeenRef.current = newest;

    const prefs = loadPrefs();
    if (!prefs.enabled) return;
    for (const it of items) {
      if (it.at <= prevSeen) break; // items are newest-first
      if (it.origin !== "agent") continue;
      if (prefs.finished && it.action === "closed") {
        fire(`🤖 ${it.actor} finished ${it.issueId}`, it.title);
      } else if (prefs.blocked && it.action.startsWith("marked Blocked")) {
        fire(`⛔ ${it.issueId} is blocked`, it.title);
      }
    }
  }, [items]);

  // New human-escalations, from the beads list.
  React.useEffect(() => {
    const current = new Set(beads.filter(needsHuman).map((b) => b.id));
    if (seenHumanRef.current === null) {
      seenHumanRef.current = current;
      return;
    }
    const prevSeen = seenHumanRef.current;
    seenHumanRef.current = current;

    const prefs = loadPrefs();
    if (!prefs.enabled || !prefs.escalation) return;
    for (const b of beads.filter(needsHuman)) {
      if (!prevSeen.has(b.id)) fire(`🙋 Needs you: ${b.id}`, b.title);
    }
  }, [beads]);
}
