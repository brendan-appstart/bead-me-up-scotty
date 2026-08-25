import "server-only";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import {
  AI_PROVIDERS,
  DEFAULT_AI_PROVIDER,
  aiProviderLabel,
  isAiProvider,
  type AiProvider,
} from "./ai-providers";

export type { AiProvider } from "./ai-providers";
export { AI_PROVIDERS, DEFAULT_AI_PROVIDER, isAiProvider } from "./ai-providers";

const pExecFile = promisify(execFile);
const MAX_OUT = 8 * 1024 * 1024;
const ASSIST_TIMEOUT_MS = 120_000;

export class AiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "AiError";
    this.code = code;
  }
}

function spec(id: AiProvider) {
  const s = AI_PROVIDERS.find((p) => p.id === id);
  if (!s) throw new AiError(`Unknown AI provider: ${id}`, "bad_provider");
  return s;
}

function binFor(id: AiProvider): string {
  const s = spec(id);
  return process.env[s.binEnv] || s.bin;
}

/**
 * Run a local coding CLI in print/exec mode with the prompt as an argument.
 *
 * Critically, stdin is `/dev/null` (stdio[0] = "ignore"). `execFile` would leave
 * an open stdin pipe, so some CLIs wait for piped input and stall. Closing stdin
 * makes them read the prompt from argv immediately. We only surface stderr when
 * the process actually exits non-zero.
 */
function childEnv(id: AiProvider): NodeJS.ProcessEnv {
  const env = { ...process.env };
  // A placeholder/invalid ANTHROPIC_API_KEY (e.g. "your_api_key_here" left in a
  // shell profile) takes precedence over the Claude Code subscription login and
  // makes the CLI fail with "Invalid API key". Real keys start with "sk-ant-";
  // drop anything else so we fall back to the existing Claude Code auth.
  if (env.ANTHROPIC_API_KEY && !env.ANTHROPIC_API_KEY.startsWith("sk-ant-")) {
    delete env.ANTHROPIC_API_KEY;
  }
  if (id === "opencode") {
    // Deny write/shell tools so `opencode run` cannot hang on a TTY prompt or
    // edit the repo. Refine with AI is suggestion-only.
    env.OPENCODE_PERMISSION = JSON.stringify({ edit: "deny", bash: "deny" });
  }
  return env;
}

function argsFor(id: AiProvider, prompt: string): string[] {
  switch (id) {
    case "claude":
      return ["-p", prompt];
    case "cursor":
      // Ask mode: answer only, no file edits. `--trust` skips the workspace
      // prompt so headless runs can finish.
      return ["-p", "--mode", "ask", "--output-format", "text", "--trust", prompt];
    case "codex":
      return ["exec", "--ephemeral", "--skip-git-repo-check", "--sandbox", "read-only", prompt];
    case "opencode":
      return ["run", prompt];
  }
}

function runProvider(
  id: AiProvider,
  prompt: string,
  timeoutMs: number,
  cwd?: string,
): Promise<string> {
  const bin = binFor(id);
  const label = aiProviderLabel(id);
  return new Promise((resolve, reject) => {
    const child = spawn(bin, argsFor(id, prompt), {
      stdio: ["ignore", "pipe", "pipe"],
      env: childEnv(id),
      cwd: cwd || undefined,
    });
    let stdout = "";
    let stderr = "";
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(() => reject(new AiError(`The ${label} CLI timed out.`, "timeout")));
    }, timeoutMs);
    child.stdout.on("data", (d: Buffer) => {
      stdout += d;
      if (stdout.length > MAX_OUT) {
        child.kill("SIGKILL");
        finish(() => reject(new AiError(`The ${label} CLI produced too much output.`, "overflow")));
      }
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d;
    });
    child.on("error", (err) =>
      finish(() =>
        reject(
          new AiError(
            `The ${label} CLI ("${bin}") could not be run. Install ${label} or set ${spec(id).binEnv}. (${(err as Error).message})`,
            "unavailable",
          ),
        ),
      ),
    );
    child.on("close", (code) =>
      finish(() => {
        if (code === 0) resolve(stdout);
        else reject(new AiError(stderr.trim() || `The ${label} CLI exited with code ${code}.`, "failed"));
      }),
    );
  });
}

