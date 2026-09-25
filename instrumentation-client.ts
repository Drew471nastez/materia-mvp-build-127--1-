/**
 * Runs in the browser before the app does (Next's instrumentation-client).
 *
 * Two jobs, both needing to be first:
 *
 * Count the navigations the router starts, so the navigation bar can tell a
 * link the router followed from a link the page handled itself
 * (lib/ui/router-starts.ts). Next calls `onRouterTransitionStart`
 * synchronously inside the click that caused it, for a Link, a push and a
 * back or forward alike.
 *
 * Add the popstate listener a page with unsaved work holds Back with
 * (lib/ui/leave-guard.ts). It has to be added before the router adds its
 * own, which it does as the app starts: window listeners run in the order
 * they were added.
 */
import { noteRouterStart, watchRouterStarts } from "@/lib/ui/router-starts"
import { watchLeaveGuard } from "@/lib/ui/leave-guard"

watchRouterStarts()
watchLeaveGuard()

export function onRouterTransitionStart() {
  noteRouterStart()
}
