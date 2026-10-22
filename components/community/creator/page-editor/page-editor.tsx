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
import { useRouter } from "next/navigation"
import { ChevronDown, Eye, Monitor, Moon, PanelRightClose, PanelRightOpen, Pencil, Smartphone, Sun } from "lucide-react"
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
import { CommunityStatusBadge, buttonPrimary, buttonSecondary, card, communityState, errorText, send } from "../parts"
import { nameCoverGradient } from "@/lib/communities/cover-gradient"
import { useConfirm } from "@/app/app/products/new/confirm-sheet"
import type { CommunityHead, SettingsData } from "../view-types"
import { GROUP_BLOCKS, PAGE_BLOCKS, PAGE_GROUPS, changedBody, draftOf, draftProblems, groupOf, isPageBlock, previewData, type DraftProblem, type PageBlock, type PageDraft, type PageGroup } from "./draft"
import { BLOCK_INFO, GROUP_INFO, GroupFields, groupSummary, type PanelProps } from "./panels"
import { PreviewDocument, PreviewFrame, type Device } from "./preview-frame"
import { PreviewChrome } from "./preview-chrome"
import { EditorDrawer } from "./drawer"
import { EditorBar, EditorScreen, useLeaveEditor } from "./screen"
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
 * THE PAGE ABOVE THE DRAWER (round 37: the editor owns the screen). Beside the panel the stage is simply the room under
 * the bar. Over the drawer it ends where the drawer's head begins, read from the drawer's own measure (./drawer.tsx
 * data-peek-top, CLAUDE.md: "measure it once"), so the card is whole as the page opens. A keyboard lifts the drawer and
 * not the page: the drawer moves over it, and nothing in the frame is laid out again.
 */
