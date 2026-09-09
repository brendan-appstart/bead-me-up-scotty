import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

type State = { enabled: boolean };
type Options = {
  file: string;
  key: string;
  host: string;
  version: string;
  now?: () => Date;
  send?: typeof fetch;
};

/** Only this allowlisted event leaves the machine. No bead/config/request data is accepted. */
export function createTelemetry(options: Options) {
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
    return { enabled: read().enabled, configured: !!options.key.trim() };
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
  async function capture(): Promise<void> {
    try {
      if (!options.key.trim()) return;
      const host = new URL(options.host);
      if (host.protocol !== "https:" || host.username || host.password) return;
      if (!read().enabled) return;
      fs.mkdirSync(path.dirname(options.file), { recursive: true });
      const id = installationId();
      const timestamp = now().toISOString();
      const day = timestamp.slice(0, 10);
      const days = `${options.file}.days`;
      fs.mkdirSync(days, { recursive: true });
      // A permanent, exclusive reservation for this day, not a process lock.
      // A crash can miss one day, but cannot block tomorrow or overwrite opt-out.
      const claim = fs.openSync(path.join(days, day), "wx", 0o600);
      fs.closeSync(claim);
      if (!read().enabled) return;
      await (options.send ?? fetch)(new URL("/i/v0/e/", host).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(3000),
        body: JSON.stringify({
          api_key: options.key,
          event: "app_active",
          distinct_id: id,
          timestamp,
          properties: {
            app_version: options.version,
            $process_person_profile: false,
            $geoip_disable: true,
          },
        }),
      });
      // No retries or backfill: offline/failed days may be undercounted.
    } catch {
      // Analytics must never interrupt use or log tokens / request details.
    }
  }
  return { settings, setEnabled, capture };
}
