"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { Search, Clock, ArrowUpLeft, X, Store } from "lucide-react"
import { useLocale } from "@/components/locale-provider"
import { useRecentSearches } from "@/lib/hooks/use-recent-searches"
import { DEPARTMENT_RAIL } from "@/lib/marketplace/department-nav"
import { DEPARTMENTS } from "@/lib/marketplace/listing-taxonomy"
import { SmartLink } from "@/components/smart-link"
import { SellerScore } from "@/components/marketplace/seller-score"
import { AvatarPhoto } from "@/components/ui/initial-avatar"
import { IosSpinner } from "./ios-spinner"
import { cn } from "@/lib/utils"
import { claimSurface } from "@/lib/surface-bg"
import { lockScroll } from "@/lib/scroll-lock"

type SearchTab = "items" | "categories" | "people"

/**
 * TWO TABS, NOT THREE — Categorii IS TEMPORARILY OUT.
 *
 * A tab earns its place by answering a question the other tabs cannot. Articole
 * and Persoane do: "what is for sale" and "who is selling", and neither is
 * reachable from the other. Categorii did not, and the reason is that the
 * categories are already everywhere else on this surface — the rail sits
 * directly under this panel on the desktop header, the department menu is one
 * press away, and every listing card carries its own. A third of the width of
 * a search panel spent on a list you can see behind it is a third of the width
 * spent on nothing.
 *
 * TEMPORARILY, and written that way on purpose. `CategoriesTab` below is left
 * intact and `SearchTab` still names it, so putting the row back is one line
 * here rather than a rebuild — this is a decision about whether the tab is
 * pulling its weight today, not a deletion of the feature.
 */
const TABS: ReadonlyArray<readonly [SearchTab, string]> = [
  ["items", "mfeed.tab_items"],
  ["people", "mfeed.tab_people"],
]

// Popular query expansions — the "platform knows what people search" signal.
// Typing a token surfaces the popular full queries people actually run. Broad
// coverage across sneakers, streetwear, luxury, denim, outerwear, bags, womens-
// wear and vintage so almost any query lands on relevant, richer suggestions.
const POPULAR_EXPANSIONS: Record<string, string[]> = {
  // ── Jordan / Nike ──
  jordan: ["jordan 4", "jordan 4 black cat", "jordan 4 white cement", "jordan 1 chicago", "jordan 1 low", "jordan 3", "jordan 11", "jordan retro"],
  "jordan 4": ["jordan 4 black cat", "jordan 4 white cement", "jordan 4 bred", "jordan 4 military black", "jordan 4 thunder"],
  "jordan 1": ["jordan 1 chicago", "jordan 1 low", "jordan 1 mocha", "jordan 1 unc", "jordan 1 shadow"],
  nike: ["nike air max", "nike dunk low", "nike tech fleece", "nike air force 1", "nike vomero", "nike shox", "nike vintage"],
  "air force": ["air force 1", "air force 1 white", "air force 1 shadow", "air force 1 low"],
  airforce: ["air force 1", "air force 1 white"],
  "air max": ["air max 90", "air max 95", "air max plus tn", "air max 1"],
  dunk: ["nike dunk low", "dunk panda", "dunk low retro", "dunk unc"],
  tn: ["air max plus tn", "nike tn triple black"],
  vomero: ["nike vomero 5", "nike zoom vomero"],
  "tech fleece": ["nike tech fleece", "nike tech fleece grey", "nike tech fleece set"],
  // ── Adidas / New Balance / others ──
  adidas: ["adidas samba", "adidas gazelle", "adidas spezial", "adidas campus", "adidas superstar", "adidas handball spezial"],
  samba: ["adidas samba og", "samba black", "samba white"],
  gazelle: ["adidas gazelle", "gazelle indoor", "gazelle bold"],
  spezial: ["adidas handball spezial", "spezial blue"],
  campus: ["adidas campus 00s", "campus grey"],
  yeezy: ["yeezy 350", "yeezy slide", "yeezy boost 700", "yeezy foam runner"],
  "new balance": ["new balance 550", "new balance 990", "new balance 2002r", "new balance 9060", "new balance 530"],
  newbalance: ["new balance 550", "new balance 990", "new balance 2002r", "new balance 9060"],
  "550": ["new balance 550", "new balance 550 green"],
  asics: ["asics gel kayano", "asics gel 1130", "asics gel nyc"],
  salomon: ["salomon xt6", "salomon speedcross"],
  converse: ["converse chuck 70", "converse vintage"],
  vans: ["vans old skool", "vans knu skool", "vans vintage"],
  // ── Streetwear / brands ──
  supreme: ["supreme box logo", "supreme hoodie", "supreme tee", "supreme vintage"],
  "stone island": ["stone island jacket", "stone island hoodie", "stone island vintage"],
  stone: ["stone island jacket", "stone island hoodie"],
  "north face": ["north face puffer", "north face nuptse", "north face jacket", "north face vintage"],
  northface: ["north face puffer", "north face nuptse"],
  carhartt: ["carhartt jacket", "carhartt double knee", "carhartt beanie", "carhartt vintage"],
  arcteryx: ["arcteryx beta", "arcteryx jacket"],
  "arc'teryx": ["arcteryx beta", "arcteryx jacket"],
  corteiz: ["corteiz cargos", "corteiz hoodie", "corteiz tracksuit"],
  trapstar: ["trapstar hoodie", "trapstar tracksuit"],
  nocta: ["nocta hoodie", "nocta tech fleece"],
  essentials: ["fear of god essentials", "essentials hoodie"],
  "fear of god": ["fear of god essentials", "fear of god hoodie"],
  // ── Denim / Levis ──
  levis: ["levis 501", "levis 501 vintage", "levis 550", "levis denim jacket", "levis vintage"],
  "levi's": ["levis 501", "levis vintage"],
  jeans: ["baggy jeans", "levis 501", "vintage jeans", "wide leg jeans", "carpenter jeans"],
  denim: ["denim jacket", "vintage denim", "baggy denim"],
  // ── Luxury / bags ──
  gucci: ["gucci bag", "gucci belt", "gucci vintage"],
  prada: ["prada bag", "prada nylon bag", "prada re edition"],
  "louis vuitton": ["louis vuitton bag", "louis vuitton speedy", "louis vuitton vintage"],
  dior: ["dior saddle bag", "dior bag"],
  chanel: ["chanel bag", "chanel vintage", "chanel flap"],
  coach: ["coach bag", "coach vintage"],
  bag: ["shoulder bag", "tote bag", "crossbody bag", "vintage bag", "mini bag"],
  // ── Garments ──
  hoodie: ["nike hoodie", "vintage hoodie", "champion hoodie", "essentials hoodie", "zip hoodie"],
  tee: ["vintage tee", "graphic tee", "band tee", "boxy tee"],
  "t-shirt": ["vintage t-shirt", "graphic t-shirt", "band t-shirt"],
  tshirt: ["vintage tshirt", "graphic tshirt"],
  polo: ["polo ralph lauren", "polo shirt", "ralph lauren polo", "vintage polo"],
  ralph: ["polo ralph lauren", "ralph lauren vintage", "ralph lauren jumper"],
  jacket: ["denim jacket", "leather jacket", "bomber jacket", "puffer jacket", "vintage jacket"],
  puffer: ["north face puffer", "puffer jacket", "cropped puffer"],
  jumper: ["knitted jumper", "vintage jumper", "ralph lauren jumper"],
  cargos: ["cargo pants", "corteiz cargos", "parachute cargos"],
  cargo: ["cargo pants", "cargo trousers"],
  tracksuit: ["nike tracksuit", "adidas tracksuit", "corteiz tracksuit"],
  // ── Womenswear ──
  dress: ["summer dress", "vintage dress", "mini dress", "maxi dress", "midi dress"],
  skirt: ["mini skirt", "denim skirt", "pleated skirt"],
  top: ["corset top", "crop top", "going out top"],
  heels: ["black heels", "vintage heels"],
  // ── Vintage ──
  vintage: ["vintage tee", "vintage nike", "vintage jacket", "vintage denim", "vintage jumper", "y2k vintage"],
  y2k: ["y2k tops", "y2k jeans", "y2k accessories"],
}

