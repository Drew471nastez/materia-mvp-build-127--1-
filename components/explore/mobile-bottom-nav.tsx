"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { useLocale } from "@/components/locale-provider"
import { HomeIcon, InboxIcon, ProfileIcon, SearchIcon } from "./tab-icons"
import { triggerHaptic, warmHaptics } from "@/lib/native-bridge"
import { beginTabLeave, endTabLeave } from "@/lib/tab-leave"
import { createTapRescue, type TapRescue } from "@/lib/tap-rescue"
import { cn } from "@/lib/utils"
import { isSellFormRoute } from "@/lib/marketplace/sell-route"

// Module-scoped so sixty page navigations do not mean sixty counts: every
// mounted bar shares one number and one in-flight request, refreshed on mount
// only when stale and on window focus — the moment a reply is most likely
// waiting.
let unreadCache = { count: 0, at: 0 }
let unreadInflight: Promise<number> | null = null
const UNREAD_TTL = 30_000

function fetchUnread(): Promise<number> {
  if (unreadInflight) return unreadInflight
  unreadInflight = fetch("/api/messages/unread", { credentials: "include" })
    .then((r) => (r.ok ? r.json() : { count: 0 }))
    .then((d) => {
      unreadCache = { count: d?.count ?? 0, at: Date.now() }
      return unreadCache.count
    })
    .catch(() => unreadCache.count)
    .finally(() => {
      unreadInflight = null
    })
  return unreadInflight
}

/**
 * Depop/Vinted-style bottom tab bar for the mobile marketplace.
 * Home / Search / Sell (+) / Inbox / Profile. Fixed to the safe-area bottom.
 */
