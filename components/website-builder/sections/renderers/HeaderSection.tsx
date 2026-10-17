"use client"

// ============================================================
// Storelib Theme Engine — HeaderSection
// Extracted from SectionRenderer.tsx (Stage 2 refactor).
// Contains: MobileNavItem type,
// HeaderMobileNavDrawer, MobileDrawerInner, HeaderSection.
// These are tightly coupled — the drawers are only used by
// HeaderSection — so they all live in this file together.
// Behaviour is identical to the inline version they replaced.
// ============================================================

import {
  ChevronDown, ChevronLeft, ChevronRight,
  Heart, Menu, Minus, Plus, Search, ShoppingBag, Trash2, User, X,
} from "lucide-react"
import { useCallback, useState, useEffect, useRef, useLayoutEffect, type CSSProperties } from "react"
import { createPortal } from "react-dom"
import { ThemeSocials } from "../../theme/ThemeSocials"
import { cn } from "@/lib/utils"
import { DRAWER_BACKDROP_Z, DRAWER_CLOSE_MS, DRAWER_PANEL_Z, drawerSafeArea, prefersStill, useBackdropDismiss, useComposedRef, useDrawerFrame, useDrawerMotion, useDrawerPresence, useDrawerSwipe, useDrawerTouchGuard, useFocusTrap } from "../../drawer-frame"
import { useDrawerHost } from "../../site-drawer-host"
import { SearchModal } from "../../header-search-modal"
import { SHOP_PATH } from "@/lib/website-builder/live-links"
import { followSectionLink } from "@/lib/website-builder/section-motion"
import { useSiteCart } from "../../site-cart"
import { useAmountMoney, useCartMoney, useStorefront, useWord } from "../../theme/storefront-context"
import { CartReturnsNote } from "../../theme/shop-commerce"
import { CartOfferSavings, CartOfferSuggestions, useCartOffers } from "@/components/offers/cart-offers"
import { lineKey } from "@/lib/website-builder/cart"
import { cartPathFor, drawerCheckout } from "@/lib/website-builder/cart-checkout"
import { headerIconOn } from "@/lib/website-builder/header-icons"
import { headerGap, headerPad } from "@/lib/website-builder/header-spacing"
import { useSiteWishlist } from "../../site-wishlist"
import type { ColorSchemeKey, ColorSchemeValues } from "@/lib/website-builder/types"
import {
  type SectionProps,
  sectionColors,
  schemeButton,
  str,
  bool,
  hexToRgba,
  buttonRadiusStyle,
  SectionWrapper,
} from "../_shared"
import { useStorelibPage } from "../storelib-sources"
import { cleanMenus } from "@/lib/storelib-theme/values"
import { desktopDrawerEdge, desktopMenu, drawerClosedTransform, headerBorderHere, headerMenuBlocks, headerMenuHandleOf, isMenuButton, logoFontStack as wordmarkFont, logoParts, mobileMenuStyle, searchMode, transparentHere, type MobileMenuStyle } from "@/lib/website-builder/header-settings"
import { MENU_DRAWER_MAX_WIDTH, drawerEdgeHere, menuDrawerExists } from "@/lib/website-builder/header-drawers"

// ── Header color schemes ─────────────────────────────────────
type HeaderColorScheme = ColorSchemeKey

export type MobileNavItem = {
  id: string
  label: string
  href: string
  openInNew: boolean
  children?: MobileNavItem[]
}

/** The drawers' close, shared with the cart. Links wait for it before navigating. */
const CLOSE_MS = DRAWER_CLOSE_MS

/** The header's call to action, as the drawer needs it. */
export interface DrawerCta {
  text: string
  url: string
  /** The scheme button's colours as custom properties: see schemeButton. */
  style: CSSProperties
}

export function HeaderMobileNavDrawer({
  open,
  onClose,
  items,
  scheme,
  scopedToPreview,
  onEditorNavigate,
  showAccount,
  showWishlist,
  showSearch,
  cta,
  onOpenSearch,
  menuStyle = "left",
  phoneOnly,
  below,
}: {
  /** Header › Menu on phones: from the left, from the right, or over the whole screen. */
  menuStyle?: MobileMenuStyle
  /** Published: hidden by CSS from the tablet breakpoint up, where the header has its links in the row. */
  phoneOnly?: boolean
  /** The header: the menu opens under it and leaves it showing. */
  below?: { current: HTMLElement | null }
  open: boolean
  onClose: () => void
  items: MobileNavItem[]
  scheme: ColorSchemeValues
  scopedToPreview?: boolean
  onEditorNavigate?: (href: string, fromNav?: boolean) => void
  showAccount?: boolean
  showSearch?: boolean
  showWishlist?: boolean
  cta?: DrawerCta | null
  /** Set when the header opens search in itself rather than on a page. */
  onOpenSearch?: (() => void) | null
}) {
  /*
    The pin, the scroll lock and the portal target are the same problem for
    the cart drawer, so they live in one place. See components/website-builder
    /drawer-frame.ts for the three bugs they answer.
  */
  const { mounted, target, positionClass, frameStyle, inset } = useDrawerFrame(open, !!scopedToPreview, onClose, below)
  /* Only in the page while open or closing: see useDrawerPresence. */
  const present = useDrawerPresence(open)
  if (!mounted || !target || !present) return null

  // Filter out empty/placeholder items so the drawer only shows real links
  const visibleItems = items.filter(it => it.label && it.label.trim().length > 0)

  const drawer = (
    <MobileDrawerInner
      /* A new node per style, so a changed setting never inherits the old edge's transform. */
      key={menuStyle}
      open={open}
      onClose={onClose}
      visibleItems={visibleItems}
      scheme={scheme}
      positionClass={positionClass}
      frameStyle={frameStyle}
      onEditorNavigate={onEditorNavigate}
      scopedToPreview={!!scopedToPreview}
      showAccount={!!showAccount}
      showSearch={showSearch !== false}
      showWishlist={!!showWishlist}
      cta={cta ?? null}
      onOpenSearch={onOpenSearch ?? null}
      menuStyle={menuStyle}
      phoneOnly={!!phoneOnly}
      underHeader={inset > 0}
    />
  )

  return createPortal(drawer, target)
}


/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE BAG
 * ═══════════════════════════════════════════════════════════════════════════
 * It takes its colour from the header it sits in — `currentColor`, set by the
 * icon row — so it belongs to whichever scheme the creator chose rather than
 * carrying a colour of its own.
 *
 * The count waits for `ready`. Local storage does not exist on the server, so
 * a number rendered before the cart has been read is a number React will
 * throw away, and a badge that appears and then changes is worse than one
 * that appears once.
 */

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ACCOUNT AND WISHLIST ARE PAGES OF THIS WEBSITE
 * ═══════════════════════════════════════════════════════════════════════════
 * They used to be links to storelib.com, because the session that knows who
 * a visitor is lives there and is host-only on purpose. Every website now
 * has customer accounts of its own, the way a Shopify store does: an email
 * and a code on its own sign in page (/account/login), its account page
 * (/account) and a Wishlist (/wishlist), with this website's own session
 * (lib/site-accounts). So these are root-relative links, which the proxy
 * resolves to whichever address the site is being served on, and in the
 * builder they open those pages in the canvas.
 *
 * SIGN IN OR ACCOUNT. A visitor who is not signed in is offered Sign in, and
 * it goes straight to the sign in page; a signed in one is offered Account.
 * The page's hint cookie says which (../../site-wishlist), read once the
 * page is in the browser, so the server's drawing is the signed out one and
 * the first render agrees with it.
 *
 * The heart carries the count of saved products, from the same list the
 * hearts on the products draw (../../site-wishlist), once it has been read.
 */
const ACCOUNT_PATH = "/account"
const SIGN_IN_PATH = "/account/login"
const WISHLIST_PATH = "/wishlist"

/** Where the account control goes, and what it is called, for this visitor. */
function useAccountLink(): { href: string; label: string } {
  const { signedIn } = useSiteWishlist()
  /* In the page's language (Translate › Shop words). */
  const w = useWord()
  return signedIn ? { href: ACCOUNT_PATH, label: w("account") } : { href: SIGN_IN_PATH, label: w("sign_in") }
}

function SavedCount({ className }: { className?: string }) {
  const { count, ready } = useSiteWishlist()
  if (!ready || count === 0) return null
  return (
    <span
      aria-hidden
      className={cn("absolute min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-semibold leading-[17px] text-center", className)}
      style={{ background: "currentColor" }}
    >
      {/* Punched out of the dot, as the bag's is, so it reads on any scheme. */}
      <span className="mix-blend-difference text-white">{count > 99 ? "99+" : count}</span>
    </span>
  )
}

function useWishlistLabel(): string {
  const { count, ready } = useSiteWishlist()
  const w = useWord()
  return ready && count > 0 ? `${w("wishlist")}, ${count} ${w("saved")}` : w("wishlist")
}


/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SEARCH, OPENED WHERE IT WAS CLICKED
 * ═══════════════════════════════════════════════════════════════════════════
 * The icon sent people to a page. That is one of two right answers and it
 * was the only one on offer, so a shop whose catalogue is small enough to
 * search from where you are stood had to send a visitor away and bring them
 * back. This is the other: a field that opens over the header row, which is
 * what the themes people are used to do.
 *
 * OVER THE ROW, NOT IN PLACE OF IT. Swapping the row's contents reflows the
 * header — the logo leaves, the icons leave, and anything under a sticky
 * header jumps by whatever the difference came to. This is laid over the
 * row and fades in, so nothing below it moves at all.
 *
 * IT IS A REAL FORM. `action="/search"` with a `q`, so it works from a
 * keyboard, works before any JavaScript has run, and needs no handler to
 * take somebody to the results. Inside the editor the canvas cancels the
 * submit, and this asks the builder to open the search page instead, so the
 * control does the same thing in both places.
 */
interface SearchHit {
  id: string
  title: string
  price: string
  image: string
  url: string
}

function HeaderSearchPanel({
  open,
  onClose,
  scheme,
  background,
  radius,
  placeholder,
  widthClass,
  paddingClass,
  innerStyle,
  widthStyle,
  onEditorNavigate,
}: {
  open: boolean
  onClose: () => void
  scheme: ColorSchemeValues
  background: string
  radius: CSSProperties
  placeholder: string
  widthClass: string
  paddingClass: string
  innerStyle: CSSProperties
  widthStyle: CSSProperties
  onEditorNavigate?: (href: string, fromNav?: boolean) => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  /**
   * The SEARCH ITSELF: the field, its magnifier and the close button. Not
   * the panel, which is the whole header — see the note on the dismiss.
   */
  const barRef = useRef<HTMLDivElement | null>(null)
  /** And the suggestions, which hang below the header and are also ours. */
  const listRef = useRef<HTMLDivElement | null>(null)
  /* Published, the site knows its creator. In the editor it knows the
     install, and the endpoint resolves the creator from that, so the field
     answers inside the canvas too. */
  const { creatorId, installId } = useStorefront()
  const askAs = creatorId ? `creator=${encodeURIComponent(creatorId)}` : installId ? `install=${encodeURIComponent(installId)}` : ""

  useEffect(() => {
    if (!open) return
    /* After the frame the panel becomes interactive on, or the focus lands
       on an element that is still `pointer-events: none` and iOS declines
       to raise the keyboard for it. */
    const id = window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 60)
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)

    /*
      ═══════════════════════════════════════════════════════════════════
       AND PRESSING ANYWHERE ELSE CLOSES IT — INCLUDING THE HEADER ITSELF
      ═══════════════════════════════════════════════════════════════════
      Escape and the X were the only ways out, which is one way fewer than
      most people look for: a panel laid over the page reads as something
      you dismiss by pressing past it.

      This asked whether the press landed inside the PANEL, and the panel is
      `absolute inset-0` — it is the whole header. On a header with generous
      padding that is a large dark band with a field floating in the middle
      of it, and the empty part of that band is the most natural place in
      the world to press to make the field go away. Every one of those
      presses landed "inside the panel" and did nothing at all, which is
      "I click away and it does not close".

      So what counts as ours is the SEARCH, not the header it is drawn on:
      the field with its magnifier and the close button, and the suggestions
      hanging below. A press anywhere else is a press away, and the empty
      header around the field is anywhere else.

      On the press rather than the click, so it goes as soon as the gesture
      starts, and only for a press that BEGAN outside — a drag that starts
      on the field and ends on the page is still a selection.
    */
    const onDown = (e: PointerEvent) => {
      const el = e.target as Node | null
      if (!el) return
      if (barRef.current?.contains(el)) return
      /*
        AND THE SUGGESTIONS ONLY COUNT WHEN THERE ARE SUGGESTIONS.

        The list is drawn even when empty, so it can fade in rather than
        appear, and its wrapper is a full-width band hanging directly under
        the header. That band was always in the DOM and always took the
        pointer, so a press on the strip of page immediately below the
        header — the first place anybody looks after the header itself —
        landed "inside the suggestions" and dismissed nothing.

        A ref rather than the state itself: this listener is attached when
        the search opens and would otherwise be closing over whatever was
        showing at that moment, which is nothing.
      */
      if (hitsShownRef.current && listRef.current?.contains(el)) return
      onClose()
    }
    /* Not capture: a press on the bag or the search icon should reach its
       own handler, which toggles, rather than be eaten here and reopened. */
    document.addEventListener("pointerdown", onDown)

    return () => {
      window.clearTimeout(id)
      window.removeEventListener("keydown", onKey)
      document.removeEventListener("pointerdown", onDown)
    }
  }, [open, onClose])

  /*
    ═══════════════════════════════════════════════════════════════════════
     WHAT MATCHES, WHILE THEY ARE STILL TYPING
    ═══════════════════════════════════════════════════════════════════════
    The field asks the site's own search endpoint as the query changes and
    shows the first few hits under itself, with a way to see all of them.
    Debounced, because a request per keystroke is a request per keystroke;
    aborted on the next change, because an answer to "te" arriving after the
    answer to "tech" would replace the right list with the wrong one.

    Inside the editor there is no creator to ask on behalf of, so the field
    says nothing rather than something made up.
  */
  const [q, setQ] = useState("")
  const [hits, setHits] = useState<SearchHit[]>([])
  const [total, setTotal] = useState(0)
  const [asked, setAsked] = useState("")

  useEffect(() => {
    if (!open) { setQ(""); setHits([]); setTotal(0); setAsked(""); return }
  }, [open])

  useEffect(() => {
    const term = q.trim()
    if (!askAs || !term) { setHits([]); setTotal(0); setAsked(""); return }
    const ctrl = new AbortController()
    const id = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/website-builder/search?${askAs}&q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        if (!res.ok) return
        const data = (await res.json()) as { items?: SearchHit[]; total?: number }
        setHits(Array.isArray(data.items) ? data.items : [])
        setTotal(typeof data.total === "number" ? data.total : 0)
        setAsked(term)
      } catch {
        /* Aborted, or offline. The list stays as it was. */
      }
    }, 180)
    return () => { window.clearTimeout(id); ctrl.abort() }
  }, [q, askAs])

  /**
   * A CLOSED PANEL DOES NOT KEEP THE CARET.
   *
   * The field is where focus goes when the search opens, and nothing moved
   * it when the search closed: the caret stayed in a field at opacity zero
   * that takes no input, so typing went nowhere and the next Tab carried on
   * from inside something invisible.
   */
  useEffect(() => {
    if (open) return
    const active = document.activeElement as HTMLElement | null
    if (active && panelRef.current?.contains(active)) active.blur()
  }, [open])

  const showHits = open && asked !== "" && asked === q.trim()
  /** What the dismiss listener reads, since it outlives any one render. */
  const hitsShownRef = useRef(false)
  hitsShownRef.current = showHits
  const viewAll = `/search?q=${encodeURIComponent(q.trim())}`

  return (
    <div
      ref={panelRef}
      aria-hidden={!open}
      /*
        This panel sits inside the header, so the canvas counted its result
        links as the site's navigation and followed them in the capture
        phase, before the handler on each one could put the panel away. The
        links below do both. See the editor's onClickCapture.
      */
      data-self-nav=""
      /*
        EXACTLY THE HEADER ROW, AND THE FIELD FITS INSIDE IT.

        Two versions of this were wrong in opposite directions. First the
        field filled the row, so a header with little padding had a field
        touching its edges. Then the panel was given a minimum height and
        the field a height of 100%, and the two inflated each other: the
        field stretched to the panel, the panel grew to the field, and it
        settled 24px TALLER than the header — measured at 84px against a
        60px row. A panel taller than the header hangs below it, and that
        overhang is a band of header colour across the top of whatever
        section follows.

        So the panel is the row, never more, and the field takes 44px or
        whatever the row leaves after 8px of clearance, whichever is less.
        A roomy header gets a 44px field; a very tight one gets a smaller
        field rather than a header that grows.

        AND THE CLIP THAT DOES THAT IS ON THE ROW, NOT ON THIS BOX. It was
        here, and it hid the whole suggestions list: the list hangs BELOW
        the header on purpose, `overflow: hidden` on the header-sized box
        around it cut everything below that edge, and what was left on
        screen was the top hairline of a card and nothing else. Reported
        from a phone, and it was doing it everywhere.

        So this box only positions and paints. The row below clips itself,
        which is all the clip was ever for, and the list is a sibling of the
        row rather than a child of it.
      */
      className="absolute inset-0 z-[70]"
      style={{
        background,
        opacity: open ? 1 : 0,
        transform: open ? "translateY(0)" : "translateY(-6px)",
        pointerEvents: open ? "auto" : "none",
        /*
          The way out is nearly as long as the way in, and on a curve that
          spends its time evenly. It was 160ms of `ease-in`, which
          ACCELERATES into the disappearance: the panel hangs for a moment
          and then is snatched, which reads as a cut rather than as a close.
          A dismissal somebody asked for should look like it was carried
          out, not like the page gave up.
        */
        transition: open
          ? "opacity 220ms cubic-bezier(0.32, 0.72, 0, 1), transform 260ms cubic-bezier(0.32, 0.72, 0, 1)"
          : "opacity 200ms cubic-bezier(0.4, 0, 0.2, 1), transform 200ms cubic-bezier(0.4, 0, 0.2, 1)",
        willChange: "opacity, transform",
      }}
    >
      {/*
        The header's own row: full height, vertically centred, and the one
        box that clips, which is all the clipping this needs.

        ═══════════════════════════════════════════════════════════════════
         AND NOT THE HEADER'S VERTICAL PADDING, WHICH IS WHY THIS SHIPPED
        ═══════════════════════════════════════════════════════════════════
        `innerStyle` carries the header's own top and bottom padding, and it
        was spread here as an inline style — which beats the `py-2` class it
        was sitting beside, silently.

        That padding is a different number in the two places this renders.
        In the editor the header is drawn for one device and the padding is
        on the row, so this row got it too, the field was laid out inside
        the padding, and everything lined up. PUBLISHED there is no device
        mode: both shells are rendered and each carries its own padding, so
        this row's padding is zero and the field was laid out against the
        header's whole height instead.

        So the editor showed it correct and the site showed it broken, which
        is how a field stuck to the top of a 104px header with its own
        magnifier floating 36px below it reached a published site and was
        reported with a screenshot.

        The panel is a layer over the header. What it needs is the header's
        WIDTH and its horizontal padding, so the field lines up with the
        logo above it, and its own height to centre one field in. The
        vertical padding is the header content's, not this row's, and taking
        it made the two paths one.
      */}
      <div
        className={cn(widthClass, paddingClass, "flex h-full w-full items-center overflow-hidden")}
        style={{ ...innerStyle, paddingTop: 0, paddingBottom: 0, ...widthStyle }}
      >
        {/*
          NOT AS WIDE AS THE HEADER. A header set to full width is a header
          whose logo and menu reach the edges; a field that reaches the
          edges of a large screen is a field a person has to look across.
          It stops at a reading width and sits in the middle, whatever the
          header does, which is what the field in the reference does.
        */}
        {/*
          `items-center`. It was `items-stretch`, and that is the second
          half of the same bug: the form stretched to the row, the field
          stretched to the form and was then trimmed to 44px — and a
          stretched box whose height is capped keeps its TOP edge, so the
          field sat at the top of the header while the magnifier, which is
          positioned at 50% of the form that really did stretch, and the
          close button, centred in the row, both stayed on the middle line.
          Three things, three different answers to "where is the middle".

          Centred, there is one answer: the form is the field's height and
          is centred, the magnifier is at 50% of the form, and the close
          button is centred in the same row. The header cannot grow because
          the form is capped, and it cannot overflow because the cap is a
          `min()` against the room there is.
        */}
        <div ref={barRef} className="relative mx-auto flex h-full w-full max-w-[720px] items-center gap-2">
          <form
            action="/search"
            method="get"
            role="search"
            className="relative flex flex-1 min-w-0"
            /*
              44px, or whatever the row leaves after 8px of clearance, and
              the smaller of the two. The percentage resolves here because
              the box above it has `h-full` of a row whose height comes from
              the panel's `inset-0` — a definite height all the way up. It
              did not resolve on the input, which was a percentage inside a
              form that was itself sized by a percentage on a flex item, and
              that is why two earlier attempts fell through to the floor.
            */
            style={{ height: "min(44px, calc(100% - 8px))" }}
            onSubmit={(e) => {
              if (!onEditorNavigate) return
              e.preventDefault()
              e.stopPropagation()
              onEditorNavigate("/search", true)
              onClose()
            }}
          >
            <input
              ref={inputRef}
              type="search"
              name="q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={placeholder}
              aria-label={placeholder}
              autoComplete="off"
              className="hdr-search-field h-full w-full bg-transparent outline-none"
              style={{
                /* 16px or iOS zooms the page when the field takes focus, and
                   a header that scales up under a keyboard never recovers. */
                fontSize: 16,
                padding: "0 40px 0 14px",
                /*
                  The field is the form, and the form has a height. Nothing
                  here resolves a percentage against something indefinite,
                  which is what the last three versions of this were doing.
                */
                color: scheme.heading,
                caretColor: scheme.heading,
                /* The browser's own clear control and focus ring take the
                   platform accent, which on a dark header is the blue in
                   the report. Nothing native is drawn in this field. */
                accentColor: scheme.heading,
                outline: "none",
                boxShadow: "none",
                WebkitAppearance: "none",
                appearance: "none",
                border: `1px solid ${scheme.inset_border}`,
                ...radius,
              }}
            />
            <button
              type="submit"
              aria-label="Search"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 flex items-center justify-center rounded-full transition-colors theme-tint-hover"
              style={{ color: scheme.heading }}
            >
              <Search className="h-[18px] w-[18px]" strokeWidth={1.8} />
            </button>
          </form>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="h-9 w-9 shrink-0 self-center flex items-center justify-center rounded-full transition-colors theme-tint-hover"
            style={{ color: scheme.heading }}
          >
            <X className="h-5 w-5" strokeWidth={1.8} />
          </button>

        </div>
      </div>

      {/*
        ═══════════════════════════════════════════════════════════════════
         THE SUGGESTIONS HANG BELOW THE HEADER, SO THEY LIVE BELOW IT
        ═══════════════════════════════════════════════════════════════════
        This was a child of the row, and the row is exactly the height of
        the header and clips itself so the field can never make the header
        taller. A list positioned at the row's bottom edge is therefore
        entirely outside the clip: every pixel of it was cut, and all that
        reached the screen was the top hairline of a card under the field.
        Reported from a phone, and it was doing it on every screen.

        A sibling of the row instead, hung off the panel, which is the
        header's own box and clips nothing. The two wrappers put it back
        under the field: the header's width and padding, then the field's
        reading width, then the width of the close button so the list stops
        where the field stops rather than under the X.

        Drawn even when empty so it can fade rather than appear, and told to
        take no input until it is there.
      */}
      {/* `pointer-events: none` until there is something in it. An empty
          band across the top of the page that swallows presses is worse
          than no band at all: it is invisible, so there is nothing to
          explain why pressing there does nothing. */}
      <div
        ref={listRef}
        className={cn(widthClass, paddingClass, "absolute left-0 right-0 top-full w-full")}
        style={{ ...widthStyle, pointerEvents: showHits ? "auto" : "none" }}
      >
        <div className="relative mx-auto w-full max-w-[720px] pr-11">
            <div
              aria-hidden={!showHits}
              className="relative z-[80] mt-2 overflow-hidden"
              style={{
                background: scheme.bg,
                color: scheme.heading,
                border: `1px solid ${scheme.inset_border}`,
                boxShadow: "0 18px 40px -18px rgba(15, 23, 42, 0.35)",
                opacity: showHits ? 1 : 0,
                transform: showHits ? "translateY(0)" : "translateY(-4px)",
                pointerEvents: showHits ? "auto" : "none",
                transition: showHits
                  ? "opacity 200ms cubic-bezier(0.32, 0.72, 0, 1), transform 240ms cubic-bezier(0.32, 0.72, 0, 1)"
                  : "opacity 140ms ease-in, transform 140ms ease-in",
                ...radius,
              }}
            >
              {hits.length === 0 ? (
                <p className="px-4 py-4 text-[14px] opacity-60">No results for &ldquo;{asked}&rdquo;</p>
              ) : (
                <>
                  <ul className="site-slim-scroll max-h-[min(calc(var(--sl-vh,1vh)*56),420px)] overflow-y-auto overscroll-contain py-1">
                    {hits.map((h) => (
                      <li key={h.id}>
                        <a
                          href={h.url}
                          onClick={onEditorNavigate ? (e) => { e.preventDefault(); e.stopPropagation(); onEditorNavigate(h.url, true); onClose() } : undefined}
                          className="flex items-center gap-3 px-3 py-2 transition-colors theme-tint-hover"
                        >
                          <span
                            className="h-11 w-11 shrink-0 overflow-hidden"
                            style={{ background: scheme.inset_border, borderRadius: 8 }}
                          >
                            {h.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={h.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                            ) : null}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{h.title}</span>
                          {h.price && <span className="shrink-0 text-[13px] opacity-70 tabular-nums">{h.price}</span>}
                        </a>
                      </li>
                    ))}
                  </ul>
                  <a
                    href={viewAll}
                    onClick={onEditorNavigate ? (e) => { e.preventDefault(); e.stopPropagation(); onEditorNavigate("/search", true); onClose() } : undefined}
                    className="flex items-center justify-between px-4 py-3 text-[13px] font-semibold transition-colors theme-tint-hover"
                    style={{ borderTop: `1px solid ${scheme.inset_border}` }}
                  >
                    <span>View all {total} result{total === 1 ? "" : "s"}</span>
                    <ChevronRight className="h-4 w-4 opacity-60" strokeWidth={2} />
                  </a>
                </>
              )}
            </div>
        </div>
      </div>
    </div>
  )
}

