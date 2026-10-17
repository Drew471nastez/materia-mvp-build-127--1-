"use client"

/**
 * ===========================================================================
 *  THE PAGE EDITOR (round 33, rebuilt round 26)
 * ===========================================================================
 * /app/community/<slug>/page. The owner, round 26: "currently not
 * responsive, occupies too much space, overly complicated; the preview
 * cramped, the editor awkwardly split. A large live preview; a compact
 * organized editing panel; collapse/hide the panel; full width preview;
 * desktop/mobile preview switch; simple field groups; no horizontal
 * overflow; loading/save/success/error feedback. On mobile a dedicated
 * editing panel or drawer and a usable full width preview. Avoid nested
 * scroll containers. Preview as visitor."
 *
 *   THE STAGE     the About page itself (components/community/public/
 *                 sales-page.tsx) drawn from the draft (./draft.ts
 *                 previewData) into a frame of its own (./preview-frame.tsx:
 *                 the pane's width, at least 1280, or a phone), under one row
 *                 of controls: Computer
 *                 or Phone, As a visitor, the state of the save, Full screen,
 *                 the panel, Save and Publish. It is as tall as the screen
 *                 below the admin's tabs (measured once, useStage), and stays
 *                 there while the panel beside it scrolls with the page: the
 *                 only scroll inside it is the page's own.
 *   THE PANEL     beside the stage: the six groups (./panels.tsx), one open
 *                 at a time, in the page's own scroll (no second scroll box).
 *                 Hidden with one press, the stage then takes the whole
 *                 width. Round 27: as wide as the creator drags it (300 to
 *                 560px, the edge between it and the stage is the handle,
 *                 the keyboard's arrows move it too), remembered; while it
 *                 is dragged the page in the frame is only scaled, and laid
 *                 out once at the end (./preview-frame.tsx).
 *   THE DRAWER    only where the editor itself is narrower than SIDE_MIN
 *                 (a phone, a tablet upright beside the rail): the groups in
 *                 a drawer docked at the foot (./drawer.tsx), dragged
 *                 between its head, half the screen and nearly all of it,
 *                 never covering the page with a dimmed layer.
 *
 * DECIDED BY THE EDITOR'S OWN WIDTH, NOT THE WINDOW'S (round 27, the owner:
 * "the phone like layout with the bar appears too early, also when I zoom
 * in"). Round 26 asked the window for 1280px, so a laptop at 150% zoom
 * (960px of CSS) or with the panel wanted beside a 1100px window got the
 * phone's bar. The editor is measured instead (the rail open or folded, the
 * zoom, the shell's gutters all in it): the panel sits beside the page
 * wherever there is room for both, 300px of panel and 340 of page.
 *   FULL SCREEN   the stage alone over the whole window (Escape leaves).
 *   AS A VISITOR  the page as somebody signed out sees it: no outlines, no
 *                 Edit badges, no placeholders for empty parts; the gallery
 *                 and the questions work, links and Join do not.
 *   SAVE          one Save for everything, which sends only what changed
 *                 (./draft.ts changedBody) and waits for uploads, for a link
 *                 that is not an address yet, and for anything ./draft.ts
 *                 draftProblems names (opening the group it is in). Saving,
 *                 Saved with a check, Unsaved changes, or what went wrong,
 *                 always beside it. Ctrl or Cmd S saves. Leaving with changes
 *                 asks first.
 *   PUBLISH       a draft community has Publish beside Save (Save and
 *                 publish while something is unsaved): the same request as
 *                 the bar's Publish (PATCH { publish: true },
 *                 lib/communities/server/creator.ts setPublished), after the
 *                 save.
 *
 * THE BUTTON'S COLOUR FROM THE LOGO. Picking "Your colour" reads the logo
 * into a 48px canvas (through the image optimiser, the site's own origin,
 * so the canvas can be read) and takes its commonest saturated colour
 * (lib/communities/page-look.ts dominantColour); a new logo reads it again.
 */
import * as React from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { ChevronDown, Eye, Maximize2, Minimize2, Monitor, Moon, PanelRightClose, PanelRightOpen, Pencil, Smartphone, Sun } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { announceCommunityUpdated } from "@/lib/communities/updated-signal"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import { dominantColour } from "@/lib/communities/page-look"
import { htmlToPlainText } from "@/lib/rich-text/html"
import { getMainDomain } from "@/lib/url-helpers"
import { CommunitySalesPage } from "@/components/community/public/sales-page"
import { JoinSurface } from "@/components/community/public/join-controls"
import type { SalesPageData } from "@/components/community/public/types"
import { COMMUNITY_STATE_WORD, buttonPrimary, buttonSecondary, card, communityState, errorText, send, useToast } from "../parts"
import type { CommunityHead, SettingsData } from "../view-types"
import { GROUP_BLOCKS, PAGE_BLOCKS, PAGE_GROUPS, changedBody, draftOf, draftProblems, groupOf, isPageBlock, previewData, type DraftProblem, type PageBlock, type PageDraft, type PageGroup } from "./draft"
import { BLOCK_INFO, GROUP_INFO, GroupFields, groupSummary, type PanelProps } from "./panels"
import { PreviewDocument, PreviewFrame, type Device } from "./preview-frame"
import { PreviewChrome } from "./preview-chrome"
import { EditorDrawer } from "./drawer"
import { HANDLE_W, PANEL_DEFAULT, PANEL_KEY, PANEL_MAX, PANEL_MIN, modeFor, panelWidthFor, type Detent, type EditorMode } from "./layout"

