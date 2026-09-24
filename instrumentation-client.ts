/**
 * Runs in the browser before the app does (Next's instrumentation-client).
 *
 * One job: count the navigations the router starts, so the navigation bar
 * can tell a link the router followed from a link the page handled itself
 * (lib/ui/router-starts.ts).
 * Next calls `onRouterTransitionStart` synchronously inside the click that
 * caused it, for a Link, a push and a back or forward alike.
 */
import { noteRouterStart, watchRouterStarts } from "@/lib/ui/router-starts"

watchRouterStarts()

export function onRouterTransitionStart() {
  noteRouterStart()
}