function CartButton() {
  const { count, ready, setOpen } = useSiteCart()
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={ready && count > 0 ? `Cart, ${count} item${count === 1 ? "" : "s"}` : "Cart"}
      className="relative h-9 w-9 flex items-center justify-center rounded-full theme-tint-hover transition-colors"
    >
      <ShoppingBag className="h-[18px] w-[18px]" strokeWidth={1.8} />
      {ready && count > 0 && (
        <span
          aria-hidden
          className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-semibold leading-[17px] text-center"
          style={{ background: "currentColor" }}
        >
          {/* The number is punched out of the dot rather than drawn on it, so
              it reads on a light header and a dark one without a second
              colour to keep in step. */}
          <span className="mix-blend-difference text-white">{count > 99 ? "99+" : count}</span>
        </span>
      )}
    </button>
  )
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE CART DRAWER
 * ═══════════════════════════════════════════════════════════════════════════
 * From the right, where a cart comes from, while the menu comes from the
 * left. It shares the pin, the scroll lock and the portal target with the
 * menu through useDrawerFrame, so the three bugs solved there are solved
 * once. See components/website-builder/drawer-frame.ts.
 *
 * A digital line has no stepper. An entitlement is one row per buyer per
 * product, so a second copy of a download is not a thing this product can
 * express, and a stepper that refuses to go past one is a control that lies.
 */
export function HeaderCartDrawer({
  scheme,
  scopedToPreview,
  onEditorNavigate,
}: {
  scheme: ColorSchemeValues
  scopedToPreview: boolean
  onEditorNavigate?: (href: string, fromNav?: boolean) => void
}) {
  const { open, setOpen } = useSiteCart()
  const onClose = useCallback(() => setOpen(false), [setOpen])
  const { mounted, target, positionClass, frameStyle } = useDrawerFrame(open, scopedToPreview, onClose)
  /* Only in the page while open or closing: see useDrawerPresence. */
  const present = useDrawerPresence(open)
  if (!mounted || !target || !present) return null
  return createPortal(
    <CartDrawerInner
      open={open}
      onClose={onClose}
      scheme={scheme}
      scopedToPreview={scopedToPreview}
      onEditorNavigate={onEditorNavigate}
      positionClass={positionClass}
      frameStyle={frameStyle}
    />,
    target,
  )
}