/*
  ROUND 27: SIDE OR DRAWER, BY THE EDITOR'S OWN WIDTH (see the top of this file). The panel goes beside the page from
  SIDE_MIN of editor and back to the drawer under it, with a few pixels between the two so a scrollbar coming and going
  at the line never flips it back and forth.
*/
function storedPanelWidth(): number | null {
  try {
    const n = Number(window.localStorage.getItem(PANEL_KEY))
    return Number.isFinite(n) && n >= PANEL_MIN && n <= PANEL_MAX ? n : null
  } catch {
    return null
  }
}

/**
 * THE EDITOR'S WIDTH, WITHOUT A RENDER PER PIXEL. A window being resized changes it every frame, and a render of the
 * editor is a render of the whole page in the frame, so only what it decides is React state (side or drawer); the
 * panel's width, which follows it, is written straight to the panel (`apply`).
 */
function useEditorMode(root: React.RefObject<HTMLDivElement | null>, apply: (width: number) => void): EditorMode {
  const [mode, setMode] = React.useState<EditorMode>("side")
  const applyRef = React.useRef(apply)
  applyRef.current = apply
  React.useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    let now: EditorMode | null = null
    const read = () => {
      const w = el.clientWidth
      if (!w) return
      now = modeFor(w, now)
      setMode(now)
      applyRef.current(w)
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [root])
  return mode
}

/**
 * THE STAGE'S HEIGHT, MEASURED ONCE AND SHARED (CLAUDE.md: "measure it once"). The pane the admin scrolls in
 * (community-shell.tsx .orders-pane), the row of tabs that sticks at its top, and on a narrow screen the drawer's head
 * at the foot, read from the page itself and handed to CSS as two numbers on the editor: --pe-top (where the stage
 * sticks, under the tabs) and --pe-stage-h (its height). Beside the panel the stage fills the pane under the tabs once
 * the bar with the name has scrolled away; over the drawer it fills what is left above the drawer's head as the page
 * opens, so the card is whole without a scroll, and it keeps that height whatever the drawer does (the drawer moves over
 * it; nothing in the frame is laid out again).
 */
function useStage(root: React.RefObject<HTMLDivElement | null>, side: boolean, raised: boolean) {
  React.useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const pane = el.closest<HTMLElement>(".orders-pane") ?? (document.scrollingElement as HTMLElement | null)
    if (!pane) return
    /*
      THE DRAWER RAISED (round 26): the page is what the creator is changing, so it stays in sight above the drawer. The
      bar with the community's name scrolls away (the tabs stay) and the part being edited is brought into what is left
      (./preview-frame.tsx focus). At the foot again, the pane goes back to the top.
    */
    const header = pane.querySelector<HTMLElement>("[data-community-header]")?.offsetHeight ?? 0
    if (!side) pane.scrollTo({ top: raised ? header : 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
    let raf = 0
    const read = () => {
      raf = 0
      if (!el.getClientRects().length) return
      const tabs = pane.querySelector<HTMLElement>("[data-community-tabs-bar]")
      const tabsH = tabs?.offsetHeight ?? 0
      const paneRect = pane.getBoundingClientRect()
      const paneH = pane.clientHeight || window.innerHeight
      let h: number
      if (side) {
        /*
          Stuck under the tabs, the stage may reach no lower than the end of the section's content (the shell keeps 48px
          and the save bars' room under it): any lower, and at the end of a long panel the row it sticks in would push it
          up under the tabs.
        */
        const body = el.closest<HTMLElement>("[data-community-body]")
        const foot = body ? parseFloat(getComputedStyle(body).paddingBottom) || 0 : 16
        h = paneH - tabsH - 12 - Math.max(16, foot)
      } else {
        const stage = el.querySelector<HTMLElement>("[data-page-stage]")
        const drawer = el.querySelector<HTMLElement>("[data-page-drawer]")
        /* Where the stage starts in the pane's content: on the screen with the pane at its top. */
        const top = stage ? stage.getBoundingClientRect().top - paneRect.top + pane.scrollTop : tabsH
        const peekTop = Number(drawer?.dataset.peekTop) || paneRect.bottom - 80
        h = peekTop - (paneRect.top + top) - 12
      }
      el.style.setProperty("--pe-top", `${tabsH + 12}px`)
      el.style.setProperty("--pe-stage-h", `${Math.round(Math.max(side ? 420 : 240, h))}px`)
    }
    const soon = () => {
      if (!raf) raf = requestAnimationFrame(read)
    }
    read()
    const ro = new ResizeObserver(soon)
    ro.observe(pane)
    const tabs = pane.querySelector<HTMLElement>("[data-community-tabs-bar]")
    if (tabs) ro.observe(tabs)
    window.addEventListener("resize", soon)
    window.visualViewport?.addEventListener("resize", soon)
    el.addEventListener("page-drawer:measured", soon)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener("resize", soon)
      window.visualViewport?.removeEventListener("resize", soon)
      el.removeEventListener("page-drawer:measured", soon)
    }
  }, [root, side, raised])
}

/** The logo's commonest saturated colour, or null (no logo, or nothing but greys in it). */
async function logoColour(url: string): Promise<string | null> {
  const img = new Image()
  img.crossOrigin = "anonymous"
  img.decoding = "async"
  img.src = optimizedImageUrl(url, 32)
  try {
    await img.decode()
  } catch {
    return null
  }
  const size = 48
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const g = canvas.getContext("2d", { willReadFrequently: true })
  if (!g) return null
  g.drawImage(img, 0, 0, size, size)
  try {
    return dominantColour(g.getImageData(0, 0, size, size).data)
  } catch {
    return null
  }
}

