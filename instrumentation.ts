/**
 * Runs on the server as the app starts (Next's instrumentation).
 *
 * register: in the Node runtime, every console.error and console.warn on
 * the server becomes one JSON line with its route and request id, scrubbed
 * of tokens, keys, cookies and addresses (lib/net/console-guard.ts). The
 * routes that catch their own errors and log them with console.error are
 * structured this way without editing each one.
 *
 * onRequestError: every error a route, a page or a server action throws
 * reaches here, whether or not anybody wrote a catch for it, and goes to
 * lib/observability/report: one JSON log line (route, method, status,
 * request id, digest), counted in public.error_events, and the owner told
 * the first time (and at most hourly while it continues). Next then prints
 * the same error itself; the guard drops that second line, so each uncaught
 * error is logged once.
 */
import type { Instrumentation } from "next"

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installConsoleGuard } = await import("@/lib/net/console-guard")
    installConsoleGuard()
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const { reportError } = await import("@/lib/observability/report")
  const { requestIdFrom } = await import("@/lib/net/request-id")
  const { markLogged } = await import("@/lib/net/logged-once")
  const route = context.routePath || request.path.split("?")[0]
  markLogged(error)
  await reportError({
    source: "server",
    where: `${request.method} ${route}`,
    error,
    context: {
      route,
      method: request.method,
      /* What an uncaught error answers when nothing was sent yet (a page that had started streaming keeps its 200). */
      status: 500,
      routeType: context.routeType,
      routerKind: context.routerKind ?? null,
      renderSource: (context as { renderSource?: string }).renderSource ?? null,
      revalidateReason: context.revalidateReason ?? null,
      digest: (error as { digest?: string } | null)?.digest ?? null,
    },
    /* The id the proxy sent back as x-request-id: the row and the person's failed load are the same request. */
    requestId: requestIdFrom(request.headers),
  })
}
