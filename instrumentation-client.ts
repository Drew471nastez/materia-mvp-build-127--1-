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
 *
 * Heal a tab that still holds the last deploy's code (lib/ui/stale-code.ts):
 * a lazy import that fails outside any error boundary, in a press or an
 * effect, reloads the page once, or on a page with something typed in it
 * shows a bar that offers to.
 */
import { noteRouterStart, watchRouterStarts } from "@/lib/ui/router-starts"
import { watchLeaveGuard } from "@/lib/ui/leave-guard"
import { guardDomAgainstTranslators } from "@/lib/ui/dom-guard"
import { watchStaleCode } from "@/lib/ui/stale-code"

guardDomAgainstTranslators()
watchRouterStarts()
watchLeaveGuard()
watchStaleCode()

export function onRouterTransitionStart() {
  noteRouterStart()
}
