import "server-only";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const pExecFile = promisify(execFile);
const MAX_OUT = 8 * 1024 * 1024;

/**
 * Run the Claude CLI in print mode with the prompt as an argument.
 *
 * Critically, stdin is `/dev/null` (stdio[0] = "ignore"). `execFile` would leave
 * an open stdin pipe, so `claude` waits for piped input, prints "no stdin data
 * received in 3s, proceeding without it", and can fail. Closing stdin makes it
 * read the prompt from `-p` immediately. We only surface stderr (which includes
 * harmless connector/auth warnings) when the process actually exits non-zero.
 */
function childEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  // A placeholder/invalid ANTHROPIC_API_KEY (e.g. "your_api_key_here" left in a
  // shell profile) takes precedence over the Claude Code subscription login and
  // makes the CLI fail with "Invalid API key". Real keys start with "sk-ant-";
  // drop anything else so we fall back to the existing Claude Code auth.
  if (env.ANTHROPIC_API_KEY && !env.ANTHROPIC_API_KEY.startsWith("sk-ant-")) {
    delete env.ANTHROPIC_API_KEY;
  }
  return env;
}

function runClaude(prompt: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE_BIN, ["-p", prompt], { stdio: ["ignore", "pipe", "pipe"], env: childEnv() });
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
      finish(() => reject(new AiError("The Claude CLI timed out.", "timeout")));
    }, timeoutMs);
    child.stdout.on("data", (d: Buffer) => {
      stdout += d;
      if (stdout.length > MAX_OUT) {
        child.kill("SIGKILL");
        finish(() => reject(new AiError("The Claude CLI produced too much output.", "overflow")));
      }
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d;
    });
    child.on("error", (err) =>
      finish(() =>
        reject(
          new AiError(
            `The Claude CLI ("${CLAUDE_BIN}") could not be run. Install Claude Code or set CLAUDE_BIN. (${(err as Error).message})`,
            "claude_unavailable",
          ),
        ),
      ),
    );
    child.on("close", (code) =>
      finish(() => {
        if (code === 0) resolve(stdout);
        else reject(new AiError(stderr.trim() || `The Claude CLI exited with code ${code}.`, "claude_failed"));
      }),
    );
  });
}
// Mirrors the BD_BIN pattern: shell out to the user's local Claude CLI. No API
// key — it reuses the existing Claude Code / CLI auth on the machine.
const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";

export class AiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "AiError";
    this.code = code;
  }
}

export interface AssistInput {
  id: string;
  title: string;
  description: string;
  type: string;
  labels: string[];
  /** Candidate beads for duplicate detection (id + title only). */
  others: { id: string; title: string }[];
}
export interface AssistResult {
  description: string;
  acceptance: string;
  labels: string[];
  duplicates: { id: string; title: string; reason: string }[];
}

export async function isClaudeAvailable(): Promise<boolean> {
  try {
    await pExecFile(CLAUDE_BIN, ["--version"], { timeout: 5000 });
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
  if (!(await isClaudeAvailable())) {
    throw new AiError(
      `The Claude CLI ("${CLAUDE_BIN}") was not found on PATH. Install Claude Code or set CLAUDE_BIN.`,
      "claude_unavailable",
    );
  }
  const stdout = await runClaude(buildPrompt(input), 120_000);

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
