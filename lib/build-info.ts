/**
 * Build metadata, baked in at build time by next.config.ts (git commit count +
 * short hash). Safe to import from client components — the values are inlined as
 * plain strings, no runtime git access. See bead wxu.
 */

/** owner/repo slug for this project's GitHub. */
export const GITHUB_REPO = "brendan-appstart/bead-me-up-scotty";

/** Sequential build number = `git rev-list --count HEAD` at build time. */
export const BUILD_NUMBER = process.env.NEXT_PUBLIC_BUILD_NUMBER || "";

/** 7-char short commit hash the build was produced from. */
export const BUILD_SHA = process.env.NEXT_PUBLIC_BUILD_SHA || "";

/** Link to a commit's comments section on GitHub. */
export function commitUrl(sha: string): string {
  return `https://github.com/${GITHUB_REPO}/commit/${sha}#commitcomments`;
}
