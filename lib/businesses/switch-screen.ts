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

export type SwitchStep = "asking" | "opening" | "arriving" | "creating" | "starting"

/**
 * A NEW BUSINESS HAS THE SAME SCREEN, WITH ITS OWN TWO STEPS. "New business"
 * in the account menu makes an account and opens its setup (the creator
 * onboarding on /signup/success), which is a switch in all but name:
 *
 *   CREATING  the server makes the account, links it to the login and
 *             makes a session for it (app/api/businesses). "Setting up your
 *             new business", the moment the row is pressed.
 *   STARTING  the browser holds that session and asks for the setup page.
 *             "Opening your new business", on the page you were on, then
 *             on the setup page's first frame, the same words in the same
 *             place, until the setup's first step is ready to show.
 *
 * The setup is drawn on white, not in the app's frame, so this screen is
 * the plain white one (`surface: "plain"` in components/app/business-switch-
 * screen) on both sides of the reload.
 */
export const NEW_BUSINESS_STEPS = ["creating", "starting"] as const satisfies readonly SwitchStep[]

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
  if (step === "creating") return "Setting up your new business"
  if (step === "starting") return "Opening your new business"
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
/**
 * The most the arrival's screen is ever up once its script runs, on a timer
 * that needs no frame to be drawn. Past the app's session gate's own limit
 * (ten seconds, components/native-auth-gate), so the gate reaches its own end
 * first and the screen hands over to that, never to its cold start.
 */
export const ARRIVAL_HARD_CAP_MS = 15_000
/**
 * The most it is up if its script never runs at all (a phone that lost the
 * connection half way through loading it): the HTML's own timer, in
 * SWITCH_ARRIVAL_SCRIPT, takes it away, clears the cookie and gives the
 * canvas back. The script stops that timer as it takes over.
 */
export const ARRIVAL_GIVE_UP_MS = 20_000

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
 * clears it as it hands over. It holds nothing but the name and the photo
 * the menu showed: the screen's header draws the business you are going to
 * with them (components/app/shell-header-still), on both sides of the
 * reload, so the black bar is never an empty band.
 *
 * The photo follows the name after a line break, which a cleaned name can
 * never hold, so a cookie written before the photo was carried (a name
 * alone) still reads as that name.
 */
export const SWITCH_COOKIE = "storelib_switching"
export const SWITCH_COOKIE_MAX_AGE_S = 30

/**
 * THE PHOTO, CLEANED. Only a picture address the app itself would draw: an
 * https address, or a path on this site (never `//host`), of a sensible
 * length, with no spaces, quotes or control characters. Anything else is no
 * photo, and the header shows the initials.
 */
