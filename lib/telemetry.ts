import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Public ingestion-only project token: safe to distribute; never use a personal API key here.
const DEFAULT_POSTHOG_KEY = "phc_rgigo4YQzZwrhRSzFkpBt2ZUuiKkRbXvN9wrCmn6Er4a";

type State = { enabled: boolean };
type Options = {
  file: string;
  key?: string;
  host: string;
  version: string;
  now?: () => Date;
  send?: typeof fetch;
};

/** Only this allowlisted event leaves the machine. No bead/config/request data is accepted. */
export function createTelemetry(options: Options) {
  // An explicit empty token is an operator-level opt-out.
  const key = options.key ?? DEFAULT_POSTHOG_KEY;
  const now = options.now ?? (() => new Date());
  function read(): State {
    try {
      const value = JSON.parse(fs.readFileSync(options.file, "utf8"));
      if (typeof value?.enabled !== "boolean") return { enabled: false };
      return { enabled: value.enabled };
    } catch (e) {
      // A missing file is a new install. Unreadable/corrupt preferences must not undo opt-out.
      return { enabled: (e as NodeJS.ErrnoException).code === "ENOENT" };
    }
  }
  function write(state: State) {
    fs.mkdirSync(path.dirname(options.file), { recursive: true });
    const temp = `${options.file}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temp, JSON.stringify(state), { mode: 0o600 });
      fs.renameSync(temp, options.file);
    } finally {
      fs.rmSync(temp, { force: true });
    }
  }
  function settings() {
    return { enabled: read().enabled, configured: !!key.trim() };
  }
  function setEnabled(enabled: boolean) {
    write({ ...read(), enabled }); // Report save failures instead of pretending opt-out persisted.
    return settings();
  }
  function installationId(): string {
    const file = `${options.file}.id`;
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
      if (!fs.existsSync(file)) {
        fs.writeFileSync(temp, randomUUID(), { mode: 0o600 });
        // Publish a complete ID exclusively. Concurrent processes all use the winner.
        try { fs.linkSync(temp, file); }
        catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; }
      }
      const id = fs.readFileSync(file, "utf8");
      if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Invalid installation ID");
      return id;
    } finally { fs.rmSync(temp, { force: true }); }
  }
  // Publish complete records exclusively, including across independent server processes.
  // A crash before publication leaves no half-written record for another process to read.
  function reserve(file: string, value: unknown): boolean {
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temp, JSON.stringify(value), { mode: 0o600 });
      try { fs.linkSync(temp, file); return true; }
      catch (e) { if ((e as NodeJS.ErrnoException).code === "EEXIST") return false; throw e; }
    } finally { fs.rmSync(temp, { force: true }); }
  }
  async function capture(): Promise<void> {
    try {
      if (!key.trim()) return;
      const host = new URL(options.host);
      if (host.protocol !== "https:" || host.username || host.password) return;
      if (!read().enabled) return;
      fs.mkdirSync(path.dirname(options.file), { recursive: true });
      const id = installationId();
      const timestamp = now().toISOString();
      const day = timestamp.slice(0, 10);
      const days = `${options.file}.days`;
      fs.mkdirSync(days, { recursive: true });
      const complete = path.join(days, day);
      // Also honor legacy daily reservations, whose delivery status is unknown.
      if (fs.existsSync(complete)) return;
      const eventFile = `${complete}.event.json`;
      reserve(eventFile, { uuid: randomUUID(), timestamp, version: options.version });
      const event = JSON.parse(fs.readFileSync(eventFile, "utf8"));
      if (!/^[0-9a-f-]{36}$/.test(event.uuid) || typeof event.version !== "string" ||
          typeof event.timestamp !== "string" || event.timestamp.slice(0, 10) !== day ||
          !Number.isFinite(Date.parse(event.timestamp))) return;
      // At most three attempts, ten minutes apart, triggered only by current-day UI use.
      // Immutable attempt records survive crashes without a stale lock or endless retries.
      let claimed = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        const attemptFile = `${complete}.attempt-${attempt}.json`;
        if (reserve(attemptFile, timestamp)) { claimed = true; break; }
        const previous = Date.parse(JSON.parse(fs.readFileSync(attemptFile, "utf8")));
        if (!Number.isFinite(previous) || Date.parse(timestamp) - previous < 10 * 60_000) return;
      }
      if (!claimed || !read().enabled || fs.existsSync(complete)) return;
      const response = await (options.send ?? fetch)(new URL("/i/v0/e/", host).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(3000),
        body: JSON.stringify({
          api_key: key,
          event: "app_active",
          distinct_id: id,
          uuid: event.uuid,
          timestamp: event.timestamp,
          properties: {
            app_version: event.version,
            $process_person_profile: false,
            $geoip_disable: true,
          },
        }),
      });
      if (!response.ok) return;
      const acknowledgement = await response.json();
      if (acknowledgement === 1 || ((acknowledgement?.status === 1 || acknowledgement?.status === "Ok") &&
          !acknowledgement.quota_limited?.length)) reserve(complete, true);
    } catch {
      // Analytics must never interrupt use or log tokens / request details.
    }
  }
  return { settings, setEnabled, capture };
}