function CartDrawerInner({
  open,
  onClose,
  scheme,
  scopedToPreview,
  onEditorNavigate,
  positionClass,
  frameStyle,
}: {
  open: boolean
  onClose: () => void
  scheme: ColorSchemeValues
  scopedToPreview: boolean
  onEditorNavigate?: (href: string, fromNav?: boolean) => void
  positionClass: string
  frameStyle: CSSProperties
}) {
  const { lines, setQty, remove, count, shopId, clear, add, live } = useSiteCart()
  /* The shop's own words, in the page's language (lib/markets/ui-words.ts). */
  const w = useWord()
  /* The store's upsells and bundles for this cart (components/offers/cart-offers.tsx): what it gets, and what it could add. Asked only while the bag is open on a live site. */
  const offers = useCartOffers(lines, shopId, open && live && !scopedToPreview)
  /* Amounts in the visitor's market's currency, as the product cards show them and checkout adds them up (lib/markets/cart-money). */
  const cartMoney = useCartMoney()
  const amounts = cartMoney(lines, offers && offers.offerCents > 0 ? { subtotalCents: lines.reduce((n, l) => n + l.priceCents * l.quantity, 0), discountCents: offers.offerCents } : null)
  const amountMoney = useAmountMoney()
  const unitMoney = (cents: number) => cartMoney([{ priceCents: cents, quantity: 1 }]).lines[0]
  /* Back from checkout lands on the cart in the page's language. */
  const cartPath = cartPathFor(useStorefront().language)
  /* Check out goes straight to the checkout (lib/website-builder/cart-checkout). */
  const [leaving, setLeaving] = useState(false)
  /* Back from the checkout, the page can come out of the back/forward cache with the spinner still on. */
  useEffect(() => {
    const back = () => setLeaving(false)
    window.addEventListener("pageshow", back)
    return () => window.removeEventListener("pageshow", back)
  }, [])
  const checkOut = async (e: React.MouseEvent) => {
    e.preventDefault()
    if (onEditorNavigate) { e.stopPropagation(); return }
    if (leaving) return
    setLeaving(true)
    const next = await drawerCheckout(lines, shopId, cartPath)
    if (next.go === null) { window.location.href = "/cart"; return }
    if (next.free) clear()
    window.location.href = next.go
  }
  /*
    THE SLIDE AND THE FADE ARE WRITTEN TO THE NODES, ON THE FRAME THEY BEGIN.

    Both used to be React props — `transform` and `transition` in the style
    object below — which meant the transition started inside the commit that
    opened the drawer and ran unseen for as long as that commit took. See
    useDrawerMotion in components/website-builder/drawer-frame.ts for what
    that measured, and why the bag and the menu both do it this way.
  */
  const slidePanel = useDrawerMotion(open, "transform", "translateX(101%)", "translateX(0)")
  const fadeBackdrop = useDrawerMotion(open, "opacity", "0", "1")
  const pressBackdrop = useBackdropDismiss(open, onClose)
  const touchGuard = useDrawerTouchGuard()
  /* Pushed back toward the right edge, it closes: see useDrawerSwipe. */
  const backdropNode = useRef<HTMLElement | null>(null)
  const keepBackdrop = useCallback((node: HTMLElement | null) => { backdropNode.current = node }, [])
  const swipeBack = useDrawerSwipe("right", onClose, backdropNode)
  const dismissBackdrop = useComposedRef(useComposedRef(pressBackdrop, fadeBackdrop), keepBackdrop)
  const panelRef = useRef<HTMLElement | null>(null)
  const keepPanel = useCallback((node: HTMLElement | null) => { panelRef.current = node }, [])
  const guardPanel = useComposedRef(useComposedRef(useComposedRef(touchGuard, slidePanel), keepPanel), swipeBack)
  useFocusTrap(open, panelRef, !scopedToPreview)

  const stop = (e: React.MouseEvent) => { if (onEditorNavigate) { e.preventDefault(); e.stopPropagation() } }

  return (
    <>
      <div
        aria-hidden
        data-site-drawer-backdrop=""
        ref={dismissBackdrop}
        className={cn(positionClass, "left-0 right-0 bg-black/50", DRAWER_BACKDROP_Z)}
        style={{
          ...frameStyle,
          pointerEvents: open ? "auto" : "none",
        }}
      />
      <aside
        ref={guardPanel}
        role="dialog"
        aria-label="Cart"
        data-site-drawer="cart"
        aria-hidden={!open}
        /* See the menu drawer below for why this says so while it is open. */
        aria-modal={open ? true : undefined}
        className={cn(
          positionClass,
          "right-0 flex flex-col",
          DRAWER_PANEL_Z,
          open && "shadow-2xl",
          scopedToPreview ? "w-[88%] max-w-[360px]" : "w-[90vw] max-w-[400px]",
        )}
        style={{
          ...frameStyle,
          background: scheme.bg,
          color: scheme.heading,
          pointerEvents: open ? "auto" : "none",
          ...(scopedToPreview ? {} : drawerSafeArea("right")),
        }}
      >
        <div
          className="flex items-center px-3 h-[60px] shrink-0 gap-1"
          /*
            THE SCHEME, NOT A FIXED BLACK. This was `#0f0f10` on `#ffffff`,
            so a drawer whose body is painted from `scheme.bg` opened with a
            black slab across the top of it — on a coral header, on a cream
            one, on every scheme anybody picks. `heading` on `background` is
            the same pairing the panel below it already uses.
          */
          style={{ background: scheme.bg, color: scheme.heading }}
        >
          <span className="flex-1 text-[18px] font-semibold truncate px-1">
            {count > 0 ? `${w("cart")} (${count})` : w("cart")}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close cart"
            data-drawer-focus=""
            className="theme-tint-hover h-9 w-9 flex items-center justify-center rounded-full transition-colors"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>

        {lines.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <ShoppingBag className="h-7 w-7 opacity-25" strokeWidth={1.5} />
            <p className="text-[15px] opacity-60">{w("cart_nothing")}</p>
            <a
              href="/products"
              onClick={stop}
              className="text-[14px] font-medium underline underline-offset-4"
            >
              Browse the shop
            </a>
          </div>
        ) : (
          <div className="site-slim-scroll flex-1 overflow-y-auto overscroll-contain px-3 py-3" style={{ WebkitOverflowScrolling: "touch" }}>
            <ul className="flex flex-col">
              {lines.map((l, i) => {
                const k = lineKey(l)
                return (
                  <li key={k} className="flex gap-3 py-3 border-b last:border-b-0" style={{ borderColor: scheme.inset_border }}>
                    <a
                      href={`/products/${l.slug}`}
                      onClick={stop}
                      className="shrink-0 h-[64px] w-[64px] overflow-hidden rounded-lg"
                      style={{ background: scheme.inset_border }}
                    >
                      {l.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={l.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : null}
                    </a>
                    <div className="min-w-0 flex-1">
                      <a href={`/products/${l.slug}`} onClick={stop} className="block text-[14px] font-medium leading-snug line-clamp-2">
                        {l.title}
                      </a>
                      {l.variantName && <p className="mt-0.5 text-[12px] opacity-60">{l.variantName}</p>}
                      <div className="mt-2 flex items-center gap-3">
                        {l.digital ? (
                          <button
                            type="button"
                            onClick={() => remove(k)}
                            aria-label={`Remove ${l.title}`}
                            className="h-7 w-7 flex items-center justify-center rounded-full theme-tint-hover transition-colors opacity-60"
                          >
                            <Trash2 className="h-[15px] w-[15px]" strokeWidth={1.8} />
                          </button>
                        ) : (
                          <div className="flex items-center rounded-full" style={{ border: `1px solid ${scheme.inset_border}` }}>
                            <button
                              type="button"
                              onClick={() => setQty(k, l.quantity - 1)}
                              aria-label={l.quantity === 1 ? `Remove ${l.title}` : `One fewer ${l.title}`}
                              className="h-7 w-7 flex items-center justify-center rounded-full theme-tint-hover transition-colors"
                            >
                              {l.quantity === 1
                                ? <Trash2 className="h-[13px] w-[13px]" strokeWidth={1.8} />
                                : <Minus className="h-[13px] w-[13px]" strokeWidth={2} />}
                            </button>
                            <span className="w-6 text-center text-[13px] tabular-nums">{l.quantity}</span>
                            <button
                              type="button"
                              onClick={() => setQty(k, l.quantity + 1)}
                              aria-label={`One more ${l.title}`}
                              className="h-7 w-7 flex items-center justify-center rounded-full theme-tint-hover transition-colors"
                            >
                              <Plus className="h-[13px] w-[13px]" strokeWidth={2} />
                            </button>
                          </div>
                        )}
                        <span className="ml-auto text-[14px] font-semibold tabular-nums">
                          {amounts.lines[i]}
                        </span>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
            {/* Upsells shown in the cart and bundles it holds part of (lib/offers). */}
            <div className="mt-2 empty:hidden">
              <CartOfferSuggestions data={offers} onAdd={(added) => added.forEach((l) => add(l))} money={unitMoney} colors={{ text: scheme.heading, muted: scheme.paragraph, border: scheme.inset_border }} />
            </div>
          </div>
        )}

        {lines.length > 0 && (
          <div className="shrink-0 px-4 pt-3 pb-4 border-t" style={{ borderColor: scheme.inset_border }}>
            <CartOfferSavings data={offers} money={amountMoney} className="mb-1.5 space-y-1 text-[13px]" />
            <div className="flex items-baseline justify-between">
              <span className="text-[14px] opacity-70">{w("subtotal")}</span>
              <span className="text-[18px] font-semibold tabular-nums">{offers && offers.offerCents > 0 ? amounts.total : amounts.subtotal}</span>
            </div>
            <a
              href="/cart"
              onClick={checkOut}
              aria-busy={leaving || undefined}
              data-cart-checkout=""
              className="mt-3 flex h-11 items-center justify-center gap-2 rounded-full text-[15px] font-semibold transition-opacity"
              style={{ background: scheme.primary_btn_bg, color: scheme.primary_btn_text, opacity: leaving ? 0.7 : 1 }}
            >
              {leaving && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
              {w("check_out")}
            </a>
            <a
              href="/cart"
              onClick={stop}
              className="mt-1 flex h-11 items-center justify-center text-[14px] font-medium underline-offset-4 hover:underline"
            >
              {w("view_cart")}
            </a>
            {/* No "charged in USD" line in the cart (the owner): it is said at checkout, where the card is charged. */}
            {/* Website settings › Commerce › Returns line in the cart. */}
            <CartReturnsNote className="mt-1 text-center text-[12.5px] opacity-70" />
          </div>
        )}
      </aside>
    </>
  )
}

// Inner render — kept as its own component so the expanded-submenu state
// (useState) lives here rather than in the outer drawer, keeping the parent
// portal logic clean.
function MobileDrawerInner({
  open,
  onClose,
  visibleItems,
  scheme,
  positionClass,
  frameStyle,
  onEditorNavigate,
  scopedToPreview,
  showAccount,
  showWishlist,
  showSearch,
  cta,
  onOpenSearch,
  menuStyle = "left",
  phoneOnly,
  underHeader,
}: {
  menuStyle?: MobileMenuStyle
  phoneOnly: boolean
  /** Opened under a header that is on screen, whose hamburger is the close. */
  underHeader: boolean
  open: boolean
  onClose: () => void
  visibleItems: MobileNavItem[]
  scheme: ColorSchemeValues
  positionClass: string
  frameStyle: CSSProperties
  onEditorNavigate?: (href: string, fromNav?: boolean) => void
  scopedToPreview: boolean
  showAccount: boolean
  showWishlist: boolean
  showSearch: boolean
  cta: DrawerCta | null
  onOpenSearch: (() => void) | null
}) {
  /* Its words in the page's language (Translate › Shop words). */
  const w = useWord()
  // Active submenu id — null means we're on the ROOT menu. When an item
  // with children is tapped this flips to that item's id and the drawer
  // slides to a sub-page showing just that item's children (iOS-style).
  // The back button on the sub-page returns us to the root by clearing it.
  /*
    THE PANEL TRAVELS, THE BACKDROP DARKENS, AND NEITHER OF THEM IS A PROP.

    Both were rendered by React — `transform` and `opacity` in the style
    objects below, with their transitions beside them — so both started
    inside the commit that opened the menu and spent it unpainted. Measured
    on a 390px screen at a quarter of the processor: the tap landed, nothing
    moved for 138ms, and then 93% of the picture changed in one frame. The
    panel was not sliding in. It was appearing.

    They are written to the nodes now, on the first frame the browser is
    about to paint. See useDrawerMotion in components/website-builder
    /drawer-frame.ts, which is also where the bag's half of this lives, so
    the two cannot drift.
  */
  const slidePanel = useDrawerMotion(
    open,
    "transform",
    /* Covers the screen slides in from the side too. From the top it drops
       inside a frame that starts under the header, so it never travels
       across the header it opens under (drawerClosedTransform). */
    drawerClosedTransform(menuStyle),
    "translate3d(0, 0, 0)",
  )
  const fromTop = menuStyle === "top"
  const fadeBackdrop = useDrawerMotion(open, "opacity", "0", "1")
  const pressBackdrop = useBackdropDismiss(open, onClose)
  const touchGuard = useDrawerTouchGuard()
  /* Pushed back toward the edge it came from, it closes: see useDrawerSwipe. */
  const backdropNode = useRef<HTMLElement | null>(null)
  const keepBackdrop = useCallback((node: HTMLElement | null) => { backdropNode.current = node }, [])
  const swipeBack = useDrawerSwipe(menuStyle === "right" ? "right" : fromTop ? "top" : "left", onClose, backdropNode)
  const dismissBackdrop = useComposedRef(useComposedRef(pressBackdrop, fadeBackdrop), keepBackdrop)
  /* The panel, for the focus trap: Tab goes round the menu, not out to the page. */
  const panelRef = useRef<HTMLElement | null>(null)
  const keepPanel = useCallback((node: HTMLElement | null) => { panelRef.current = node }, [])
  const guardPanel = useComposedRef(useComposedRef(useComposedRef(touchGuard, slidePanel), keepPanel), swipeBack)
  /* Under the header the hamburger is the close, so Tab goes round it and the menu. */
  useFocusTrap(open, panelRef, !scopedToPreview, underHeader)
  const railRef = useRef<HTMLDivElement | null>(null)
  const [activeSubmenuId, setActiveSubmenuId] = useState<string | null>(null)
  /* The saved count for the heart, and Sign in or Account for this visitor. */
  const account = useAccountLink()
  const wishlistLabel = useWishlistLabel()
  // Reset to root whenever the drawer closes so reopening always starts
  // fresh on the main menu.
  useEffect(() => {
    if (!open) {
      // Delay slightly so the reset happens AFTER the drawer has started
      // sliding off-screen — otherwise the user briefly sees the root
      // menu snap back into view during the close animation.
      const t = window.setTimeout(() => {
        setActiveSubmenuId(null)
        /* And at the top of its list: the drawer stays mounted, so a list
           scrolled halfway down opened halfway down next time. */
        railRef.current?.querySelectorAll<HTMLElement>(":scope > div").forEach((pane) => { pane.scrollTop = 0 })
      }, 280)
      return () => window.clearTimeout(t)
    }
  }, [open])
  const activeSubmenuItem = activeSubmenuId
    ? visibleItems.find(i => i.id === activeSubmenuId) ?? null
    : null
  const inSubmenu = !!activeSubmenuItem

  /*
    INTO A SUB-MENU AND BACK, WITH THE KEYBOARD TOO. Going in puts focus on
    Back, the one control the new pane is entered by; coming back puts it on
    the row that was opened, so a keyboard is where it left off. Only when
    focus is already in the menu, so a tap does not draw a focus ring.
  */
  const backRef = useRef<HTMLButtonElement | null>(null)
  const openSubmenu = (id: string) => {
    const keyboard = !!panelRef.current?.contains(document.activeElement) && document.activeElement !== document.body
    setActiveSubmenuId(id)
    if (keyboard) window.setTimeout(() => backRef.current?.focus({ preventScroll: true }), 0)
  }
  const goBack = () => {
    const from = activeSubmenuId
    const keyboard = document.activeElement === backRef.current
    setActiveSubmenuId(null)
    if (keyboard && from) {
      window.setTimeout(() => {
        panelRef.current?.querySelector<HTMLElement>(`[data-submenu-trigger="${CSS.escape(from)}"]`)?.focus({ preventScroll: true })
      }, 0)
    }
  }

  /*
    ═══════════════════════════════════════════════════════════════════════
     THE MENU CLOSES, AND THEN THE PAGE CHANGES
    ═══════════════════════════════════════════════════════════════════════
    On a published site a link here used to close the drawer and navigate in
    the same tick. The navigation wins: the browser starts unloading, the
    close transition never gets a frame, and the menu sits frozen on screen
    for however long the next page takes. It reads as a tap that jammed.

    So the drawer slides out first and the page is asked for once it has
    gone. One close animation is what the visitor is waiting through either
    way, and now it is the thing they can see.

    A MODIFIED CLICK IS NOT THIS. Command, control, shift and the middle
    button mean "open it somewhere else", and a link that cancels its own
    default takes that away. Those are left to the browser, and the drawer
    just closes.

    IN THE EDITOR nothing is unloaded, so there is nothing to wait for: the
    canvas has already swapped the page being edited by the time this runs.
    The drawer closes and that is all this has to do.
  */
  /**
   * ═══════════════════════════════════════════════════════════════════════
   *  THE MENU CLOSES, THEN THE PAGE CHANGES
   * ═══════════════════════════════════════════════════════════════════════
   * Tapping Home means both things: go home, and put the menu away. Doing
   * them in that order is what makes it read as one movement instead of a
   * page that changed behind a panel somebody still has to dismiss.
   *
   * The wait is the drawer's own closing time, shared with the animation so
   * the two cannot drift apart. It is a quarter of a second, which is under
   * the panel while it is still sliding rather than a delay anybody waits
   * through.
   *
   * SAME ON BOTH SIDES. The live site assigns a location and the editor
   * changes the canvas page, but the timing and the order are the one thing
   * they must share: the drawer was closing on the live site and vanishing
   * in the editor, and the report was about the editor.
   */
  const handleLinkClick = (href: string) => (e: React.MouseEvent) => {
    /* A modifier click opens somewhere else and this page stays where it is,
       so there is nothing to navigate and nothing to wait for. Only on a
       real site: in the canvas the browser is not going anywhere. */
    if (!onEditorNavigate && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)) {
      onClose()
      return
    }

    e.preventDefault()
    e.stopPropagation()
    onClose()

    /* The second argument says this link IS the site's navigation rather
       than content being edited, so the editor follows it with the
       inspector on. See SectionProps.onEditorNavigate for what used to
       decide that. */
    /* A section of the page that is open: the drawer is gone by now, and the
       page scrolls to it on the live site's curve (section-motion.ts). */
    const go = onEditorNavigate
      ? () => { onEditorNavigate(href, true) }
      : () => { if (!followSectionLink(href)) window.location.assign(href) }
    window.setTimeout(go, CLOSE_MS)
  }

  const menuPanel = (
      <aside
        ref={guardPanel}
        role="dialog"
        aria-label="Menu"
        data-site-drawer="menu"
        data-menu-style={menuStyle}
        aria-hidden={!open}
        /*
          ═══════════════════════════════════════════════════════════════════
           THIS IS THE HEADER'S NAVIGATION, WHEREVER IT IS DRAWN
          ═══════════════════════════════════════════════════════════════════
          The editor's canvas cancels a link's default and then follows it
          only when the link is inside the header or the footer, which it
          decides by looking for `data-chrome` above the anchor. That rule is
          right: a link in a hero is content being edited and a tap on it
          nearly always meant the section behind it, while a nav you cannot
          follow is a nav you cannot check.

          But this drawer is PORTALLED. It is the header's menu and it is
          rendered as a child of the canvas rather than of the header, so
          nothing above its links carried the attribute and every one of them
          was cancelled and went nowhere. Reported as "the navigation links
          in the mobile nav do nothing", and the search row with them.

          Carrying it here says what is already true. Measured by
          scripts/check-nav-drawer.mjs, which replicates the canvas rule and
          clicks the links.
        */
        data-chrome=""
        /*
          And it follows them itself. The canvas takes a link inside
          `data-chrome` in the capture phase and stops the event there, so
          the handler below never ran and the drawer stayed open over the
          page it had just opened. This says the drawer will do it, after it
          has closed. See the note in the editor's onClickCapture.
        */
        data-self-nav=""
        /*
          ═══════════════════════════════════════════════════════════════════
           OPEN, IT SAYS IT IS A MODAL, AND THE LOCK IS LEFT ALONE
          ═══════════════════════════════════════════════════════════════════
          The root layout mounts a guard on every page (StuckLayerGuard) that
          takes back any lock on the body that no open modal accounts for,
          after 400ms or at the next touch, whichever comes first. It asks
          one question, `[aria-modal="true"]`, and this drawer never said it.
          So the menu pinned the page, the guard unpinned it, and the first
          drag in the menu scrolled the website behind it from the top: the
          recording. Said only while open, so a closed drawer never keeps a
          stale lock alive. Measured by scripts/check-storefront-mobile-drawer.
        */
        aria-modal={open ? true : undefined}
        className={cn(
          /* From the top it sits in its frame (below), as tall as its links and no taller than the frame. */
          fromTop ? "absolute left-0 right-0 top-0 max-h-full overflow-y-auto overscroll-contain site-slim-scroll" : positionClass,
          "flex flex-col",
          DRAWER_PANEL_Z,
          /* Never on a desktop layout, unless Menu on larger screens asks for it: the header has its links in the row there. */
          phoneOnly && "md:hidden",
          open && "shadow-2xl",
          /*
            WHERE IT COMES FROM: Header › Menu on phones. From the left is
            what every site had; from the right sits under a thumb on the
            right hand; over the whole screen is a menu with room for long
            names. Only the transform differs, so the slide stays on the
            compositor whichever it is.
          */
          fromTop
            ? "w-full"
            : menuStyle === "full"
            ? "left-0 right-0 w-full max-w-none"
            : menuStyle === "right"
              ? cn("right-0", scopedToPreview ? "w-[82%] max-w-[320px]" : "w-[85vw] max-w-[360px]")
              : cn("left-0", scopedToPreview ? "w-[82%] max-w-[320px]" : "w-[85vw] max-w-[360px]"),
        )}
        style={{
          ...(fromTop ? {} : frameStyle),
          background: scheme.bg,
          color: scheme.heading,
          pointerEvents: open ? "auto" : "none",
          /* Clear of the notch and the home bar on an iPhone; nought in a browser. */
          ...(scopedToPreview ? {} : drawerSafeArea(menuStyle === "right" ? "right" : menuStyle === "full" || fromTop ? "both" : "left")),
          /* From the top on a wide screen the rows line up with the header's own 5% edge (their own 20px inside it); on a phone the inset comes to nothing, or to the notch. */
          ...(fromTop
            ? { paddingLeft: "max(env(safe-area-inset-left, 0px), calc(5% - 20px))", paddingRight: "max(env(safe-area-inset-right, 0px), calc(5% - 20px))" }
            : {}),
        }}
      >
        {/*
          ═══════════════════════════════════════════════════════════════════
           UNDER THE HEADER, THE HEADER IS THE TOP OF THE MENU
          ═══════════════════════════════════════════════════════════════════
          The menu used to cover the whole screen with a row of its own,
          "Menu" and an X, while the site's header faded out behind it. Now it
          opens below the header the way Dawn's does: the logo stays, and the
          hamburger, which has turned into an X, is the close. This row is
          only drawn when there is no header above the drawer to close it
          from (a header scrolled out of view), so there is always one way
          out on screen and never two.
        */}
        {!underHeader && (
          <div
            className="flex items-center px-3 h-[60px] shrink-0 gap-1"
            /* The scheme's heading on its background, the same pairing as the panel. */
            style={{ background: scheme.bg, color: scheme.heading }}
          >
            <span className="flex-1 text-[18px] font-semibold truncate px-2">{w("menu")}</span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close menu"
              data-drawer-focus=""
              className="theme-tint-hover h-9 w-9 flex items-center justify-center rounded-full transition-colors"
            >
              <X className="h-5 w-5" strokeWidth={2} />
            </button>
          </div>
        )}

        {/* Scrollable link list — uses a 2-track slide. The ROOT pane and
            the SUBMENU pane live side-by-side inside a 200%-wide rail;
            switching views just translates the rail by -50%. This is the
            exact pattern iOS uses for drill-down navigation and keeps
            animation work on the GPU. */}
        <nav
          /* From the top the list is in the flow, so the panel is as tall as its links; the panel scrolls when they outgrow the frame. */
          className={fromTop ? "relative shrink-0 overflow-hidden" : "flex-1 relative overflow-hidden"}
          style={{ overscrollBehavior: "contain" }}
        >
          <div
            ref={railRef}
            className={fromTop ? "grid grid-cols-2" : "absolute inset-0 flex"}
            style={{
              width: "200%",
              transform: inSubmenu ? "translateX(-50%)" : "translateX(0%)",
              transition: "transform 300ms cubic-bezier(0.32, 0.72, 0, 1)",
              willChange: "transform",
            }}
          >
            {/* ── Pane 1: ROOT menu ── */}
            <div
              className={fromTop ? "min-w-0" : "site-slim-scroll w-1/2 h-full overflow-y-auto"}
              aria-hidden={inSubmenu}
              /* The pane that is slid away takes no Tab and no tap. */
              inert={inSubmenu}
              style={{ overscrollBehavior: "contain" }}
            >
              {visibleItems.map((item, idx) => {
                const hasChildren = !!item.children && item.children.length > 0
                return (
                  <div key={item.id} className={cn(idx > 0 && "border-t border-black/10")}>
                    {hasChildren ? (
                      <button
                        type="button"
                        data-submenu-trigger={item.id}
                        onClick={() => openSubmenu(item.id)}
                        className="w-full flex items-center justify-between px-5 py-4 text-left theme-tint-hover transition-colors"
                        style={{ color: scheme.nav_link }}
                        aria-haspopup="menu"
                      >
                        <span className="text-[17px] font-semibold">{item.label}</span>
                        <ChevronRight className="h-[18px] w-[18px]" strokeWidth={2} />
                      </button>
                    ) : (
                      <a
                        href={item.href}
                        target={item.openInNew ? "_blank" : undefined}
                        rel={item.openInNew ? "noopener noreferrer" : undefined}
                        onClick={handleLinkClick(item.href)}
                        className="flex items-center justify-between px-5 py-4 theme-tint-hover transition-colors"
                        style={{ color: scheme.nav_link }}
                      >
                        <span className="text-[17px] font-semibold">{item.label}</span>
                      </a>
                    )}
                  </div>
                )
              })}
            </div>

            {/* ── Pane 2: SUBMENU content ──
                Renders the currently-active submenu's children. We keep
                this pane mounted even when inactive so the slide-out
                animation has something to slide toward. */}
            <div
              className={fromTop ? "min-w-0" : "site-slim-scroll w-1/2 h-full overflow-y-auto"}
              aria-hidden={!inSubmenu}
              inert={!inSubmenu}
              style={{ overscrollBehavior: "contain" }}
            >
              {/* Back, at the top of the level it leaves, named for where it is. */}
              <button
                type="button"
                ref={backRef}
                onClick={goBack}
                aria-label="Back to main menu"
                className="flex w-full items-center gap-2 border-b border-black/10 px-4 py-3.5 text-left text-[15px] font-semibold theme-tint-hover transition-colors"
                style={{ color: scheme.heading }}
              >
                <ChevronLeft className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
                <span className="truncate">{activeSubmenuItem?.label ?? ""}</span>
              </button>
              {activeSubmenuItem?.children?.map((child, idx) => (
                <a
                  key={child.id}
                  href={child.href}
                  target={child.openInNew ? "_blank" : undefined}
                  rel={child.openInNew ? "noopener noreferrer" : undefined}
                  onClick={handleLinkClick(child.href)}
                  className={cn(
                    "flex items-center justify-between px-5 py-4 theme-tint-hover transition-colors",
                    idx > 0 && "border-t border-black/10",
                  )}
                  style={{ color: scheme.nav_link }}
                >
                  <span className="text-[17px] font-semibold">{child.label}</span>
                  <ChevronRight className="h-[18px] w-[18px] opacity-40" strokeWidth={2} />
                </a>
              ))}
            </div>
          </div>
        </nav>

        {/* ── Account + Wishlist row ──
            Sits ABOVE the currency/language row. Only renders when at least
            one icon is enabled so the drawer doesn't grow a dead divider
            when both are off.
            Alignment rules (per spec):
              • Account only            → Log In LEFT
              • Wishlist only           → Wishlist LEFT
              • Both account + wishlist → Log In LEFT, Wishlist RIGHT
            We render a single row with `justify-between` and conditionally
            place each element on the correct side. */}
        {/*
          ═══════════════════════════════════════════════════════════════════
           THE CALL TO ACTION IS ON A PHONE TOO, AND THIS IS WHERE IT FITS
          ═══════════════════════════════════════════════════════════════════
          It was desktop only. The header row on a phone is a hamburger, a
          logo, search and the bag, and there is no width left in it for a
          labelled button — "Book a cut" in that row is either an ellipsis or
          a logo squeezed out of the middle.

          So it is the first thing in the menu, full width, in the theme's
          own button colours: the one action the creator has decided matters
          most, at the size a thumb wants, which is where every shop's app
          puts it. The desktop header is unchanged.
        */}
        {cta && (
          <div className="border-t border-black/10 px-5 py-4 shrink-0" style={{ background: scheme.bg }}>
            <a
              href={cta.url}
              onClick={handleLinkClick(cta.url)}
              className="flex h-12 w-full items-center justify-center px-4 text-[15px] font-semibold"
              data-sl-button="primary"
              data-button=""
              style={cta.style}
            >
              <span className="truncate">{cta.text}</span>
            </a>
          </div>
        )}

        {(showAccount || showWishlist) && (
          <div
            className="border-t border-black/10 px-5 py-3 flex items-center justify-between shrink-0"
            style={{ background: scheme.bg }}
          >
            {/* LEFT slot */}
            {showAccount ? (
              /* Sign in, straight to this website's sign in page, or the
                 account page once signed in (useAccountLink). */
              <a
                href={account.href}
                onClick={handleLinkClick(account.href)}
                className="flex min-h-[44px] items-center gap-2 text-[15px] font-semibold hover:opacity-70 transition-opacity"
                style={{ color: scheme.nav_link }}
              >
                <User className="h-5 w-5" strokeWidth={1.8} />
                <span>{account.label}</span>
              </a>
            ) : (
              // Wishlist-only case: wishlist goes on the LEFT.
              <a
                href={WISHLIST_PATH}
                aria-label={wishlistLabel}
                onClick={handleLinkClick(WISHLIST_PATH)}
                className="relative h-9 w-9 flex items-center justify-center rounded-full theme-tint-hover transition-colors -ml-2"
                style={{ color: scheme.nav_link }}
              >
                <Heart className="h-[22px] w-[22px]" strokeWidth={1.8} />
                <SavedCount className="-top-0.5 -right-0.5" />
              </a>
            )}
            {/* RIGHT slot — only when BOTH are on so wishlist moves to the right */}
            {showAccount && showWishlist ? (
              <a
                href={WISHLIST_PATH}
                aria-label={wishlistLabel}
                onClick={handleLinkClick(WISHLIST_PATH)}
                className="relative h-9 w-9 flex items-center justify-center rounded-full theme-tint-hover transition-colors -mr-2"
                style={{ color: scheme.nav_link }}
              >
                <Heart className="h-[22px] w-[22px]" strokeWidth={1.8} />
                <SavedCount className="-top-0.5 -right-0.5" />
              </a>
            ) : (
              // Empty right slot so `justify-between` keeps the left element
              // flush to the edge instead of centring it.
              <span aria-hidden />
            )}
          </div>
        )}

        {/*
          NO SEPARATE CREATE ACCOUNT. Signing in with an email and a code
          makes the account when the email is new (lib/site-accounts/
          sign-in.ts), so "Sign in" above is the way in for somebody who
          has shopped here before and for somebody who has not.
        */}

        {/*
          AND SEARCH ON A PHONE, which is where somebody is least willing to
          scroll a catalogue. It is a row rather than a third icon squeezed
          into the pair above, and it closes the drawer on the way out.
        */}
        {showSearch && (
          <a
            href="/search"
            /*
              WHEN THE HEADER OPENS SEARCH IN ITSELF, SO DOES THIS ROW.
              A menu that leaves for a page while the icon beside it opens a
              field is one control behaving two ways. The drawer slides out
              first and the field opens behind it, so the two are never on
              screen together.
            */
            onClick={
              onOpenSearch
                ? (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onClose()
                    window.setTimeout(onOpenSearch, CLOSE_MS)
                  }
                : handleLinkClick("/search")
            }
            className="border-t border-black/10 px-5 py-4 flex items-center gap-3 shrink-0 text-[15px] font-medium"
            style={{ background: scheme.bg, color: scheme.nav_link }}
          >
            <Search className="h-[20px] w-[20px]" strokeWidth={1.8} />
            <span>{w("search")}</span>
          </a>
        )}

      </aside>
  )

  return (
    <>
      {/* Backdrop — spans the ENTIRE viewport (top:0) so the drawer and
          overlay fully cover the sticky header when opened. */}
      <div
        aria-hidden
        data-site-drawer-backdrop=""
        ref={dismissBackdrop}
        className={cn(positionClass, "left-0 right-0 bg-black/50", DRAWER_BACKDROP_Z, phoneOnly && "md:hidden")}
        style={{
          ...frameStyle,
          pointerEvents: open ? "auto" : "none",
        }}
      />
      {/*
        FROM THE TOP, INSIDE A FRAME THAT STARTS UNDER THE HEADER. The frame
        is the drawer's rectangle and clips; the panel inside it is only as
        tall as its links and drops from the frame's top edge, so it never
        travels across the header. Presses on the frame below the panel fall
        through to the backdrop, which closes it. Fixed, the frame is a
        stacking context of its own, so it carries the panel's layer: without
        it the panel was drawn under the backdrop, dimmed, and a touch on it
        landed on the backdrop. It paints nothing itself.
      */}
      {fromTop ? (
        <div
          data-drawer-frame="top"
          className={cn(positionClass, "left-0 right-0 overflow-hidden", DRAWER_PANEL_Z)}
          style={{ ...frameStyle, pointerEvents: "none" }}
        >
          {menuPanel}
        </div>
      ) : menuPanel}
    </>
  )
}

// NOTE: The mobile drawer's currency + language selectors were removed
// entirely at user request. The drawer now ends at the nav list / footer
// icons — no trigger row, no expanding panel, no state.


export function HeaderSection({ section, theme, isEditing, isSelected, onClick, deviceMode, wrapperId, onEditorNavigate, canvasRoundedTopPx, insideEditor }: SectionProps) {
  // Treat ANY presence of `onEditorNavigate` as "we're inside the editor",
  // as a safety-net fallback for call sites that haven't yet been updated
  // to pass `insideEditor` explicitly. The website-builder editor is the
  // ONLY consumer that ever sets `onEditorNavigate`.
  const renderingInsideEditor = insideEditor ?? !!onEditorNavigate
  const { template: pageTemplate } = useStorelibPage()
  const s = section.settings
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  /* One function for the life of the header: the drawer's lock and its
     touch guard should not be handed a new one on every render. */
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), [])
  /* Whether a drawer is over the page, read by the scroll handler below
     without making it a dependency. Set during render, so it is already
     true when the lock's own scroll event arrives. */
  const drawerOverPage = useRef(false)

  // Resolve color scheme (falls back to explicit bg/text colors if still set)
  const schemeKey = (str(s.color_scheme, "white") as HeaderColorScheme)
  /*
    WITH THE HEADER'S OWN ADVANCED COLORS. This was `resolveScheme`, which
    reads the scheme alone, so every colour a creator set on the header in
    Advanced colors (its background, its text, its button) changed the panel
    and never the header. Setting the button's colour there also blanked the
    old CTA field, so the button fell back to an unrelated theme colour: the
    "I changed the button colour and nothing happened" report.
  */
  const scheme = sectionColors({ ...section, settings: { ...s, color_scheme: schemeKey } }, theme)
  /** The call to action, painted by the header's scheme and its own colours, hover included. */
  const ctaButton = schemeButton(scheme, "primary", { background: str(s.cta_color), text: str(s.cta_text_color) })
  /**
   * `header_transparent` is the control the panel offers; `transparent_on_hero`
   * is what it used to be called. Headers saved under the old name are still
   * out there, so it stays as the FALLBACK — read only when the current
   * control has never been set. It was a second primary read before, which
   * meant a creator turning the toggle off could not turn transparency off.
   */
  /* And, since Header › Transparent on, only on the home page when the
     creator asked for that: an inner page has no picture to sit over. */
  const transparent = transparentHere(bool(s.header_transparent, bool(s.transparent_on_hero, false)), s.header_transparent_scope, pageTemplate)
  // We approximate this by using transparent background only when the toggle is on
  // — the consumer (page renderer) wraps the header above the hero in those cases.
  const bg = transparent ? "transparent" : scheme.bg
  const textColor = scheme.heading
  const navLinkColor = scheme.nav_link
  const borderColor = scheme.inset_border

  const layout = str(s.header_layout, "logo_left_nav_right")
  /* One rule, shared with the Header elements panel, so a toggle and the
     icon it describes cannot disagree again. See lib/website-builder
     /header-icons.ts for the two that did. */
  const showAccount = headerIconOn(s.show_account_icon)
  const showWishlist = headerIconOn(s.show_wishlist_icon)
  const wishlistLabel = useWishlistLabel()
  const account = useAccountLink()
  /*
    ON BY DEFAULT. Every shop is expected to have one, and a header without a
    way to look for something is the first thing a visitor misses. It is a
    toggle rather than a fixture because a one-product site does not need it.
  */
  const showSearch = headerIconOn(s.show_search_icon, s.show_search)
  /*
    Two right answers, and the creator picks. A field that opens over the
    header suits a shop you can search from where you are stood; a page
    suits one with enough in it that the results need room. Open in the
    header is the default because it is what the themes people have used
    before do, and because it costs a visitor nothing to change their mind.
  */
  const searchOpensInHeader = str(s.search_behaviour, "header") !== "page"
  /* And, opening here, in the row or in a window over the page (header-search-modal.tsx). */
  const searchInWindow = searchMode(s.search_behaviour) === "modal"
  const [searchOpen, setSearchOpen] = useState(false)
  /*
    THE DROPDOWN A MENU BUTTON HAS OPENED, on a computer. A link with
    sub-links and nowhere of its own to go is a button (isMenuButton): a
    pointer resting on it opens its links, as it always did, and a press, a
    tap or Enter opens them too. Escape, a press anywhere else, or choosing a
    link puts them away.
  */
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const dropdownRoot = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!openDropdown) return
    const onDown = (e: PointerEvent) => {
      const el = e.target as Element | null
      if (el && el.closest?.(`[data-nav-item="${CSS.escape(openDropdown)}"]`)) return
      setOpenDropdown(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      const trigger = dropdownRoot.current?.querySelector<HTMLElement>(`[data-nav-item="${CSS.escape(openDropdown)}"] > button`)
      setOpenDropdown(null)
      if (trigger && trigger.closest("[data-nav-item]")?.contains(document.activeElement)) trigger.focus({ preventScroll: true })
    }
    document.addEventListener("pointerdown", onDown)
    window.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onDown)
      window.removeEventListener("keydown", onKey)
    }
  }, [openDropdown])
  const showCart = headerIconOn(s.show_cart_icon, s.show_cart)

  /*
    ═══════════════════════════════════════════════════════════════════════
     ONE DRAWER AT A TIME
    ═══════════════════════════════════════════════════════════════════════
    The menu, the cart and search each close the other two as they open.
    The cart can also open itself (Add to cart anywhere on the page), so it
    is watched rather than only asked. The rule is lib/website-builder
    /header-drawers.ts; the scroll lock they share is counted in
    drawer-frame.ts, so a handover never lets go of the page in between.
  */
  const { open: cartOpen, setOpen: setCartOpen } = useSiteCart()
  /*
    Header › Menu on larger screens. The links in the row, as every header
    had, or a menu button that opens the drawer from the left, the right or
    the top. A phone always has its menu button; this is the larger layout.
  */
  const desktopMenuSetting = desktopMenu(s.desktop_menu)
  const desktopEdge = desktopDrawerEdge(desktopMenuSetting)
  const drawerOnDesktop = desktopEdge !== null
  /* Does this surface have a menu drawer at all? Not on a desktop canvas whose links are in the row. */
  const hasMenuDrawer = menuDrawerExists(deviceMode, drawerOnDesktop)
  const openMenu = useCallback(() => {
    setSearchOpen(false)
    setCartOpen(false)
    setMobileNavOpen(true)
  }, [setCartOpen])
  const toggleMenu = () => { if (mobileNavOpen) setMobileNavOpen(false); else openMenu() }
  const closeSearch = useCallback(() => setSearchOpen(false), [])
  const toggleSearch = () => {
    if (searchOpen) { setSearchOpen(false); return }
    setMobileNavOpen(false)
    setCartOpen(false)
    setSearchOpen(true)
  }
  useEffect(() => {
    if (!cartOpen) return
    setMobileNavOpen(false)
    setSearchOpen(false)
  }, [cartOpen])
  /* A desktop canvas has no phone menu, so switching the preview to it closes one that was open. */
  useEffect(() => { if (!hasMenuDrawer) setMobileNavOpen(false) }, [hasMenuDrawer])
  /*
    AND PUBLISHED, WIDENING THE WINDOW PAST THE PHONE LAYOUT CLOSES IT. The
    drawer is hidden there by CSS; closing it as well lets go of the page,
    which would otherwise stay locked under a menu nobody can see.
  */
  useEffect(() => {
    if (deviceMode || !mobileNavOpen || typeof window.matchMedia !== "function") return
    const wide = window.matchMedia(`(min-width: ${MENU_DRAWER_MAX_WIDTH + 1}px)`)
    /* With a drawer on larger screens too it may stay, but it closes as the
       window crosses the breakpoint: the edge it came from may be another. */
    if (drawerOnDesktop) {
      const was = wide.matches
      const onCross = () => { if (wide.matches !== was) setMobileNavOpen(false) }
      wide.addEventListener("change", onCross)
      return () => wide.removeEventListener("change", onCross)
    }
    if (wide.matches) { setMobileNavOpen(false); return }
    const onChange = () => { if (wide.matches) setMobileNavOpen(false) }
    wide.addEventListener("change", onChange)
    return () => wide.removeEventListener("change", onChange)
  }, [deviceMode, mobileNavOpen, drawerOnDesktop])
  /*
    WHICH EDGE, HERE. The phone's setting on a phone and the larger screen's
    on a larger one. Published there is no device, so it is read from the
    window as the menu opens, and kept while it is open.
  */
  const [wideWindow, setWideWindow] = useState(false)
  useEffect(() => {
    if (deviceMode || !drawerOnDesktop || typeof window.matchMedia !== "function") return
    const wide = window.matchMedia(`(min-width: ${MENU_DRAWER_MAX_WIDTH + 1}px)`)
    const read = () => setWideWindow(wide.matches)
    read()
    wide.addEventListener("change", read)
    return () => wide.removeEventListener("change", read)
  }, [deviceMode, drawerOnDesktop])
  /*
    PREVIEWING Menu on phones SHOWS THE REAL DRAWER, AT THE REAL SIZE. In
    the editor's phone preview a change to the setting opens the menu, so
    the creator sees where it now comes from. In the desktop preview there
    is no phone menu to show, and nothing opens.
  */
  const menuStyleSetting = mobileMenuStyle(s.mobile_menu_style)
  const lastMenuStyle = useRef(menuStyleSetting)
  useEffect(() => {
    if (lastMenuStyle.current === menuStyleSetting) return
    lastMenuStyle.current = menuStyleSetting
    if (renderingInsideEditor && deviceMode === "mobile") openMenu()
  }, [menuStyleSetting, renderingInsideEditor, deviceMode, openMenu])
  /* And Menu on larger screens, the same way, in the desktop and tablet previews. */
  const lastDesktopMenu = useRef(desktopMenuSetting)
  useEffect(() => {
    if (lastDesktopMenu.current === desktopMenuSetting) return
    lastDesktopMenu.current = desktopMenuSetting
    if (!renderingInsideEditor || deviceMode === "mobile") return
    if (drawerOnDesktop) openMenu()
    else setMobileNavOpen(false)
  }, [desktopMenuSetting, drawerOnDesktop, renderingInsideEditor, deviceMode, openMenu])
  const drawerEdge = drawerEdgeHere(menuStyleSetting, desktopEdge, deviceMode, wideWindow)
  // Hover style for desktop menu links — mirrors the select in Header Settings.
  // Values: "inherit" | "none" | "underline" | "underline_reverse" | "fade_siblings"
  const menuHoverStyle = str(s.menu_link_hover_style, "inherit")
  // Header width — 3 real, working options for desktop screens + a full-width
  // edge-to-edge option. The number is a max-width cap applied to the
  // INNER container on `md:` and above, so on mobile the layout never
  // feels cramped. `legacy fields:` `max_width` and "fixed" both fall
  // through to sensible caps for backwards compat with older themes.
  //   narrow  — 960px  (compact, text-focused stores)
  //   medium  — 1140px (balanced default for most stores)
  //   wide    — 1280px (roomy for big hero imagery & dense nav)
  //   full    — no cap (edge-to-edge)
  const headerWidthRaw = str(s.header_width, str(s.max_width, "wide"))
  const headerWidthMaxPx: number | null =
    headerWidthRaw === "narrow" ? 960 :
    headerWidthRaw === "medium" ? 1140 :
    headerWidthRaw === "wide"   ? 1280 :
    headerWidthRaw === "fixed"  ? 1280 : // legacy alias
    null // "full"
  const isFixedWidth = headerWidthMaxPx !== null
  // Sticky header — honour new fields with legacy fallbacks.
  //   header_sticky_enabled       — master toggle
  //   header_sticky_on_scroll_up  — only reveal when scrolling up
  //   legacy: header_fixed / sticky
  const headerStickyEnabled = bool(
    s.header_sticky_enabled,
    bool(s.header_fixed, bool(s.sticky, true)),
  )
  const headerStickyOnScrollUp = bool(s.header_sticky_on_scroll_up, false)
  // Back-compat alias used further down
  const headerFixed = headerStickyEnabled

  // ── Scroll-aware sticky header ────────────────────────────────
  // SIMPLE + SMOOTH. The earlier three-state Glozin port was buggy in the
  // editor (it gated sticky on `stickyActive`, but the scroll target lookup
  // ran before the ref attached so `window` got the listener instead of
  // `#wb-preview-root` — result: sticky never activated inside the editor
  // and "blocked" on scroll-up). We're back to the proven two-state model:
  //
  //   • sticky is ALWAYS on when `headerStickyEnabled` — no activation gate
  //   • `stickyVisible === false` slides the header up 100% (only when
  //     `headerStickyOnScrollUp` is also true AND we're past 80px)
  //
  // Scroll-direction detection uses a 4px hysteresis so sub-pixel momentum
  // trackpad scroll doesn't flicker the state. The reveal/hide transition
  // uses Glozin's fadeInSticky curve (see `hideTransition` below).
  /**
   * ═══════════════════════════════════════════════════════════════════════
   *  THE REVEAL IS DRIVEN FROM THE SCROLL EVENT, NOT FROM REACT STATE
   * ═══════════════════════════════════════════════════════════════════════
   *
   * It used to be `useState` + a style prop, and that is what made it flash.
   * Scrolling is handled on the compositor; a React state update is a render,
   * a reconcile and a commit later. Flick to the top and for those few frames
   * the page has already arrived while the header is still holding
   * `translateY(-100%)` — displaced up over the announcement bar with its own
   * sticky space left empty underneath. That is the white band, for exactly as
   * long as the render lag, which is why it reads as a millisecond flicker
   * rather than as a layout bug.
   *
   * Written straight to the node instead, in the scroll handler, so the header
   * moves on the same tick as the scroll that moved it. It also means the
   * header no longer re-renders on scroll at all.
   *
   * AND THE HIDDEN STATE CANNOT OUTLIVE BEING PINNED. `hidden && pinned` is
   * the value applied, not `hidden` — so there is no ordering between two
   * pieces of state to get wrong, and no frame in which an unpinned header is
   * translated. That was the previous fix's remaining hole: the gate decided
   * when to CHANGE `hidden`, but the transform still rendered from `hidden`
   * alone.
   *
   * The transition stays ON while pinned, which is the smooth reveal, and is
   * off only while unpinned — where there is nothing to travel, because the
   * header is never translated there.
   */
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = headerRef.current
    if (!el) return
    const clear = () => {
      el.style.transform = ""
      el.style.transition = ""
      el.style.pointerEvents = ""
    }
    if (!headerStickyOnScrollUp) {
      clear()
      return
    }

    const target = ((): HTMLElement | Window => {
      if (!renderingInsideEditor) return window
      const preview = typeof document !== "undefined" ? document.getElementById("wb-preview-root") : null
      if (preview) return preview
      let node: HTMLElement | null = scrollAnchorRef.current
      while (node) {
        const oy = window.getComputedStyle(node).overflowY
        if ((oy === "auto" || oy === "scroll") && node.scrollHeight > node.clientHeight) return node
        node = node.parentElement
      }
      return window
    })()

    const getY = () => (target === window ? window.scrollY : (target as HTMLElement).scrollTop)

    /**
     * How far down the page the header's own box sits — the announcement bar's
     * height, plus anything else above it. `offsetTop` and not
     * `getBoundingClientRect().top`, because the rect is displaced by the very
     * transform this decides whether to apply.
     */
    /**
     * WHERE THE HEADER'S BOX SITS IN THE SCROLLING CONTENT.
     *
     * This used to walk `offsetParent`, and that is wrong inside the editor:
     * `offsetParent` SKIPS ancestors that are not positioned, so the walk never
     * reaches `#wb-preview-root` and instead accumulates the editor page's own
     * offsets. `settled` came out enormous, `mayMove` was never true, and the
     * header simply never hid — the reveal looked like it was not implemented.
     *
     * Rects instead, which are the same in both surfaces. The catch is that a
     * PINNED header reports a top of zero, so measuring then would say the box
     * lives wherever you have scrolled to. So the sample is only taken when the
     * header is demonstrably NOT pinned — its top still below the container's,
     * or the scroller at rest — and the last good value is kept otherwise. The
     * first sample is taken on mount, at whatever position the page loads at.
     */
    const containerTop = () => (target === window ? 0 : (target as HTMLElement).getBoundingClientRect().top)
    let origin = 0
    let height = 0
    const sampleOrigin = () => {
      /*
        NEVER WHILE A DRAWER IS OVER THE PAGE, for the same reason the
        decision below stands still there. Locking the page pins the body at
        minus its offset, so the scroller reports nought and a sticky header
        reports a top of nought with it — which reads as "this header lives at
        the very top of the page", and the clearance band that keeps it from
        flickering over the announcement bar would be thrown away by the act
        of opening the menu. The lock also changes the body's width on a
        screen with a scrollbar, which is enough to wake the observer below.
      */
      if (drawerOverPage.current) return
      const rel = el.getBoundingClientRect().top - containerTop()
      const y = getY()
      if (rel > 1 || y <= 1) origin = Math.max(0, y + rel)
      height = el.offsetHeight
    }

    /*
      A REVEAL IS A MOVEMENT, AND SOME PEOPLE HAVE ASKED FOR NONE.
      With reduced motion the header still hides and still comes back — that
      is the behaviour the creator switched on — it simply arrives instead of
      travelling.
    */
    const REVEAL = prefersStill() ? "none" : "transform 260ms cubic-bezier(0.32, 0.72, 0, 1)"
    /*
      AND IT IS ONLY WRITTEN WHEN IT CHANGES.

      This used to set all three properties on every scroll event — the same
      values, over and over, forty times a flick — and every one of those
      writes dirties the element's style whether or not the value moved. The
      header has exactly two states worth writing, and there is no reason to
      write either of them more than once. It also makes the reveal's own
      decisions readable in a film: the header's inline transform changes
      when the header changes, so a spurious move (one the visitor did not
      ask for, on a menu opening or closing) is a line in the record rather
      than something lost among forty identical writes. That is the check
      scripts/check-header-motion.mjs reports as `headerMoves`.
    */
    /*
      ═══════════════════════════════════════════════════════════════════════
       THE HEADER GOES WITH THE SCROLL, PIXEL FOR PIXEL (round 22)
      ═══════════════════════════════════════════════════════════════════════
      The owner: "as I start scrolling it feels too direct and bumpy, instead
      of going smoothly through the scroll." It was a switch: past the
      clearance line a scroll down of 4px set off a 350ms slide, whatever the
      finger was doing, so a slow scroll got a fast hide and a header that
      left on its own clock. Now the header moves with the page by exactly
      the distance scrolled, up to its own height, the way Safari's and the
      native apps' bars do: scrolling down takes it away as far as the page
      went, scrolling up brings it back as far. When the scroll stops halfway,
      it settles to whichever end is nearer (shown, after scrolling up), on
      the reveal's curve. Only translate, written once per frame and only
      when it changes. Reduced motion: it still follows the finger (that is
      the visitor moving it), and settles without travelling.
    */
    let shown = -1
    let shownTransition = ""
    const write = (off: number, transition: string) => {
      const px = Math.round(off * 2) / 2
      if (px === shown && transition === shownTransition) return
      shown = px
      shownTransition = transition
      el.style.transition = transition
      el.style.transform = `translate3d(0, ${-px}px, 0)`
      el.style.pointerEvents = px >= height - 1 && height > 0 ? "none" : ""
    }

    let lastY = getY()
    let offset = 0
    let lastDir: 1 | -1 = 1
    let settleTimer = 0
    write(0, "none")
    sampleOrigin()
    /* Where a scroll that has stopped leaves it: all the way in or all the way out. */
    const settle = () => {
      settleTimer = 0
      if (drawerOverPage.current || offset <= 0 || offset >= height) return
      offset = lastDir < 0 || offset < height / 2 ? 0 : height
      write(offset, REVEAL)
    }

    /*
      ═══════════════════════════════════════════════════════════════════════
       ONE DECISION PER FRAME, NOT ONE PER SCROLL EVENT
      ═══════════════════════════════════════════════════════════════════════
      A flick sends scroll events faster than the screen refreshes, and this
      ran the whole decision on each of them — a `getBoundingClientRect`, an
      `offsetHeight` and three style writes — for a screen that can only show
      one answer per frame. Work nobody can see, done on the thread that is
      supposed to be drawing.

      The event now does one thing: ask for a frame, if one has not been
      asked for already. The decision happens in that frame, once, against
      the offset as it is at that moment, which is also the only offset the
      frame is going to draw. The answer is the same and the work is a
      fraction of it.
    */
    let pendingFrame = 0
    const decide = () => {
      pendingFrame = 0
      /*
        NOT WHILE A DRAWER IS OVER THE PAGE. Pinning the page for the menu
        is itself a scroll: the document's offset drops to zero, and on the
        way out it jumps back. Read as a visitor scrolling, the first showed
        the header and the second hid it, so a header that was showing when
        the menu opened was gone when it closed. Nothing the visitor did
        happened in between, so nothing is recorded, and the offset after the
        close is the same one the header last saw.
      */
      if (drawerOverPage.current) return
      const y = getY()

      /**
       * A HEADER'S HEIGHT OF CLEARANCE BEFORE IT MAY MOVE AT ALL.
       *
       * The previous gate was `y >= origin - 1`: one pixel of slack, which is
       * none. Un-pinning is done by the BROWSER, natively, as the scroll
       * happens; the transform is applied by US, from a scroll event. Right at
       * the origin those two disagree for a frame or more — the browser has let
       * the header drop back to its place while the transform still holds it
       * up — and the header is drawn off its own box with the gap underneath
       * showing the page background. Filmed at 60fps it is a white band under
       * the header that grows toward the announcement bar's height and then
       * snaps shut.
       *
       * The fix is clearance, not precision. Below `origin + height` the header
       * is FORCED to `translateY(0)` with no transition, so by the time the
       * browser is anywhere near un-pinning it, there has been no transform on
       * the element for a whole header's worth of scrolling. Above it, the
       * header is unambiguously pinned and free to animate.
       *
       * Read fresh each time: both the announcement bar's height and the
       * header's own are settings, and a header that measured itself once at
       * mount is a header that is wrong after the first edit.
       */
      /*
        AND IT IS ONLY RE-MEASURED WHERE THE ANSWER CAN CHANGE. `sampleOrigin`
        reads the header's rectangle, which is the one expensive thing here,
        and above the clearance line it can only ever confirm what is already
        known: a pinned header's top IS the container's, so `rel` is nought,
        the guard above rejects the sample, and the read was for nothing.
        Below the line it is taken, which is exactly where the announcement
        bar's height and the header's own are still in play — and the
        ResizeObserver below catches an edit made while scrolled down.
      */
      if (y <= origin + height + 1) sampleOrigin()
      const settled = origin + height
      const dy = y - lastY
      lastY = y
      if (dy !== 0) lastDir = dy > 0 ? 1 : -1
      if (settleTimer) window.clearTimeout(settleTimer)
      settleTimer = 0
      /* Below the clearance line the browser is still placing the header itself: no transform at all. */
      if (y < settled) {
        offset = 0
        write(0, "none")
        return
      }
      /* Past it, the header goes exactly as far as the page did, never further than its own height. */
      offset = Math.min(height, Math.max(0, offset + dy))
      write(offset, "none")
      settleTimer = window.setTimeout(settle, 140)
    }

    const onScroll = () => {
      if (pendingFrame) return
      pendingFrame = requestAnimationFrame(decide)
    }

    /* A header whose own height changed — a logo swapped, a padding slider
       dragged — has a new clearance line, and the creator is often scrolled
       away from the top when they change it. */
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sampleOrigin) : null
    ro?.observe(el)
    window.addEventListener("resize", sampleOrigin)

    target.addEventListener("scroll", onScroll as EventListener, { passive: true })
    return () => {
      target.removeEventListener("scroll", onScroll as EventListener)
      window.removeEventListener("resize", sampleOrigin)
      ro?.disconnect()
      if (pendingFrame) cancelAnimationFrame(pendingFrame)
      if (settleTimer) window.clearTimeout(settleTimer)
      clear()
    }
  }, [renderingInsideEditor, headerStickyEnabled, headerStickyOnScrollUp])

  /*
    ═══════════════════════════════════════════════════════════════════════
     A SEE-THROUGH HEADER IS SOLID ONCE IT IS PINNED OVER THE PAGE
    ═══════════════════════════════════════════════════════════════════════
    Transparent is for sitting over the picture at the top of a page. Sticky
    as well, it went on being see-through over everything below the picture,
    text over text. It is clear at the top and takes its scheme's background
    from the moment it pins, the way Dawn's does, in the canvas's scroller and
    in the window alike. An attribute, not React state, so a scroll never
    re-renders the header.
  */
  const transparentSetting = bool(s.header_transparent, bool(s.transparent_on_hero, false))
  useEffect(() => {
    const el = headerRef.current
    if (!el) return
    if (!transparentSetting || !(headerStickyEnabled || headerStickyOnScrollUp)) { el.removeAttribute("data-scrolled"); return }
    const preview = renderingInsideEditor ? document.getElementById("wb-preview-root") : null
    const target: HTMLElement | Window = preview ?? window
    const top = () => (preview ? preview.getBoundingClientRect().top : 0)
    const offset = () => (preview ? preview.scrollTop : window.scrollY)
    let frame = 0
    const decide = () => {
      frame = 0
      if (drawerOverPage.current) return
      const pinned = offset() > 0 && el.getBoundingClientRect().top - top() <= 0.5
      if (pinned) el.setAttribute("data-scrolled", "")
      else el.removeAttribute("data-scrolled")
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(decide) }
    decide()
    target.addEventListener("scroll", onScroll as EventListener, { passive: true })
    return () => {
      target.removeEventListener("scroll", onScroll as EventListener)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [transparentSetting, headerStickyEnabled, headerStickyOnScrollUp, renderingInsideEditor])
  const transparentOnHero = transparent
  // A control at last, rather than a value nobody could set. Read by the
  // default "logo left, nav right" layout.
  const navAlignment = str(s.nav_alignment, "right")

  /*
    ═══════════════════════════════════════════════════════════════════════
     PADDING IN PIXELS, ONE NUMBER PER DEVICE
    ═══════════════════════════════════════════════════════════════════════
    These were `vw`. A viewport unit is one number that means something
    different on every screen: 1.2vw was 15px on a laptop and 5px on a
    phone, and in the editor it was measured against the BROWSER's width, so
    a phone preview drawn inside a desktop browser got a laptop's padding
    and then looked nothing like the phone it was previewing. That is the
    report about the slider not being accurate on mobile, in the editor,
    and on the live site all at once.

    A pixel is the same everywhere. The creator sets one number for desktop
    and one for phones, the desktop shell and the phone shell each carry
    their own, and the editor shows whichever device it is drawing.

    THE OLD VALUE IS STILL HONOURED, translated: a `vw` somebody set is
    turned into the pixels it came to at 1280px wide for the desktop and at
    390px for a phone, so a header keeps the padding it had on a common
    screen rather than snapping to the default.
  */
  const padDesktop = headerPad(s.vertical_padding, s.vertical_padding_vw, "desktop")
  const padMobile = headerPad(s.vertical_padding, s.vertical_padding_vw, "mobile")
  const linkSpacingPx = headerGap(s.link_spacing, s.link_spacing_vw)

  const forceMobile = deviceMode === "mobile"
  const hasDeviceMode = !!deviceMode

  /**
   * THE STORE'S LOGO, WHEREVER IT WAS UPLOADED.
   *
   * The theme's Branding group has a logo image and a logo width, and the
   * header read neither — it only looked at its own `logo_url`. A creator who
   * uploaded their logo under Branding, which is where you would look for it,
   * got the store name in text and no explanation.
   */
  /**
   * ═══════════════════════════════════════════════════════════════════════
   *  THE WORDMARK IS THE HEADING FACE, BECAUSE IT IS THE SITE'S NAME
   * ═══════════════════════════════════════════════════════════════════════
   * This was the logo_font setting with the word inherit behind it, and both
   * halves of that were wrong.
   *
   * `logo_font` is a setting no schema declares and no panel offers, so it
   * is never set and this was always the word `inherit`. And what the logo
   * inherits is not the page's font: it sits inside an <a href="/">, and the
   * theme's typography stylesheet gives every anchor in a section the BUTTON
   * role's face —
   *
   *     :where([data-section] a[href]){font-family:var(--type-button-font);…}
   *
   * so the site's name has been drawn in whatever face the BUTTONS use,
   * which nobody chose for it and which changes the wordmark the moment
   * somebody restyles a button. Measured in scripts/check-logo-font.mjs: on
   * a theme set to Playfair Display for headings, the wordmark came out in
   * DM Sans on both surfaces.
   *
   * The heading face instead, named rather than inherited, so it is the same
   * on the canvas and on the published page and does not move when something
   * else does. `logo_font` stays ahead of it as an override for the day a
   * control exists, and falls through to the heading face rather than to the
   * browser's default, which is a serif nobody asked for.
   */
  /* The rule is in lib/website-builder/header-settings.ts: a chosen family
     first, then the heading face, then the system's sans. "inherit", which
     the schema stores for no choice, is skipped, because inside a list it
     invalidated the whole declaration. */
  const logoFontStack = wordmarkFont(s.logo_font)

  const branding = theme as Record<string, unknown>
  const headerLogo = str(s.logo_url) || str(branding.logo_url)
  const logoMaxWidth = Number(branding.logo_width) || undefined

  const mobileLogoSrc = s.use_mobile_logo && s.mobile_logo_url ? str(s.mobile_logo_url) : headerLogo
  /*
    THE PHONE'S LOGO HEIGHT IS ITS OWN NUMBER, with or without a separate
    phone logo. It used to apply only to a second picture, so a site with one
    logo drew it 64px tall on a 390px screen and the only way to make it
    smaller was to upload the same file twice.
  */
  const mobileLogoH = typeof s.mobile_logo_height === "number" && s.mobile_logo_height > 0
    ? s.mobile_logo_height
    : s.use_mobile_logo && s.mobile_logo_url ? 32 : (Number(s.logo_height) || 64)
  const desktopLogoH = Number(s.logo_height) || 64

  // Custom logo horizontal position — desktop & mobile (separate)
  const desktopLogoOffsetEnabled = bool(s.logo_horizontal_offset_enabled, false)
  const desktopLogoOffsetPx = Number.isFinite(Number(s.logo_horizontal_offset_px))
    ? Number(s.logo_horizontal_offset_px)
    : 0
  const mobileLogoOffsetEnabled = bool(s.mobile_logo_horizontal_offset_enabled, false)
  const mobileLogoOffsetPx = Number.isFinite(Number(s.mobile_logo_horizontal_offset_px))
    ? Number(s.mobile_logo_horizontal_offset_px)
    : 0

  const desktopLogoTransform = desktopLogoOffsetEnabled && desktopLogoOffsetPx !== 0
    ? `translateX(${desktopLogoOffsetPx}px)`
    : undefined
  const mobileLogoTransform = mobileLogoOffsetEnabled && mobileLogoOffsetPx !== 0
    ? `translateX(${mobileLogoOffsetPx}px)`
    : undefined

  /*
    ═══════════════════════════════════════════════════════════════════════
     LOGO SHOWS: THE PICTURE, THE NAME, OR BOTH
    ═══════════════════════════════════════════════════════════════════════
    Header › Logo shows. Both is the picture with the store's name beside
    it, centred on the same line, the way a mark and a wordmark sit together.
    A header that never set it keeps what it drew: the picture when there is
    one, the name when there is not (logoParts).

    One drawing per shell. The phone shell asks for the phone's picture, its
    height and its nudge, the desktop shell for the desktop's, so a published
    page and the editor's preview of either device draw the same thing.
  */
  const logoName = str(s.logo_text, theme.brand_name ?? "My Store")
  const renderLogo = (mobile: boolean) => {
    const parts = logoParts(s.logo_mode, !!headerLogo)
    const height = mobile ? mobileLogoH : desktopLogoH
    return (
      <span
        className="inline-flex min-w-0 items-center gap-2.5"
        data-logo-mode={parts.image && parts.text ? "image_text" : parts.image ? "image" : "text"}
        style={{ transform: mobile ? mobileLogoTransform : desktopLogoTransform }}
      >
        {parts.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mobile ? mobileLogoSrc : headerLogo}
            alt={parts.text ? "" : str(s.logo_text, theme.brand_name ?? "Logo")}
            className="block shrink-0 object-contain"
            style={{
              height: `${height}px`,
              maxWidth: logoMaxWidth ? `${logoMaxWidth}px` : undefined,
            }}
            loading="eager"
            /* Decoded with the page, not after it: an async decode let the first frame of every page paint without the logo, the blink between pages. It is small. */
            decoding="sync"
            fetchPriority="high"
          />
        )}
        {parts.text && (
          <span
            className={cn("min-w-0 truncate font-bold leading-tight", mobile ? "text-[16px]" : "text-[17px]")}
            style={{ color: textColor, fontFamily: logoFontStack }}
          >
            {logoName}
          </span>
        )}
      </span>
    )
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   *  THE FALLBACK NAV ONLY NAMES ADDRESSES EVERY SITE ANSWERS
   * ═══════════════════════════════════════════════════════════════════════
   * This is what a header with no stored blocks renders, which is every site
   * whose header has never been edited. It shipped Home, Shop, About and
   * Contact, and measured on a real published site three of those four were
   * HTTP 404 — serving Storelib's own not-found page inside somebody's
   * website:
   *
   *     /          200   the site
   *     /products  200   the shop
   *     /shop      404
   *     /about     404
   *     /contact   404
   *
   * Reported as "the menu links do not work at all". They worked: the drawer
   * closed and the address changed, and what arrived was a Storelib 404 with
   * no header, no menu and no logo on it, which is a visitor stranded inside
   * a creator's site.
   *
   * `/shop` was never an address — lib/website-builder/live-links has said so
   * since it was written, and SHOP_PATH is the same constant this uses.
   * About and Contact are pages a creator MAKES; until they do, a link to
   * one is a promise the site cannot keep. A stored nav that names them is
   * left alone and repaired separately, in live-links, where the site's real
   * page list is in hand.
   */
  const DEFAULT_NAV_BLOCKS: { id: string; type: string; settings: Record<string, unknown> }[] = [
    { id: "nav-home", type: "nav_link", settings: { label: "Home", url: "/", link_type: "custom" } },
    { id: "nav-shop", type: "nav_link", settings: { label: "Shop", url: SHOP_PATH, link_type: "custom" } },
  ]
  /*
    A MENU FROM THEME SETTINGS › MENUS, when the header names one, in place
    of its own links: see lib/website-builder/header-settings.ts. The same
    menu can then sit in the header and in a footer column without being
    typed twice. `theme.menus` is cleaned (every address made safe) before
    it is turned into links.
  */
  const siteMenus = cleanMenus((theme as Record<string, unknown>).menus)
  const fromMenu = headerMenuBlocks(headerMenuHandleOf(str(s.menu), siteMenus), siteMenus)
  const navBlocks = fromMenu ?? ((section.blocks && section.blocks.length > 0) ? section.blocks : DEFAULT_NAV_BLOCKS)

  const resolveHref = (block: { settings: Record<string, unknown> }): string => {
    const linkType = str(block.settings.link_type, "custom")
    const url = str(block.settings.url, "")
    const targetId = str(block.settings.target_id, "")
    if (linkType === "product" && targetId) return `/products/${targetId}`
    // No "collection": there is no collection in this product, so the option
    // is gone from the control and a link saved under it before now has
    // nothing to point at. It falls through to whatever URL it carries.
    if (linkType === "page" && targetId) return `/${targetId}`
    if (linkType === "blog" && targetId) return `/blog/${targetId}`
    if (linkType === "blog_post" && targetId) return `/blog/${targetId}`
    return url || "#"
  }

  // Group nav blocks: root items + children keyed by parent id.
  const rootNavBlocks = navBlocks.filter(b => !(b.settings?.parent_id))
  const childrenByParent: Record<string, typeof navBlocks> = {}
  navBlocks.forEach(b => {
    const pid = b.settings?.parent_id as string | undefined
    if (pid) {
      if (!childrenByParent[pid]) childrenByParent[pid] = []
      childrenByParent[pid].push(b)
    }
  })

  // Hover classes — applied to the <span> that wraps the label TEXT inside
  // each anchor. Wrapping text in a span (instead of styling the anchor
  // directly) guarantees `hover:underline` and `hover:scale` render reliably
  // even when the anchor itself is `inline-flex` (required for the chevron
  // to sit to the right of the label). `fade_siblings` is handled at the
  // nav level via `:has()` so this returns an empty string.
  //
  // All styles are tuned to be SUBTLE, SMOOTH and MINIMAL — short easing,
  // light underline weight, small scale.
  const hoverClassFor = (style: string): string => {
    switch (style) {
      case "none":
        return ""
      case "underline":
        return "relative after:absolute after:left-0 after:right-0 after:-bottom-[3px] after:h-[1.5px] after:bg-current after:scale-x-0 after:origin-left hover:after:scale-x-100 after:transition-transform after:duration-[280ms] after:ease-[cubic-bezier(0.22,1,0.36,1)]"
      case "underline_reverse":
        return "relative after:absolute after:left-0 after:right-0 after:-bottom-[3px] after:h-[1.5px] after:bg-current after:scale-x-100 after:origin-right hover:after:scale-x-0 after:transition-transform after:duration-[280ms] after:ease-[cubic-bezier(0.22,1,0.36,1)]"
      case "fade_siblings":
        // Siblings fade is applied at the nav-level via :has(). Individual
        // link keeps full opacity on hover so it pops.
        return ""
      case "inherit":
      default:
        return "transition-opacity duration-200 hover:opacity-60"
    }
  }
  const hoverLabelClass = hoverClassFor(menuHoverStyle)

  const renderNavLinks = () => {
    if (!rootNavBlocks.length) return null
    return rootNavBlocks.map(block => {
      const openInNew = bool(block.settings.open_in_new_tab, false)
      const href = resolveHref(block)
      const label = str(block.settings.label)
      const kids = childrenByParent[block.id] ?? []
      const hasChildren = kids.length > 0
      /* A link with sub-links and nowhere of its own to go opens them instead (header-settings.ts). */
      const asButton = isMenuButton(href, kids.length)
      const dropdownOpen = asButton && openDropdown === block.id

      const linkAnchor = asButton ? (
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={dropdownOpen}
          aria-controls={`${block.id}-menu`}
          className="text-[14px] font-medium whitespace-nowrap inline-flex flex-row items-center gap-1.5 leading-none align-middle"
          style={{ color: navLinkColor }}
          onClick={e => {
            e.stopPropagation()
            setOpenDropdown(dropdownOpen ? null : block.id)
          }}
        >
          <span className={cn("inline-block", hoverLabelClass)}>{label}</span>
          <ChevronDown
            className={cn("h-[14px] w-[14px] shrink-0 translate-y-[0.5px] transition-transform duration-200", dropdownOpen && "rotate-180")}
            strokeWidth={2}
            aria-hidden
          />
        </button>
      ) : (
        <a
          href={href}
          target={openInNew ? "_blank" : undefined}
          rel={openInNew ? "noopener noreferrer" : undefined}
          className="text-[14px] font-medium whitespace-nowrap inline-flex flex-row items-center gap-1.5 leading-none align-middle"
          style={{ color: navLinkColor }}
          /**
           * Intercepted whenever this header is INSIDE THE EDITOR, not only
           * while the inspector is on. `onEditorNavigate` is only ever passed
           * by the editor, so its presence is the test. Gated on `isEditing`,
           * a nav link with the inspector off was a real anchor to "/" — which
           * in the editor's own document is storelib.com, not the site being
           * built. Home took people out of the builder.
           */
          onClick={e => {
            if (onEditorNavigate) {
              e.preventDefault()
              e.stopPropagation()
              onEditorNavigate(href, true)
            }
          }}
        >
          {/* Label — hover styles apply to this span so they render reliably
              regardless of the anchor's flex layout. */}
          <span className={cn("inline-block", hoverLabelClass)}>{label}</span>
          {hasChildren && (
            <ChevronDown
              className="h-[14px] w-[14px] shrink-0 translate-y-[0.5px] transition-transform duration-200 group-hover/navitem:rotate-180"
              strokeWidth={2}
              aria-hidden
            />
          )}
        </a>
      )

      // Hide on mobile shells.
      const visibilityClass = cn(
        hasDeviceMode && forceMobile ? "hidden" : "",
        !hasDeviceMode && "hidden md:inline-block",
      )

      if (!hasChildren) {
        return (
          <span key={block.id} className={cn("inline-block", visibilityClass)}>
            {linkAnchor}
          </span>
        )
      }

      // With children: wrap in a `group/navitem` container, render dropdown.
      return (
        <div
          key={block.id}
          data-nav-item={block.id}
          className={cn(
            "relative group/navitem",
            visibilityClass,
          )}
          /* A menu button opens under a resting pointer too, as the links did; never on a touch, whose tap is the press. */
          onPointerEnter={asButton ? (e) => { if (e.pointerType === "mouse") setOpenDropdown(block.id) } : undefined}
          onPointerLeave={asButton ? (e) => { if (e.pointerType === "mouse") setOpenDropdown((cur) => (cur === block.id ? null : cur)) } : undefined}
        >
          {linkAnchor}
          {/* Hover bridge — prevents the dropdown from closing when the
              cursor travels from the trigger into the panel. */}
          <div aria-hidden className="absolute left-0 right-0 top-full h-2" />
          {/* Dropdown panel */}
          <div
            role="menu"
            id={`${block.id}-menu`}
            data-open={asButton ? (dropdownOpen ? "true" : "false") : undefined}
            className={cn(
              // Dropdown z-index MUST be higher than every section below
              // (which sit at `isolate` / z:auto). We use z-[70] so the panel
              // paints over hero/image/product sections that render with
              // their own internal z-10 overlays. The header's own sticky
              // wrapper sits at z-[60] (below the drawer, see drawer-frame),
              // and because the dropdown lives inside that stacking context
              // its effective paint order vs. outside siblings = z-[60] —
              // still comfortably above all non-sticky section content.
              "theme-nav-dropdown absolute left-0 top-full mt-2 min-w-[200px] rounded-xl shadow-xl py-2 z-[70]",
              /* A link opens it under the pointer, and under the keyboard's focus; a menu button when it is pressed. */
              asButton
                ? (dropdownOpen ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-1 pointer-events-none")
                : cn(
                    "opacity-0 translate-y-1 pointer-events-none",
                    "group-hover/navitem:opacity-100 group-hover/navitem:translate-y-0 group-hover/navitem:pointer-events-auto",
                    "group-focus-within/navitem:opacity-100 group-focus-within/navitem:translate-y-0 group-focus-within/navitem:pointer-events-auto",
                  ),
              "transition-[opacity,translate] duration-200 ease-out",
            )}
            /*
              THE SCHEME PAINTS THIS, NOT A HARDCODED WHITE.

              It was `bg-white` with `ring-black/5` and `text-gray-800`
              children: a white card with dark text whatever the header was,
              so on a dark scheme it hung off the bar as a white slab with
              unreadable links. `header_dropdown_bg` and
              `header_dropdown_link` are slots the scheme already has — they
              resolve to its background and text — so there was nothing to
              add, only something to read.

              AND THE EDGE COMES FROM THE PANEL'S OWN INK. The first version
              of this used `scheme.inset_border`, which is the theme's
              BORDER slot, and that slot is for dividers drawn on the page's
              background. Borrowed for a panel floating on a coloured bar it
              came out as a hard dark outline round a coral menu — the line
              was the scheme's, and it was still the wrong line, because a
              scheme tunes that colour against a different surface.

              A wash of `currentColor` cannot be wrong that way: currentColor
              here IS `header_dropdown_link`, so the edge is always a
              hairline of the panel's own text, in proportion, on a light
              scheme and a dark one and on anything anybody builds later. It
              is the same reasoning as the hover tint below, which was got
              right first.
            */
            style={{
              backgroundColor: scheme.header_dropdown_bg || scheme.bg,
              color: scheme.header_dropdown_link || scheme.nav_link,
            }}
          >
            {kids.map(child => {
              const childHref = resolveHref(child)
              const childOpenInNew = bool(child.settings.open_in_new_tab, false)
              return (
                <a
                  key={child.id}
                  href={childHref}
                  target={childOpenInNew ? "_blank" : undefined}
                  rel={childOpenInNew ? "noopener noreferrer" : undefined}
                  /*
                    `currentColor` is the panel's own link colour from the
                    scheme, so the hover tint is a wash of the text over the
                    panel and lands right on a dark scheme and a light one
                    alike. `hover:bg-gray-50` only ever worked on white.
                  */
                  /*
                    THE TRIGGER'S OWN TYPE. 14px and font-medium are what the
                    nav link above renders at, and the family comes from the
                    theme's stylesheet through the header. A submenu set half
                    a pixel under its own trigger reads as a different menu
                    rather than as part of this one.
                  */
                  role="menuitem"
                  className="theme-nav-dropdown-item block px-4 py-2 text-[14px] font-medium transition-colors whitespace-nowrap"
                  style={{ color: "inherit" }}
                  onClick={e => {
                    setOpenDropdown(null)
                    if (onEditorNavigate) {
                      e.preventDefault()
                      e.stopPropagation()
                      onEditorNavigate(childHref, true)
                    }
                  }}
                >
                  {str(child.settings.label)}
                </a>
              )
            })}
          </div>
        </div>
      )
    })
  }

  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  THERE IS NO CART, SO THERE IS NO CART ICON
   * ═════════════════════════════════════════════════════════════════════════
   * The header carried a shopping bag, a count badge, a subtotal and a
   * slide-out drawer. Nothing ever put anything in any of them: the count
   * came from a `window` event no code dispatches, the drawer said "your
   * cart is empty" because it could say nothing else, and the "Page" style
   * sent people to /cart, which is not a route anywhere in this product.
   * Storelib sells one thing at a time — Buy goes straight to
   * /checkout?productId= — so a cart is a feature, not a fix, and a shopping
   * bag that can never fill is a shop that looks broken.
   *
   * The three theme settings that configured it went with it.
   */

  // On a phone the header carries the hamburger and nothing else: account
  // and wishlist live in the drawer it opens, where there is room for a word
  // beside the icon.
  const renderIcons = (forMobile: boolean = false) => (
    <div className="flex min-w-0 items-center gap-2 shrink-0" style={{ color: textColor }}>
      {/*
        ACCOUNT AND WISHLIST GO SOMEWHERE. Both were buttons whose only
        behaviour was `preventDefault()`: on a published site they were three
        pixels of hover state and nothing else. They are this website's own
        pages now: Sign in (or Account, once signed in) and the Wishlist,
        see ACCOUNT_PATH above.
      */}
      {/*
        SEARCH GOES TO THE SITE, not to the platform. A search is about THIS
        shop's catalogue, so it is a root-relative link the proxy resolves to
        whichever address the site is being served on (the subdomain, the
        custom domain or /w/<name>) without any of them being named here.
      */}
      {/*
        SEARCH IS ON A PHONE TOO, on the right beside the bag.

        It was desktop only, on the reasoning that the phone drawer carries a
        Search row with room for the word beside the icon. It does, and that
        is one tap too many for the thing somebody on a phone reaches for
        first: a shop's catalogue is longer than a thumb wants to scroll, and
        finding search meant opening a menu to look for it.

        The two controls that carry a shopper's intent, what they are looking
        for and what they have chosen, sit together on the right. Account and
        wishlist stay in the drawer, where they read as words.
      */}
      {showSearch && (
        searchOpensInHeader ? (
          <button
            type="button"
            aria-label="Search"
            aria-expanded={searchOpen}
            onClick={(e) => { e.stopPropagation(); toggleSearch() }}
            className="h-9 w-9 flex items-center justify-center rounded-full theme-tint-hover transition-colors"
          >
            <Search className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </button>
        ) : (
          <a
            href="/search"
            aria-label="Search"
            onClick={onEditorNavigate ? (e) => e.preventDefault() : undefined}
            className="h-9 w-9 flex items-center justify-center rounded-full theme-tint-hover transition-colors"
          >
            <Search className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </a>
        )
      )}
      {showAccount && !forMobile && (
        <a
          href={account.href}
          aria-label={account.label}
          title={account.label}
          onClick={onEditorNavigate ? (e) => { e.preventDefault(); onEditorNavigate(account.href, true) } : undefined}
          className="h-9 w-9 flex items-center justify-center rounded-full theme-tint-hover transition-colors"
        >
          <User className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </a>
      )}
      {showWishlist && !forMobile && (
        <a
          href={WISHLIST_PATH}
          aria-label={wishlistLabel}
          onClick={onEditorNavigate ? (e) => { e.preventDefault(); onEditorNavigate(WISHLIST_PATH, true) } : undefined}
          className="relative h-9 w-9 flex items-center justify-center rounded-full theme-tint-hover transition-colors"
        >
          <Heart className="h-[18px] w-[18px]" strokeWidth={1.8} />
          <SavedCount className="-top-0.5 -right-0.5" />
        </a>
      )}
      {/*
        THE BAG IS ON A PHONE TOO, unlike account and wishlist. Those two are
        links off to the platform and read fine as words in the menu; a cart
        is where a shopper's decisions are being collected, and hiding the
        count behind a hamburger is how a basket gets abandoned. It is the
        one icon that carries state, so it is the one that stays visible.
      */}
      {showCart && <CartButton />}
      {/*
        The store's social links, when the theme says they belong up here.
        "Show icons in header" was a toggle with no wire behind it.
      */}
      {!forMobile && (
        <ThemeSocials theme={theme} where="header" className="flex items-center gap-2 pl-1" size={16} />
      )}
      {/* Call-to-action button.
          Visibility is gated by the `show_cta_button` toggle (default ON).
          The label falls back to "Shop Now" if the user hasn't typed one —
          so enabling the toggle always produces a real, clickable button
          instead of nothing. */}
      {(s.show_cta_button !== false) && (
        <a
          href={str(s.cta_url, "#")}
          className={cn(
            /**
             * IT MAY SHRINK, AND IT MAY NOT PUSH THE PAGE.
             *
             * `shrink-0` on a nowrap label means the button's width is
             * whatever its text needs, for ever. Measured at 834px with a
             * forty-character call to action — a real one, somebody's actual
             * button copy — the header ran 104px past the edge of the page and
             * took the whole document into horizontal scroll with it.
             *
             * The theme's `overflow-wrap: anywhere` cannot help here: a flex
             * item that is not allowed to shrink never gets down to its
             * min-content width in the first place. So it shrinks, it has a
             * ceiling, and anything past that is an ellipsis.
             */
            "ml-1 min-w-0 max-w-[160px] truncate font-semibold px-3 py-1.5 text-[13px]",
            hasDeviceMode ? (forceMobile ? "hidden" : "") : "hidden md:inline-block",
          )}
          /**
           * The header offered a CTA colour and a CTA label colour and painted
           * the button with the THEME's primary colour and hard-coded white
           * text. Both pickers are read now; both default to what was being
           * painted, so no header that already exists changes.
           */
          data-sl-button={ctaButton["data-sl-button"]}
          data-button=""
          style={ctaButton.style}
          onClick={e => {
            if (onEditorNavigate) {
              e.preventDefault()
              e.stopPropagation()
              onEditorNavigate(str(s.cta_url, "#"), true)
            }
          }}
        >
          {str(s.cta_text, "Shop Now")}
        </a>
      )}
    </div>
  )

  // Mobile hamburger — 3 animated bars that morph into an X when open.
  // Rendered on the LEFT side of the header on mobile.
  /* `forDesktop`: the menu button the larger layout gets from Menu on larger screens. It only ever sits in the desktop shell, which hides it on a phone. */
  const renderHamburger = (forDesktop: boolean = false) => (
    <button
      type="button"
      aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
      aria-expanded={mobileNavOpen}
      data-menu-button={forDesktop ? "desktop" : "phone"}
      className={cn(
        "h-9 w-9 items-center justify-center rounded-full theme-tint-hover transition-colors shrink-0",
        forDesktop
          ? "flex"
          : hasDeviceMode
          ? (forceMobile ? "flex" : "hidden")
          : "flex md:hidden",
      )}
      style={{ color: navLinkColor }}
      onClick={e => { e.preventDefault(); toggleMenu() }}
    >
      {/*
        ═══════════════════════════════════════════════════════════════════
         THE BARS SLIDE ON THE COMPOSITOR, NOT ON `top`
        ═══════════════════════════════════════════════════════════════════
        The top and bottom bars used to travel by transitioning `top` from
        0px and 14px to 7px. `top` is a layout property: every frame of that
        180ms asks the browser to lay the page out again, and it runs during
        the exact frames the menu drawer is trying to slide in — which is the
        one moment on the whole page where there is no main thread to spare.
        scripts/check-header-motion.mjs names it in the list of what is
        animating during an open: "top on span".

        Two nested spans instead. The outer one carries the travel as a
        `translateY`, the inner one the rotation, so the stagger the original
        had — slide first, then turn — survives while both halves stay on the
        compositor and cost the layout nothing.
      */}
      <span className="relative block h-[16px] w-[22px]">
        <span
          aria-hidden
          className="absolute left-0 top-0 h-[2px] w-full"
          style={{
            transform: mobileNavOpen ? "translateY(7px)" : "translateY(0px)",
            transition: mobileNavOpen
              ? "transform 180ms cubic-bezier(0.4, 0, 0.6, 1)"
              : "transform 180ms 60ms cubic-bezier(0.32, 0.72, 0, 1)",
          }}
        >
          <span
            aria-hidden
            className="block h-full w-full rounded-full"
            style={{
              background: navLinkColor,
              transform: mobileNavOpen ? "rotate(45deg)" : "rotate(0deg)",
              transition: mobileNavOpen
                ? "transform 200ms 80ms cubic-bezier(0.32, 0.72, 0, 1)"
                : "transform 160ms cubic-bezier(0.4, 0, 1, 1)",
            }}
          />
        </span>
        <span
          aria-hidden
          className="absolute left-0 top-[7px] h-[2px] w-full rounded-full"
          style={{
            background: navLinkColor,
            opacity: mobileNavOpen ? 0 : 1,
            transition: mobileNavOpen
              ? "opacity 120ms ease-out"
              : "opacity 160ms 60ms ease-in",
          }}
        />
        <span
          aria-hidden
          className="absolute left-0 top-[14px] h-[2px] w-full"
          style={{
            transform: mobileNavOpen ? "translateY(-7px)" : "translateY(0px)",
            transition: mobileNavOpen
              ? "transform 180ms cubic-bezier(0.4, 0, 0.6, 1)"
              : "transform 180ms 60ms cubic-bezier(0.32, 0.72, 0, 1)",
          }}
        >
          <span
            aria-hidden
            className="block h-full w-full rounded-full"
            style={{
              background: navLinkColor,
              transform: mobileNavOpen ? "rotate(-45deg)" : "rotate(0deg)",
              transition: mobileNavOpen
                ? "transform 200ms 80ms cubic-bezier(0.32, 0.72, 0, 1)"
                : "transform 160ms cubic-bezier(0.4, 0, 1, 1)",
            }}
          />
        </span>
      </span>
    </button>
  )

  // ── Layout variants ──────────────────────────────────────
  // For the "fade siblings" hover style the nav's own :hover fades its
  // anchors to 40% opacity, and the hovered one stays at 100%.
  /* With a drawer on larger screens the row has no links: the menu button opens them. */
  const navNode = drawerOnDesktop ? null : (
    <nav
      ref={dropdownRoot}
      className={cn(
        "flex items-center",
        // "Fade siblings": while the pointer is over the nav, every anchor
        // but the hovered one smoothly fades to 40% opacity, dropdown
        // triggers included. The nav's own :hover sets a variable the
        // anchors read. It was `:has(a:hover)`, and a hover state inside any
        // :has() in the stylesheet made Chromium restyle the whole document
        // on every hover change anywhere, the builder's canvas included
        // (lib/press-mark.ts). The links sit edge to edge but for the gap,
        // so the difference is the gap between two links.
        menuHoverStyle === "fade_siblings" &&
          "[&_a]:transition-opacity [&_a]:duration-[220ms] [&_a]:[opacity:var(--nav-fade,1)] hover:[--nav-fade:0.4] [&_a:hover]:opacity-100",
      )}
      style={{ gap: `${linkSpacingPx}px` }}
    >
      {renderNavLinks()}
    </nav>
  )

  /**
   * ═════════════════════════════════════════════════════════════════════
   *  THE LOGO GOES HOME
   * ═════════════════════════════════════════════════════════════════════
   * It was a bare <span> or <img>, so it was not a link anywhere: not in
   * the editor and not on the published site. Every website on earth puts
   * its home page behind its logo, and a visitor who clicks it and stays
   * where they are concludes the site is broken before they conclude
   * anything about the shop.
   *
   * A real <a href="/"> so it is one for a visitor, a keyboard and a search
   * engine, and the same interception the nav uses so that inside the
   * editor it changes the page being edited rather than taking the builder
   * to storelib.com.
   */
  const logoFor = (mobile: boolean) => (
    /* A phone may shorten a long store name rather than push the icons off. */
    <div className={cn("flex items-center gap-2", mobile ? "min-w-0" : "shrink-0")}>
      <a
        href="/"
        aria-label="Go to the home page"
        className="inline-flex min-w-0 items-center no-underline"
        style={{ color: "inherit" }}
        onClick={(e) => {
          if (!onEditorNavigate) return
          e.preventDefault()
          e.stopPropagation()
          onEditorNavigate("/", true)
        }}
      >
        {renderLogo(mobile)}
      </a>
    </div>
  )
  const logoNode = logoFor(false)
  const phoneLogoNode = logoFor(true)

  // ── Mobile shell (driven by `mobile_header_layout`) ──────
  const mobileLayout = str(s.mobile_header_layout, "logo_center_hamburger_left")
  const buildMobileShell = (): React.ReactNode => {
    if (mobileLayout === "logo_left_hamburger_right") {
      return (
        <div className="w-full flex items-center justify-between gap-3">
          <div className="flex items-center min-w-0">{phoneLogoNode}</div>
          <div className="flex items-center gap-1">
            {renderIcons(true)}
            {renderHamburger()}
          </div>
        </div>
      )
    }
    if (mobileLayout === "hamburger_left_logo_left") {
      return (
        <div className="w-full flex items-center gap-3">
          {renderHamburger()}
          <div className="flex items-center min-w-0">{phoneLogoNode}</div>
          <div className="flex-1" />
          {renderIcons(true)}
        </div>
      )
    }
    // logo_center_hamburger_left (default) — truly centered logo via 3-col grid
    return (
      <div className="w-full grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex items-center justify-start">{renderHamburger()}</div>
        <div className="flex items-center justify-center min-w-0">{phoneLogoNode}</div>
        <div className="flex items-center justify-end">{renderIcons(true)}</div>
      </div>
    )
  }

  // When we KNOW the device (editor preview) we render only one layout;
  // otherwise (live site) we render BOTH and use Tailwind `md:` classes to
  // swap at the breakpoint so mobile browsers see the hamburger shell and
  // desktop browsers see the configured desktop layout.
  const isMobileShell = hasDeviceMode && forceMobile
  const isLiveResponsive = !hasDeviceMode
  /*
    MENU ON LARGER SCREENS: A MENU BUTTON. The links leave the row and the
    same hamburger a phone has sits beside the logo, opening the drawer from
    the edge the setting names. In the two layouts with a slot of their own
    on the left, the button takes that slot.
  */
  const deskMenuButton = drawerOnDesktop ? renderHamburger(true) : null
  const deskLogo = deskMenuButton ? (
    <div className="flex min-w-0 items-center gap-3">
      {deskMenuButton}
      {logoNode}
    </div>
  ) : logoNode
  let content: React.ReactNode
  if (isMobileShell) {
    content = buildMobileShell()
  } else if (layout === "logo_left_nav_center") {
    // Truly centered nav using 3-col grid
    content = (
      <div className="w-full grid grid-cols-[1fr_auto_1fr] items-center gap-6">
        <div className="flex items-center">{deskLogo}</div>
        <div className="flex items-center justify-center">{navNode}</div>
        <div className="flex items-center justify-end">{renderIcons()}</div>
      </div>
    )
  } else if (layout === "nav_left_logo_center") {
    // Truly centered logo using 3-col grid
    content = (
      <div className="w-full grid grid-cols-[1fr_auto_1fr] items-center gap-6">
        <div className="flex items-center justify-start">{navNode ?? deskMenuButton}</div>
        <div className="flex items-center justify-center">{logoNode}</div>
        <div className="flex items-center justify-end">{renderIcons()}</div>
      </div>
    )
  } else if (layout === "logo_center_nav_below") {
    content = (
      <div className="w-full flex flex-col items-center gap-3">
        <div className="w-full grid grid-cols-[1fr_auto_1fr] items-center gap-6">
          {deskMenuButton ? <div className="flex items-center justify-start">{deskMenuButton}</div> : <div />}
          <div className="flex items-center justify-center">{logoNode}</div>
          <div className="flex items-center justify-end">{renderIcons()}</div>
        </div>
        {navNode && <div className="flex items-center justify-center w-full">{navNode}</div>}
      </div>
    )
  } else if (layout === "logo_left_nav_inline") {
    content = (
      <div className="w-full flex items-center gap-8">
        {deskLogo}
        {navNode}
        <div className="flex-1" />
        {renderIcons()}
      </div>
    )
  } else {
    // logo_left_nav_right (default) — honours legacy nav_alignment when set
    if (navAlignment === "center") {
      content = (
        <div className="w-full grid grid-cols-[1fr_auto_1fr] items-center gap-6">
          <div className="flex items-center">{deskLogo}</div>
          <div className="flex items-center justify-center">{navNode}</div>
          <div className="flex items-center justify-end">{renderIcons()}</div>
        </div>
      )
    } else if (navAlignment === "left") {
      content = (
        <div className="w-full flex items-center gap-6">
          {deskLogo}
          {navNode}
          <div className="flex-1" />
          {renderIcons()}
        </div>
      )
    } else {
      content = (
        <div className="w-full flex items-center justify-between gap-6">
          {deskLogo}
          <div className="flex items-center" style={{ gap: `${linkSpacingPx}px` }}>
            {navNode}
            {renderIcons()}
          </div>
        </div>
      )
    }
  }

  // On the live site (no deviceMode) always wrap the desktop content in a
  // `hidden md:flex` container and also render the mobile shell with
  // `flex md:hidden`, so every visitor gets a proper responsive header.
  if (isLiveResponsive) {
    const desktopContent = content
    /* Each shell carries its own padding, so the phone's number is the
       phone's and the desktop's is the desktop's, with no media query to
       keep in step with the breakpoint that hides one of them. */
    content = (
      <>
        <div className="hidden md:flex w-full" style={{ paddingTop: padDesktop, paddingBottom: padDesktop }}>{desktopContent}</div>
        <div className="flex md:hidden w-full" style={{ paddingTop: padMobile, paddingBottom: padMobile }}>{buildMobileShell()}</div>
      </>
    )
  }

  /* In the editor the canvas is one device at a time, so the padding is that
     device's, on the row. Published, the shells above carry it instead. */
  const padHere = isLiveResponsive ? 0 : forceMobile ? padMobile : padDesktop
  const innerStyle: CSSProperties = {
    paddingTop: padHere,
    paddingBottom: padHere,
    borderColor,
    color: textColor,
  }
  const widthClass = isFixedWidth ? "mx-auto" : "w-full"
  // Width change reflects LIVE in the editor. The transition on maxWidth is
  // what makes Narrow/Medium/Wide/Full feel "snappy but visible" — without it
  // the change is instantaneous and hard to perceive when the preview frame
  // is already close to the cap (e.g. selecting Wide 1280 in a 1300px canvas).
  const widthStyle: CSSProperties = isFixedWidth && headerWidthMaxPx
    ? {
        maxWidth: `${headerWidthMaxPx}px`,
        width: "100%",
        transition: "max-width 260ms cubic-bezier(0.22, 0.61, 0.36, 1)",
      }
    : {
        maxWidth: "none",
        width: "100%",
        transition: "max-width 260ms cubic-bezier(0.22, 0.61, 0.36, 1)",
      }
  const outerPaddingClass = hasDeviceMode
    ? (forceMobile ? "px-4" : "px-[5%]")
    : "px-4 md:px-[5%]"


  /**
   * ===========================================================================
   *  ONE STICKY MODE, AND IT IS `position: sticky`
   * ===========================================================================
   * The live site used `position: fixed` plus an in-flow spacer, on the
   * grounds that the marketing layout's `<main className="[overflow-x:clip]">`
   * "kills `position: sticky` in most browsers". That is true of
   * `overflow: hidden` and NOT true of `clip` — not making a scroll container
   * is the entire reason `clip` exists. Measured in Chromium against the real
   * layout, flex wrapper and all: sticky pins at 0 and returns to 44px, exactly
   * as it should.
   *
   * The fixed version produced both of the bugs a creator could see on their
   * published site and not in the editor:
   *
   *   • A header pinned to `top: 0` COVERS THE ANNOUNCEMENT BAR, and the
   *     spacer underneath it reserves the header's height a second time — so
   *     the bar vanished and a band of empty background appeared below the
   *     header.
   *
   *   • Scrolling back to the top slid the header DOWN OVER the bar, because
   *     a fixed header has no natural position to return to.
   *
   * Sticky has neither problem: the bar scrolls away, the header pins, and on
   * the way back the header lands under the bar again because that is where it
   * lives. And the editor and the published page now run the same branch,
   * which is what stops the two disagreeing a third time.
   */
  /**
   * EITHER TOGGLE MAKES IT STICK, BECAUSE REVEAL-ON-SCROLL-UP IS A KIND OF
   * STICKY.
   *
   * These were master-and-sub: "Sticky header on scroll up" did nothing unless
   * "Enable sticky header" was also on. But the two describe DIFFERENT
   * behaviours, not a feature and its option — one is "always pinned", the
   * other is "pinned, but out of the way until you scroll up" — and the second
   * one reads, on its own control with its own description, as a complete
   * choice. Turning it on and getting a header that does not move at all is the
   * setting lying.
   *
   * A header that reveals on scroll up has to be sticky to reveal ANYWHERE, so
   * the position follows from either toggle.
   */
  const useSticky = headerStickyEnabled || headerStickyOnScrollUp

  const headerRef = useRef<HTMLDivElement | null>(null)
  /*
    ONE REF CALLBACK FOR THE LIFE OF THE HEADER. An inline arrow is a new
    callback every render, and React detaches the old one (null) before the
    drawers inside the header run their layout effects: the menu measured a
    header that was not there, and opened over it instead of under it.
  */
  const attachHeader = useCallback((el: HTMLDivElement | null) => {
    headerRef.current = el
    scrollAnchorRef.current = el
  }, [])
  /*
    A DRAWER OVER THE PAGE, the menu or the bag: the header's show on scroll
    up stands still, so the lock is not read as a scroll.
  */
  const drawerOpen = mobileNavOpen || (showCart && cartOpen) || (searchInWindow && searchOpen)
  drawerOverPage.current = drawerOpen
  /*
    THE HEADER STAYS. It used to fade out under an open drawer, which on a
    phone read as the menu hiding the header. The menu opens below it now,
    and the cart's backdrop dims it like the rest of the page.
  */
  const [measuredH, setMeasuredH] = useState(0)
  useLayoutEffect(() => {
    // Measure for both the live fixed header (so the spacer reserves the
    // right height) and the editor sticky header (so the mobile drawer can
    // start just below it).
    // Measured whenever the header is sticky OR transparent: the transparent
    // overlay below needs the height to cancel out with a negative margin.
    if (!headerStickyEnabled && !transparent) { setMeasuredH(0); return }
    const el = headerRef.current
    if (!el) return
    const update = () => setMeasuredH(el.offsetHeight)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener("resize", update)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", update)
    }
  }, [headerStickyEnabled, transparent])

  // ── Bottom border + depth shadow (Header settings) ──────────
  //
  // The header used to always render a hard `border-b`. That's now
  // controlled by three settings in Header Settings → Border & Shadow:
  //   • show_bottom_border   (toggle)   — master on/off
  //   • border_style         (radio)    — "solid" | "subtle"
  //   • border_visibility    (select)   — "none" | "home_only" |
  //                                        "inner_only" | "all"
  //   • header_depth_shadow  (toggle)   — subtle modern drop shadow
  //                                        under the header (default ON)
  //
  // Legacy fields (show_border) still feed show_bottom_border when the
  // new field is missing, so older themes don't lose their border.
  const borderEnabled = bool(s.show_bottom_border, bool(s.show_border, true))
  const borderStyleRaw = str(s.border_style, "solid") // "solid" | "subtle"
  const borderVisibility = str(s.border_visibility, "all") // "none" | "home_only" | "inner_only" | "all"
  // Determine whether the CURRENT page counts as "home" — only relevant when
  // the visibility selector limits the border to a subset. We detect this
  // at render time via the pathname because the header doesn't know which
  // page it's on otherwise. Inside the editor we treat every page as
  // "home" for visibility purposes so the setting is easy to preview.
  /*
    FROM THE PAGE BEING DRAWN, NOT THE ADDRESS BAR. This read
    `window.location` while rendering, so the server (no window) and the
    browser disagreed about the border and React threw the server's header
    away; and it counted any one-segment path as home, so "home page only"
    also drew the border on /about. The page's template is in context on
    the live page and in the canvas alike: "index" is the front page.
  */
  /* And the canvas asks the same question of the page it is drawing, so
     "Inner pages only" shows its border on an inner page in the editor too.
     It used to call every page in the editor the home page. */
  const shouldShowBorder = headerBorderHere(borderEnabled, borderVisibility, pageTemplate)
  // Depth shadow — default ON. A very soft 1–2px shadow that gives the
  // header subtle physical depth. Sits on the OUTER wrapper so it
  // doesn't get clipped by the inner content.
  const headerDepthShadow = bool(s.header_depth_shadow, true)

  // The actual header visual — always identical between editor and live.
  // We put the slide-up/down transform on the OUTERMOST wrapper so the
  // whole header (including its background) hides together instead of
  // leaving an empty bar behind.
  const headerInner = (
    <div
      className={cn("relative", transparent && useSticky && "transition-[background-color] duration-200 [[data-scrolled]>&]:!bg-[var(--hdr-solid)]")}
      style={{
        background: bg,
        // Border rendered INSIDE the header (inset) so it doesn't add any
        // layout offset when toggled on/off. "subtle" uses 50% alpha of
        // the scheme's inset_border; "solid" uses the scheme colour as-is.
        boxShadow: [
          /*
            A SEPARATOR ALWAYS DARKENS. NEVER A LIGHT LINE.

            This was drawn in `scheme.inset_border`, the scheme's divider
            colour for lines inside content, which is light because content
            usually is. On a dark header that is a bright line across the
            page. Drawing it from the header's own text colour instead only
            moved the problem: on a dark header the text is white, so the
            line was white, and it came back as "what is that white line
            under the header" twice.

            A separator between two surfaces is a shadow where one meets the
            other. A shadow is darker than what it falls on, in every room
            and on every screen, so this is a fixed dark hairline: a normal
            divider under a light header, and nothing at all under a black
            one, which is the correct amount of line to draw between black
            and what is below it. Subtle is half of it.

            PURE BLACK, NOT SLATE. Written first as rgba(15, 23, 42, …),
            the tint everything else here shades with, and the probe
            photographed it on a black header and found the line lighter than
            the header by two levels: 15, 23, 42 is not black, so a tenth of
            it laid over #000000 lightens it. The whole point is that this can
            never lighten anything, and only pure black cannot.

            Measured by scripts/check-header-seam.mjs, which photographs the
            header over the section under it and reads the pixels: no row
            anywhere near the edge may come out lighter than the surface it
            is drawn on.
          */
          shouldShowBorder
            ? `inset 0 -1px 0 rgba(0, 0, 0, ${borderStyleRaw === "subtle" ? 0.05 : 0.1})`
            : null,
          // Smooth subtle depth shadow (Figma-like). Two layers:
          //   - 1px hairline with 4% alpha: creates the sense of a hard
          //     edge separating the header from the content
          //   - 6px soft blur with 5% alpha: the "hover off the page"
          //     feel the user asked for in the screenshot
          /* Black for the same reason as the line above: a slate-tinted
             shadow under a black header is a pale haze on the section below
             it rather than a shadow. The probe measured that one too. */
          headerDepthShadow
            ? "0 1px 0 rgba(0, 0, 0, 0.04), 0 4px 12px -6px rgba(0, 0, 0, 0.08)"
            : null,
        ]
          .filter(Boolean)
          .join(", ") || undefined,
      }}
    >
      <div className={cn(widthClass, outerPaddingClass)} style={{ ...innerStyle, ...widthStyle }}>
        {content}
      </div>
      {showSearch && searchOpensInHeader && !searchInWindow && (
        <HeaderSearchPanel
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          scheme={scheme}
          background={bg === "transparent" ? scheme.bg : bg}
          radius={buttonRadiusStyle(theme)}
          placeholder={str(s.search_placeholder, "Search")}
          widthClass={widthClass}
          paddingClass={outerPaddingClass}
          innerStyle={innerStyle}
          widthStyle={widthStyle}
          onEditorNavigate={onEditorNavigate}
        />
      )}
    </div>
  )

  // Sticky reveal timing ported verbatim from the Glozin theme's
  // `fadeInSticky` animation (see assets/theme.css → .shopify-section-header-sticky):
  //   transition: transform 350ms cubic-bezier(0.22, 0.61, 0.36, 1);
  // The 0.22/0.61/0.36/1 curve is a "quint-like" ease-out that feels crisp
  // and confident at the start and settles softly at the end — exactly the
  // "smooth, clean, accurate" reveal the user asked for.
  /**
   * ─────────────────────────────────────────────────────────────────────────
   *  NOTHING MOVES UNLESS THE REVEAL IS TURNED ON
   * ─────────────────────────────────────────────────────────────────────────
   *
   * `header_sticky_on_scroll_up` defaults to FALSE, so on almost every site
   * this header never moves — and yet it was still shipping
   * `transform: translateY(0)`, a `transition` and `will-change: transform`
   * on every render. An identity transform is not free: with `will-change` it
   * promotes the header to its own compositor layer, permanently, for an
   * animation that never runs.
   *
   * That is what leaves the band. The LAYOUT is correct — measured in
   * Chromium, in all four configurations, the next section's top and the
   * header's bottom are the same pixel — so what is visible under the header
   * is not a gap in the page, it is a stale tile from a promoted layer that
   * the compositor did not repaint. A permanently promoted `position: sticky`
   * element inside an `overflow-x: clip` ancestor is exactly where that shows
   * up, and it explains the two things a layout bug cannot: why it appears
   * only after scrolling, and why it comes and goes.
   *
   * So the promotion is now tied to the thing that needs it. Reveal off: no
   * transform, no transition, no `will-change` — an ordinary sticky header,
   * with nothing for the compositor to keep alive. Reveal on: the machinery
   * is there, because then it genuinely animates on every scroll.
   */
  const revealEnabled = headerStickyOnScrollUp

  /* One drawer per cart, even beside a header of the creator's own with a bag in it (site-drawer-host.ts). */
  const hostsCart = useDrawerHost(setCartOpen, section.id, showCart)
  const cartDrawer = showCart && hostsCart ? (
    <HeaderCartDrawer
      scheme={scheme}
      scopedToPreview={renderingInsideEditor}
      onEditorNavigate={renderingInsideEditor ? onEditorNavigate : undefined}
    />
  ) : null

  /* Header › When search is clicked › Open a search window. */
  const searchWindow = showSearch && searchInWindow ? (
    <SearchModal
      open={searchOpen}
      onClose={closeSearch}
      scheme={scheme}
      radius={buttonRadiusStyle(theme)}
      placeholder={str(s.search_placeholder, "Search")}
      scopedToPreview={renderingInsideEditor}
      onEditorNavigate={renderingInsideEditor ? onEditorNavigate : undefined}
    />
  ) : null

  /*
    THE PHONE MENU EXISTS ONLY WHERE THERE IS A PHONE LAYOUT. In the editor
    that is the phone preview and nowhere else; published, it is drawn for
    every width and CSS hides it from the tablet breakpoint up (phoneOnly).
    A desktop canvas has no element for it at all, so no setting can put a
    phone menu over a desktop page.
  */
  const mobileDrawer = hasMenuDrawer ? (
    <HeaderMobileNavDrawer
      open={mobileNavOpen}
      onClose={closeMobileNav}
      scheme={scheme}
      menuStyle={drawerEdge}
      /* Published, a phone's alone, unless Menu on larger screens has a drawer too. */
      phoneOnly={!deviceMode && !drawerOnDesktop}
      below={headerRef}
      // CRITICAL: use `renderingInsideEditor`, NOT `isEditing`. `isEditing`
      // flips with the Inspector toggle — when the user turns Inspector off
      // the drawer would portal into `document.body` with `position: fixed`
      // and cover the entire editor viewport (including the left nav + rail)
      // instead of staying scoped to the preview card. `renderingInsideEditor`
      // stays TRUE for the whole editor session, so the drawer is always
      // scoped to `#wb-preview-root` in both desktop and mobile preview modes.
      scopedToPreview={renderingInsideEditor}
      onEditorNavigate={renderingInsideEditor ? onEditorNavigate : undefined}
      showAccount={showAccount}
      showWishlist={showWishlist}
      showSearch={showSearch}
      /* The same toggle, text, link and colours the desktop button uses.
         Resolved here rather than inside the drawer so there is one answer
         to "is there a call to action and what does it look like". */
      onOpenSearch={showSearch && searchOpensInHeader ? () => setSearchOpen(true) : null}
      cta={
        s.show_cta_button !== false && str(s.cta_text, "Shop Now").trim()
          ? {
              text: str(s.cta_text, "Shop Now"),
              url: str(s.cta_url, "/"),
              style: ctaButton.style,
            }
          : null
      }
      items={rootNavBlocks.map(b => {
        const kids = childrenByParent[b.id] ?? []
        return {
          id: b.id,
          label: str(b.settings.label),
          href: resolveHref(b),
          openInNew: bool(b.settings.open_in_new_tab, false),
          children: kids.length > 0
            ? kids.map(c => ({
                id: c.id,
                label: str(c.settings.label),
                href: resolveHref(c),
                openInNew: bool(c.settings.open_in_new_tab, false),
              }))
            : undefined,
        }
      })}
    />
  ) : null

  /**
   * THE TRANSPARENT HEADER TAKES NO SPACE.
   *
   * "Make header transparent" is for a header sitting over a hero image, and
   * in flow it only ever showed the page background instead. A negative bottom
   * margin of exactly its own height cancels the space it occupies, so the
   * section below starts underneath it — the overlay the control describes,
   * without leaving `position: sticky` behind. Verified in Chromium: the
   * header's top and the hero's top land on the same pixel.
   */
  const overlayMargin: React.CSSProperties | undefined = transparent
    ? {
        /**
         * A CSS variable with a real default rather than a plain negative
         * number, because `measuredH` comes from a layout effect and there is
         * no layout effect on the server. With a bare `-measuredH` the header
         * took full space in the first paint and jumped up on hydration — a
         * layout that needs JavaScript to be correct is a layout that flashes.
         *
         * 72px is a header with the default 64px logo and its padding; the
         * measured value replaces it a frame later, so the correction is a few
         * pixels rather than the whole header.
         */
        marginBottom: "calc(-1 * var(--storelib-header-h, 72px))",
        ...(measuredH ? ({ "--storelib-header-h": `${measuredH}px` } as React.CSSProperties) : {}),
      }
    : undefined

  // 1) Sticky — the editor canvas and the published page, the same branch.
  //    The transform lives on the SectionWrapper's root div rather than on an
  //    inner wrapper, so when the header slides up the WHOLE thing (background
  //    and content) goes with it.
  if (useSticky) {
    return (
      <SectionWrapper
        isChrome
        id={wrapperId}
        bgColor={bg}
        isEditing={isEditing}
        isSelected={isSelected}
        onClick={onClick}
        disableWrapperTransition
        canvasRoundedTopPx={canvasRoundedTopPx}
        dataSticky={revealEnabled ? "scroll-up" : "always"}
        className={cn(
          "sticky top-0 z-[60] isolate",
          // Only when it actually animates — the reveal effect above writes
          // the transform straight to this node on scroll.
          revealEnabled && "will-change-transform",
          /* A see-through header that has pinned over the page takes its
             scheme's background, or its links sit on whatever scrolls under
             them. `data-scrolled` is written by the effect above. */
          transparent && "transition-[background-color] duration-200 [&[data-scrolled]]:!bg-[var(--hdr-solid)]",
          // Suppress the hover ring on the sticky header — it looks broken
          // when it appears over the sliding transform. The SELECTED ring
          // (blue) must remain so the user can see which section is
          // currently picked, matching every other section's behaviour.
          "hover:!ring-0",
        )}
        style={{
          // Make sure the background is fully opaque (no glassmorphism /
          // bleed-through from the content behind it).
          backgroundColor: bg,
          opacity: 1,
          ...(transparent ? ({ "--hdr-solid": scheme.bg } as CSSProperties) : {}),
          // Absent entirely when the reveal is off, so the header is a plain
          // sticky box with no compositor layer of its own.
          // NOT set here. `transform`, `transition` and `pointerEvents` are
          // owned by the reveal effect and written straight to the node, so a
          // React render can never race the scroll that moved it — and so this
          // prop cannot overwrite them on an unrelated re-render.
          ...overlayMargin,
        }}
        forwardRef={attachHeader}
      >
        {headerInner}
        {mobileDrawer}
        {cartDrawer}
        {searchWindow}
      </SectionWrapper>
    )
  }

  // 2) Plain non-sticky. Still honours transparency, which it did not before:
  //    a transparent header with sticky turned off simply showed the page
  //    background, so the control meant two different things.
  return (
    <SectionWrapper
      isChrome
      id={wrapperId}
      bgColor={bg}
      isEditing={isEditing}
      isSelected={isSelected}
      onClick={onClick}
      canvasRoundedTopPx={canvasRoundedTopPx}
      dataSticky="none"
      className={transparent ? "z-[60]" : undefined}
      style={overlayMargin}
      forwardRef={attachHeader}
    >
      {headerInner}
      {mobileDrawer}
      {cartDrawer}
      {searchWindow}
    </SectionWrapper>
  )
}

export default HeaderSection