// Generic modifiers appended to a query when nothing more specific matches, so
// even an unknown brand still yields useful, varied suggestions.
const GENERIC_MODIFIERS = ["vintage", "black", "white", "hoodie", "jacket", "tee", "y2k"]

function buildKeywordSuggestions(raw: string, realTitles: string[]): string[] {
  const query = raw.trim().toLowerCase()
  if (!query) return []
  const out: string[] = []
  const push = (s: string) => {
    const v = s.trim().replace(/\s+/g, " ")
    if (v && v.length <= 46 && !out.some((x) => x.toLowerCase() === v.toLowerCase())) out.push(v)
  }

  const tokens = query.split(/\s+/).filter(Boolean)

  // 1. Popular expansions — match the whole query or any of its tokens.
  const scored: { v: string; score: number }[] = []
  for (const [key, vals] of Object.entries(POPULAR_EXPANSIONS)) {
    const keyMatch =
      query.includes(key) || key.includes(query) || tokens.some((tk) => key.includes(tk) || tk.includes(key))
    if (!keyMatch) continue
    for (const v of vals) {
      const lv = v.toLowerCase()
      // Rank: starts-with query > contains query > loosely related.
      const score = lv.startsWith(query) ? 3 : lv.includes(query) ? 2 : 1
      scored.push({ v, score })
    }
  }
  scored.sort((a, b) => b.score - a.score)
  for (const s of scored) push(s.v)

  // 2. Real listing titles that match — reflects actual on-platform inventory.
  for (const title of realTitles) {
    if (out.length >= 9) break
    if (title && title.toLowerCase().includes(query)) push(title)
  }

  // 3. Fallback so short/unknown queries still feel rich.
  if (out.length < 4) {
    for (const m of GENERIC_MODIFIERS) {
      push(`${raw.trim()} ${m}`)
      if (out.length >= 6) break
    }
  }

  // 4. Always let the user search exactly what they typed, up top.
  const exact = raw.trim()
  const rest = out.filter((s) => s.toLowerCase() !== exact.toLowerCase())
  return [exact, ...rest].slice(0, 8)
}

/**
 * EVERY ANSWER THIS SESSION HAS ALREADY HAD.
 *
 * Search is the one surface where the same request is made over and over by
 * definition: "jordan" is typed as j, jo, jor, jord… and then half of it is
 * deleted and retyped. Keeping the answers means the panel can respond on the
 * frame a key is pressed for every query it has seen, which is what makes
 * backspacing feel instant rather than like a fresh search.
 *
 * Module scope rather than component state: the overlay unmounts every time it
 * closes, and a cache that dies with it would be empty exactly when somebody
 * reopens the search to refine what they just typed.
 *
 * Capped and evicted oldest-first. A Map iterates in insertion order, so the
 * first key is the oldest one — no timestamps, no sorting.
 */
const SEARCH_CACHE_MAX = 40
const searchCache = new Map<string, { titles: string[]; people: Person[] }>()

function rememberSearch(key: string, titles: string[], people: Person[]): void {
  // Delete before set, so re-answering an old query moves it to the back of the
  // eviction queue instead of leaving it at the front.
  searchCache.delete(key)
  searchCache.set(key, { titles, people })
  if (searchCache.size > SEARCH_CACHE_MAX) {
    const oldest = searchCache.keys().next().value
    if (oldest !== undefined) searchCache.delete(oldest)
  }
}

interface Person {
  id: string
  slug?: string
  headline?: string | null
  products_count?: number | null
  /** Batched by the endpoint over the page it returns, so the row can draw the
   *  same ⭐ 4,9 · 63 vândute line the profile does at no extra request. `null`
   *  rating means unrated — never 0; see components/marketplace/seller-score.tsx. */
  sold_count?: number | null
  rating?: number | null
  reviews_count?: number | null
  profile?: { display_name?: string | null; avatar_url?: string | null; username?: string | null } | null
}

/**
 * Full-screen mobile search surface (Depop-style). Opens with a smooth blend,
 * two tabs — Items / People, see the note on TABS — recent searches,
 * platform-aware keyword suggestions and live member search.
 */
