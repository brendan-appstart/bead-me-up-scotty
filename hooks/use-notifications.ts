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
const OPEN_BEAD_EVENT = "bmus:open-bead";

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

function currentProjectId(): string | null {
  if (typeof window === "undefined") return null;
  const match = /^\/p\/([^/]+)\/?$/.exec(window.location.pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/** Activate a notification without retaining a component callback that may have
 * been unmounted after the user switched projects. */
export function activateNotification(projectId: string, beadId: string) {
  if (typeof window === "undefined") return;
  if (currentProjectId() === projectId) {
    const event = new CustomEvent(OPEN_BEAD_EVENT, {
      cancelable: true,
      detail: { projectId, beadId },
    });
    // A transition can update the URL before the incoming AppShell listener is
    // mounted. In that narrow window, fall through to the URL landing route.
    if (!window.dispatchEvent(event)) return;
  }
  window.location.assign(`/p/${encodeURIComponent(projectId)}?bead=${encodeURIComponent(beadId)}`);
}

/** Registers the current AppShell as the live, project-scoped notification
 * target. The listener is discarded when a project shell unmounts. */
export function useNotificationActivation(projectId: string, openDetail: (id: string) => void) {
  React.useEffect(() => {
    const onOpenBead = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId?: string; beadId?: string }>).detail;
      if (detail?.projectId === projectId && detail.beadId) {
        event.preventDefault();
        openDetail(detail.beadId);
      }
    };
    window.addEventListener(OPEN_BEAD_EVENT, onOpenBead);
    return () => window.removeEventListener(OPEN_BEAD_EVENT, onOpenBead);
  }, [projectId, openDetail]);
}

function fire(title: string, body: string, projectId: string, beadId: string) {
  // Always show an in-app toast; raise a desktop Notification when granted.
  toast(title, { description: body });
  if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
    try {
      const notification = new Notification(title, { body });
      notification.onclick = () => {
        notification.close();
        window.focus();
        activateNotification(projectId, beadId);
      };
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
  const { beads, loading, error } = useApp();
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
        fire(`🤖 ${it.actor} finished ${it.issueId}`, it.title, projectId, it.issueId);
      } else if (prefs.blocked && it.action.startsWith("marked Blocked")) {
        fire(`⛔ ${it.issueId} is blocked`, it.title, projectId, it.issueId);
      }
    }
  }, [items, projectId]);

  // New human-escalations, from the beads list.
  React.useEffect(() => {
    // `beads` is an empty fallback while the query is loading. Waiting avoids
    // treating every existing human-labelled bead as a newly raised escalation.
    if (loading || error) return;
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
      if (!prevSeen.has(b.id)) {
        fire(`🙋 Needs you: ${b.id}`, b.title, projectId, b.id);
      }
    }
  }, [beads, error, loading, projectId]);
}