/**
 * The page inside the frame: its bar, its columns, the About page drawn from the draft.
 *
 * DRAWN AFRESH WHEN THE GALLERY CHANGES (round 26). The gallery's strip is Swiper
 * (components/community/public/gallery-view.tsx, components/product/media-swiper), which a visitor's page never
 * changes under; in the editor it changed in place, and taking a picture away (two to one) threw inside Swiper's own
 * update ("reading 'querySelectorAll'"), which took the whole editor down: measured on round 33's editor too. The
 * page is keyed by what the gallery holds, so a gallery that changes is a new strip, never one updated in place.
 */
/* Memoised (round 27): the drawer moving, the panel shown or hidden, the save's state, none of them draws the page again. */
const FramedPage = React.memo(function FramedPage({ data, visitor }: { data: SalesPageData; visitor: boolean }) {
  const doc = React.useContext(PreviewDocument)
  const galleryKey = data.community.gallery.map((g) => (g.type === "image" ? g.url : g.type === "video" ? `v:${g.videoId}` : `e:${g.provider}:${g.id}`)).join("|")
  return (
    <JoinSurface.Provider value={doc?.body ?? null}>
      <PreviewChrome community={data.community}>
        <CommunitySalesPage key={galleryKey} data={data} editing={!visitor} />
      </PreviewChrome>
    </JoinSurface.Provider>
  )
})

/** The group a field named by the server's answer is in (a refused save opens it). */
function groupOfField(field: string | undefined): PageGroup | null {
  if (!field) return null
  const key = field.split(".")[0]
  const map: Record<string, PageBlock> = { name: "name", tagline: "tagline", summary: "summary", logoUrl: "logo", coverUrl: "cover", gallery: "gallery", descriptionHtml: "description", description: "description", benefits: "benefits", faq: "faq", links: "links", memberLinks: "memberLinks", pageLook: "join", seoTitle: "search", seoDescription: "search", discoveryEnabled: "search", legalLinks: "legal" }
  return map[key] ? groupOf(map[key]) : null
}

function problemText(p: DraftProblem): string {
  if (p.block === "summary") return tt("The short description is over 160 characters.")
  if (p.block === "memberLinks") return p.code === "name" ? tt("Member link {n} needs a name.", { n: p.index + 1 }) : tt("Member link {n} needs a web address or a Storelib page.", { n: p.index + 1 })
  if (p.block === "legal") return p.kind === "privacy" ? tt("The privacy policy needs the full address of a web page.") : tt("The terms need the full address of a web page.")
  return p.code === "money" ? tt("The join button cannot name a price, a currency or a billing period.") : tt("Joining costs money, so the button cannot say free.")
}

type SaveState = "idle" | "saving" | "saved" | "publishing"

const iconButton = "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#4b5563] outline-none transition-colors duration-100 hover:bg-[#eceef1] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 aria-pressed:bg-white aria-pressed:text-[#1a1a2e] aria-pressed:shadow-[0_1px_2px_rgba(16,24,40,0.08),0_0_0_0.5px_rgba(16,24,40,0.08)] sm:h-9 sm:w-9 [-webkit-tap-highlight-color:transparent]"