export function MobileSearchOverlay({
  open,
  onClose,
  onSelectCategory,
  onSearchSubmit,
  initialQuery = "",
  anchored = false,
  anchorTo,
  query: controlledQuery,
  onQueryChange,
}: {
  open: boolean
  onClose: () => void
  onSelectCategory: (id: string) => void
  /** Fired right when a search is run, so the feed can jump to the results tab. */
  onSearchSubmit?: () => void
  /** Pre-fills the field when opened (e.g. an active search on the feed). */
  initialQuery?: string
  /**
   * DROP FROM A FIELD THAT IS ALREADY ON SCREEN, instead of being a panel with
   * a field of its own.
   *
   * The desktop header has a search box in the bar. A centred modal with its
   * own box put TWO search inputs on screen at once, and hiding the header's
   * while the panel was open was worse again: the thing you clicked vanished
   * from where you clicked it and a different one appeared lower down.
   *
   * Anchored mode is the answer the old dropdown had right. The header's field
   * stays exactly where it is and stays the one you type in; this renders the
   * results under it, positioned by being a child of the field's own container
   * rather than by measuring anything. There is one input, it never moves, and
   * the panel is visibly attached to it.
   *
   * Requires a `position: relative` parent, and the caller must own the query.
   */
  anchored?: boolean
  /**
   * The element the panel hangs off, when anchored.
   *
   * It is MEASURED and the panel is drawn in a portal at those coordinates,
   * rather than being an `absolute` child of it. That looks like the long way
   * round and it is the only way that holds:
   *
   * The header is `sticky` with a `z-index`, which makes it a STACKING CONTEXT.
   * A panel inside it can be given z-90 and still be trapped underneath the
   * page, because its z-index is resolved against its siblings inside the
   * header and the whole header is then placed as one layer. Its scrim has the
   * same problem in reverse: `fixed inset-0` covers the viewport geometrically
   * but is still painted within the header's layer. And any ancestor that ever
   * grows an `overflow` — a scrolling category rail is one edit away — clips it
   * outright with no warning.
   *
   * A portal to `document.body` has none of those. The cost is that the
   * position has to be recomputed on resize and on scroll, which is what the
   * effect below does.
   */
  anchorTo?: React.RefObject<HTMLElement | null>
  /** Controlled query. Passed with `anchored`, where the caller draws the
   *  field; omitted on a phone, where this component draws it. */
  query?: string
  onQueryChange?: (value: string) => void
}) {
  const { t } = useLocale()
  const router = useRouter()
  const { searches, add: addSearch, remove: removeSearch, clear: clearSearches } = useRecentSearches()

  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  ONE SEARCH, TWO SHAPES — and it used to be one shape and a stub
   * ═════════════════════════════════════════════════════════════════════════
   *
   * This is the marketplace's real search: items, categories and people behind
   * three tabs, recent queries, and the popular-expansion table that turns
   * "jordan" into the eight things people actually look for. It was
   * `md:hidden`, so a desktop browser could not reach any of it.
   *
   * What a desktop got instead was the header's own dropdown, which predates
   * the marketplace entirely: nine digital-goods categories (Design,
   * Development, Marketing, AI…), results linking to /p/ product pages,
   * prices in dollars, "Product by", and English copy on a Romanian site. It
   * was not a smaller version of this — it was a different product's search,
   * left running.
   *
   * So the same component now draws a centred panel above 768px. Same tabs,
   * same suggestions, same recents, same everything; a phone gets the full
   * screen it needs and a desktop gets a panel under the header, because a
   * 2000px window blanked to white for a search box is the same category of
   * mistake as a bottom sheet on a monitor.
   */
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)
  const [tab, setTab] = useState<SearchTab>("items")
  const [ownQuery, setOwnQuery] = useState("")
  // Controlled when the caller draws the field, uncontrolled when this does.
  // One `query` either way, so nothing below has to know which case it is in.
  const query = controlledQuery ?? ownQuery
  const setQuery = onQueryChange ?? setOwnQuery
  const [titles, setTitles] = useState<string[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [peopleLoading, setPeopleLoading] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)

  /** Where the field is, in viewport coordinates. Null until measured, which is
   *  before the first paint — see the layout effect. */
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null)

  useEffect(() => {
    if (!open) return
    // Wherever focus happens to be. The caller's input has its own handler, but
    // focus moves the moment anything in the panel is clicked, and a panel that
    // only closes while one particular element is focused is a panel that
    // stops responding to Escape as soon as you use it.
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", esc)
    return () => document.removeEventListener("keydown", esc)
  }, [open, onClose])

  useLayoutEffect(() => {
    if (!anchored || !mounted) return
    const measure = () => {
      const el = anchorTo?.current
      if (!el) return
      const r = el.getBoundingClientRect()
      // 8px of air under the field, which is what `mt-2` used to be.
      setBox({ top: r.bottom + 8, left: r.left, width: r.width })
    }
    measure()
    // `true` on the scroll listener so it fires for scrolls in any container,
    // not only the window: a sticky header does not move, but the page under it
    // does, and on a short window the header can still travel.
    window.addEventListener("resize", measure)
    window.addEventListener("scroll", measure, true)
    return () => {
      window.removeEventListener("resize", measure)
      window.removeEventListener("scroll", measure, true)
    }
  }, [anchored, mounted, anchorTo])

  // Smooth mount / open / close blend.
  useEffect(() => {
    if (open) {
      setMounted(true)
      // BOTH frames, and a floor under them.
      //
      // Only the outer handle was kept, so a cleanup landing between the two
      // frames cancelled nothing that mattered — the inner one still fired and
      // set `shown` on a panel that had already been told to close.
      //
      // And requestAnimationFrame does not run at all while the WebView is not
      // painting, which is the same way the feed's cross-fade could hang. Here
      // it would leave search mounted, invisible and inert while the screen that
      // opened it believes it is open: you press Search and nothing happens. The
      // timeout is longer than two frames on any device and shorter than anyone
      // waits, so in the normal case it is cancelled having done nothing.
      let inner = 0
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setShown(true))
      })
      const floor = window.setTimeout(() => setShown(true), 250)
      return () => {
        cancelAnimationFrame(outer)
        if (inner) cancelAnimationFrame(inner)
        window.clearTimeout(floor)
      }
    }
    setShown(false)
    // Just past the slowest of the two transitions above (320ms). Unmounting
    // early would cut the close off mid-fade; unmounting late leaves an
    // invisible full-screen layer over the page it just closed onto — and this
    // one is z-[90], above the tab bar, so those extra frames are frames where
    // the bar you are reaching for does not answer.
    const timer = setTimeout(() => setMounted(false), 360)
    return () => clearTimeout(timer)
  }, [open])

  // Keep the native safe-area (status bar) zone white while the sheet is up, so
  // the top never shows the black html.capacitor background behind the clock/5G.
  useEffect(() => {
    if (!mounted) return
    // Counted, like every other owner of this strip. It used to add the class
    // and never take it off, while restoring an inline colour captured from
    // whatever happened to be set when it opened — so closing the search could
    // repaint the strip in the previous screen's colour over the top of the one
    // underneath it.
    const surface = claimSurface("#ffffff")
    return () => surface.release()
  }, [mounted])

  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  THE PAGE ONLY HOLDS STILL WHEN THE PANEL IS THE WHOLE SCREEN
   * ═════════════════════════════════════════════════════════════════════════
   *
   * This locked the body unconditionally, and on a desktop that is two visible
   * faults for the price of one:
   *
   *   THE FLASH. `overflow: hidden` removes the scrollbar, so the viewport
   *   gains ~15px and the ENTIRE page reflows wider the instant the field is
   *   clicked — and snaps back when the panel closes. Every element on the page
   *   moves, twice, because somebody clicked a search box.
   *
   *   THE JUMP. Locking the document scroller while the page is scrolled down
   *   can leave the browser with nothing to hold the position against, and it
   *   restores to the top. That is the "it randomly scrolls me up".
   *
   * Neither is a bug on a PHONE, where the panel is a full-screen sheet and the
   * feed behind it genuinely must not slide under your thumb. Anchored, the
   * panel is a small dropdown hanging off the field: the page behind it is
   * still the thing you are looking at, and it should behave exactly as it did
   * a moment ago — scroll included.
   *
   * `lockScroll()` rather than a raw write, because this used to save and
   * restore its own value and that is the pattern lib/scroll-lock.ts exists to
   * replace: two overlapping overlays each restoring what they captured is how
   * a page ends up locked with nothing on screen to unlock it.
   */
  /**
   * AND IT IS RELEASED WHEN THE CLOSE STARTS, NOT WHEN THE PANEL UNMOUNTS.
   *
   * `overflow: hidden` on the body makes the DOCUMENT non-scrollable, and a
   * `position: sticky` element in a document that cannot scroll has nothing to
   * stick to — it falls back to its place in the flow. So the header above
   * moves when the lock goes on and moves back when it comes off. Behind an
   * opaque panel neither is visible; at `mounted`, the lock came off at 360ms,
   * a good forty milliseconds AFTER the panel had finished fading out. That is
   * the header jumping on its own, with nothing on screen to explain it.
   *
   * `open` rather than `mounted`, so the page settles under a panel that is
   * still at full opacity and the fade plays over a page that has already
   * stopped moving. The panel is `pointer-events: none` from the same frame, so
   * releasing early does not hand it a scroll it would swallow.
   */
  useEffect(() => {
    if (!mounted || anchored || !open) return
    return lockScroll()
  }, [mounted, anchored, open])

  // Keep the sheet FULL-SCREEN (no displacement/gaps) and instead pad the results
  // list by the keyboard height, so the last items always scroll clear of the
  // keyboard while the container itself never resizes.
  const [kbHeight, setKbHeight] = useState(0)
  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  THE CLOSE, AND THE TWO THINGS THAT WERE HAPPENING DURING IT
   * ═════════════════════════════════════════════════════════════════════════
   *
   * The fade itself was never the problem — 300ms of opacity and 8px of travel
   * is one composited property and a transform. What made pressing Închide
   * look broken was everything ELSE that moved while it played.
   *
   *   THE KEYBOARD LEFT ON ITS OWN SCHEDULE. Nothing blurred the field, so iOS
   *   dismissed the keyboard only when the input was torn down at 360ms —
   *   after the panel had gone. So the sheet faded out over a keyboard that
   *   was still up, and then the keyboard slid away over the feed underneath,
   *   which reads as two separate animations for one gesture. Blurring at the
   *   start of the close puts them on the same frame.
   *
   *   AND THE LIST RESIZED WHILE IT FADED. This padding tracks the keyboard's
   *   height, so a dismissing keyboard walks it from ~300px to 0 in half a
   *   dozen visualViewport events — every one of them a reflow of the results
   *   list, mid-fade, on the frames where it is still half visible. That is
   *   the content jumping under a panel that is supposedly leaving.
   *
   * `open`, not `mounted`: the difference between the two is exactly the third
   * of a second this is meant to hold still for. The last value stays on the
   * node, so the list keeps the shape it had when you pressed the button and
   * fades out in it.
   */
  useEffect(() => {
    if (!mounted || !open) return
    const vv = window.visualViewport
    if (!vv) return
    const update = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      setKbHeight(kb)
    }
    update()
    vv.addEventListener("resize", update)
    vv.addEventListener("scroll", update)
    return () => {
      vv.removeEventListener("resize", update)
      vv.removeEventListener("scroll", update)
    }
  }, [mounted, open])

  // The keyboard goes on the frame the panel starts leaving, not on the frame
  // the input is unmounted. `activeElement` rather than the ref alone, because
  // the focus may have moved to a result row on the way out and blurring the
  // field would then do nothing at all.
  useEffect(() => {
    if (open || !mounted) return
    inputRef.current?.blur()
    const el = document.activeElement
    if (el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) el.blur()
  }, [open, mounted])

  // Focus the field (and seed / reset state) each time it opens.
  useEffect(() => {
    if (!open) return
    setTab("items")
    // Only when this component owns the field. Anchored, the caller's input is
    // already focused and already holds what was typed into it — re-seeding it
    // from `initialQuery` would erase the first character somebody typed,
    // because typing is what opened the panel.
    if (!anchored) setQuery(initialQuery)
    setPeople([])
    if (anchored) return
    const timer = setTimeout(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      // Caret to the end so an active query is easy to edit.
      const len = el.value.length
      try {
        el.setSelectionRange(len, len)
      } catch {
        /* some input types disallow this */
      }
    }, 140)
    return () => clearTimeout(timer)
  }, [open, initialQuery, anchored])

  const trimmed = query.trim()

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   *  RESULTS FROM THE FIRST LETTER, AND NO EMPTY FRAME BETWEEN LETTERS
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * FROM THE FIRST. It was `trimmed.length < 2`, so typing "a" cleared both
   * lists and drew the "search members by name" hint — the panel telling you to
   * do the thing you were visibly in the middle of doing. Two characters is a
   * sensible floor for a full-text query over a million documents; it is the
   * wrong floor for a name lookup over a marketplace's members, where one letter
   * is a real prefix and the endpoint already ranks and caps what comes back.
   *
   * ONE HUNDRED AND TWENTY MILLISECONDS, down from 220. A debounce exists to
   * stop a request per keystroke, and 120 does that — nobody types faster than
   * eight characters a second — while 220 is long enough to feel like the panel
   * is deciding whether to bother.
   *
   * AND A CACHE, which is what actually makes it feel instant. Every answer is
   * kept for the session, keyed by the query, so BACKSPACE IS FREE: deleting a
   * letter shows the previous list on the same frame, with no request and no
   * spinner, which is most of what "typing feels smooth" means in a search box.
   * A cache hit skips the debounce entirely.
   *
   * NOTHING IS EVER CLEARED WHILE YOU TYPE. The old code emptied both arrays on
   * every keystroke below the floor and set `loading` before the debounce had
   * even elapsed, so the panel flashed hint → spinner → results for a single
   * fast word. The previous results stay on screen until the next set replaces
   * them; the only thing that empties the panel is emptying the field.
   */
  useEffect(() => {
    if (!open) return
    if (!trimmed) {
      setTitles([])
      setPeople([])
      setPeopleLoading(false)
      return
    }

    const key = trimmed.toLowerCase()
    const hit = searchCache.get(key)
    if (hit) {
      setTitles(hit.titles)
      setPeople(hit.people)
      setPeopleLoading(false)
      return
    }

    const ctrl = new AbortController()
    /**
     * The spinner is armed on a TIMER, not on the keystroke.
     *
     * A response that comes back in 90ms with a spinner shown at 0ms is a
     * spinner nobody could read and everybody sees flicker. Below this it never
     * appears at all — and it only ever appears when there is nothing on screen
     * to keep looking at, because `PeopleTab` draws it only for an empty list.
     */
    const spinner = setTimeout(() => setPeopleLoading(true), 260)

    const timer = setTimeout(async () => {
      try {
        const [itemsRes, peopleRes] = await Promise.all([
          fetch(`/api/v2/search?q=${encodeURIComponent(trimmed)}&limit=8`, { signal: ctrl.signal }).catch(() => null),
          fetch(`/api/v2/search/people?q=${encodeURIComponent(trimmed)}&limit=8`, { signal: ctrl.signal }).catch(() => null),
        ])
        if (ctrl.signal.aborted) return

        let nextTitles: string[] | null = null
        let nextPeople: Person[] | null = null

        if (itemsRes?.ok) {
          const data = await itemsRes.json()
          nextTitles = ((data?.results ?? []) as any[]).map((r) => r?.title).filter(Boolean)
          setTitles(nextTitles)
        }
        if (peopleRes?.ok) {
          const data = await peopleRes.json()
          nextPeople = (data?.people ?? []) as Person[]
          setPeople(nextPeople)
        }

        // Only a COMPLETE answer is cached. Half of one would be served in full
        // next time, and the missing half would never be fetched again.
        if (nextTitles && nextPeople) rememberSearch(key, nextTitles, nextPeople)
      } catch {
        /* aborted / offline — keep whatever is on screen */
      } finally {
        if (!ctrl.signal.aborted) setPeopleLoading(false)
      }
    }, 120)

    return () => {
      ctrl.abort()
      clearTimeout(timer)
      clearTimeout(spinner)
    }
  }, [open, trimmed])

  const suggestions = useMemo(() => buildKeywordSuggestions(query, titles), [query, titles])

  const runSearch = useCallback(
    (q: string) => {
      const v = q.trim()
      if (!v) return
      setQuery(v) // reflect the chosen term in the field before it closes
      inputRef.current?.blur() // dismiss the keyboard so the close reads clean
      addSearch(v)
      onSearchSubmit?.() // switch the feed to the results tab immediately
      onClose() // begin the smooth close blend
      // Navigate once the blend is under way, so results reveal behind the fade
      // instead of snapping in the instant you tap.
      // `/shop`, not `/?q=`. A query is a RESULT — it wants a title, a total, a
      // filter bar and a page number, and the home feed has none of those. Same
      // destination as the desktop field's Enter, so one search box is not a
      // different feature from the other.
      window.setTimeout(() => router.push(`/shop?q=${encodeURIComponent(v)}`), 170)
    },
    [addSearch, onSearchSubmit, onClose, router],
  )

  const pickCategory = useCallback(
    (id: string) => {
      onSelectCategory(id)
      onClose()
    },
    [onSelectCategory, onClose],
  )

  if (!mounted) return null
  // Anchored, nothing is drawn until the field has been measured — one frame,
  // in a layout effect, so there is no flash of a panel in the wrong place.
  if (anchored && !box) return null

  const recent = searches.slice(0, 4)

  const body = (
    <div
      className={cn(
        anchored
          ? "fixed z-[95]"
          : "fixed inset-0 z-[90] flex flex-col bg-white",
      )}
      style={{
        // Full-screen — never resizes, so no bottom gap/displacement. Anchored,
        // the geometry comes from the measured field.
        height: anchored ? undefined : "100dvh",
        ...(anchored && box ? { top: box.top, left: box.left, width: box.width } : null),
        opacity: shown ? 1 : 0,
        // Pure fade + a whisper of a slide — NO scale (which warps text).
        //
        // 300ms, down from 460. Search is the middle TAB of the bottom bar, not
        // a modal you open occasionally, and it has to answer at the same speed
        // its four neighbours do — those settle in 260ms (`.tab-arriving` in
        // app/globals.css), and half a second next to a quarter of one is what
        // makes one of five tabs feel like the slow one. The curve is unchanged,
        // so it is the same movement, finished sooner.
        //
        // The two durations stay a fraction apart on purpose: the slide landing
        // just after the fade is what stops the panel arriving as a flat sheet.
        transform: shown ? "translateY(0)" : "translateY(-8px)",
        transition:
          "opacity 300ms cubic-bezier(0.16,1,0.3,1), transform 320ms cubic-bezier(0.16,1,0.3,1)",
        willChange: "opacity, transform",
        // Transparent to the finger the instant it starts closing, not when it
        // finishes unmounting. This is a full-screen layer at z-[90] — above
        // the tab bar — so for the third of a second it spends fading out it was
        // swallowing every tap aimed at the screen behind it. Pressing a tab
        // right after dismissing search did nothing at all, which is
        // indistinguishable from the tab being broken.
        pointerEvents: shown ? "auto" : "none",
      }}
    >
      {/* `display: contents` on a phone, so the children stay direct flex items
          of the full-screen column exactly as they were and not one pixel of
          the existing layout moves. Anchored, this is the panel. */}
      <div
        className={
          anchored
            ? // `h-fit`, and it is the whole of "the modal is too tall".
              //
              // The children are laid out for a phone, where the panel IS the
              // screen and the content area is meant to take everything left
              // over — `flex-1` on the scroller, a 40vh floor under the empty
              // state. Put that in a box with a max-height and it stops being a
              // ceiling and becomes a target: the panel grew to 78% of the
              // window to hold an icon and one line of grey text.
              //
              // `h-fit` makes the box content-sized, so `flex-1` has no free
              // space to claim and the max-height goes back to being a cap for
              // a long list of results. The empty states drop their viewport
              // floors at the same breakpoint; both halves are needed, because
              // either one alone still leaves a panel sized by the viewport.
              "search-anchored relative z-[90] flex h-fit max-h-[min(560px,70vh)] w-full flex-col overflow-hidden rounded-2xl border border-neutral-200/70 bg-white shadow-[0_24px_64px_-14px_rgba(15,15,15,0.30),0_2px_8px_rgba(15,15,15,0.07)]"
            : "contents"
        }
      >
      {/* Header: search field + close. NOT DRAWN WHEN ANCHORED — the caller's
          field is the one and only search input, which is the whole point of
          anchoring. See the note on the `anchored` prop. */}
      {!anchored && (
      <div className="shrink-0 px-4" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.85rem)" }}>
        <div className="flex items-center gap-2">
          <form
            className="relative flex-1"
            onSubmit={(e) => {
              e.preventDefault()
              runSearch(query)
            }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              inputMode="search"
              enterKeyHint="search"
              placeholder={t("mfeed.search_items_members")}
              className="h-11 w-full rounded-full border border-neutral-200 bg-neutral-100 pl-10 pr-9 text-sm text-neutral-900 outline-none focus:border-neutral-300"
            />
            {query && (
              <button
                type="button"
                aria-label={t("mfeed.clear_all")}
                onClick={() => {
                  setQuery("")
                  inputRef.current?.focus()
                }}
                className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-neutral-300/70 text-neutral-600 active:scale-90"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </form>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 px-1 text-[15px] font-medium text-neutral-900 active:opacity-60"
          >
            {t("mfeed.close")}
          </button>
        </div>
      </div>
      )}

      {/* Tabs */}
      {/* TWO TABS, SEPARATED BY A RULE. (Three, until Categorii came out —
          see the note on TABS above, and note that this row is rendered FROM
          that array, so it is already correct at either length.)

          Items and People are two different KINDS of result, not two degrees of
          one — a person is not a narrower article. Spacing alone left them
          reading as a row of words, so the hairline says where one choice ends
          and the next begins.

          Drawn by the tab AFTER each one (`i > 0`) so there is never a stray
          rule hanging off either end, and `self-center` keeps it to the height
          of the label rather than the height of the button, which would put a
          line through the active tab's purple underline. */}
      <div className={cn("shrink-0 flex items-stretch border-b border-neutral-100 px-2", anchored ? "pt-1.5" : "mt-2")}>
        {TABS.map(([id, key], i) => {
          const active = tab === id
          return (
            <div key={id} className="flex flex-1 items-stretch">
              {i > 0 && <span aria-hidden className="my-2 w-px shrink-0 self-center bg-neutral-200 h-4" />}
              <button
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  "flex flex-1 flex-col items-center pb-2.5 pt-1 text-[15px] transition-colors duration-200",
                  active ? "font-semibold text-neutral-900" : "font-medium text-neutral-400",
                )}
              >
                <span className="relative inline-flex flex-col items-center">
                  {t(key)}
                  <span
                    className={cn(
                      "mt-2 h-[2px] w-full rounded-full bg-[#7c3aed] transition-all duration-300 ease-out",
                      active ? "scale-x-100 opacity-100" : "scale-x-50 opacity-0",
                    )}
                  />
                </span>
              </button>
            </div>
          )
        })}
      </div>

      {/* Content — padded by the keyboard height so results never hide under it */}
      <div
        className={cn(
          "min-h-0 overflow-y-auto overscroll-contain scrollbar-hide",
          // A phone: fill everything under the tabs, because the panel IS the
          // screen. A desktop: `flex: 0 1 auto` — size to the content so a
          // one-line empty state is a one-line panel, but still SHRINK when the
          // list is long enough to hit the panel's cap, which is what makes it
          // scroll instead of being clipped by the `overflow-hidden` above.
          // `flex-none` would have done the first half and lost the second.
          "flex-1",
          anchored && "flex-initial",
        )}
        style={{
          scrollbarWidth: "none",
          paddingBottom: anchored ? 10 : `calc(env(safe-area-inset-bottom, 0px) + 16px + ${kbHeight}px)`,
        }}
      >
        <div key={`${tab}-${trimmed ? "q" : "e"}`} className="animate-in fade-in-0 duration-200 ease-out">
          {tab === "items" && (
            <ItemsTab
              trimmed={trimmed}
              recent={recent}
              suggestions={suggestions}
              onRun={runSearch}
              onRemoveRecent={removeSearch}
              onClearRecent={clearSearches}
              t={t}
            />
          )}
          {/* Not reachable while Categorii is out of TABS, and kept rather than
              removed so putting the tab back is one line. `tab` is only ever
              set from that array. */}
          {tab === "categories" && <CategoriesTab onPick={pickCategory} t={t} />}
          {tab === "people" && (
            <PeopleTab trimmed={trimmed} people={people} loading={peopleLoading} onClose={onClose} t={t} />
          )}
        </div>
      </div>
      </div>
    </div>
  )

  /**
   * THE DIM IS A SIBLING OF THE PANEL, NOT A CHILD OF IT.
   *
   * It was inside — `fixed inset-0 z-[94]` within the panel's own
   * `fixed z-[95]` wrapper — and that wrapper is positioned WITH a z-index,
   * which makes it a stacking context. So the scrim's 94 and the panel's 90
   * were compared against each other rather than against the page, the scrim
   * won, and it painted a 25% black wash OVER the search panel: the whole box
   * came up grey, and every click aimed at a tab or a result landed on the
   * scrim and closed it.
   *
   * As siblings the two numbers mean what they look like they mean. Nothing
   * else about either element changed.
   */
  const layer =
    anchored && box ? (
      <>
        {/* BELOW THE HEADER, NOT OVER IT.
 
            At z-94 this covered the whole viewport — including the search field
            it belongs to. So the field you were typing in was dimmed and behind
            a layer, and a click on it landed on the scrim and CLOSED the panel:
            open search, click the box you are searching in, and it shuts. There
            is no way to select the text you have typed, either.

            z-39 puts it under the site header (z-40) and over the page. The
            header stays fully lit and fully clickable, which is correct on its
            own terms as well — the field is part of the search, not part of
            what the search is covering — and the page behind still dims and
            still closes on a click. */}
        <div
          aria-hidden
          className="fixed inset-0 z-[39] bg-black/25"
          style={{ opacity: shown ? 1 : 0, transition: "opacity 220ms cubic-bezier(0.33,0,0.67,1)" }}
          onClick={onClose}
        />
        {body}
      </>
    ) : (
      body
    )

  // Out of the header's stacking context entirely. See `anchorTo`.
  return anchored && typeof document !== "undefined" ? createPortal(layer, document.body) : layer
}