export interface AssistInput {
  id: string;
  title: string;
  description: string;
  type: string;
  labels: string[];
  /** Candidate beads for duplicate detection (id + title only). */
  others: { id: string; title: string }[];
  provider?: AiProvider;
  cwd?: string;
}
export interface AssistResult {
  description: string;
  acceptance: string;
  labels: string[];
  duplicates: { id: string; title: string; reason: string }[];
}

export async function isProviderAvailable(id: AiProvider): Promise<boolean> {
  try {
    await pExecFile(binFor(id), ["--version"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function buildPrompt(input: AssistInput): string {
  const others = input.others
    .slice(0, 80)
    .map((o) => `- ${o.id}: ${o.title}`)
    .join("\n");
  return [
    "You are refining a software issue (a 'bead') so an engineer can pick it up cold.",
    "Improve it: rewrite the description into a clear, bounded scope; add acceptance criteria;",
    "propose a short markdown sub-task checklist; suggest labels; and flag likely duplicates",
    "from the candidate list (only if genuinely similar).",
    "Do not edit files or run shell commands. Respond with JSON only.",
    "",
    `BEAD ${input.id} [type: ${input.type}]`,
    `Title: ${input.title}`,
    `Current labels: ${input.labels.join(", ") || "(none)"}`,
    "Current description:",
    input.description || "(empty)",
    "",
    "Candidate beads (for duplicate detection):",
    others || "(none)",
    "",
    "Respond with ONLY a JSON object (no prose, no code fences) of the form:",
    '{"description": "<refined markdown — include an "## Acceptance criteria" section and a "- [ ]" checklist>",',
    '"acceptance": "<the acceptance criteria as plain text>",',
    '"labels": ["label1","label2"],',
    '"duplicates": [{"id":"<bead id from the candidates>","title":"<its title>","reason":"<why>"}]}',
    "Use [] for duplicates if none apply. Do not invent bead ids.",
  ].join("\n");
}

/** Extract the first balanced JSON object from arbitrary model output. */
function extractJson(out: string): string {
  const start = out.indexOf("{");
  const end = out.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new AiError("The model did not return JSON.", "bad_output");
  }
  return out.slice(start, end + 1);
}

export async function assistBead(input: AssistInput): Promise<AssistResult> {
  const provider = isAiProvider(input.provider) ? input.provider : DEFAULT_AI_PROVIDER;
  const s = spec(provider);
  const bin = binFor(provider);
  const label = s.label;

  if (!(await isProviderAvailable(provider))) {
    throw new AiError(
      `The ${label} CLI ("${bin}") was not found on PATH. Install ${label} or set ${s.binEnv}.`,
      "unavailable",
    );
  }
  const stdout = await runProvider(provider, buildPrompt(input), ASSIST_TIMEOUT_MS, input.cwd);

  let parsed: Partial<AssistResult>;
  try {
    parsed = JSON.parse(extractJson(stdout)) as Partial<AssistResult>;
  } catch (err) {
    if (err instanceof AiError) throw err;
    throw new AiError("Could not parse the model's response as JSON.", "bad_output");
  }

  const validIds = new Set(input.others.map((o) => o.id));
  return {
    description: typeof parsed.description === "string" ? parsed.description : input.description,
    acceptance: typeof parsed.acceptance === "string" ? parsed.acceptance : "",
    labels: Array.isArray(parsed.labels) ? parsed.labels.filter((l): l is string => typeof l === "string") : [],
    duplicates: Array.isArray(parsed.duplicates)
      ? parsed.duplicates
          .filter((d): d is { id: string; title: string; reason: string } => !!d && typeof d.id === "string")
          .filter((d) => validIds.has(d.id))
      : [],
  };
}
