/**
 * Runs on the server as the app starts (Next's instrumentation).
 *
 * onRequestError: every error a route, a page or a server action throws
 * reaches here, whether or not anybody wrote a catch for it, and goes to
 * lib/observability/report: counted in public.error_events, and the owner
 * told the first time (and at most hourly while it continues). Without this
 * an error that nobody caught existed only in the Vercel log.
 */
import type { Instrumentation } from "next"

export function register() {}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const { reportError } = await import("@/lib/observability/report")
  await reportError({
    source: "server",
    where: `${request.method} ${context.routePath || request.path.split("?")[0]}`,
    error,
    context: {
      routeType: context.routeType,
      renderSource: (context as { renderSource?: string }).renderSource ?? null,
      digest: (error as { digest?: string } | null)?.digest ?? null,
    },
  })
}