/* ---------------- Items tab ---------------- */

function ItemsTab({
  trimmed,
  recent,
  suggestions,
  onRun,
  onRemoveRecent,
  onClearRecent,
  t,
}: {
  trimmed: string
  recent: { q: string }[]
  suggestions: string[]
  onRun: (q: string) => void
  onRemoveRecent: (q: string) => void
  onClearRecent: () => void
  t: (k: string) => string
}) {
  if (!trimmed) {
    if (recent.length === 0) {
      return (
        <div className="search-empty flex flex-col items-center justify-center px-8 text-center">
          <Search className="mb-3 h-7 w-7 text-neutral-300" />
          <p className="text-[13px] text-neutral-500">{t("mfeed.search_placeholder")}</p>
        </div>
      )
    }
    return (
      <div className="px-1 py-2">
        <div className="flex items-center justify-between px-4 pb-1 pt-2">
          <span className="text-[13px] font-semibold text-neutral-500">{t("mfeed.recent_searches")}</span>
          <button type="button" onClick={onClearRecent} className="text-[12px] font-medium text-neutral-400 active:opacity-60">
            {t("mfeed.clear_all")}
          </button>
        </div>
        {recent.map((r) => (
          <Row key={r.q} icon={<Clock className="h-[18px] w-[18px] text-neutral-400" />} label={r.q} onClick={() => onRun(r.q)}>
            <button
              type="button"
              aria-label={t("mfeed.clear_all")}
              onClick={(e) => {
                e.stopPropagation()
                onRemoveRecent(r.q)
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-300 active:scale-90"
            >
              <X className="h-4 w-4" />
            </button>
          </Row>
        ))}
      </div>
    )
  }

  return (
    <div className="px-1 py-2">
      {suggestions.map((s) => (
        <Row
          key={s}
          icon={<Search className="h-[18px] w-[18px] text-neutral-400" />}
          label={s}
          query={trimmed}
          onClick={() => onRun(s)}
        >
          <ArrowUpLeft className="h-[18px] w-[18px] text-neutral-300" />
        </Row>
      ))}
    </div>
  )
}

/** A suggestion / recent row. Bolds the part of the label past the typed query. */
function Row({
  icon,
  label,
  query,
  onClick,
  children,
}: {
  icon: React.ReactNode
  label: string
  query?: string
  onClick: () => void
  children?: React.ReactNode
}) {
  let head = ""
  let tail = label
  if (query) {
    const idx = label.toLowerCase().indexOf(query.toLowerCase())
    if (idx === 0) {
      head = label.slice(0, query.length)
      tail = label.slice(query.length)
    }
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors active:bg-neutral-50"
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 truncate text-[15px] text-neutral-800">
        {head ? (
          <>
            <span className="text-neutral-500">{head}</span>
            <span className="font-semibold text-neutral-900">{tail}</span>
          </>
        ) : (
          label
        )}
      </span>
      {children}
    </button>
  )
}

/* ---------------- Categories tab ---------------- */

/**
 * THE DEPARTMENTS THIS MARKETPLACE ACTUALLY HAS.
 *
 * This tab listed the nine legacy digital-goods categories — Design,
 * Development, Marketing, AI — none of which anybody can list on Storelib. So
 * the search panel's middle tab offered nine ways to reach an empty page.
 *
 * `DEPARTMENTS` is the same list the sell form's category picker reads, so what
 * you can browse for here is exactly what somebody could have listed.
 */
function CategoriesTab({ onPick, t }: { onPick: (id: string) => void; t: (k: string) => string }) {
  return (
    <div className="px-4 py-4">
      <p className="pb-3 text-[13px] font-semibold text-neutral-500">{t("mfeed.browse_categories")}</p>
      {/* Every tile wore CATEGORIES[0].icon — the legacy list's `Layers` glyph,
          six times, because the departments had no icons of their own here. Six
          identical marks beside six different words is worse than none: it says
          the pictures carry no information and trains the eye to skip them.
          DEPARTMENT_RAIL brings each department's own. */}
      <div className="grid grid-cols-2 gap-2.5">
        {DEPARTMENT_RAIL.map((d) => (
          <CategoryTile key={d.id} id={d.id} label={d.label} Icon={d.icon} onPick={onPick} />
        ))}
      </div>
    </div>
  )
}

function CategoryTile({
  id,
  label,
  Icon,
  onPick,
}: {
  id: string
  label: string
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  onPick: (id: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(id)}
      className="flex items-center gap-3 rounded-2xl border border-neutral-200/70 bg-neutral-50 px-4 py-3.5 text-left transition-all duration-200 active:scale-[0.97] active:bg-neutral-100"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/[0.04]">
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
      </span>
      <span className="truncate text-[14px] font-medium text-neutral-800">{label}</span>
    </button>
  )
}

/* ---------------- People tab ---------------- */

function PeopleTab({
  trimmed,
  people,
  loading,
  onClose,
  t,
}: {
  trimmed: string
  people: Person[]
  loading: boolean
  onClose: () => void
  t: (k: string) => string
}) {
  /**
   * The hint is for an EMPTY field, and for nothing else.
   *
   * It was `< 2`, so typing the first letter of somebody's name replaced the
   * results with an instruction to search for them — the panel telling you to do
   * the thing you were visibly in the middle of doing. One character is a real
   * prefix over a members table; the endpoint ranks and caps what comes back.
   */
  if (trimmed.length < 1) {
    return (
      <div className="search-empty flex flex-col items-center justify-center px-8 text-center">
        <Store className="mb-3 h-7 w-7 text-neutral-300" />
        <p className="text-[13px] text-neutral-500">{t("mfeed.search_people_hint")}</p>
      </div>
    )
  }
  if (loading && people.length === 0) {
    return (
      <div className="search-empty flex items-center justify-center">
        <IosSpinner size={24} />
      </div>
    )
  }
  if (people.length === 0) {
    return (
      <div className="search-empty flex flex-col items-center justify-center px-8 text-center">
        <p className="text-[14px] font-semibold text-neutral-700">{t("mfeed.no_people")}</p>
      </div>
    )
  }
  return (
    <div className="px-1 py-2">
      {people.map((p, i) => (
        /**
         * A SHORT STAGGER, and a very short one.
         *
         * Eight rows appearing in the same frame is a block of text arriving;
         * the same eight arriving 22ms apart reads as a list filling in, which
         * is the difference between a panel that popped and one that responded.
         *
         * Capped at the fifth row so the last one is never more than a tenth of
         * a second behind the first — a stagger that keeps accumulating turns
         * into a queue you are waiting through. Opacity and a two-pixel rise
         * only: both are composited, and nothing here can move the row above it.
         *
         * Keyed on the person's id, so a list that changes under a keystroke
         * replays only for the rows that are actually new — React keeps the
         * ones that were already there, and they do not flicker.
         */
        <div
          key={p.id}
          className="animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-out"
          style={{ animationDelay: `${Math.min(i, 4) * 22}ms`, animationFillMode: "both" }}
        >
          <PersonRow person={p} onClose={onClose} t={t} />
        </div>
      ))}
    </div>
  )
}

function PersonRow({ person, onClose, t }: { person: Person; onClose: () => void; t: (k: string) => string }) {
  const name = person.profile?.display_name || person.profile?.username || "Membru"
  const username = person.profile?.username || person.slug || ""
  const avatar = person.profile?.avatar_url
  const count = person.products_count ?? 0

  return (
    /**
     * /member/<handle>, NOT /u/<handle>.
     *
     * They are two different pages and the search was sending people to the
     * wrong one. /u/ is the DIGITAL creator storefront with its store-builder
     * theming; /member/ is the second-hand marketplace profile — the avatar,
     * the name, the listings grid, the Salvate and Evaluări tabs, the score.
     * Somebody who typed a name into a marketplace search and pressed a result
     * expects the second, and on an account that never went through seller
     * onboarding the first is an empty shop.
     */
    <SmartLink
      href={username ? `/member/${encodeURIComponent(username)}` : "#"}
      useClientNav
      onClick={onClose}
      className="flex w-full items-center gap-3 px-4 py-2.5 transition-colors active:bg-neutral-50"
    >
      {/**
       * THROUGH THE OPTIMISER, at the size it is actually drawn.
       *
       * It was a bare `<img src={avatar}>`, and a bare img downloads WHAT WAS
       * UPLOADED: an avatar is a camera photograph somebody picked off their
       * phone — two or three megabytes, three thousand pixels across — decoded
       * in full and then painted into a circle forty-four pixels wide. Eight of
       * those, fetched the moment somebody types a letter, on the one surface
       * whose whole job is to answer before they finish typing.
       *
       * `AvatarPhoto` asks for the size that will be shown, in AVIF, off the
       * ladder next.config.mjs keeps rungs on for exactly this. The same face
       * becomes a couple of kilobytes and stops competing with the request that
       * is fetching the next set of results.
       *
       * `loading="lazy"` is gone with it and is not missed: these are eight rows
       * in a panel that is already on screen, so lazy-loading them is deferring
       * the only thing the panel is for.
       *
       * The fallback is the caller's own — the grey initial this row already had
       * — and it also covers a URL that does not resolve, which a bare img
       * answered with the browser's broken-image glyph.
       */}
      {/* `relative`, because the skeleton below positions against this box. */}
      <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-neutral-200">
        <AvatarPhoto url={avatar} size={44} skeleton className="h-full w-full object-cover">
          <span className="flex h-full w-full items-center justify-center text-[16px] font-semibold text-neutral-500">
            {name.charAt(0).toUpperCase()}
          </span>
        </AvatarPhoto>
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-semibold text-neutral-900">{name}</span>
        <span className="truncate text-[12px] text-neutral-500">
          {username ? `@${username}` : ""}
          {count > 0 ? ` · ${count} ${t("mfeed.items_count")}` : ""}
        </span>
        {/* The same line the profile and the listing page carry, and drawn by
            the same component so it cannot say something different here. The
            endpoint batches both numbers over the page it returns — see
            app/api/v2/search/people/route.ts — so this costs no extra request,
            and a member with neither renders nothing at all. */}
        <SellerScore
          rating={person.rating ?? null}
          reviews={person.reviews_count ?? 0}
          sold={person.sold_count ?? 0}
          className="mt-0.5"
        />
      </span>
    </SmartLink>
  )
}