function useDrawerRoom(root: React.RefObject<HTMLDivElement | null>, drawer: boolean) {
  React.useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    if (!drawer) {
      el.style.removeProperty("--pe-drawer-room")
      return
    }
    let raf = 0
    const read = () => {
      raf = 0
      if (!el.getClientRects().length) return
      const peek = Number(el.querySelector<HTMLElement>("[data-page-drawer]")?.dataset.peekTop)
      if (!peek) return
      const kb = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--kb-inset")) || 0
      const room = el.getBoundingClientRect().bottom - (peek + kb) + 8
      el.style.setProperty("--pe-drawer-room", `${Math.max(0, Math.round(room))}px`)
    }
    const soon = () => {
      if (!raf) raf = requestAnimationFrame(read)
    }
    read()
    window.addEventListener("resize", soon)
    el.addEventListener("page-drawer:measured", read)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener("resize", soon)
      el.removeEventListener("page-drawer:measured", read)
    }
  }, [root, drawer])
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
  const [detent, setDetent] = React.useState<Detent>("peek")
  useDrawerRoom(root, !wide)
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
        Only the box the field is in moves: the drawer's list on a phone, the panel's own list beside the stage (round 37).
        scrollIntoView would also move the drawer itself and the page around the frame.
      */
      const box = el.closest<HTMLElement>("[data-page-sheet-body]") ?? el.closest<HTMLElement>("[data-page-side-body]")
      if (!box) return
      const delta = el.getBoundingClientRect().top - box.getBoundingClientRect().top
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
      const pane = root.current?.querySelector<HTMLElement>("[data-preview-pane]")
      const halfTop = Number(drawer?.dataset.halfTop)
      const room = drawer && drawer.dataset.detent !== "peek" && pane && halfTop ? Math.max(120, halfTop - pane.getBoundingClientRect().top) : undefined
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
    router.refresh()
    announceCommunityUpdated(head.id)
  }
  const reset = () => {
    setD(saved)
    setError(null)
    setBadLinks(0)
  }
  /* Ctrl or Cmd S, while this section is the one on screen. */
  const saveRef = React.useRef(save)
  saveRef.current = save
  React.useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "s") {
        if (!root.current?.getClientRects().length) return
        e.preventDefault()
        void saveRef.current()
      }
    }
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [])

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
              : /* Round 37: the community's state is the badge in the bar; here, only the save's. */
              { tone: "idle", text: tt("All changes saved") }
  const dot = { error: "bg-[#d92d20]", busy: "bg-[#e8a400] animate-pulse motion-reduce:animate-none", dirty: "bg-[#e8a400]", saved: "bg-[#22a06b]", idle: "bg-[#9ca3af]" }[status.tone]
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

  /* ── Leaving: back to the community's admin where the owner was, asking first when something is not saved ── */
  const [ask, confirmSheet] = useConfirm()
  const leaveEditor = useLeaveEditor(React.useCallback((href: string) => router.push(href, { scroll: false }), [router]))
  const leave = async () => {
    if (busy) return
    if (dirty || uploading) {
      const yes = await ask({ title: tt("Discard changes?"), body: tt("Your edits since the last save will be lost."), confirm: tt("Discard"), cancel: tt("Keep editing") })
      if (!yes) return
      reset()
    }
    leaveEditor()
  }

  /*
    THE BAR (round 37): the screen's only chrome. The way back and the community on the left; the preview's controls
    (Computer or Phone, as a visitor, the dark look); beside the panel the state of the save, the panel, Save and Publish.
    A size container: the words beside the icons go where the bar has no room for them, so a phone keeps the icons and
    the name. On a phone Save lives in the drawer's head, under the thumb.
  */
  const logo = head.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={head.logoUrl} alt="" className="h-8 w-8 shrink-0 rounded-[9px] object-cover shadow-[0_0_0_1px_rgba(16,24,40,0.06)] max-sm:hidden" data-page-editor-logo="" />
  ) : (
    <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] text-[14px] font-semibold text-white shadow-[0_0_0_1px_rgba(16,24,40,0.06)] [text-shadow:0_1px_1px_rgba(0,0,0,0.18)] max-sm:hidden" style={{ backgroundImage: nameCoverGradient(head.name) }} data-page-editor-logo="">
      {(Array.from(head.name.trim())[0] || "C").toUpperCase()}
    </span>
  )
  const title = (
    <div className="flex min-w-0 flex-1 items-center gap-2.5" data-page-editor-title="">
      {logo}
      <div className="flex min-w-0 flex-col items-start gap-0.5 @min-[560px]:flex-row @min-[560px]:items-center @min-[560px]:gap-2">
        <h1 className="max-w-full truncate text-[15px] font-semibold leading-5 text-[#1a1a2e]" title={head.name}>
          {head.name}
        </h1>
        <CommunityStatusBadge state={state} />
      </div>
    </div>
  )
  const barControls = (
    <>
      <div className="flex shrink-0 items-center gap-1 sm:gap-1.5" data-page-toolbar="">
        {deviceSwitch}
        <button type="button" onClick={() => setVisitor((v) => !v)} aria-pressed={visitor} className={cn(iconButton, "@min-[900px]:w-auto @min-[900px]:gap-1.5 @min-[900px]:px-2.5 text-[13px] font-medium")} data-page-visitor="" title={tt("See the page as a visitor who is not signed in")} aria-label={tt("As a visitor")}>
          <Eye aria-hidden className="h-4 w-4" />
          <span className="@max-[899px]:hidden">{tt("As a visitor")}</span>
        </button>
        <button type="button" onClick={() => setDark((v) => !v)} aria-pressed={dark} aria-label={dark ? tt("Show the page in the light look") : tt("Show the page in the dark look")} title={dark ? tt("Show the page in the light look") : tt("Show the page in the dark look")} className={iconButton} data-page-look="">
          {dark ? <Sun aria-hidden className="h-4 w-4" /> : <Moon aria-hidden className="h-4 w-4" />}
        </button>
      </div>
      {wide ? (
        <div className="flex min-w-0 shrink-0 items-center justify-end gap-1.5 @min-[1100px]:flex-1" data-page-editor-save-row="">
          <div className="min-w-0 px-1 @max-[979px]:hidden">{statusLine}</div>
          <button type="button" onClick={() => setPanel((p) => !p)} aria-pressed={!panel} aria-expanded={panel} aria-controls="pe-side" aria-label={panel ? tt("Hide the editing panel") : tt("Show the editing panel")} title={panel ? tt("Hide the editing panel") : tt("Show the editing panel")} className={iconButton} data-page-panel-toggle="">
            {panel ? <PanelRightClose aria-hidden className="h-4 w-4" /> : <PanelRightOpen aria-hidden className="h-4 w-4" />}
          </button>
          {saveButtons}
        </div>
      ) : null}
    </>
  )

  /* The page itself, filling what the bar leaves (above the drawer's head on a phone). */
  const stage = (
    <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col p-2 sm:p-3", wide ? (panel ? "pr-0 sm:pr-0" : "") : "pb-[var(--pe-drawer-room,96px)] sm:pb-[var(--pe-drawer-room,96px)]")} data-page-stage="">
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
    <EditorScreen ref={root} data-page-editor="" data-mode={mode} data-device={device} data-visitor={visitor ? "" : undefined} data-panel={wide ? (panel ? "open" : "hidden") : "drawer"}>
      <EditorBar onBack={() => void leave()} title={title}>
        {barControls}
      </EditorBar>
      {wide ? (
        <div className="flex min-h-0 flex-1" data-page-editor-body="">
          {stage}
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
                className="group/resize relative flex w-3 shrink-0 cursor-col-resize touch-none items-center justify-center outline-none sm:w-4 [-webkit-tap-highlight-color:transparent]"
                data-page-resize=""
              >
                <span aria-hidden className="absolute inset-y-3 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors duration-150 group-hover/resize:bg-[#d4d6db] group-focus-visible/resize:bg-[#1a1a2e]/40 group-data-[active]/resize:bg-[#1a1a2e]/50 motion-reduce:transition-none" />
                <span aria-hidden className="absolute h-9 w-[5px] rounded-full bg-[#d9dce1] transition-colors duration-150 group-hover/resize:bg-[#9ca3af] group-focus-visible/resize:bg-[#1a1a2e] group-data-[active]/resize:bg-[#1a1a2e] motion-reduce:transition-none" />
              </div>
              {/* Flush to the right edge, the height of the screen under the bar; its list is the one thing in it that scrolls. */}
              <aside ref={side} id="pe-side" className="flex w-[360px] min-w-[300px] max-w-[560px] shrink-0 flex-col bg-white pr-[env(safe-area-inset-right,0px)] shadow-[inset_1px_0_0_#e5e7eb]" aria-label={tt("Edit page")} data-page-side="">
                <div className="flex shrink-0 items-center gap-2 border-b border-[#f1f2f4] py-2 pl-4 pr-2 sm:pl-5">
                  <h2 className="min-w-0 flex-1 text-[15px] font-semibold leading-6 text-[#1a1a2e]">{tt("Edit page")}</h2>
                  <button type="button" onClick={() => setPanel(false)} className={iconButton} aria-label={tt("Hide the editing panel")} title={tt("Hide the editing panel")}>
                    <PanelRightClose aria-hidden className="h-4 w-4" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom,0px)]" data-page-side-body="">
                  {groups}
                  {error ? (
                    <p role="alert" className="border-t border-[#f1f2f4] px-4 py-3 text-[13px] text-[#b42318] sm:px-5" data-page-panel-error="">
                      {error}
                    </p>
                  ) : null}
                </div>
              </aside>
            </>
          ) : null}
        </div>
      ) : (
        <>
          {stage}
          {/* A narrow screen: the groups in a drawer docked at the foot, its head the name, the state and Save. */}
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
      {confirmSheet}
    </EditorScreen>
  )
}