export function PageEditor({ head, data, preview, creatorId, clicks = null }: { head: CommunityHead; data: SettingsData; preview: SalesPageData | null; creatorId: string; /** Round 26: how often members opened each member link, when it is counted. */ clicks?: Record<string, number> | null }) {
  const router = useRouter()
  const toast = useToast()
  const root = React.useRef<HTMLDivElement>(null)
  const side = React.useRef<HTMLElement>(null)
  /* The panel's width: what the creator dragged it to (remembered), kept to what the editor's width leaves (panelWidthFor). */
  const wantWidth = React.useRef<number | null>(null)
  const editorWidth = React.useRef(0)
  const applyPanel = React.useCallback((w: number) => {
    editorWidth.current = w
    const el = side.current
    if (!el) return
    const want = wantWidth.current ?? (w < 900 ? Math.round(w * 0.42) : PANEL_DEFAULT)
    const width = panelWidthFor(w, want)
    el.style.width = `${width}px`
    const handle = el.previousElementSibling
    if (handle?.hasAttribute("data-page-resize")) {
      handle.setAttribute("aria-valuenow", String(width))
      handle.setAttribute("aria-valuemax", String(panelWidthFor(w, PANEL_MAX)))
    }
  }, [])
  const mode = useEditorMode(root, applyPanel)
  const modeRef = React.useRef(mode)
  modeRef.current = mode
  const wide = mode === "side"
  const start = React.useMemo(() => draftOf(head, data), [head, data])
  const [saved, setSaved] = React.useState(start)
  const [d, setD] = React.useState(start)
  const [group, setGroup] = React.useState<PageGroup | null>("basics")
  const [seen, setSeen] = React.useState<ReadonlySet<PageGroup>>(() => new Set(["basics"]))
  const [picked, setPicked] = React.useState<PageBlock | null>(null)
  const [focus, setFocus] = React.useState<{ block: string; room?: number } | null>(null)
  const [device, setDevice] = React.useState<Device>("desktop")
  const [visitor, setVisitor] = React.useState(false)
  const [dark, setDark] = React.useState(false)
  const [panel, setPanel] = React.useState(true)
  /* The panel drawn again (shown after being hidden, or the editor wide enough again): its width before it is painted. */
  React.useLayoutEffect(() => {
    if (panel && mode === "side") applyPanel(editorWidth.current || root.current?.clientWidth || 0)
  }, [panel, mode, applyPanel])
  const [full, setFull] = React.useState(false)
  const [detent, setDetent] = React.useState<Detent>("peek")
  useStage(root, wide, !wide && detent !== "peek")
  const [phase, setPhase] = React.useState<SaveState>("idle")
  const [error, setError] = React.useState<string | null>(null)
  const [uploads, setUploads] = React.useState<{ cover: boolean; gallery: boolean }>({ cover: false, gallery: false })
  const [badLinks, setBadLinks] = React.useState(0)
  const [brandBusy, setBrandBusy] = React.useState(false)
  const uploading = uploads.cover || uploads.gallery
  const busy = phase === "saving" || phase === "publishing"
  const body = React.useMemo(() => changedBody(saved, d), [saved, d])
  const dirty = Object.keys(body).length > 0
  const state = communityState(head)
  const canPublish = state === "draft" && head.can.manage_settings === true
  const fieldsReady = data.pageFieldsReady === true
  const free = preview ? preview.join.kind === "join_free" || preview.join.option?.kind === "free" : head.access === "free"
  const paid = preview ? preview.join.kind === "checkout" || preview.join.option?.kind === "paid" || head.access === "paid" || head.access === "product" : head.access === "paid" || head.access === "product"
  const problems = React.useMemo(() => draftProblems(d, { paid }), [d, paid])

  /*
    Where the page would be drawn narrower than a phone's card with room around it (a phone, a tablet beside the rail, a
    zoomed window), the editor opens on the phone's page; the page's look starts as the dashboard's.
  */
  React.useLayoutEffect(() => {
    wantWidth.current = storedPanelWidth()
    applyPanel(root.current?.clientWidth ?? 0)
    const w = editorWidth.current
    const stage = modeFor(w, null) === "side" ? w - panelWidthFor(w, wantWidth.current ?? (w < 900 ? Math.round(w * 0.42) : PANEL_DEFAULT)) - HANDLE_W : w
    if (stage < 560) setDevice("phone")
    if (document.documentElement.hasAttribute("data-sl-dark")) setDark(true)
  }, [applyPanel])
  /* The server drew the page again (a save, a change elsewhere) while nothing was changed here: start from it. */
  const dirtyRef = React.useRef(dirty)
  dirtyRef.current = dirty
  React.useEffect(() => {
    if (dirtyRef.current) return
    setSaved(start)
    setD(start)
  }, [start])
  /* Saved, with its check, for a moment. */
  React.useEffect(() => {
    if (phase !== "saved") return
    const t = window.setTimeout(() => setPhase("idle"), 2400)
    return () => window.clearTimeout(t)
  }, [phase])
  /* Leaving with changes asks first (a reload, a closed tab, an address typed). */
  React.useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  const set = React.useCallback(<K extends keyof PageDraft>(k: K, v: PageDraft[K]) => {
    setD((x) => ({ ...x, [k]: v }))
    setError(null)
  }, [])
  const setMany = React.useCallback((patch: Partial<PageDraft>) => {
    setD((x) => ({ ...x, ...patch }))
    setError(null)
  }, [])

  const readBrand = React.useCallback(async (logo: string | null) => {
    if (!logo) return
    setBrandBusy(true)
    const colour = await logoColour(logo)
    setBrandBusy(false)
    setD((x) => ({ ...x, look: { ...x.look, brand: colour } }))
  }, [])
  /* A new logo while the button is in the community's colour: its colour is read again. */
  const lastLogo = React.useRef(d.logoUrl)
  React.useEffect(() => {
    if (lastLogo.current === d.logoUrl) return
    lastLogo.current = d.logoUrl
    if (d.look.joinStyle === "brand") void readBrand(d.logoUrl)
  }, [d.logoUrl, d.look.joinStyle, readBrand])

  const videos = data.galleryVideos
  const shown = React.useMemo(() => (preview ? previewData(preview, d, videos) : null), [preview, d, videos])
  const defaultJoin = preview?.join.label || tt("Join")
  const summaryHint = React.useMemo(() => {
    const t = d.tagline.trim() || htmlToPlainText(d.descriptionHtml).replace(/\s+/g, " ").trim()
    return Array.from(t).slice(0, 160).join("")
  }, [d.tagline, d.descriptionHtml])

  /* ── Opening a group, from its header or from a part of the page ── */
  const scrollTo = React.useRef<PageBlock | null>(null)
  const openGroup = React.useCallback((g: PageGroup | null, block?: PageBlock) => {
    setGroup(g)
    if (g) setSeen((s) => (s.has(g) ? s : new Set(s).add(g)))
    if (block) scrollTo.current = block
  }, [])
  /* The field asked for, brought into view in the panel or the drawer once its group is drawn. */
  React.useEffect(() => {
    const b = scrollTo.current
    if (!b) return
    /* Asked again after every render until it runs: a render in between (the drawer arriving) only moves it later. */
    const t = window.setTimeout(() => {
      if (scrollTo.current !== b) return
      scrollTo.current = null
      const el = root.current?.ownerDocument.getElementById(`pe-field-${b}`)
      if (!el || !el.getClientRects().length) return
      /*
        Only the box the field is in moves: the drawer's list on a phone, the admin's pane beside the stage on a computer
        (to just under its tabs). scrollIntoView would also move the drawer itself and the page around the frame.
      */
      const box = el.closest<HTMLElement>("[data-page-sheet-body]") ?? el.closest<HTMLElement>(".orders-pane")
      if (!box) return
      const under = box.matches(".orders-pane") ? (box.querySelector<HTMLElement>("[data-community-tabs-bar]")?.offsetHeight ?? 0) + 12 : 0
      const delta = el.getBoundingClientRect().top - box.getBoundingClientRect().top - under
      box.scrollTo({ top: Math.max(0, box.scrollTop + delta), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
    }, wide ? 0 : 340)
    return () => window.clearTimeout(t)
  })
  /**
   * A part brought into view in the page. Over a raised drawer only the page above it is in sight, so the part is
   * centred in that (`room`), once the drawer and the pane have arrived.
   */
  const focusOn = React.useCallback((block: string, wait = 0) => {
    const go = () => {
      const drawer = root.current?.querySelector<HTMLElement>("[data-page-drawer]")
      const card = root.current?.querySelector<HTMLElement>("[data-preview-pane]")
      const halfTop = Number(drawer?.dataset.halfTop)
      const room = drawer && drawer.dataset.detent !== "peek" && card && halfTop ? Math.max(120, halfTop - card.getBoundingClientRect().top) : undefined
      setFocus({ block, room })
    }
    if (wait) window.setTimeout(go, wait)
    else go()
  }, [])
  const pick = React.useCallback(
    (b: string) => {
      if (!isPageBlock(b)) return
      setPicked(b)
      openGroup(groupOf(b), b)
      setFull(false)
      if (modeRef.current === "side") setPanel(true)
      else {
        setDetent((d) => (d === "peek" ? "half" : d))
        /* Once the drawer and the pane have arrived, the part is brought into what is left of the page above it. */
        focusOn(b, 400)
      }
    },
    [openGroup, focusOn],
  )
  const toggleGroup = (g: PageGroup) => {
    if (group === g) return openGroup(null)
    openGroup(g)
    const first = GROUP_BLOCKS[g].find((b) => b !== "memberLinks" && b !== "search") ?? null
    setPicked(first)
    if (first) focusOn(first)
  }

  /* ── Save and publish ── */
  const save = async (): Promise<boolean> => {
    if (uploading) return false
    if (!wide) setDetent((x) => (x === "peek" && (!d.name.trim() || badLinks || problems.length) ? "half" : x))
    if (!d.name.trim()) {
      openGroup("basics", "name")
      setError(tt("A community needs a name."))
      return false
    }
    if (badLinks) {
      openGroup("links", "links")
      setError(tt("A link is not an address yet. Fix it or remove it."))
      return false
    }
    if (problems.length) {
      const first = problems[0]
      openGroup(groupOf(first.block), first.block)
      setError(problemText(first))
      return false
    }
    if (!dirty) return true
    setPhase("saving")
    setError(null)
    const sent = d
    const res = await send(`/api/app/community/${head.id}`, "PATCH", body)
    if (!res.ok) {
      setPhase("idle")
      setError(errorText(res.data.error))
      const g = groupOfField(res.data.field)
      if (g) openGroup(g)
      return false
    }
    setSaved(sent)
    setPhase("saved")
    toast(tt("Saved"))
    router.refresh()
    announceCommunityUpdated(head.id)
    return true
  }
  const publish = async () => {
    if (!canPublish || busy) return
    if (dirty && !(await save())) return
    setPhase("publishing")
    setError(null)
    const res = await send(`/api/app/community/${head.id}`, "PATCH", { publish: true })
    if (!res.ok) {
      setPhase("idle")
      return setError(errorText(res.data.error, tt("It could not be published. Try again.")))
    }
    setPhase("saved")
    toast(tt("Published. Your page is live."))
    router.refresh()
    announceCommunityUpdated(head.id)
  }
  const reset = () => {
    setD(saved)
    setError(null)
    setBadLinks(0)
  }
  /* Full screen takes the focus to its own way out, and gives it back to the button that opened it. */
  React.useEffect(() => {
    if (!full) return
    const opener = document.activeElement as HTMLElement | null
    const t = window.setTimeout(() => document.querySelector<HTMLElement>("[data-page-stage][data-page-full] [data-page-full-toggle]")?.focus(), 0)
    return () => {
      window.clearTimeout(t)
      window.setTimeout(() => (opener && opener.isConnected ? opener : root.current?.querySelector<HTMLElement>("[data-page-full-toggle]"))?.focus(), 0)
    }
  }, [full])
  /* Ctrl or Cmd S, while this section is the one on screen. */
  const saveRef = React.useRef(save)
  saveRef.current = save
  React.useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && full) setFull(false)
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "s") {
        if (!root.current?.getClientRects().length) return
        e.preventDefault()
        void saveRef.current()
      }
    }
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [full])

  const labels = React.useMemo(() => Object.fromEntries(PAGE_BLOCKS.map((b) => [b, BLOCK_INFO[b].title])), [])
  const panelProps: PanelProps = {
    head,
    draft: d,
    set,
    setMany,
    communityId: head.id,
    creatorId,
    videos,
    galleryReady: data.galleryReady,
    defaultJoinLabel: defaultJoin,
    requests: preview?.join.kind === "request",
    free,
    onError: (m: string | null) => setError(m),
    onBusy: (what: "cover" | "gallery", b: boolean) => setUploads((u) => (u[what] === b ? u : { ...u, [what]: b })),
    onLinks: (links: PageDraft["links"], invalid: number) => {
      set("links", links)
      setBadLinks(invalid)
    },
    brandBusy,
    onPickBrand: () => void readBrand(d.logoUrl),
    fieldsReady,
    clicks,
    problems,
    summaryHint,
    publishing: phase === "publishing",
    onPublish: canPublish ? () => void publish() : null,
    origin: getMainDomain(),
  }

  /* ── What the row says ── */
  const status: { tone: "error" | "busy" | "dirty" | "saved" | "idle"; text: string } = error
    ? { tone: "error", text: error }
    : uploading
      ? { tone: "busy", text: tt("Uploading") }
      : phase === "saving"
        ? { tone: "busy", text: tt("Saving") }
        : phase === "publishing"
          ? { tone: "busy", text: tt("Publishing") }
          : dirty
            ? { tone: "dirty", text: tt("Unsaved changes") }
            : phase === "saved"
              ? { tone: "saved", text: tt("Saved") }
              : { tone: "idle", text: COMMUNITY_STATE_WORD[state] }
  const dot = { error: "bg-[#d92d20]", busy: "bg-[#e8a400] animate-pulse motion-reduce:animate-none", dirty: "bg-[#e8a400]", saved: "bg-[#22a06b]", idle: state === "published" ? "bg-[#22a06b]" : "bg-[#9ca3af]" }[status.tone]
  /* The state of the save, as a line (the toolbar, the panel) or inside a button (the drawer's head): the same words. */
  const statusParts = (
    <>
      <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", dot)} />
      <span className="truncate">{status.text}</span>
    </>
  )
  const statusTone = cn("flex min-w-0 items-center gap-2 text-[13px] leading-5", status.tone === "error" ? "text-[#b42318]" : status.tone === "dirty" ? "font-medium text-[#1a1a2e]" : "text-[#6b7280]")
  const statusLine = (
    <p role="status" aria-live="polite" className={statusTone} data-page-status={status.tone}>
      {statusParts}
    </p>
  )
  const saveLabel = phase === "saving" ? tt("Saving") : phase === "saved" && !dirty ? tt("Saved") : tt("Save")
  const publishLabel = phase === "publishing" ? tt("Publishing") : dirty ? tt("Save and publish") : tt("Publish")

  const deviceSwitch = (
    <div role="radiogroup" aria-label={tt("Preview on")} className="inline-flex shrink-0 rounded-[10px] bg-[#eef0f2] p-0.5" data-page-device="">
      {(
        [
          { value: "desktop" as const, label: tt("Computer"), Icon: Monitor },
          { value: "phone" as const, label: tt("Phone"), Icon: Smartphone },
        ]
      ).map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={device === value}
          aria-label={label}
          title={label}
          onClick={() => setDevice(value)}
          data-page-device-option={value}
          className={cn(
            "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-[8px] px-2.5 text-[13px] font-medium outline-none transition-colors duration-100 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 sm:h-8",
            device === value ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.08),0_0_0_0.5px_rgba(16,24,40,0.06)]" : "text-[#4b5563] hover:text-[#1a1a2e]",
          )}
        >
          <Icon aria-hidden className="h-4 w-4" />
          {/* Round 27: the labels by the room the row has (a container query), not by the window's width. */}
          <span className="@max-[760px]:hidden">{label}</span>
        </button>
      ))}
    </div>
  )

  const saveButtons = (
    <div className="ml-auto flex shrink-0 items-center gap-1.5 pl-1" data-page-save="">
      {dirty && !busy ? (
        <button type="button" onClick={reset} className={buttonSecondary} data-page-discard="">
          {tt("Discard")}
        </button>
      ) : null}
      <button type="button" onClick={() => void save()} disabled={!dirty || busy || uploading} className={cn(canPublish ? buttonSecondary : buttonPrimary, "min-w-[72px] justify-center disabled:cursor-default disabled:opacity-50")} data-page-save-button="" aria-busy={phase === "saving" || undefined}>
        {saveLabel}
      </button>
      {canPublish ? (
        <button type="button" onClick={() => void publish()} disabled={busy || uploading} className={cn(buttonPrimary, "justify-center")} data-page-publish="">
          {publishLabel}
        </button>
      ) : null}
    </div>
  )

  /*
    ONE ROW, AS WIDE AS THE STAGE. It is a size container: what it shows follows its own width (the panel dragged, the
    window, the zoom), and where the save buttons do not fit beside the view's controls they go to a second row, on the
    right, rather than off the edge.
  */
  const toolbar = (
    <div className="@container min-w-0 shrink-0" data-page-toolbar-box="">
      <div className="flex min-h-11 min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 py-0.5 sm:gap-x-2" data-page-toolbar="">
        {deviceSwitch}
        <button type="button" onClick={() => setVisitor((v) => !v)} aria-pressed={visitor} className={cn(iconButton, "w-auto gap-1.5 px-2.5 text-[13px] font-medium sm:w-auto")} data-page-visitor="" title={tt("See the page as a visitor who is not signed in")} aria-label={tt("As a visitor")}>
          <Eye aria-hidden className="h-4 w-4" />
          <span className="@max-[640px]:hidden">{tt("As a visitor")}</span>
        </button>
        <button type="button" onClick={() => setDark((v) => !v)} aria-pressed={dark} aria-label={dark ? tt("Show the page in the light look") : tt("Show the page in the dark look")} title={dark ? tt("Show the page in the light look") : tt("Show the page in the dark look")} className={iconButton} data-page-look="">
          {dark ? <Sun aria-hidden className="h-4 w-4" /> : <Moon aria-hidden className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1 px-1 @max-[520px]:hidden">{wide || full ? statusLine : null}</div>
        <span className="flex-1 @min-[520px]:hidden" />
        <button type="button" onClick={() => setFull((f) => !f)} aria-pressed={full} aria-label={full ? tt("Leave full screen") : tt("Full screen preview")} title={full ? tt("Leave full screen") : tt("Full screen preview")} className={iconButton} data-page-full-toggle="">
          {full ? <Minimize2 aria-hidden className="h-4 w-4" /> : <Maximize2 aria-hidden className="h-4 w-4" />}
        </button>
        {wide && !full ? (
          <button type="button" onClick={() => setPanel((p) => !p)} aria-pressed={!panel} aria-expanded={panel} aria-controls="pe-side" aria-label={panel ? tt("Hide the editing panel") : tt("Show the editing panel")} title={panel ? tt("Hide the editing panel") : tt("Show the editing panel")} className={iconButton} data-page-panel-toggle="">
            {panel ? <PanelRightClose aria-hidden className="h-4 w-4" /> : <PanelRightOpen aria-hidden className="h-4 w-4" />}
          </button>
        ) : null}
        {wide || full ? saveButtons : null}
      </div>
    </div>
  )

  const stage = (
    <div
      className={cn("flex min-w-0 flex-col gap-2", full ? "fixed inset-0 z-[90] bg-[#f8f9fa] p-3 pt-[max(12px,env(safe-area-inset-top))] sm:p-4" : wide ? "sticky top-[var(--pe-top,64px)] h-[var(--pe-stage-h,calc(100dvh-160px))] flex-1" : "h-[var(--pe-stage-h,calc(100dvh-260px))]")}
      data-page-stage=""
      data-page-full={full ? "" : undefined}
      role={full ? "dialog" : undefined}
      aria-modal={full ? true : undefined}
      aria-label={full ? tt("Preview of your page") : undefined}
    >
      {toolbar}
      <section className={cn(card, "min-h-0 flex-1 overflow-hidden")} aria-label={tt("Your page")} data-page-preview-card="">
        {shown ? (
          <PreviewFrame device={device} selected={visitor ? null : picked} labels={labels} onPick={pick} focus={focus} visitor={visitor} dark={dark}>
            <FramedPage data={shown} visitor={visitor} />
          </PreviewFrame>
        ) : (
          <p className="p-6 text-[14px] text-[#6b7280]">{tt("The page could not be read. Reload to try again.")}</p>
        )}
      </section>
    </div>
  )

  const groups = (
    <div className="divide-y divide-[#f1f2f4]" data-page-groups="">
      {PAGE_GROUPS.map((g) => {
        const open = group === g
        const issues = problems.filter((p) => groupOf(p.block) === g).length
        return (
          <section key={g} data-page-group={g} data-open={open ? "" : undefined}>
            <h3>
              <button
                type="button"
                onClick={() => toggleGroup(g)}
                aria-expanded={open}
                aria-controls={`pe-group-${g}`}
                className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors duration-100 hover:bg-[#f8f9fa] focus-visible:bg-[#f4f5f7] active:bg-[#f4f5f7] sm:px-5 [-webkit-tap-highlight-color:transparent]"
                data-page-group-button={g}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-semibold leading-5 text-[#1a1a2e]">{GROUP_INFO[g].title}</span>
                  {open ? null : <span className="mt-0.5 block truncate text-[12.5px] leading-[18px] text-[#6b7280]">{groupSummary(g, d)}</span>}
                </span>
                {issues ? <span aria-label={tt("Needs a fix")} title={tt("Needs a fix")} className="h-2 w-2 shrink-0 rounded-full bg-[#d92d20]" data-page-group-issue="" /> : null}
                <ChevronDown aria-hidden className={cn("h-4 w-4 shrink-0 text-[#9ca3af] transition-[rotate] duration-150 motion-reduce:transition-none", open && "rotate-180")} />
              </button>
            </h3>
            {/* Drawn the first time it opens, then kept (hidden while closed), so an upload or a half typed link in a closed group carries on. */}
            {seen.has(g) ? (
              <div id={`pe-group-${g}`} role="region" aria-label={GROUP_INFO[g].title} hidden={!open} className="px-4 pb-5 sm:px-5" data-page-group-body={g}>
                <GroupFields {...panelProps} group={g} />
              </div>
            ) : null}
          </section>
        )
      })}
    </div>
  )

  /* ── The panel's edge, dragged: the width written straight to the panel each move, kept on release ── */
  const resizeTo = (w: number, keep: boolean) => {
    const width = panelWidthFor(editorWidth.current, w)
    wantWidth.current = width
    applyPanel(editorWidth.current)
    if (!keep) return
    try {
      window.localStorage.setItem(PANEL_KEY, String(width))
    } catch {
      /* storage blocked: the width holds for this visit */
    }
  }
  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const handle = e.currentTarget
    const startX = e.clientX
    const startW = side.current?.getBoundingClientRect().width ?? PANEL_DEFAULT
    handle.setPointerCapture(e.pointerId)
    handle.setAttribute("data-active", "")
    root.current?.setAttribute("data-resizing", "")
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
    let x = startX
    let raf = 0
    /* One write a frame, however many moves the pointer sends. */
    const frame = () => {
      raf = 0
      resizeTo(startW + (startX - x), false)
    }
    const move = (ev: PointerEvent) => {
      x = ev.clientX
      if (!raf) raf = requestAnimationFrame(frame)
    }
    const up = () => {
      if (raf) cancelAnimationFrame(raf)
      handle.removeEventListener("pointermove", move)
      handle.removeEventListener("pointerup", up)
      handle.removeEventListener("pointercancel", up)
      handle.removeAttribute("data-active")
      root.current?.removeAttribute("data-resizing")
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      resizeTo(startW + (startX - x), true)
    }
    handle.addEventListener("pointermove", move)
    handle.addEventListener("pointerup", up)
    handle.addEventListener("pointercancel", up)
  }
  const resizeKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const now = side.current?.getBoundingClientRect().width ?? PANEL_DEFAULT
    const step = e.shiftKey ? 64 : 16
    const to = e.key === "ArrowLeft" ? now + step : e.key === "ArrowRight" ? now - step : e.key === "Home" ? PANEL_MAX : e.key === "End" ? PANEL_MIN : null
    if (to === null) return
    e.preventDefault()
    resizeTo(to, true)
  }

  return (
    <div ref={root} data-page-editor="" data-mode={mode} data-device={device} data-visitor={visitor ? "" : undefined} data-panel={wide ? (panel ? "open" : "hidden") : "drawer"} className="min-w-0">
      {wide ? (
        <div className="flex items-start">
          {full ? <div className="sticky top-[var(--pe-top,64px)] h-[var(--pe-stage-h,calc(100dvh-160px))] min-w-0 flex-1" /> : null}
          {full ? createPortal(stage, document.body) : stage}
          {panel ? (
            <>
              {/*
                THE HANDLE IS THE GAP between the page and the panel (the website builder's sidebar edge): wider than it
                looks, a line and a grip drawn where the stage is, under the pointer and while dragged. Double press puts
                the panel back to its first width.
              */}
              <div
                role="separator"
                aria-orientation="vertical"
                aria-controls="pe-side"
                aria-label={tt("Resize the editing panel")}
                aria-valuemin={PANEL_MIN}
                aria-valuemax={PANEL_MAX}
                aria-valuenow={PANEL_DEFAULT}
                tabIndex={0}
                onPointerDown={startResize}
                onKeyDown={resizeKey}
                onDoubleClick={() => resizeTo(PANEL_DEFAULT, true)}
                className="group/resize relative w-4 shrink-0 cursor-col-resize touch-none self-stretch outline-none [-webkit-tap-highlight-color:transparent]"
                data-page-resize=""
              >
                <div className="sticky top-[var(--pe-top,64px)] flex h-[var(--pe-stage-h,calc(100dvh-160px))] items-center justify-center">
                  <span aria-hidden className="h-full w-px bg-transparent transition-colors duration-150 group-hover/resize:bg-[#d4d6db] group-focus-visible/resize:bg-[#1a1a2e]/40 group-data-[active]/resize:bg-[#1a1a2e]/50 motion-reduce:transition-none" />
                  <span aria-hidden className="absolute h-9 w-[5px] rounded-full bg-[#d9dce1] transition-colors duration-150 group-hover/resize:bg-[#9ca3af] group-focus-visible/resize:bg-[#1a1a2e] group-data-[active]/resize:bg-[#1a1a2e] motion-reduce:transition-none" />
                </div>
              </div>
              <aside ref={side} id="pe-side" className={cn(card, "w-[360px] min-w-[300px] max-w-[560px] shrink-0 overflow-hidden")} aria-label={tt("Edit page")} data-page-side="">
                <div className="flex items-center gap-2 border-b border-[#f1f2f4] py-2 pl-4 pr-2 sm:pl-5">
                  <h2 className="min-w-0 flex-1 text-[15px] font-semibold leading-6 text-[#1a1a2e]">{tt("Edit page")}</h2>
                  <button type="button" onClick={() => setPanel(false)} className={iconButton} aria-label={tt("Hide the editing panel")} title={tt("Hide the editing panel")}>
                    <PanelRightClose aria-hidden className="h-4 w-4" />
                  </button>
                </div>
                {groups}
                {error ? (
                  <p role="alert" className="border-t border-[#f1f2f4] px-4 py-3 text-[13px] text-[#b42318] sm:px-5" data-page-panel-error="">
                    {error}
                  </p>
                ) : null}
              </aside>
            </>
          ) : null}
        </div>
      ) : (
        <>
          {full ? <div className="h-[var(--pe-stage-h,calc(100dvh-260px))]" /> : null}
          {full ? createPortal(stage, document.body) : stage}
          {/* A narrow editor: the groups in a drawer docked at the foot, its head the name, the state and Save. */}
          <EditorDrawer
            detent={detent}
            onDetent={setDetent}
            label={tt("Edit page")}
            head={
              <div className="flex items-center gap-2 px-2.5 pb-2.5 pt-0.5" data-page-drawer-head="">
                <button
                  type="button"
                  onClick={() => setDetent((x) => (x === "peek" ? "half" : "peek"))}
                  aria-expanded={detent !== "peek"}
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-[10px] px-1.5 text-left outline-none transition-colors duration-100 hover:bg-[#f8f9fa] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 [-webkit-tap-highlight-color:transparent]"
                  data-page-open-sheet=""
                >
                  <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#f1f2f4] text-[#1a1a2e]">
                    <Pencil className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold leading-5 text-[#1a1a2e]">{tt("Edit page")}</span>
                    <span role="status" aria-live="polite" className={cn(statusTone, "text-[12.5px] leading-[18px]")} data-page-status={status.tone}>
                      {statusParts}
                    </span>
                  </span>
                </button>
                {dirty && !busy && detent !== "peek" ? (
                  <button type="button" onClick={reset} className={cn(buttonSecondary, "h-10 shrink-0 px-3 text-[14px]")} data-page-discard="">
                    {tt("Discard")}
                  </button>
                ) : null}
                {canPublish && !dirty ? (
                  <button type="button" onClick={() => void publish()} disabled={busy || uploading} className={cn(buttonPrimary, "h-10 shrink-0 justify-center px-4 text-[14px]")} data-page-publish="">
                    {publishLabel}
                  </button>
                ) : (
                  <button type="button" onClick={() => void save()} disabled={!dirty || busy || uploading} className={cn(buttonPrimary, "h-10 min-w-[76px] shrink-0 justify-center px-4 text-[14px] disabled:cursor-default disabled:opacity-50")} data-page-save-button="" data-page-sheet-save="">
                    {saveLabel}
                  </button>
                )}
              </div>
            }
          >
            {groups}
            {error ? (
              <p role="alert" className="border-t border-[#f1f2f4] px-4 py-3 text-[13px] text-[#b42318]" data-page-panel-error="">
                {error}
              </p>
            ) : null}
          </EditorDrawer>
        </>
      )}
    </div>
  )
}
