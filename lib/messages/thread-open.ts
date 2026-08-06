"use client"

/**
 * One push animation, across two elements that replace each other.
 *
 * ---------------------------------------------------------------------------
 * The problem
 * ---------------------------------------------------------------------------
 * Opening a conversation renders `.thread-shell` twice: first from
 * loading.tsx while the server answers, then from thread.tsx when it has. Those
 * are two different DOM elements rendering the same class, and a CSS
 * `animation` belongs to an element — so:
 *
 *   · put the entrance on BOTH and the slide restarts from off-screen the
 *     moment the real thread replaces the shell. The conversation comes in
 *     twice.
 *   · put it on the SHELL ONLY and a fast server — which never renders the
 *     shell at all — gets no entrance. The screen just appears. Which is the
 *     inconsistency: the same tap animates or does not depending on how quickly
 *     the server happened to answer, and unpredictability reads as broken far
 *     more than slowness does.
 *
 * ---------------------------------------------------------------------------
 * A negative animation-delay is the whole trick
 * ---------------------------------------------------------------------------
 * `animation-delay: -120ms` starts an animation 120ms in. So the tap records
 * WHEN it happened, and every element that renders during the window applies
 * the same 300ms animation offset by however long has already passed.
 *
 * The shell starts it at 0. The thread replaces the shell 180ms later and picks
 * it up at 180ms. Neither restarts, and the result is one continuous slide that
 * does not care which element is on screen or how many times they swap. A
 * server fast enough to skip the shell entirely gets the animation from the
 * start, on the thread itself.
 *
 * Stored on `<html>` rather than in a module variable because loading.tsx and
 * thread.tsx are separate route-level modules that do not share an import graph
 * at runtime in the way a shared value would need, and the document is the one
 * thing both can reach that survives the route change between them.
 */

const ATTR = "data-thread-open-at"

/** How long the push takes. Must match `.thread-enter` in app/globals.css. */
export const THREAD_ENTER_MS = 300

/**
 * Record the moment a conversation was opened. Called on the tap, before the
 * navigation, so the clock starts with the finger rather than with whichever
 * element happens to render first.
 */
export function markThreadOpening(): void {
  try {
    document.documentElement.setAttribute(ATTR, String(Date.now()))
  } catch {
    /* the animation simply starts from 0 */
  }
}

/**
 * The `animation-delay` to apply right now, or null if there is no entrance to
 * play.
 *
 * Null in three cases, all of which correctly mean "do not animate":
 *   · nothing recorded — a deep link, a push notification, a cold reload, a
 *     back/forward gesture. None of those is a push from the inbox and none
 *     should slide in from the right.
 *   · the window has passed — a remount minutes later must not replay it.
 *   · the value is unreadable.
 *
 * Read during render, not in an effect: an effect runs after paint, so the
 * first frame would be the un-animated element and the slide would begin one
 * frame late from wherever it already was.
 */
export function threadEnterDelay(): string | null {
  try {
    const raw = document.documentElement.getAttribute(ATTR)
    if (!raw) return null
    const at = Number(raw)
    if (!Number.isFinite(at)) return null
    const elapsed = Date.now() - at
    if (elapsed < 0 || elapsed >= THREAD_ENTER_MS) return null
    return `-${Math.round(elapsed)}ms`
  } catch {
    return null
  }
}

/**
 * Forget the tap, so nothing replays it.
 *
 * Called once the animation can no longer be in flight. Without this, a
 * remount inside the window — React re-running an effect, a hot reload, a
 * refetch that swaps the element — would pick the entrance up again partway
 * through and slide a conversation that is already sitting still.
 */
export function clearThreadOpening(): void {
  try {
    document.documentElement.removeAttribute(ATTR)
  } catch {
    /* nothing to clear */
  }
}
