/**
 * One-time notice about the default port move, shared by both launchers
 * (bin/bead-me-up-scotty.mjs and scripts/serve.mjs).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Tell existing users once that the default port moved from 3000, since the
 * browser keeps bookmarks, saved settings and notification permission per
 * origin, so they stay behind on the old one.
 */
export function noticePortMove() {
  // Same directory as configDir() in lib/config.ts.
  const dir = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "bead-me-up-scotty");
  const marker = path.join(dir, "port-19847-notice");
  if (fs.existsSync(marker)) return;
  if (fs.existsSync(path.join(dir, "config.json"))) {
    console.log(
      `\n  Scotty's default port moved from 3000 to 19847. Your browser keeps\n` +
        `  bookmarks, saved settings (theme, board preferences, WIP limits,\n` +
        `  notification preferences, palette recents) and notification permission\n` +
        `  per port, so they stay with http://localhost:3000. To keep using it, run\n` +
        `  \`scotty --port 3000\` or \`PORT=3000 npm run serve\`.\n` +
        `  This notice appears once.\n`,
    );
  }
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(marker, "");
  } catch {
    /* read-only config dir: the notice shows again next time */
  }
}