export function cleanSwitchPhoto(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const url = raw.trim()
  if (!url || url.length > 1000) return null
  // eslint-disable-next-line no-control-regex
  if (/[\s"'<>\\\u0000-\u001f\u007f]/.test(url)) return null
  if (url.startsWith("https://")) return url
  if (url.startsWith("/") && !url.startsWith("//")) return url
  return null
}

export function switchCookie(name: string, { secure = false, photo = null }: { secure?: boolean; photo?: string | null } = {}): string {
  const clean = cleanSwitchName(name) ?? ""
  const picture = clean ? cleanSwitchPhoto(photo) : null
  const value = picture ? `${clean}\n${picture}` : clean
  return `${SWITCH_COOKIE}=${encodeURIComponent(value)}; Path=/app; Max-Age=${SWITCH_COOKIE_MAX_AGE_S}; SameSite=Lax${secure ? "; Secure" : ""}`
}

export function clearSwitchCookie({ secure = false }: { secure?: boolean } = {}): string {
  return `${SWITCH_COOKIE}=; Path=/app; Max-Age=0; SameSite=Lax${secure ? "; Secure" : ""}`
}

export interface SwitchArrival {
  name: string
  photo: string | null
}

/** The name and photo in the cookie, cleaned, or null for no cookie, an empty one, or one that is not ours. */
export function readSwitchArrival(value: string | undefined | null): SwitchArrival | null {
  if (!value) return null
  let raw: string
  try {
    raw = decodeURIComponent(value)
  } catch {
    return null
  }
  const at = raw.indexOf("\n")
  const name = cleanSwitchName(at === -1 ? raw : raw.slice(0, at))
  if (!name) return null
  return { name, photo: at === -1 ? null : cleanSwitchPhoto(raw.slice(at + 1)) }
}

/** The name in the cookie, cleaned, or null for no cookie, an empty one, or one that is not ours. */
export function readSwitchCookie(value: string | undefined | null): string | null {
  return readSwitchArrival(value)?.name ?? null
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

/**
 * What the new /app's HTML runs just before it draws the screen (app/app/
 * layout.tsx): the spinner's turn (SWITCH_SPIN_SCRIPT), and the screen's
 * limit for a page whose script never runs. The screen is drawn by the
 * server, so it would otherwise stay over the page for as long as the page
 * had no script to take it away: after ARRIVAL_GIVE_UP_MS, unless the
 * script has taken over (components/app/business-switch-screen sets
 * __slSwitchOwned and stops this timer), it hides the screen, clears the
 * cookie and gives the canvas back. Nothing else is touched.
 */
export const SWITCH_ARRIVAL_SCRIPT =
  SWITCH_SPIN_SCRIPT +
  `try{window.__slSwitchGiveUp=setTimeout(function(){if(window.__slSwitchOwned)return;try{document.documentElement.classList.remove(${JSON.stringify("switch-arriving")});` +
  `document.cookie=${JSON.stringify(`${SWITCH_COOKIE}=; Path=/app; Max-Age=0; SameSite=Lax`)}+(location.protocol==="https:"?"; Secure":"");` +
  `var s=document.querySelectorAll("[data-business-switch-screen]");for(var i=0;i<s.length;i++)s[i].style.display="none"}catch(e){}},${ARRIVAL_GIVE_UP_MS})}catch(e){}`

/* ── The new document's first frame ─────────────────────────────────────── */

/**
 * ===========================================================================
 *  THE WHITE FRAME BETWEEN THE TWO DOCUMENTS, AND THE TWO THINGS THAT CLOSE IT
 * ===========================================================================
 * "Make sure there is no flash happening in that transition to the business
 * page. No flash or reload or anything like that."
 *
 * The screen is drawn on both sides of the reload and it is the same
 * picture, so the swap was supposed to show nothing. It still could, and
 * scripts/check-business-switch.mjs catches it when the new document does
 * not land in one piece (SPLIT_MS): the browser keeps the page before on
 * the glass only until it has a document it can lay out. The head and the
 * open <body> are enough for that. So the moment the stylesheet has applied
 * and the body has begun — and BEFORE the screen's own markup has been
 * parsed — the browser paints what the document says is there, which is
 * nothing at all: the canvas. Measured at 1440 and at 390, on a machine
 * slowed four times, that is ONE WHITE FRAME HELD FOR AS LONG AS THE REST OF
 * THE DOCUMENT TAKES: the mean light of the glass steps by 16 to 20 of 255
 * and a tenth of the picture changes between two frames. A megabyte of /app
 * over a real connection is exactly that shape.
 *
 * Two things close it, both from the <head>, both before the body is parsed,
 * and each enough on its own:
 *
 *   DO NOT PAINT YET. `<link rel=expect blocking=render>` naming the
 *   screen's own element tells the browser not to draw this document until
 *   that element has been parsed. Until then the page before stays on the
 *   glass — and the page before is the same screen — so the swap shows
 *   nothing at all. Browsers that do not know `rel=expect` ignore the link;
 *   it can never block for longer than the parse, because the rule ends
 *   when the parser does.
 *
 *   AND IF IT PAINTS ANYWAY, PAINT THE SCREEN. The canvas itself is given
 *   the screen's own two fields (app/globals.css html.switch-arriving): the
 *   bar's colour down to the bar's height, white under it. A browser with no
 *   `rel=expect` (Safari, the app's web view) then paints the screen's
 *   surface rather than a white page, and what is missing for those frames
 *   is the bar's name and photo and the spinner, not the whole picture.
 *
 * Both hang off the switch's own cookie, which is only sent to /app and is
 * cleared as the screen hands over, so nothing of this is on any other page
 * or after the switch is over.
 */
export const SWITCH_HTML_CLASS = "switch-arriving"
/**
 * What `rel=expect` names: a mark at the END of the screen, not the screen
 * itself (components/app/business-switch-screen). A browser stops blocking
 * the moment the element it was told to wait for is in the document, and on
 * the screen's own box that is its opening tag — bar, spinner and line still
 * to come. The mark is the last thing in it, so nothing of the screen is left
 * to parse when the browser starts drawing.
 */
export const SWITCH_SCREEN_ID = "business-switch-screen-ready"

export const SWITCH_FIRST_PAINT_SCRIPT =
  `try{if(/(^|;\\s*)${SWITCH_COOKIE}=[^;\\s]/.test(document.cookie)){document.documentElement.classList.add(${JSON.stringify(SWITCH_HTML_CLASS)});` +
  `try{var l=document.createElement("link");l.rel="expect";l.setAttribute("blocking","render");l.href="#${SWITCH_SCREEN_ID}";document.head.appendChild(l)}catch(e){}}}catch(e){}`
