import { subscribeBeadsChange } from "@/lib/beads-watch";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ projectId: string }> };

/** Keep the connection alive and let the server notice dead sockets. */
const HEARTBEAT_MS = 25_000;

/**
 * Server-Sent Events stream of beads changes for a project.
 *
 * The server watches the project's `.beads/` directory (see lib/beads-watch)
 * and emits a `change` event whenever it mutates. The client reacts by
 * refetching `/api/p/<projectId>/beads`, so this stream is signal-only — it
 * carries no bead data of its own.
 */
export async function GET(req: Request, { params }: Ctx) {
  const { projectId } = await params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      send(": connected\n\n");
      const unsub = subscribeBeadsChange(projectId, () =>
        send("event: change\ndata: 1\n\n"),
      );
      const heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsub();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      req.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