export function MobileBottomNav({
  active = "home",
  onSearch,
}: {
  active?: "home" | "search" | "sell" | "inbox" | "profile"
  /** Focus the feed search instead of navigating. */
  onSearch?: () => void
}) {
  const { t } = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  /**
   * The sheet is up. DERIVED FROM THE ROUTE, never stored.
   *
   * There used to be a `launching` boolean set when + was pressed and cleared
   * when the route changed, and it is the reason + sometimes did nothing: any
   * moment where the flag says "already launching" and the route disagrees is a
   * press that returns at the guard and opens nothing. Closing the sheet and
   * pressing + again inside the same frame did it; so did a push that the
   * router deduped. Both are rare, both are silent, and the second left + dead
   * until the app was restarted.
   *
   * A boolean that mirrors the route can drift from the route. This one IS the
   * route, so there is no state to get stuck: it is true exactly while
   * /products/new is open and false exactly when it is not. Same fix as the
   * image viewer's close latch and the sheet's own launch flag, and the same
   * lesson — if the truth is already somewhere, do not keep a copy of it.
   */
  const sheetOpen = isSellFormRoute(pathname)

  // The Profile tab points at /profile now, but the callers that compute
  // `active` still only know about /settings, so the tab would sit unlit on the
  // very screen it opened. Reading the path here lights it without every caller
  // having to learn the new route.
  const profileActive = active === "profile" || (pathname?.startsWith("/profile") ?? false)

  /**
   * The tab your finger just landed on, before the router has caught up.
   *
   * This is the whole of "smooth in between". A tap on a tab used to produce
   * nothing visible at all until the route committed: the haptic fired on
   * pointerdown, the click fired 60–120ms later on release, then the navigation
   * ran, and only when the new page committed did `active` change and the icon
   * fill. On a warm route that gap is short and on a cold one it is not, but it
   * is never zero — and for its whole length the bar is sitting there having
   * apparently ignored you.
   *
   * So the bar answers immediately and the page arrives behind it, which is what
   * a native tab bar does and why one feels instant even when it is not. The
   * optimistic value is dropped the moment the real `active` agrees, and on a
   * timer regardless — a navigation that never happens (a cancelled tap, a
   * failed route) must not leave the wrong tab lit for the rest of the session.
   */
  const [pressed, setPressed] = useState<string | null>(null)
  useEffect(() => {
    if (!pressed) return
    // Caught up: the route is here and `active` is the truth again.
    if (pressed === active || (pressed === "profile" && profileActive)) {
      setPressed(null)
      return
    }
    // Long enough to cover a cold route on a bad connection. It used to be
    // 1.4s, which is under the time a first visit to the sell form takes on 3G
    // — so the tab you were waiting on gave up and un-filled while its page was
    // still on the way, which looks exactly like the tap having been ignored.
    // The two cases that used to need this timer to be short are both handled
    // properly now: a tap that turns into a drag takes its own fill back
    // immediately (see lib/tap-rescue.ts), and a swallowed click is retried at
    // 220ms rather than waited out.
    const give = window.setTimeout(() => setPressed(null), 2400)
    return () => window.clearTimeout(give)
  }, [pressed, active, profileActive])

  /**
   * The + is turning because a FINGER said so, not because a route arrived.
   *
   * This is the whole of "the plus does not visibly rotate". The turn was
   * driven by `sheetOpen` alone — which is the URL — so it could not start
   * until the navigation committed, and the sheet starts rising on that same
   * commit. The bar is at the very bottom of the screen and the sheet climbs
   * from below it, so it covers the + within about two frames of the rise:
   * the rotation began at the exact moment the thing that hides it did. What
   * you saw was a + that sat still and then was gone, and the 440ms of easing
   * underneath it was played entirely behind the sheet.
   *
   * So the turn is started by the press, on pointerdown, and the whole gap
   * that used to be dead — finger down, router push, route commit, sheet rise
   * — is now the window it plays in. Same movement, moved to where it can be
   * seen.
   *
   * OPTIMISTIC, AND NEVER A GUARD. There used to be a `launching` boolean here
   * that the press READ, and it is documented above as the reason + sometimes
   * did nothing: any moment where the flag disagreed with the route was a
   * press that returned at the guard. This one is written by the press and
   * read only by the icon's transform. Nothing branches on it, so no value it
   * can hold will ever cost you a tap — the worst it can do is turn an icon.
   */
  const [turning, setTurning] = useState(false)
  useEffect(() => {
    if (!turning) return
    // The route caught up. `sheetOpen` is the truth again and holds the × on
    // its own, so the optimistic flag can go without the icon moving a degree.
    if (sheetOpen) {
      setTurning(false)
      return
    }
    // The sheet never arrived — a cancelled tap, a push that was dropped. Turn
    // back rather than leaving an × sitting over a screen that has no sheet on
    // it. Same 2.4s as the tab fill above, and for the same reason: long enough
    // to cover a cold route on a bad connection.
    const give = window.setTimeout(() => setTurning(false), 2400)
    return () => window.clearTimeout(give)
  }, [turning, sheetOpen])

  /** What the + SHOWS: the press if there is one, the route otherwise. */
  const plusOpen = sheetOpen || turning

  /** The tab the app is actually ON, whatever the bar may currently be showing. */
  const here = profileActive ? "profile" : active

  /** What the bar SHOWS: the tap if there is one, the route otherwise. */
  const shown = pressed ?? here

  const [unread, setUnread] = useState(unreadCache.count)
  useEffect(() => {
    let alive = true
    const refresh = () => void fetchUnread().then((n) => alive && setUnread(n))
    // The TTL is what makes this bar cheap, so focus has to respect it too:
    // this bar is mounted on every page, and a handler that refetched on every
    // focus regardless of age meant the cache only ever covered navigation, not
    // the alt-tabbing that actually dominates. Stale means stale in both paths.
    const refreshIfStale = () => {
      if (Date.now() - unreadCache.at <= UNREAD_TTL) return
      refresh()
    }
    refreshIfStale()
    window.addEventListener("focus", refreshIfStale)
    return () => {
      alive = false
      window.removeEventListener("focus", refreshIfStale)
    }
  }, [])

  // Every destination the bar can reach, prefetched as soon as the bar mounts —
  // which is on every page now. A tab tap then has nothing left to fetch: the
  // route is already in the client cache and the navigation is a render, not a
  // round trip. This is the difference between "instant" and "a second".
  useEffect(() => {
    for (const href of ["/", "/products/new", "/messages", "/profile", "/settings"]) {
      router.prefetch(href)
    }
  }, [router])

  // Navigate on the SAME tick as the tap. The spin used to be played first and
  // the navigation fired 170ms later, so every trip through this button carried
  // a deliberate sixth of a second before anything happened — which is exactly
  // what reads as the app being slow. The spin now runs alongside the
  // navigation instead of in front of it.
  /**
   * A TAP RESCUE FOR THE ROUTE.
   *
   * lib/tap-rescue.ts already guarantees the press reaches this function — it
   * exists because a browser does not always synthesise the click, and it is
   * driven by pointerdown so the gesture cannot be lost on the way in. What it
   * cannot promise is that the NAVIGATION arrives, and there are two ways for a
   * press that definitely happened to leave you looking at the same screen:
   *
   *   the push is lost. `router.push` is asynchronous and can be dropped —
   *   deduped against a URL the router thinks it is already on, or abandoned
   *   with an in-flight fetch when the app is backgrounded mid-transition. The
   *   URL never changes and nothing renders.
   *
   *   the push lands and the sheet does not. /products/new is an intercepted
   *   route: it renders into the layout's @modal slot, and if that slot has
   *   resolved to its `default` — which is nothing — the URL says the sell form
   *   is open while `children` carries on showing the screen you were already
   *   on. Silent, and indistinguishable from a dropped tap.
   *
   * So the press checks its own work. This is the same idea as the gesture
   * machine, one layer further out: do the thing, then confirm the thing
   * happened, and if it did not, do it the way that cannot fail.
   *
   * The two failures are told apart by the URL, because they need different
   * answers — a lost push is worth retrying as a client navigation, while a
   * navigation that landed on an empty slot will land on an empty slot again,
   * and only a document load will fix it.
   *
   * 700ms: past any warm navigation by a wide margin, short enough that the
   * fallback is a hesitation rather than a second attempt you have given up on.
   * In the ordinary case this timer fires, finds the sheet, and returns.
   */
  /** When the sell sheet was last asked for. See the guard inside. */
  const lastSell = useRef(0)

  const onSell = useCallback(() => {
    // Already open — the only case worth declining, and it is asked of the
    // route rather than of a flag that remembers having asked.
    if (sheetOpen) return
    /**
     * AND NOT TWICE INSIDE ONE PRESS.
     *
     * `sheetOpen` is derived from the pathname, which is the right source and
     * the wrong speed: a second call arriving milliseconds after the first sees
     * a URL that has not changed yet and pushes again. The gesture machine is
     * where that second call was coming from and it has been fixed there — this
     * is the floor under it, because "open the sell sheet twice" is worth
     * refusing from every direction, including ones nobody has found yet.
     *
     * A TIMESTAMP RATHER THAN A FLAG, and the difference is the whole reason
     * this is acceptable. The note above records why a `launching` boolean had
     * to be deleted: it was set on press and cleared on a route change, so any
     * moment the two disagreed left it stuck true and the + dead for the rest of
     * the session. This cannot stick — it expires by wall clock whatever else
     * goes wrong, and the worst case is one ignored press within 700ms of
     * another, which is not a press anybody makes on purpose.
     */
    const now = Date.now()
    if (now - lastSell.current < 700) return
    lastSell.current = now
    // The buzz already fired on pointerdown, with the finger rather than after
    // it — see the gesture machine below.
    router.push("/products/new")

    // The sheet's own root. One class, on the element in
    // components/sell/new-listing-form.tsx, present on every platform — the
    // media query that uses it is not what makes it true.
    const open = () =>
      window.location.pathname.startsWith("/products/new") && !!document.querySelector(".sell-sheet")

    /**
     * THE WATCHDOG THAT WAS CAUSING THE THING IT EXISTED TO PREVENT.
     *
     * It gave the navigation 700ms and then, if `.sell-sheet` was not in the
     * document, called `window.location.assign` — a full document load. But
     * 700ms is not a timeout for "the push was dropped", it is a timeout for
     * "this phone has not finished rendering a long form yet", and on a cold
     * route those are indistinguishable from here. So a navigation that was
     * working perfectly well got a hard reload dropped on top of it, and what
     * you saw was the sell page appearing, and then appearing again. It opened
     * twice because this opened it twice.
     *
     * Two changes, and they follow from what the two failures actually look
     * like:
     *
     *   THE ROUTE IS RIGHT, THE FORM IS NOT PAINTED YET. Not a failure at all —
     *   it is a render in progress. Waiting costs nothing and reloading throws
     *   away the work and shows the arrival a second time. So this case no
     *   longer escalates, ever; it just keeps looking.
     *
     *   THE ROUTE NEVER CHANGED. That is the real dropped push, it is
     *   detectable without guessing, and it is the only thing worth acting on.
     *
     * Polled rather than a single deadline, so a fast phone stops looking
     * almost immediately and a slow one is given the time it needs.
     */
    const started = Date.now()
    const watch = window.setInterval(() => {
      if (typeof document === "undefined" || open()) {
        window.clearInterval(watch)
        return
      }
      const waited = Date.now() - started
      if (waited < 4000) return
      /**
       * THE SECOND ROUTER.PUSH IS GONE, AND THAT IS THE WHOLE FIX.
       *
       * There used to be a retry here: if the URL had not changed within a
       * short window, push again. But `router.push` is asynchronous — a slow
       * phone, a cold route, a payload still in flight all look exactly like a
       * push that was dropped, because from here the only evidence either way
       * is a pathname that has not changed YET. So the retry fired on top of a
       * navigation that was working, and the sell page opened twice. Every
       * version of this double-open has been the recovery, never the press.
       *
       * There is no way to tell the two apart from out here, so this no longer
       * tries. One press is one `router.push`, always, and the only thing left
       * is a terminal case for the genuine dead end: after four seconds with
       * neither the route nor the form, a document load. That CANNOT open
       * anything twice — it replaces the page rather than adding to it — and
       * four seconds is long enough that no working navigation has ever
       * reached it.
       */
      window.clearInterval(watch)
      if (!open()) window.location.assign("/products/new")
    }, 150)
    // Never left running: this bar is mounted on every screen for the whole
    // session, and an interval per press would accumulate one per tap.
    window.setTimeout(() => window.clearInterval(watch), 6000)
  }, [sheetOpen, router])

  // Every tab answers the finger before the route does.
  //
  // A tab change has a render behind it however well it is warmed, and the gap
  // between touching a tab and seeing anything move is where the bar feels
  // sluggish — not in the milliseconds afterwards. The icon dips on press and
  // buzzes on the tap, both immediately, so the bar is never the thing you are
  // waiting on. The dip is a composited transform on one small element.
  const item = (key: string, icon: React.ReactNode, isActive: boolean) => (
    <span
      className={cn(
        "flex flex-col items-center gap-1 text-[10px]",
        isActive ? "font-semibold" : "font-medium",
        // The label does not move. A tab whose whole contents shrink under the
        // finger is a web affordance borrowed from buttons, and on a bar you
        // press dozens of times a session it reads as cheap — a native tab bar
        // never does it. The ICON dips, which is `.tab-press` on the glyph
        // below: small, immediate, and over before the navigation starts.
        "transition-colors duration-150 ease-out",
        isActive ? "text-neutral-900" : "text-neutral-400",
      )}
    >
      {icon}
      {t(key)}
    </span>
  )

  /**
   * A whole fifth of the bar, not just the glyph inside it.
   *
   * Each tab was an inline element hugging its own icon and label, so the
   * target was roughly 24px wide with dead space either side of it — press a
   * centimetre off and nothing happened at all. Stretching every tab to fill
   * its column means the miss is impossible: anywhere in that band is the tab.
   * The visual is unchanged; only the region that answers you grew.
   */
  const TAB =
    "group flex min-h-[54px] flex-1 flex-col items-center justify-center [-webkit-tap-highlight-color:transparent] touch-manipulation select-none"

  /**
   * ONE TAP, FROM THE FINGER LANDING TO THE PAGE BEING THERE.
   *
   * The bug this exists to kill: sometimes you press a tab, the icon fills —
   * and the app stays exactly where it was, then un-fills a second later as if
   * nothing had been pressed at all.
   *
   * The whole of the diagnosis and the fix is in lib/tap-rescue.ts, which is
   * where it lives rather than here because a gesture machine written inside a
   * component can only be tested by driving a browser at a real bottom bar. In
   * short: the fill was driven by `pointerdown` and the navigation by `click`,
   * and a browser only synthesises that click when it decides the gesture was a
   * tap — a few pixels of thumb drift, a page still carrying scroll momentum,
   * or a notification landing mid-press are each enough for it not to. All
   * three fire pointerdown and no click, which is exactly "it fills and goes
   * nowhere", and exactly why it is intermittent.
   */
  type TabKey = "home" | "search" | "sell" | "inbox" | "profile"
  type Intent = { key: TabKey; href?: string; run?: () => void }

  /**
   * Read by the gesture machine, which is created once and therefore cannot
   * close over this render's `here`, `router` or `onSearch`. A ref reassigned
   * every render is the cheapest correct way to give a long-lived object a
   * fresh view of a component that re-renders under it.
   */
  const nav = useRef({ here, router, endTabLeave, beginTabLeave })
  nav.current = { here, router, endTabLeave, beginTabLeave }

  const rescue = useRef<TapRescue<Intent> | null>(null)
  if (!rescue.current) {
    rescue.current = createTapRescue<Intent>({
      // On POINTERDOWN, not click. A haptic is meant to be the bar answering
      // your finger, and click fires on release — so the buzz was arriving
      // after the press had already finished, which reads as confirmation of
      // something you had noticed rather than as feedback. Down is when the
      // finger lands, which is when a physical button would have clicked.
      onPress: (intent) => {
        void triggerHaptic("light")
        setPressed(intent.key)
        // THE TURN STARTS HERE, on the frame the finger lands, so it plays
        // across the navigation instead of behind the sheet that navigation
        // raises. Deliberately a separate statement from the `return` below:
        // that one is about the page BEHIND not dipping, this one is about the
        // icon in front turning, and folding them together would tie two
        // unrelated decisions to one line.
        if (intent.key === "sell") setTurning(true)
        // The screen starts leaving NOW, not when the route is ready. See
        // lib/tab-leave.ts — this is the first half of the switch, and the
        // reason a tab change no longer begins with a stationary screen.
        //
        // NOT FOR THE +, and that exception is the whole point of it.
        //
        // The dip exists because a tab change is a HANDOVER: the screen you are
        // on is going away, so it starts moving under your finger and the new
        // one takes over. Nothing about that is true of the sell sheet. It
        // slides up OVER the screen you are on, that screen stays mounted, and
        // you come back to it — so dipping it to 0.88 and releasing it on
        // commit is the page behind dimming and brightening again while the
        // sheet travels across it. Which is exactly the flash: the listings
        // behind the rising sheet visibly changing brightness for no reason
        // anybody could name.
        //
        // Keyed off the intent rather than the href, so it stays true if the
        // sheet ever moves to a different path.
        if (intent.key === "sell") return
        if (intent.href && intent.key !== nav.current.here) nav.current.beginTabLeave()
      },
      // The press turned out not to be a tap. Take the fill back at once
      // rather than leaving the wrong icon lit until a timeout notices, and
      // let the screen come back up.
      onAbandon: () => {
        setPressed(null)
        // The press turned out to be a drag. Turn the + back at once — the same
        // promise the tab fill makes, kept by the one icon that is not a fill.
        setTurning(false)
        nav.current.endTabLeave()
      },
      // The click was swallowed. Do what it would have done.
      onRescue: (intent) => {
        if (intent.run) {
          intent.run()
          return
        }
        if (!intent.href) return
        // It may have been swallowed, or it may have worked and simply not
        // finished yet. `location` is updated by the router the moment a
        // navigation commits, so this is the one check that tells "nothing
        // happened" from "it happened" without guessing at timing.
        if (window.location.pathname === intent.href) return
        nav.current.router.push(intent.href)
      },
    })
  }

  useEffect(() => {
    const r = rescue.current
    return () => r?.dispose()
  }, [])

  const handlers = (intent: Intent) => ({
    onPointerDown: (e: React.PointerEvent) => rescue.current?.down(intent, e.clientX, e.clientY),
    onPointerMove: (e: React.PointerEvent) => rescue.current?.move(e.clientX, e.clientY),
    onPointerUp: () => rescue.current?.up(),
    onPointerCancel: () => rescue.current?.cancel(),
    // A <Link> navigates on its own and carries no `run`. The two tabs that do
    // something instead of going somewhere — search opens an overlay, sell
    // starts the spin — put that work in the intent, so the click path and the
    // rescue path run exactly the same thing rather than two copies of it.
    onClick: () => {
      // FALSE MEANS THE RESCUE ALREADY DID THIS. The grace period is 220ms and a
      // synthesised click can arrive later than that on a busy frame — in which
      // case the rescue has already run `intent.run` and running it again is one
      // press opening two sheets. See the note on `spent` in lib/tap-rescue.ts.
      if (rescue.current?.click() === false) return
      intent.run?.()
    },
  })

  return (
    <nav
      // OPAQUE, and no backdrop blur. Two reasons, and the second one is the
      // grey fade under the sell sheet's Publish button.
      //
      // A `backdrop-filter` on a bar pinned over a scroller is recomputed
      // against fresh content on every frame of that scroll — the most
      // expensive thing on the screen, in service of an effect nobody asked
      // for. The sell form's own action bar says exactly this about itself and
      // is opaque for exactly this reason; this bar is on EVERY page.
      //
      // And it sits UNDER the sell sheet at z-80. Whenever the sheet is a few
      // pixels short of the bottom — it is sized to the visible viewport so its
      // buttons clear the keyboard — this strip showed through: 95% white with
      // a blur, over a full-bleed reels photograph, which is a smudged grey
      // band that reads unmistakably as a shadow the Publish button is casting.
      // Opaque white cannot do that whatever ends up behind it.
      className="z-40 shrink-0 border-t border-neutral-200 bg-white"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="mx-auto flex max-w-lg items-stretch px-1 pt-1 pb-1">
        <Link href="/" prefetch {...handlers({ key: "home", href: "/" })} aria-label={t("mfeed.home")} className={TAB}>
          {item("mfeed.home", <HomeIcon active={shown === "home"} className="tab-press h-[25px] w-[25px]" />, shown === "home")}
        </Link>

        <button
          type="button"
          {...handlers({ key: "search", run: () => onSearch?.() })}
          aria-label={t("mfeed.search")}
          className={TAB}
        >
          {item("mfeed.search", <SearchIcon active={shown === "search"} className="tab-press h-[25px] w-[25px]" />, shown === "search")}
        </button>

        <button
          type="button"
          {...handlers({ key: "sell", href: "/products/new", run: onSell })}
          aria-label={t("mfeed.sell")}
          // The same target every other tab gets, including the two utilities
          // this button was missing: `[-webkit-tap-highlight-color:transparent]`
          // and `touch-manipulation`. Their absence is half of the "cheap"
          // press — a WebView paints its own grey plate over an untreated
          // button the moment it is touched, so the purple circle went dull
          // under the finger and lit again on release. That flash is the
          // platform's, it is not on any curve, and it cannot be tuned; it can
          // only be turned off.
          className={TAB}
        >
          <span
            // NO SCALE ON PRESS, and no transition left to carry one. This was
            // `group-active:scale-95` over `transition-transform duration-200`,
            // and it is the bump.
            //
            // A 5% shrink on a 48px circle is two and a half pixels, taken and
            // given back on a curve nobody chose, and it fires on `:active` —
            // which the browser sets and clears on ITS schedule, not the
            // gesture's. So it landed a beat late, ran across the rotation, and
            // on a cancelled press snapped back with no easing at all. Two
            // transforms of different lengths on nested elements, started by
            // different events, is the whole recipe for cheap.
            //
            // The press is already answered twice, and better: a haptic on the
            // frame the finger lands, and the turn starting on that same frame.
            // A squash is a third answer to a question asked once. `item()`
            // above makes exactly this argument about exactly this scale.
            className="flex h-12 w-12 items-center justify-center rounded-full text-white"
            style={{
              background: "linear-gradient(150deg, #8b5cf6 0%, #7c3aed 100%)",
              boxShadow: "0 6px 18px -4px rgba(124, 58, 237, 0.55), 0 2px 6px -1px rgba(124, 58, 237, 0.35)",
            }}
          >
            {/* A TRANSITION, not a keyframe animation.
                `plus-launch` was `animation: … forwards` — it played once, to
                135°, and stayed there. Coming back was a class being removed,
                which is not an animation at all: the icon snapped from an × to
                a + in one frame. And an animation always restarts from its
                first keyframe, so tapping + again mid-turn jumped back to 0
                before setting off.
                A transition has neither problem. It runs both ways for free and
                reverses from wherever it has got to, so a tap and an immediate
                close is one continuous movement.

                Driven by `plusOpen`, NOT by `sheetOpen`. The route commits and
                the sheet starts climbing on the same tick, and this bar is the
                first thing the sheet covers — so a turn keyed to the route was
                a turn that began behind the thing hiding it. `plusOpen` is true
                from the press, which is the only version of this you can
                actually watch. The curve and its length are in globals.css. */}
            {/* THE TURN IS ON A SPAN, NOT ON THE ICON.

                `data-open` was set on <Plus>, which is a component, not an
                element — whether it reaches the DOM at all depends on that
                library forwarding unknown props to its <svg>. When it does not,
                the attribute never lands, the selector never matches, and the
                rotation does not happen: no error, no warning, and CSS that
                reads exactly right. This is a plain HTML element, so the
                attribute is on it because it was written on it. */}
            <span
              className="plus-turn flex h-6 w-6 items-center justify-center"
              data-open={plusOpen ? "true" : "false"}
            >
              <Plus className="h-6 w-6" strokeWidth={2.6} />
            </span>
          </span>
        </button>

        <Link
          href="/messages"
          prefetch
          {...handlers({ key: "inbox", href: "/messages" })}
          aria-label={t("mfeed.inbox")}
          className={cn(TAB, "relative")}
        >
          {item(
            "mfeed.inbox",
            <span className="relative">
              <InboxIcon active={shown === "inbox"} className="tab-press h-[25px] w-[25px]" />
              {/* A DOT, not a count.
                  
                  A number on a tab is a number you cannot act on: it tells you
                  "four" while giving you nothing to do about any of them, and
                  it has to shout to be legible at ten pixels — bold white on
                  brand purple with a ring around it, which on a bar of quiet
                  grey glyphs is the loudest thing on the screen by some
                  distance. The count is a fact about a LIST, and it is already
                  in the list, on the rows it belongs to.
                  
                  What a tab needs to say is only "there is something here",
                  and a dot says exactly that in eight pixels. It is what
                  Instagram and Depop both settled on, for the same reason.
                  
                  The white ring stays: it is what keeps the dot legible where
                  it overlaps the glyph, and it is one pixel. */}
              <span
                aria-label={unread > 0 ? `${unread} necitite` : undefined}
                className="unread-dot absolute -right-[3px] -top-[2px] h-[8px] w-[8px] rounded-full bg-[#7c3aed] ring-[1.5px] ring-white"
                data-on={unread > 0 ? "1" : undefined}
              />
            </span>,
            shown === "inbox",
          )}
        </Link>

        {/* Your profile, not the seller settings form. This used to open
            /settings, which redirected anyone without a creators row into
            onboarding — so for every buyer the Profile tab simply did not
            work. Settings is still one tap away, behind the gear up there. */}
        <Link
          href="/profile"
          prefetch
          {...handlers({ key: "profile", href: "/profile" })}
          aria-label={t("mfeed.profile")}
          className={TAB}
        >
          {item("mfeed.profile", <ProfileIcon active={shown === "profile"} className="tab-press h-[25px] w-[25px]" />, shown === "profile")}
        </Link>
      </div>
    </nav>
  )
}
