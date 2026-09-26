/**
 * ===========================================================================
 *  THE SCREEN WHILE ONE BUSINESS BECOMES THE OTHER
 * ===========================================================================
 * "When I switch between businesses, a loading state with text that changes
 * step by step until it loads, very smooth and clean, and then it switches.
 * And when I appear in the new /app, the elements appear smoothly."
 *
 * A switch is three real steps, and the screen says which one is happening:
 *
 *   ASKING    the server checks the link between the two accounts and makes
 *             a session for the other one (app/api/businesses/switch).
 *             "Switching to Loudlib", the moment the row is pressed.
 *   OPENING   the browser holds that session and asks for the other
 *             business's /app, which the server puts together from its
 *             products, orders and pages. "Opening Loudlib's store", on the
 *             page you were on and then on the first frame of the new one,
 *             so the words do not change as the document does.
 *   ARRIVING  the new /app has its script and draws its page; its pictures
 *             and figures come in. "Loading your dashboard", and only when
 *             that takes long enough to read (LINE_AFTER_MS): a step that is
 *             over at once is not shown just to be shown.
 *
 * A line, once up, stays LINE_MIN_MS so it can be read and its fade can end.
 * Those are the only waits of the screen's own: nothing here counts time to
 * look busy.
 *
 * Free of React and the DOM, so tests/business-accounts.test.ts holds the
 * words, the timing and the cookie to account.
 */

export type SwitchStep = "asking" | "opening" | "arriving"

/**
 * THE NAME, CLEANED. It is shown in the lines and carried across the reload
 * in a cookie this browser wrote, so it is plain text of a sensible length
 * whatever the cookie holds: no control characters, one space at a time,
 * sixty characters at most.
 */
export function cleanSwitchName(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  // eslint-disable-next-line no-control-regex
  const flat = raw.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, " ").replace(/\s+/g, " ").trim()
  if (!flat) return null
  return flat.length > 60 ? `${flat.slice(0, 59).trimEnd()}\u2026` : flat
}

/** The words for each step. `ready` is false for a business still being set up: it opens on its onboarding, not a store. */
export function switchLine(step: SwitchStep, name: string, { ready = true }: { ready?: boolean } = {}): string {
  if (step === "asking") return `Switching to ${name}`
  if (step === "opening") return ready ? `Opening ${name}'s store` : `Opening ${name}'s setup`
  return "Loading your dashboard"
}

/* ── Timing ─────────────────────────────────────────────────────────────── */

/** The screen comes up over the page you were on, on opacity alone. */
export const SCREEN_IN_MS = 140
/** One line gives way to the next: the old one out, the new one in, on opacity and a 4px move. */
export const LINE_FADE_MS = 200
/** How far a line moves as it fades: up and out, up and in. */
export const LINE_RISE_PX = 4
/** A line, once shown, stays at least this long: time to read it, and for its fade to end. */
export const LINE_MIN_MS = 450
/** A later step shows its line only once it has gone on this long; one over sooner is never shown. */
export const LINE_AFTER_MS = 300
/** The screen gives way to the new /app in one fade, with the page's own 2px rise under it. */
export const HANDOVER_MS = 200
/** The screen goes away over the business you are still in, when the switch did not happen. */
export const SCREEN_OUT_MS = 160

/**
 * When a step's line can show (performance.now() time): not before the step
 * began (plus LINE_AFTER_MS, unless it is to show at once), and not before
 * the line on screen has had its LINE_MIN_MS. The first line has nothing
 * before it (`shownAt` null) and shows at once.
 */
export function lineShowsAt(stepAt: number, shownAt: number | null, { atOnce = false }: { atOnce?: boolean } = {}): number {
  const earliest = atOnce ? stepAt : stepAt + LINE_AFTER_MS
  return shownAt == null ? earliest : Math.max(earliest, shownAt + LINE_MIN_MS)
}

/** When the screen can hand over to the page: once the page is ready, and the line on screen has had its time. */
export function handoverAt(readyAt: number, shownAt: number | null): number {
  return shownAt == null ? readyAt : Math.max(readyAt, shownAt + LINE_MIN_MS)
}

/** How long the arrival waits, at most, for the new /app to be ready to draw before it hands over anyway. */
export const ARRIVAL_CAP_MS = 8000
/** Of that, at most this long for the fonts, the first screen's pictures, and the parts of it still loading. */
export const ARRIVAL_SETTLE_CAP_MS = 1600
/** A part of the first screen marked aria-busy is waited for only when it is at least this big (px²): the chart, not a 40px pill. */
export const ARRIVAL_BUSY_MIN_AREA = 120 * 120

/* ── Across the reload ──────────────────────────────────────────────────── */

/**
 * THE COOKIE THAT CARRIES THE SCREEN ACROSS THE RELOAD. A switch loads the
 * new /app from scratch (lib/businesses/switch-client), so the screen on the
 * page you were on ends with that page. The browser keeps that page's last
 * frame on the glass until the new document paints, and the new document's
 * first paint is the server's HTML: app/app/layout.tsx reads this cookie and
 * draws the same screen with the same line in it, before any script. So
 * every frame is one screen or the other, and they are the same picture.
 *
 * Only /app is sent it, it lasts half a minute at most, and the new page
 * clears it as it hands over. It holds nothing but the name the menu showed.
 */
export const SWITCH_COOKIE = "storelib_switching"
export const SWITCH_COOKIE_MAX_AGE_S = 30

export function switchCookie(name: string, { secure = false }: { secure?: boolean } = {}): string {
  const clean = cleanSwitchName(name) ?? ""
  return `${SWITCH_COOKIE}=${encodeURIComponent(clean)}; Path=/app; Max-Age=${SWITCH_COOKIE_MAX_AGE_S}; SameSite=Lax${secure ? "; Secure" : ""}`
}

export function clearSwitchCookie({ secure = false }: { secure?: boolean } = {}): string {
  return `${SWITCH_COOKIE}=; Path=/app; Max-Age=0; SameSite=Lax${secure ? "; Secure" : ""}`
}

/** The name in the cookie, cleaned, or null for no cookie, an empty one, or one that is not ours. */
export function readSwitchCookie(value: string | undefined | null): string | null {
  if (!value) return null
  try {
    return cleanSwitchName(decodeURIComponent(value))
  } catch {
    return null
  }
}

/**
 * THE SPINNER DOES NOT JUMP AT THE RELOAD. It turns once a second (three
 * times slower with reduced motion, app/globals.css .activity-spinner), and
 * a new document starts it again from twelve o'clock. So on both pages its
 * turn is set from the wall clock: a negative delay of the time into the
 * current turn, which puts it at the same angle on the same millisecond on
 * either side of the reload. Set on <html> as --switch-spin-delay, by the
 * page you were on as the screen comes up and by the new document's HTML
 * before its first paint (SWITCH_SPIN_SCRIPT); app/globals.css applies it
 * to the screen's spinner only.
 */
export function spinDelay(nowEpochMs: number, reducedMotion: boolean): string {
  const turn = reducedMotion ? 3000 : 1000
  return `${-(nowEpochMs % turn)}ms`
}

export const SWITCH_SPIN_SCRIPT =
  `try{var r=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;document.documentElement.style.setProperty("--switch-spin-delay",-(Date.now()%(r?3000:1000))+"ms")}catch(e){}`
