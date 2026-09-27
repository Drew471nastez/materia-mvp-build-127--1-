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
 *
 * Let React survive a translated page (lib/ui/dom-guard.ts): a browser's
 * translator swaps the text nodes React holds, and without this the next
 * insert or removal next to one of them throws and takes the page. First,
 * because it has to be in place before React makes its first node.
 */
import { noteRouterStart, watchRouterStarts } from "@/lib/ui/router-starts"
import { watchLeaveGuard } from "@/lib/ui/leave-guard"
import { guardDomAgainstTranslators } from "@/lib/ui/dom-guard"

guardDomAgainstTranslators()
watchRouterStarts()
watchLeaveGuard()

export function onRouterTransitionStart() {
  noteRouterStart()
}
