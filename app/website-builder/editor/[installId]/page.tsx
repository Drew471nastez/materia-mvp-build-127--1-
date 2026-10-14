"use client"

import { SectionTitleRename } from "@/components/website-builder/editor/section-title-rename"
import { explainSaveProblem, type SaveAction, type SaveProblem } from "@/lib/website-builder/save-problem"
import { SaveProblemBanner } from "@/components/website-builder/editor/save-problem-banner"
import { PhysicalReadinessNotice } from "@/components/website-builder/editor/physical-readiness-notice"
import { SyncNotice, useSyncStatus, type AgentNote, type SyncConflict } from "@/components/website-builder/github-sync-notice"
import type { ReportFile, SyncAction } from "@/lib/github-sync/editor-status"
import { isGitHubName } from "@/lib/agent-access/connection-mark"
import { putJsonWithRetry } from "@/lib/website-builder/save-request"
import { useEffect, useState, useLayoutEffect, useCallback, useDeferredValue, useMemo, useRef, use, memo, startTransition } from "react"
import { perfFail, perfStep, sinceScreenStart } from "@/lib/perf/mark"
import { installSteadyFocus } from "@/lib/website-builder/steady-focus"
import { ownOpen, useOwnMarker } from "@/lib/analytics/own-site"
import { createPortal } from "react-dom"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, Plug, Monitor, Smartphone, Loader2, Code2, ChevronDown, Plus, Eye, EyeOff, Trash2, Copy, Settings, Check, Layers, X, RotateCcw, Layout, AlignLeft, Image, MessageSquare, HelpCircle, Megaphone, BarChart2, Grid, Award, LayoutGrid, DollarSign, LayoutTemplate, Video, Users, MapPin, Mail, Clock, BookOpen, Shirt, Columns, Play, Star, Timer, Shield, Rss, SlidersHorizontal, Code, Bell, ChevronRight, Menu as MenuIcon, Package, Undo2, Redo2, ExternalLink, Search, FileText, ArrowRight, FolderOpen, MoreHorizontal, Upload, Info, Crop, CheckCircle, Type, Square, Rows3, Grid3x3, MousePointerClick, MoveHorizontal, Hash, Columns2, LayoutDashboard, Badge as BadgeIcon, ArrowUp, ArrowDown, Maximize2, Minimize2,
  Palette, ShoppingBag, ShoppingCart, Share2, Cookie, Languages,
} from "lucide-react"
import { arrayMove } from "@dnd-kit/sortable"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { MobileEditorSheet, sheetMoveMs } from "@/components/website-builder/mobile-editor-sheet"
import { SliderNumberControl } from "@/components/website-builder/editor/slider-number-control"
import { WbImagePicker } from "@/components/website-builder/editor/image-picker"
import { ImagePickerControl } from "@/components/website-builder/editor/controls/image-picker-control"
import { SocialLinksEditor } from "@/components/website-builder/editor/social-links-editor"
import { SOCIAL_PLATFORMS } from "@/lib/website-builder/social-links"
import { FontPreviewPicker } from "@/components/website-builder/editor/font-preview-picker"
import { Collapse } from "@/components/website-builder/editor/collapse"
import { BlockTreeLevel, TreeAddBlock } from "@/components/website-builder/editor/block-tree-rows"
import { afterAddSettles, measureSectionTops, playArrival, sheetCoverAbovePeek } from "@/lib/website-builder/section-arrival"
import { SectionLibrary } from "@/components/website-builder/editor/section-library"
import { SectionsList } from "@/components/website-builder/editor/sections-list"
import { useEchoedValue } from "@/components/website-builder/echo-field"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { hapticTap } from "@/lib/native-bridge"
import { BuilderLoader, useDelayedFlag, useLinger } from "@/components/website-builder/builder-loader"
import { SPINNER_WAIT_MS } from "@/components/ui/activity-spinner"
import { CanvasScrollbar } from "@/components/website-builder/canvas-scrollbar"
import { usePhoneChromeTone } from "@/components/website-builder/native-chrome"
import { LeaveConfirm, hasSomethingToLose, type LeaveReason } from "@/components/website-builder/leave-confirm"
import { CanvasHover } from "@/components/website-builder/canvas-hover"
import { backThen } from "@/lib/navigation/go-back"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { PageList, PageSwitcher, type SwitcherPage } from "@/components/website-builder/page-switcher"
import { PublishPanel } from "@/components/website-builder/publish-panel"
import { PreviewModeSwitch, CodePane, type PreviewMode } from "@/components/website-builder/preview-mode-switch"
import { settingsSectionFrom, type ConnectVia, type SettingsSection } from "@/components/website-builder/website-settings/types"
import { ConnectionButton, LiveChangeNotice, addToBatch, useSiteActivity, type LiveBatch, type LiveChange } from "@/components/website-builder/site-connections"
import { ConnectionMarkIcon } from "@/components/website-builder/connection-marks"
import { PanelBack } from "@/components/website-builder/panel-back"
import { describeChange, pageEventPlan, pickConnection, sectionTypeOf, type ActivityEvent } from "@/lib/agent-access/connection-mark"
import { createClient } from "@/lib/supabase/client"
import { GradientEditor } from "@/components/website-builder/editor/gradient-editor"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type {
  ThemeInstall, SectionInstance, ThemeSettingsValues,
  PageKey, EditorPanel, SchemaField, SectionSchema, BlockInstance, BlockSchema, SectionPreset } from "@/lib/website-builder/types"
import { BUTTON_COLOR_GROUPS, ButtonColorGroup, ColorsPanel, SectionColorSetting, SectionDesignPanel, TypographyPanel } from "@/components/website-builder/editor/design-panels"
import { designSupport } from "@/lib/website-builder/design-support"
import { LEGACY_OVERRIDE_FIELDS } from "@/lib/website-builder/section-overrides"
import { remapScheme, themeColorSchemes } from "@/lib/storelib-theme/color-schemes"
import { sameSettingValue } from "@/lib/website-builder/same-setting"
import { THEME_ROOT_ATTRIBUTE, themeVars } from "@/lib/website-builder/theme-css"
import { deferLive, echoBlockSetting, echoSectionSetting, isLive, reconcileEchoes, useLiveTheme, setLiveBlockSetting, setLiveSectionSetting, setLiveThemeSetting } from "@/lib/website-builder/live-settings"
import { PAGE_META } from "@/lib/website-builder/types"
import { customPageSections, searchListsTheShop } from "@/lib/website-builder/shop-page"
import { storeLinkTargets } from "@/lib/website-builder/link-targets"
import { BUILT_IN_PAGE_KEYS, pageKeyFromSegment, pagePath, pageTitleFromKey, templateForPage } from "@/lib/website-builder/site-pages"
import { editorPageKeyOf, editorPagePath, resolveEditorHref } from "@/lib/website-builder/editor-navigation"
import { sectionLinkTargets } from "@/lib/website-builder/link-menu"
import { headerIconOn } from "@/lib/website-builder/header-icons"
import { headerGap, headerPad } from "@/lib/website-builder/header-spacing"
import { SHOP_PATH } from "@/lib/website-builder/live-links"
import { mainProductSection, withDeliveryBlock, withProductBlocks } from "@/lib/website-builder/product-page"
import { CHROMELESS_PAGES, chromeOf, withoutChrome, withUniversalChrome, type Chrome } from "@/lib/website-builder/universal-chrome"
import {
  groupOf,
  isKind,
  kindLookup,
  placeSection,
  repairChrome,
  sectionGroupsFor,
  splitGroups,
  toggleShown,
  visibleOfKind,
  type SectionGroup,
  type SectionKind,
} from "@/lib/storelib-theme/section-groups"
import { ReplaceChromeConfirm } from "@/components/website-builder/editor/replace-chrome-confirm"
import { AutoTextarea } from "@/components/website-builder/auto-textarea"
import { RichTextField } from "@/components/website-builder/rich-text-field"
import { toPageSlug } from "@/lib/sites/slug"
import { SECTION_SCHEMAS, ADDABLE_SECTIONS } from "@/lib/website-builder/section-schemas"
import { controlFor, resolveControlType } from "@/lib/storelib-theme/controls/registry"
import { fillResponsive } from "@/lib/storelib-theme/resolve"
import { toCard, type ProductCard } from "@/lib/website-builder/shop-products"
import { createUndoRun } from "@/lib/website-builder/undo-run"
import { sectionDisplayName } from "@/lib/website-builder/section-name"
import { PIN_AFTER_SELECT_MS, PIN_WHILE_OPENING_MS, pinScroll, resetClippedAncestors, revealWithin, reviveScroller } from "@/lib/website-builder/canvas-scroll"
import { scrollToHash, themeRootOf } from "@/lib/website-builder/section-motion"
import { SITE_DRAWER_OPEN_ATTRIBUTE } from "@/components/website-builder/drawer-frame"
import { LEAVING_SEEN_MS, NAVIGATE_CEILING_MS, navigateWithCeiling } from "@/lib/website-builder/navigate-ceiling"
import { fileLinkHref, isCanvasNavigationLink, isTypingTarget, leavesThePage, type ClickTargetLike } from "@/lib/website-builder/canvas-intercept"
import { FIELD_FLASH_MS, chainFrom, clickTarget, type ClickTarget, type ElementLike } from "@/lib/website-builder/click-to-edit"

import { watchKeyboard } from "@/lib/website-builder/keyboard-watch"
import { clearStaleDocumentLocks, watchForStuckLayer } from "@/lib/website-builder/stuck-layer"
import { addableBlocks, blockSchemaIn, customAddableSections, customSectionSchemas, schemaFor, themeBlockCatalog } from "@/lib/website-builder/storelib-schemas"
import { blocksIntoDetails, staysInDetails, PRODUCT_DETAILS_BLOCK } from "@/lib/website-builder/product-details-rule"
import { blockAt, cloneTree, countAll, depthOf, freshBlocks, insertAt as insertBlockAt, parsePath, pathKey, removeAt, resolvePath, updateAt, withChildren } from "@/lib/website-builder/block-tree"
import { type BlockChoice } from "@/components/website-builder/editor/add-block-button"
import { isStorelibSection, newSectionSettings } from "@/lib/website-builder/storelib-runtime"
import { LIMITS, MAX_BLOCK_DEPTH } from "@/lib/storelib-theme/types"
import {
  WRITING_SECTION_ID,
  WRITING_SECTION_TYPE,
  gapWithoutPlaceholder,
  instanceFromSchema,
  placeWrittenSection,
  withWritingPlaceholder,
  writingAnchor,
  type WritingAnchor,
} from "@/lib/website-builder/ai-placement"
import { WritingSection } from "@/components/website-builder/editor/writing-section"
import { EditedBuiltInNote, isEditedBuiltIn } from "@/components/website-builder/editor/edited-built-in-note"
import { DEFAULT_THEME_SOURCES } from "../../../../themes/default/sources.generated"
import { AiWorkingOverlay, SETTLE_MS } from "@/components/website-builder/editor/ai-working-overlay"
import { StorelibLiveProvider } from "@/components/website-builder/sections/storelib-live"
import { headerLogoOf } from "@/lib/website-builder/chrome-logo"
import { bodyGapToListIndex } from "@/lib/website-builder/section-order"
import { IconPicker } from "@/components/website-builder/icon-picker"
import { LinkPicker, LinkTargetsProvider, useLinkTargets, type LinkTarget, type SectionLinkSource } from "@/components/website-builder/link-picker"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import SectionRenderer from "@/components/website-builder/sections/SectionRenderer"
import { forgetCompatFiles, loadCompatFiles } from "@/components/website-builder/compat/compat-files"
import { CompatThemeSettings } from "@/components/website-builder/compat/compat-theme-settings"
import { assetAddresses, compatOf, compatPageForHref } from "@/lib/storelib-theme/compat/install"
import { faviconFollows } from "@/lib/website-builder/favicon-sync"
import { themeSchemeList } from "@/lib/storelib-theme/compat/scheme-list"
import { compatMenus } from "@/lib/storelib-theme/compat/menus"
import { isCompatSource } from "@/lib/storelib-theme/compat/theme"
import type { StoredSection } from "@/lib/storelib-theme/compat/page"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { scheduleCoverRefresh, flushCoverRefresh } from "@/lib/website-builder/cover-refresh"
import { FullScreenLock } from "@/components/website-builder/full-screen-lock"
import { CanvasTopLayerGuard } from "@/components/website-builder/canvas-top-layer"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { toast } from "sonner"
import { getWebsiteShareUrl, getWebsiteUrlDisplay } from "@/lib/url-helpers"
import { ColorField } from "@/components/storefront/color-field"
import { applyOp, type ThemeOp } from "@/lib/website-builder/agent/operations"
import { switchKnob, switchTrack } from "@/components/ui/switch-style"
import { DynamicSourceField, EditorFieldProvider, SiblingSettingsProvider, controlCarriesOwnLabel, renderRegisteredControl, type EditorFieldEnv } from "@/components/website-builder/editor/controls"
import { MenuPickerControl } from "@/components/website-builder/editor/controls/menu-picker-control"
import { dynamicContext, productFacts, siteMenus, storefrontData, withDynamicSources, type CreatorFacts } from "@/lib/website-builder/storefront-data"
import { useCanvasReviews } from "@/components/website-builder/use-canvas-reviews"
import { MAIN_MENU, adoptHeaderLinks, headerReadsMenu } from "@/lib/website-builder/main-menu"
import { MenusEditor } from "@/components/website-builder/editor/controls/menus-editor"
import { THEME_BREADCRUMBS_ID, withThemeBreadcrumbs } from "@/lib/website-builder/theme-breadcrumbs"
import { cleanMenus } from "@/lib/storelib-theme/values"
import { LoadTimeout, fetchWithin, reportLoadProblem, retrying } from "@/lib/website-builder/load-guard"
import { CanvasProblem, CompatCanvasWaiting } from "@/components/website-builder/canvas-problem"
import { usePreviewLanguage } from "@/components/website-builder/use-preview-language"
import { PreviewLanguageSwitch } from "@/components/website-builder/preview-language-switch"
import { localizeCards, localizeMenus, localizeSections } from "@/lib/markets/translate"
import { languageName } from "@/lib/markets/locales"
import { holdCanvasStill, STILL_ATTR as CANVAS_STILL_ATTR } from "@/lib/website-builder/canvas-still"
import type { StorefrontCollection, StorefrontCommunity } from "@/lib/storelib-theme/types"
import type { PickerCollection, PickerCommunity } from "@/components/website-builder/editor/controls"

/** What /api/website-builder/themes/[installId] says about the creator's communities. */
type BuilderCommunities = { choices: PickerCommunity[]; cards: Record<string, StorefrontCommunity> }
/** And about their collections: every one to pick, the published ones as a section reads them. */
type BuilderCollections = { choices: PickerCollection[]; cards: Record<string, StorefrontCollection> }

/** An imported Shopify theme's pages, by the theme's own names for its templates, in the order a shop reads. */
const COMPAT_PAGE_NAMES: [string, string, string][] = [
  ["home", "Home", "/"],
  ["product", "Product", "/products"],
  ["collection", "Collection", "/collections/all"],
  ["collections", "Collections list", "/collections"],
  ["search", "Search", "/search"],
  ["cart", "Cart", "/cart"],
  ["page", "Page", "/pages/page"],
  ["contact", "Contact", "/pages/contact"],
  ["blog", "Blog", "/blogs/news"],
  ["article", "Blog post", "/blogs/news/post"],
  ["404", "Not found", "/404"],
  ["password", "Password", "/password"],
]
function compatPages(keys: string[], extra: string[]): SwitcherPage[] {
  const known = COMPAT_PAGE_NAMES.filter(([k]) => keys.includes(k)).map(([key, name, path]) => ({ key, name, path }))
  const rest = [...new Set([...keys.filter((k) => !COMPAT_PAGE_NAMES.some(([n]) => n === k)), ...extra])].sort().map((key) => ({ key, name: pageTitleFromKey(key), path: `/pages/${key}`, custom: true }))
  return [...known, ...rest]
}
/** The sections that show the creator's collections, offered only while collections are on. */
const COLLECTION_SECTIONS: ReadonlySet<string> = new Set(["collections_grid", "collection_featured"])
import { visibleFields } from "@/lib/storelib-theme/visible-if"

/** Ask Storelib on a phone: half, and the whole screen below the status bar. A constant so the sheet's memo holds. */
const AI_SHEET_DETENTS = [0.5, 1]

/**
 * ASK STORELIB'S PILL, CLOSED ON PURPOSE, is remembered per browser: the
 * pill is there by default on a computer, and somebody who closed it with
 * its X should not find it back on every load. The bar's Ask AI brings it
 * back and forgets this. Per viewer convenience only, so a blocked store
 * just means the default.
 */
const ASK_DOCK_CLOSED_KEY = "storelib.ask-dock.closed"
function askDockClosed(): boolean {
  try {
    return window.localStorage.getItem(ASK_DOCK_CLOSED_KEY) === "1"
  } catch {
    return false
  }
}
function rememberAskDockClosed(closed: boolean) {
  try {
    if (closed) window.localStorage.setItem(ASK_DOCK_CLOSED_KEY, "1")
    else window.localStorage.removeItem(ASK_DOCK_CLOSED_KEY)
  } catch {
    /* the default next time */
  }
}

// ── Custom back-with-bar icon (topbar) ──────────────────────
function BackWithBarIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <rect x="21.333" y="85.333" width="42.666" height="341.334" />
      <path d="M490.667 234.667 H185.333 L316 104 L286.083 74.083 L104.833 255.333 L286.083 436.583 L316 406.667 L185.333 277.333 H490.667 Z" />
    </svg>
  )
}

// ── Thin page-load progress bar (single A→B sweep) ──────────
// NProgress-style: while `active` is true, the bar creeps from 0 → ~90%
// on an ease-out curve (never looping). When `active` flips false, the
// bar snaps to 100% and fades out. There is NO repeating / double
// animation — one clean sweep per load.
/** How long a wait goes before the bar shows. */
const BAR_AFTER_MS = 220

function WbLoadProgressBar({ active }: { active: boolean }) {
  const [progress, setProgress] = useState(0)
  const [visible, setVisible] = useState(false)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    const clearTimers = () => {
      timersRef.current.forEach(t => clearTimeout(t))
      timersRef.current = []
    }

    if (active) {
      clearTimers()
      /* Only a wait worth seeing: a page that answers within a fifth of a second shows no bar at all, as on the rest of Storelib (components/navigation/route-loading-bar.tsx). */
      timersRef.current.push(setTimeout(() => setVisible(true), BAR_AFTER_MS))
      // Kick off the ease-out creep: 0 → 30 → 60 → 80 → 90.
      // We never touch 100 while active so the bar can't visually "restart".
      setProgress(0)
      /**
       * More steps, closer together. Four widely spaced ones meant each move
       * was a long eased run that had visibly FINISHED before the next began,
       * so the bar advanced and then sat still, which reads as stuck. With
       * the transition longer than the gap between steps, each one starts
       * before the last has settled and the sweep is continuous.
       */
      const creep: [number, number][] = [
        [18, 40], [34, 240], [48, 480], [60, 760],
        [70, 1080], [78, 1450], [84, 1900], [89, 2500], [93, 3400],
      ]
      for (const [to, at] of creep) {
        timersRef.current.push(setTimeout(() => setProgress(to), at))
      }
    } else if (visible) {
      // Finish the sweep: snap to 100, fade out, then reset.
      clearTimers()
      setProgress(100)
      timersRef.current.push(setTimeout(() => setVisible(false), 260))
      timersRef.current.push(setTimeout(() => setProgress(0), 560))
    } else {
      setProgress(0)
    }

    return clearTimers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  return (
    <div
      aria-hidden
      /**
       * OVER the bottom edge of the bar, not under it.
       *
       * In flow, this was a 1.5px strip between the dark bar and the canvas,
       * transparent when idle, showing whatever is behind it: the page root,
       * which is light. On a desktop the light canvas hid it. On a phone the
       * theme is edge-to-edge and dark, and the strip read as a white line
       * under the bar. Absolute, it takes no room, and idle it is nothing.
       */
      /**
       * 2px. A hairline at 0.9 opacity was invisible on the one screen it
       * exists for; 3px read as a chrome element. Two is a line you notice
       * moving without noticing the line. It still takes no room in the flow.
       */
      className="absolute inset-x-0 bottom-0 z-10 h-[2px] overflow-hidden bg-transparent pointer-events-none"
      style={{
        opacity: visible ? 1 : 0,
        transition: "opacity 220ms ease-out",
      }}
    >
      <div
        className="h-full w-full origin-left"
        style={{
          /**
           * ═══════════════════════════════════════════════════════════════
           *  scaleX, NOT width
           * ═══════════════════════════════════════════════════════════════
           * A width transition is laid out and painted on the main thread on
           * every frame, and the main thread during a page load is the one
           * doing the loading: the bar stuttered, stalled, and jumped the
           * moment the work it was reporting on got busy — which is exactly
           * when somebody is looking at it. A transform is composited off
           * the main thread, so it keeps moving at the display's own rate
           * however hard React is working beside it.
           *
           * `origin-left` so it grows from the left edge rather than the
           * middle, and the element is full width with nothing in it, so
           * there is no layout to redo at any point in the sweep.
           */
          transform: `scaleX(${progress / 100})`,
          transition: "transform 520ms cubic-bezier(0.22, 1, 0.36, 1)",
          willChange: "transform",
          /**
           * The product's own accent, not a generic blue: it is the colour
           * every other "something is happening" in this editor uses. A soft
           * leading edge rather than a glow, which at 2px was a purple haze
           * over the canvas rather than a line on the bar.
           */
          background: "linear-gradient(90deg, #8B56FA 0%, #8B56FA 88%, rgba(139,86,250,0.55) 100%)",
        }}
      />
    </div>
  )
}

// ── Logo sync maps (header section ↔ theme settings) ────────
const LOGO_SYNC_HEADER_TO_THEME: Record<string, string> = {
  logo_url: "logo_url",
  logo_height: "logo_width",
  mobile_logo_url: "mobile_logo_url",
  mobile_logo_height: "mobile_logo_width",
  use_mobile_logo: "use_mobile_logo",
}
const LOGO_SYNC_THEME_TO_HEADER: Record<string, string> = {
  logo_url: "logo_url",
  logo_width: "logo_height",
  mobile_logo_url: "mobile_logo_url",
  mobile_logo_width: "mobile_logo_height",
  use_mobile_logo: "use_mobile_logo",
}

// ── URL ⇄ editor-state mapping (Shopify-style `previewPath`) ─
// The canonical URL shape is
//   /store/{creatorSlug}/themes/{installId}/editor?previewPath={path}
// where `previewPath` is URL-encoded and mirrors the live-site path the
// user is currently previewing. We also accept the legacy `?page=X[&product=Y]`
// query string so existing deep-links keep working.
type ParsedPreview = {
  page: "home" | "product" | "about" | "contact" | "products" | "search" | "404"
  productSlug?: string
  productTitle?: string
}

function parsePreviewFromSearch(search: string): ParsedPreview {
  const params = new URLSearchParams(search)

  // Legacy format: ?page=home&product=My+Title
  const legacyPage = params.get("page")
  if (legacyPage) {
    const title = params.get("product") ?? undefined
    return { page: legacyPage as ParsedPreview["page"], productTitle: title }
  }

  // New format: ?previewPath=/products/my-slug  (URL-decoded by URLSearchParams)
  const preview = params.get("previewPath")
  if (!preview) return { page: "home" }
  const normalized = preview.startsWith("/") ? preview : `/${preview}`
  const pathOnly = normalized.split("?")[0].split("#")[0].replace(/\/$/, "") || "/"

  if (pathOnly === "/") return { page: "home" }
  if (pathOnly === "/about") return { page: "about" }
  if (pathOnly === "/contact") return { page: "contact" }
  if (pathOnly === SHOP_PATH) return { page: "products" }
  if (pathOnly === "/search") return { page: "search" }
  if (pathOnly === "/404") return { page: "404" }
  if (pathOnly.startsWith("/products/")) {
    const slug = pathOnly.slice("/products/".length).split("/")[0]
    return { page: "product", productSlug: slug || undefined }
  }
  return { page: "home" }
}

function previewPathForState(page: string, productSlug?: string): string {
  if (page === "about") return "/about"
  if (page === "contact") return "/contact"
  if (page === "products") return SHOP_PATH
  if (page === "search") return "/search"
  if (page === "404") return "/404"
  if (page === "product" && productSlug) return `/products/${productSlug}`
  return "/"
}

/** Reads the site's pages and products out of context and picks among them. */
function LinkFieldEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: unknown) => void
  placeholder?: string
}) {
  const targets = useLinkTargets()
  return <LinkPicker value={value} onChange={(href) => onChange(href)} targets={targets} placeholder={placeholder} />
}

/**
 * ===========================================================================
 *  ONE SETTING, THREE SCREENS
 * ===========================================================================
 * A section may say `"responsive": true` on a setting, and seven of the
 * shipped ones do. The engine honoured it and the templates read
 * `settings.columns.desktop`, but there was no control: the editor drew a
 * single input, so the only way to give a phone its own number was to open
 * the file and type JSON. Meanwhile every grid shipped with the desktop
 * number on a phone, which is how a product card ended up 93px wide.
 *
 * The switch picks which screen you are setting. The control underneath is
 * the ordinary one for the setting, so a range is still a range and an
 * alignment is still an alignment: this wraps controls, it does not replace
 * them.
 *
 * WHAT IT STORES. A scalar while all three agree, an object the moment they
 * do not. Collapsing keeps a section that never needed a phone number out of
 * the responsive shape entirely, and matches what `stripDefaults` does on
 * the way to disk, so the editor and the engine hold the same belief about
 * what "unset" looks like.
 *
 * WHAT IT SHOWS when a breakpoint has no value of its own: the one that
 * would apply, filled down from above by `fillResponsive`, which is the same
 * function the renderer uses. A control showing the default while the page
 * renders something else is worse than no control.
 */
const RESPONSIVE_SCREENS = [
  { id: "desktop", label: "Desktop" },
  { id: "tablet", label: "Tablet" },
  { id: "mobile", label: "Phone" },
] as const

function ResponsiveField({
  field,
  value,
  onChange,
}: {
  field: SchemaField
  value: unknown
  onChange: (v: unknown) => void
}) {
  const [screen, setScreen] = useState<(typeof RESPONSIVE_SCREENS)[number]["id"]>("desktop")
  const parts = fillResponsive(value, field.default)

  const set = (v: unknown) => {
    const next = { ...parts, [screen]: v }
    const same = next.desktop === next.tablet && next.tablet === next.mobile
    onChange(same ? next.desktop : next)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5">
        {RESPONSIVE_SCREENS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setScreen(s.id)}
            className={cn(
              "flex-1 h-7 rounded-md text-[11px] font-medium transition-colors",
              screen === s.id ? "bg-background text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
      {/* `responsive: false` on the way down, or this recurses forever. */}
      <FieldEditor field={{ ...field, responsive: false }} value={parts[screen]} onChange={set} />
    </div>
  )
}

/**
 * WHICH CONTROLS NAME THEMSELVES.
 *
 * Most controls in this sidebar are a bare input and the panel puts a
 * `<label>` above them. Three do not: `header` and `paragraph` ARE text, and
 * a colour now opens as a ColorField, whose closed row already reads
 * "Background   #FFFFFF" with the swatch. Labelling those from outside
 * prints the name twice.
 *
 * This lives in one place because the panel renders fields from five
 * different call sites — section settings, block settings, the advanced
 * colours list, and two legacy paths — and a rule spelled out five times is
 * a rule that will be right in four of them. Spelling it once is what makes
 * "all of them are updated" checkable rather than hopeful.
 */
function fieldCarriesOwnLabel(field: SchemaField): boolean {
  return field.type === "color" || field.type === "header" || field.type === "paragraph" || controlCarriesOwnLabel(field.type)
}

/**
 * A one-line text setting. It shows what is typed at once and hands it to the
 * editor in a transition, so the whole editor re-rendering is no longer
 * between a key and its letter. See components/website-builder/echo-field.
 */
function EchoTextInput({ value, onChange, placeholder }: { value: string; onChange: (v: unknown) => void; placeholder: string }) {
  const [shown, set] = useEchoedValue(value, onChange)
  return (
    <input
      type="text"
      className="w-full h-8 px-2.5 text-[13px] border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 transition-colors"
      placeholder={placeholder}
      value={shown}
      onChange={e => set(e.target.value)}
    />
  )
}

// ── Field editor ─────────────────────────────────────────────
/**
 * Every setting's label and control. The label row is drawn here, not by
 * the loops that list the fields, because a setting that can take a dynamic
 * source carries its Insert shop data button at the right end of that row
 * (components/website-builder/editor/controls/dynamic-source-field.tsx).
 * `label` is absent for a control that names itself: see
 * fieldCarriesOwnLabel.
 */
/** The per-platform fields the social links editor draws as one list. */
const SOCIAL_FIELD_IDS: ReadonlySet<string> = new Set(SOCIAL_PLATFORMS.map((p) => p.key))

/** Each General Settings group's mark, by the group's id. */
const THEME_GROUP_ICONS: Record<string, typeof Image> = {
  branding: Image,
  color_schemes: Palette,
  colors: Palette,
  typography: Type,
  buttons: MousePointerClick,
  layout: LayoutDashboard,
  product_cards: ShoppingBag,
  cart: ShoppingCart,
  social: Share2,
  cookies: Cookie,
  animations: Play,
  announcement: Megaphone,
  menus: MenuIcon,
  custom_css: Code,
}

/**
 * One group in General Settings: its mark, its name, and a chevron that
 * says it opens. Pressing it opens the group as its own panel.
 */
function ThemeGroupRow({ group, onOpen }: { group: (typeof THEME_SETTINGS_GROUPS)[number]; onOpen: () => void }) {
  const Icon = THEME_GROUP_ICONS[group.id] ?? null
  return (
    <button
      type="button"
      data-theme-group-row={group.id}
      onClick={onOpen}
      className="group/row mb-0.5 flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-[13.5px] font-medium text-foreground transition-colors duration-100 hover:bg-muted/60 active:bg-muted max-sm:h-12 max-sm:text-[15px]"
    >
      {Icon ? (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground transition-colors group-hover/row:text-foreground">
          <Icon className="h-3.5 w-3.5" strokeWidth={1.9} />
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{group.label}</span>
      <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform duration-150 group-hover/row:translate-x-0.5 group-hover/row:text-foreground" />
    </button>
  )
}

function FieldEditor({ label, ...props }: Parameters<typeof FieldControl>[0] & { label?: string }) {
  return (
    <DynamicSourceField field={props.field} value={props.value ?? props.field.default} onChange={props.onChange} label={label}>
      <FieldControl {...props} />
    </DynamicSourceField>
  )
}

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: SchemaField
  value: unknown
  onChange: (v: unknown) => void
}) {
  const raw = value ?? field.default
  /**
   * ONE NAME PER CONTROL. The JSON schemas said `link`, `image`, `icon`,
   * `video`, `font`; a .storelib schema says `url`, `image_picker`,
   * `icon_picker`, `video_picker`, `font_picker`. The registry
   * (lib/storelib-theme/controls) owns the names and the aliases, and this
   * function draws whatever it resolves to — so a control exists in exactly
   * one place, and a schema written for either spelling gets the same editor.
   */
  const kind = resolveControlType(field.type) ?? field.type
  const targets = useLinkTargets()

  /**
   * After the hooks, never before: an early return above `useLinkTargets`
   * would change the hook order between a responsive field and an ordinary
   * one. The registry decides which controls can hold a value per
   * breakpoint, so a schema cannot ask for a responsive image picker.
   */
  if (field.responsive && controlFor(field.type)?.responsive) {
    return <ResponsiveField field={field} value={value} onChange={onChange} />
  }

  /* The newer controls, each in its own file: components/website-builder/editor/controls. */
  const registered = renderRegisteredControl(kind, field, raw, onChange)
  if (registered) return <>{registered}</>

  /**
   * An icon field had NO editor at all — it fell through to the last branch
   * of this function — so changing a feature's icon meant knowing that the
   * value is a kebab-case lucide name and typing one.
   */
  if (kind === "icon_picker") {
    return <IconPicker value={typeof raw === "string" ? raw : ""} onChange={(name) => onChange(name)} />
  }

  /**
   * A link field was a bare text box, which meant knowing that your own shop
   * is the string "/shop" and that a product is "/products/" and then a slug.
   * The picker lists what the site actually has, and still takes anything
   * typed.
   */
  if (kind === "url") {
    return <LinkFieldEditor value={typeof raw === "string" ? raw : ""} onChange={onChange} placeholder={field.placeholder} />
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   *  A GRADIENT IS NOT A STRING TO TYPE
   * ═══════════════════════════════════════════════════════════════════════
   * There is no `gradient` kind in the schema, so every gradient setting a
   * theme declares arrives here as text — and what a creator gets is
   *
   *     linear-gradient(135deg, #667eea 0%, #764ba…
   *
   * clipped by the width of the field, which is a thing you can only edit if
   * you already know the syntax. The editor for it has existed since the
   * colour schemes were built; it was only ever wired to the scheme panel.
   *
   * Matched on the field's own name rather than on its value, so an empty
   * gradient setting gets the editor too — otherwise the one case where it
   * is needed most, nothing set yet, is the one case that gets the box.
   */
  if (kind === "text" && /gradient/i.test(String(field.id ?? "") + " " + String(field.label ?? ""))) {
    return (
      <GradientEditor
        value={typeof raw === "string" ? raw : ""}
        onChange={(css) => onChange(css)}
      />
    )
  }

  if (kind === "text") {
    return <EchoTextInput value={typeof raw === "string" ? raw : ""} onChange={onChange} placeholder={field.placeholder ?? ""} />
  }

  /**
   * A RICHTEXT FIELD IS WRITTEN IN, NOT TYPED AS MARKUP.
   *
   * Both of these used to be the same fixed-height textarea, so the body of a
   * policy page read `<p><em>Last updated…</em></p>` in a box four lines
   * tall. Now the one that holds HTML gets an editor, and the one that holds
   * plain text gets a box the size of what is in it.
   */
  if (kind === "richtext") {
    return (
      <RichTextField
        value={typeof raw === "string" ? raw : ""}
        onChange={onChange}
        placeholder={field.placeholder ?? "Write something"}
      />
    )
  }

  if (kind === "textarea") {
    return (
      <AutoTextarea
        value={typeof raw === "string" ? raw : ""}
        onChange={onChange}
        placeholder={field.placeholder ?? ""}
      />
    )
  }

  if (kind === "color") {
    /*
      THE BUILDER'S OWN PICKER, NOT THE BROWSER'S.

      This was a native `<input type="color">` in a 36px box with the swatch
      blown up past its edges by `-inset-1`. Chrome draws that control as a
      colour band with white under it and macOS opens the system colour
      panel on top of the app — which is the "old school" strip in the
      report, and the one control in the whole config sidebar that did not
      look like the rest of it.

      ColorField is what every other colour in this product opens: the
      builder's saturation box, hue slider, hex field and the page's own
      colours, in the flow, under its own row. It carries its own label, so
      the call sites below do not add one for a colour.
    */
    return (
      <ColorField
        label={field.label}
        value={typeof raw === "string" ? raw : ""}
        fallback={typeof field.default === "string" ? field.default : "#000000"}
        onChange={onChange}
      />
    )
  }

  if (kind === "select") {
    return (
      <div className="relative">
        <select
          className="w-full h-8 px-2.5 pr-8 text-[13px] border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 appearance-none cursor-pointer transition-colors"
          value={typeof raw === "string" ? raw : String(field.default ?? "")}
          onChange={e => onChange(e.target.value)}
        >
          {field.options?.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      </div>
    )
  }

  if (kind === "toggle" || kind === "checkbox") {
    const checked = typeof raw === "boolean" ? raw : !!field.default
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={cn(switchTrack(checked), "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#111113]/30 focus-visible:ring-offset-2")}
        onClick={() => onChange(!checked)}
      >
        <span className={switchKnob(checked)} />
      </button>
    )
  }

  if (kind === "range") {
    const num = typeof raw === "number" ? raw : Number(field.default ?? 0)
    return (
      <SliderNumberControl
        value={num}
        onChange={onChange}
        min={field.min ?? 0}
        max={field.max ?? 100}
        step={field.step ?? 1}
        unit={field.unit ?? ""}
      />
    )
  }

  if (kind === "number") {
    return (
      <input
        type="number"
        className="w-full h-8 px-2.5 text-[13px] border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 transition-colors"
        min={field.min}
        max={field.max}
        step={field.step ?? 1}
        value={typeof raw === "number" ? raw : Number(field.default ?? 0)}
        onChange={e => onChange(Number(e.target.value))}
      />
    )
  }

  if (kind === "image_picker") {
    return (
      <WbImagePicker
        value={typeof raw === "string" ? raw : undefined}
        onChange={url => onChange(url ?? "")}
        aspectRatio="video"
        folder="sections"
        layout="row"
      />
    )
  }

  if (kind === "header") {
    return (
      <div className="pt-3 pb-1 border-t border-border mt-2">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">{field.label}</span>
        {field.info && <p className="text-[11px] text-muted-foreground mt-0.5">{field.info}</p>}
      </div>
    )
  }

  if (kind === "paragraph") {
    return (
      <p className="text-xs text-muted-foreground leading-relaxed">{field.info ?? field.label}</p>
    )
  }

  if (kind === "font_picker") {
    return (
      <select
        className="w-full h-8 px-2.5 text-[13px] border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 appearance-none cursor-pointer transition-colors"
        value={typeof raw === "string" ? raw : String(field.default ?? "")}
        onChange={e => onChange(e.target.value)}
        style={{ fontFamily: typeof raw === "string" ? raw : String(field.default ?? "") }}
      >
        {(field.options ?? [
          { label: "Inter", value: "Inter" },
          { label: "Poppins", value: "Poppins" },
          { label: "Playfair Display", value: "Playfair Display" },
          { label: "Merriweather", value: "Merriweather" },
          { label: "Raleway", value: "Raleway" },
          { label: "Montserrat", value: "Montserrat" },
          { label: "Lora", value: "Lora" },
          { label: "DM Sans", value: "DM Sans" },
          { label: "Space Grotesk", value: "Space Grotesk" },
        ]).map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    )
  }

  if (kind === "divider") {
    return <hr className="border-0 border-t border-border my-1" />
  }

  if (kind === "color_scheme") {
    const schemes = themeColorSchemes({})
    const keys = Object.keys(schemes)
    return (
      <div className="relative">
        <select
          className={cn("w-full h-8 px-2.5 text-[13px] border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-300", "appearance-none pr-8")}
          value={typeof raw === "string" && keys.includes(raw) ? raw : keys[0]}
          onChange={e => onChange(e.target.value)}
        >
          {keys.map(k => <option key={k} value={k}>{schemes[k].name}</option>)}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      </div>
    )
  }

  if (kind === "alignment") {
    const current = typeof raw === "string" ? raw : "left"
    return (
      <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-muted/60">
        {(["left", "center", "right"] as const).map(a => (
          <button
            key={a}
            type="button"
            className={cn("h-7 rounded-md text-xs font-medium capitalize transition-colors", current === a ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
            onClick={() => onChange(a)}
          >
            {a}
          </button>
        ))}
      </div>
    )
  }

  if (kind === "image_gallery") {
    const list = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : []
    /* The registry's ceiling for a gallery (lib/storelib-theme/controls/registry.ts), or the setting's own `max` under it. */
    const cap = Math.min(typeof field.max === "number" && field.max > 0 ? field.max : 60, 60)
    return (
      <div className="space-y-2">
        {list.map((url, i) => (
          <WbImagePicker
            key={`${i}-${url}`}
            value={url}
            onChange={next => onChange(next ? list.map((u, j) => (j === i ? next : u)) : list.filter((_, j) => j !== i))}
            aspectRatio="video"
            folder="sections"
            layout="row"
          />
        ))}
        {/* The add field takes several at once: ticked in Your files, or chosen or dropped together, up to the setting's `max`. */}
        <WbImagePicker
          value={undefined}
          onChange={next => { if (next) onChange([...list, next].slice(0, cap)) }}
          onAddMany={urls => onChange([...list, ...urls].slice(0, cap))}
          max={Math.max(0, cap - list.length)}
          aspectRatio="video"
          folder="sections"
          layout="row"
        />
      </div>
    )
  }

  /* A product is chosen in ProductPickerControl (controls/product-list-control.tsx), registered above. */
  if (kind === "page_picker") {
    const want = "page"
    const options = targets.filter(t => t.kind === want)
    /* An imported theme saves a page by its handle ("about"): it is the page at /pages/about. */
    const saved = typeof raw === "string" ? raw : ""
    const current = saved && !saved.startsWith("/") && options.some(t => t.href === `/pages/${saved}`) ? `/pages/${saved}` : saved
    return (
      <div className="relative">
        <select
          className={cn("w-full h-8 px-2.5 text-[13px] border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-300", "appearance-none pr-8")}
          value={current}
          onChange={e => onChange(e.target.value)}
        >
          <option value="">{options.length ? `Choose a ${want}` : `No ${want}s yet`}</option>
          {options.map(t => <option key={t.href} value={t.href}>{t.label}</option>)}
          {current && !options.some(t => t.href === current) && <option value={current}>{current}</option>}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      </div>
    )
  }

  if (kind === "radio") {
    const current = typeof raw === "string" ? raw : String(field.default ?? "")
    const opts = field.options ?? []
    // Fallback to a select when there are too many options for a segmented control
    if (opts.length > 3) {
      return (
        <div className="relative">
          <select
            className="w-full h-8 px-2.5 pr-8 text-[13px] border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 appearance-none cursor-pointer transition-colors"
            value={current}
            onChange={e => onChange(e.target.value)}
          >
            {opts.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        </div>
      )
    }
    return (
      <div className="flex gap-1 p-1 bg-neutral-100 rounded-lg">
        {opts.map(opt => {
          const isSelected = current === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                "flex-1 py-1 px-2.5 text-[12.5px] font-medium rounded-md border text-center transition-[background-color,color,border-color,box-shadow,scale] duration-200 ease-out active:scale-[0.97] active:duration-75",
                isSelected
                  ? "bg-white text-foreground border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_0_0_0.5px_rgba(0,0,0,0.04)]"
                  : "bg-transparent text-neutral-500 border-transparent hover:text-foreground hover:bg-white/40"
              )}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    )
  }

  // Fallback
  return (
    <input
      type="text"
      className="w-full h-8 px-2.5 text-[13px] border border-border rounded-md bg-background"
      value={String(raw ?? "")}
      onChange={e => onChange(e.target.value)}
    />
  )
}

// ── Section icon map ─────────────────────────────────────────
/*
 * The per-section icon map lived here and is gone with the icons themselves.
 *
 * Forty-nine section types were mapped onto a couple of dozen lucide glyphs,
 * so the same picture stood for several different sections and none of them
 * was the thing it named. An icon that does not identify anything is
 * decoration in the one place a list has to be scannable — people read the
 * name.
 */


// ── Section Preview — renders the real section scaled down ───
/**
 * Long enough that a drag or a burst of typing settles into one write, short
 * enough that closing the tab a second later has already saved.
 */
const AUTOSAVE_DELAY_MS = 1_500

/**
 * How long the screen that says you are leaving is on the glass before the
 * page goes. It reads three lines in turn, and a screen nobody can read is
 * a flash of grey with a word in it; this is the time those three lines
 * were written for. The ceiling that stops a slow route hanging starts
 * after this, so nothing waits twice.
 */
/* LEAVING_SEEN_MS moved to lib/website-builder/navigate-ceiling, beside the
   ceiling it starts, because the creator page editor leaves too. */

/**
 * ===========================================================================
 *  THE THREE DEVICES
 * ===========================================================================
 * These widths are what the preview card is actually set to, and — since every
 * section became a container query (components/website-builder/sections/
 * SectionRenderer.tsx) — they are also the widths the sections THEMSELVES
 * measure. Pressing the phone button used to change the size of the card and
 * nothing inside it, because a `md:` class asks about the browser window.
 *
 * Real hardware, not round numbers: 390 is an iPhone 14/15, 834 an iPad in
 * portrait. A tablet is where a two-column layout usually decides whether it
 * survives, which is exactly why guessing at it from desktop and phone alone
 * did not work.
 *
 * Desktop has no fixed width on purpose. It is however wide the canvas is, so
 * what you see is a real width rather than a made-up one — and it grows when
 * you close the AI panel or the sidebar.
 */
/**
 * TWO, NOT THREE. Tablet was a third preview whose width nobody designs to:
 * a layout that works at 390 and at 1280 works at 834, and a breakpoint that
 * only exists in a preview is a breakpoint nobody tests against. It was a
 * choice the builder asked for and did nothing with.
 */
export type DeviceMode = "desktop" | "mobile"

/**
 * 390px — iPhone 14/15/16 and the Pro, the single most common width in the
 * wild, and narrow enough that anything which survives it survives an older
 * 375px phone too. The preview is worth nothing if it is not a real phone's
 * width.
 */
/** Full screen preview, remembered for the tab's session (see `fullScreen` in the editor). */
const FULL_SCREEN_KEY = "wb:full-screen"
/** How long the sidebar takes to fold away or come back. */
const FULL_SCREEN_MS = 320

const DEVICE_WIDTH: Record<Exclude<DeviceMode, "desktop">, number> = {
  mobile: 390,
}

/** A thumbnail draws the theme's own file, never a creator's edit of it. */
const EMPTY_SOURCES: Record<string, string> = {}

/*
  THE SECTION LIBRARY moved to components/website-builder/editor/
  section-library.tsx: its previews, its cards, and the sheet and the dialog
  it opens in. It is imported above as SectionLibrary.
*/

// ── Professional Image Picker ────────────────────────────────
/*
  WbImagePicker moved to components/website-builder/editor/image-picker.tsx.
  It is imported above. The move is so scripts/check-image-picker.mjs mounts
  the same component the editor renders rather than a copy of it.
*/

// ── Branding Tab Panel — logo/favicon/tagline with header sync ──
/** The branding group's fields BrandingTabPanel draws itself; the rest of the group is drawn as usual. */
const BRANDING_PANEL_FIELDS = new Set(["brand_name", "logo_url", "logo_width", "favicon_url", "tagline"])
function BrandingTabPanel({
  settingsDraft,
  updateSetting,
}: {
  settingsDraft: ThemeSettingsValues
  updateSetting: (key: string, value: unknown) => void
}) {
  const hasLogo = typeof settingsDraft.logo_url === "string" && settingsDraft.logo_url
  const hasMobileLogo = typeof settingsDraft.mobile_logo_url === "string" && !!settingsDraft.mobile_logo_url
  const useMobileLogo = !!settingsDraft.use_mobile_logo
  return (
    <div className="space-y-5">
      {/* Store name */}
      <div>
        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5 block">Store name</label>
        <input
          type="text"
          className="w-full h-8 px-2.5 text-[13px] border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 transition-colors"
          placeholder="My Store"
          value={typeof settingsDraft.brand_name === "string" ? settingsDraft.brand_name : ""}
          onChange={e => updateSetting("brand_name", e.target.value)}
        />
      </div>

      {/* Logo image — synced with header section */}
      <WbImagePicker
        label="LOGO IMAGE"
        value={typeof settingsDraft.logo_url === "string" ? settingsDraft.logo_url as string : undefined}
        onChange={url => updateSetting("logo_url", url ?? "")}
        aspectRatio="logo"
        folder="logos"
      />
      {hasLogo && (
        <WbSlider
          label="Logo height"
          value={settingsDraft.logo_width}
          onChange={v => updateSetting("logo_width", v)}
          min={24}
          max={120}
          step={2}
          unit="px"
          defaultValue={40}
        />
      )}

      {/* Mobile logo toggle */}
      <WbToggle
        label="Use different logo for mobile"
        value={useMobileLogo}
        onChange={v => updateSetting("use_mobile_logo", v)}
        info="Enable to show a smaller logo on phones."
      />
      {useMobileLogo && (
        <>
          <WbImagePicker
            label="MOBILE LOGO"
            value={typeof settingsDraft.mobile_logo_url === "string" ? settingsDraft.mobile_logo_url as string : undefined}
            onChange={url => updateSetting("mobile_logo_url", url ?? "")}
            aspectRatio="logo"
            folder="logos"
          />
          {hasMobileLogo && (
            <WbSlider
              label="Mobile logo height"
              value={settingsDraft.mobile_logo_width}
              onChange={v => updateSetting("mobile_logo_width", v)}
              min={20}
              max={80}
              step={2}
              unit="px"
              defaultValue={32}
            />
          )}
        </>
      )}

      {/* Favicon — compact clean preview */}
      <WbImagePicker
        label="FAVICON"
        value={typeof settingsDraft.favicon_url === "string" ? settingsDraft.favicon_url as string : undefined}
        onChange={url => updateSetting("favicon_url", url ?? "")}
        aspectRatio="favicon"
        folder="logos"
      />
      <p className="text-[11px] text-muted-foreground flex items-start gap-1.5 -mt-2">
        <Info className="h-3 w-3 shrink-0 mt-0.5" />
        The favicon is the tiny icon shown in browser tabs. Use a square image (ideally 64×64 or larger).
      </p>

      {/* Tagline */}
      <div>
        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5 block">Tagline</label>
        <input
          type="text"
          className="w-full h-8 px-2.5 text-[13px] border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 transition-colors"
          placeholder="Your trusted digital store"
          value={typeof settingsDraft.tagline === "string" ? settingsDraft.tagline : ""}
          onChange={e => updateSetting("tagline", e.target.value)}
        />
      </div>

      <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
        <Info className="h-3 w-3 shrink-0 mt-0.5" />
        Logo, mobile logo and heights are synced with the Header section. Changes here update the header everywhere.
      </p>
    </div>
  )
}

/*
  THE SECOND COLOUR PICKER IS GONE.

  `WbColorPicker` sat here with its own swatch row and a native
  `<input type="color">` behind a 40px chip. It had no call sites — nothing
  in the product rendered it — but it was the thing anyone grepping this
  file for a colour control would find first, and it hid a real one: the
  native input that hands the user to the operating system's colour panel.

  One colour control now, ColorField, reached through FieldEditor, the same
  picker the storefront dialogs open.
*/

// ── Professional Slider with value display ───────────────────
function WbSlider({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  unit = "px",
  defaultValue = 0,
}: {
  label: string
  value: unknown
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  unit?: string
  defaultValue?: number
}) {
  const num = typeof value === "number" ? value : defaultValue
  return (
    <div className="space-y-2">
      <p className="text-[13px] font-medium text-foreground">{label}</p>
      <SliderNumberControl
        value={num}
        onChange={onChange}
        min={min}
        max={max}
        step={step}
        unit={unit}
      />
    </div>
  )
}

// ── Professional Toggle Row ──────────────────────────────────
function WbToggle({
  label,
  value,
  onChange,
  info,
}: {
  label: string
  value: unknown
  onChange: (v: boolean) => void
  info?: string
}) {
  const checked = typeof value === "boolean" ? value : false
  return (
    <label className="flex items-center justify-between py-1.5 cursor-pointer select-none group">
      <div className="flex-1 min-w-0 pr-3">
        <p className="text-[13px] font-medium text-foreground transition-colors">{label}</p>
        {info && <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{info}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={cn(switchTrack(checked), "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#111113]/30 focus-visible:ring-offset-2")}
        onClick={e => { e.preventDefault(); onChange(!checked) }}
      >
        <span className={switchKnob(checked)} />
      </button>
    </label>
  )
}

// ── Professional Select dropdown ─────────────────────────────
function WbSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: unknown
  onChange: (v: string) => void
  options: { label: string; value: string }[]
}) {
  const selected = typeof value === "string" ? value : String(options[0]?.value ?? "")
  return (
    <div className="space-y-1.5">
      <p className="text-[13px] font-medium text-foreground">{label}</p>
      <div className="relative">
        <select
          className="w-full h-8 px-2.5 pr-8 text-[13px] border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 appearance-none cursor-pointer transition-colors"
          value={selected}
          onChange={e => onChange(e.target.value)}
        >
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      </div>
    </div>
  )
}

// ── Professional Radio Segment Control ───────────────────────
function WbRadioSegment({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: unknown
  onChange: (v: string) => void
  options: { label: string; value: string }[]
}) {
  const selected = typeof value === "string" ? value : String(options[0]?.value ?? "")
  // Fallback to a select when there are too many options for a segmented control
  if (options.length > 3) {
    return (
      <div className="space-y-1.5">
        <p className="text-[13px] font-medium text-foreground">{label}</p>
        <div className="relative">
          <select
            className="w-full h-8 px-2.5 pr-8 text-[13px] border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 appearance-none cursor-pointer transition-colors"
            value={selected}
            onChange={e => onChange(e.target.value)}
          >
            {options.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <p className="text-[13px] font-medium text-foreground">{label}</p>
      <div className="flex gap-1 p-1 bg-neutral-100 rounded-lg">
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex-1 py-1 px-2.5 text-[12.5px] font-medium rounded-md border text-center transition-[background-color,color,border-color,box-shadow,scale] duration-200 ease-out active:scale-[0.97] active:duration-75",
              selected === opt.value
                ? "bg-white text-foreground border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_0_0_0.5px_rgba(0,0,0,0.04)]"
                : "bg-transparent text-neutral-500 border-transparent hover:text-foreground hover:bg-white/40"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Mobile header layout preview thumbnails (shared) ────────
const MOBILE_LAYOUT_PREVIEW_NODE = (id: string): React.ReactNode => {
  const burger = (
    <div className="flex flex-col gap-[2px]">
      <div className="h-[2px] w-3 bg-gray-800 rounded-full" />
      <div className="h-[2px] w-3 bg-gray-800 rounded-full" />
      <div className="h-[2px] w-3 bg-gray-800 rounded-full" />
    </div>
  )
  const logo = <div className="h-3 w-8 bg-gray-800 rounded-sm" />
  const dot = <div className="h-2 w-2 bg-gray-800 rounded-full" />
  if (id === "logo_left_hamburger_right") {
    return (
      <div className="flex items-center justify-between w-full h-full px-4">
        {logo}
        <div className="flex items-center gap-2">{dot}{burger}</div>
      </div>
    )
  }
  if (id === "hamburger_left_logo_left") {
    return (
      <div className="flex items-center w-full h-full px-4 gap-2">
        {burger}
        {logo}
        <div className="flex-1" />
        {dot}
      </div>
    )
  }
  // logo_center_hamburger_left (default)
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center w-full h-full px-4">
      <div className="flex items-center justify-start">{burger}</div>
      <div className="flex items-center justify-center">{logo}</div>
      <div className="flex items-center justify-end">{dot}</div>
    </div>
  )
}

// ── Header Section Settings Panel ────────────────────────────
function HeaderSectionSettings({
  section,
  schema,
  onBack,
  onUpdateSetting,
  onPickMenu,
  theme,
  onEditScheme,
}: {
  section: SectionInstance
  schema: any
  onBack: () => void
  onUpdateSetting: (key: string, value: unknown) => void
  /** Which menu the header shows; picking the Main menu moves the header's links into it (main-menu.ts). */
  onPickMenu: (handle: string) => void
  theme: ThemeSettingsValues
  onEditScheme: (schemeKey?: string) => void
}) {
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const s = section.settings

  const tabs = [
    { id: "logo", label: "Store Logo" },
    { id: "nav", label: "Menu" },
    { id: "header", label: "Header Settings" },
  ]

  const [layoutPickerOpen, setLayoutPickerOpen] = useState(false)
  const [mobileLayoutPickerOpen, setMobileLayoutPickerOpen] = useState(false)

  // ── Sub-panel content ──────────────────────────────────────
  const renderSubPanel = (tabId: string) => {
    switch (tabId) {
      case "logo":
        return (
          <div className="space-y-5">
            {/* Logo image picker */}
            <WbImagePicker
              label="LOGO IMAGE"
              value={typeof s.logo_url === "string" ? s.logo_url : undefined}
              onChange={url => onUpdateSetting("logo_url", url ?? "")}
              aspectRatio="logo"
              folder="logos"
            />

            {/* Logo shows: lib/website-builder/header-settings.ts (logoParts). */}
            <WbSelect
              label="Logo shows"
              value={typeof s.logo_mode === "string" ? s.logo_mode : (typeof s.logo_url === "string" && s.logo_url ? "image" : "text")}
              onChange={v => onUpdateSetting("logo_mode", v)}
              options={[
                { label: "Image", value: "image" },
                { label: "Text", value: "text" },
                { label: "Image and text", value: "image_text" },
              ]}
            />
            {(s.logo_mode === "text" || s.logo_mode === "image_text" || !(typeof s.logo_url === "string" && s.logo_url)) && (
              <div className="space-y-1.5">
                <p className="text-[13px] font-medium text-foreground">Name</p>
                <input
                  type="text"
                  className="w-full h-8 px-2.5 text-[13px] border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 transition-colors"
                  placeholder={typeof theme.brand_name === "string" && theme.brand_name ? theme.brand_name : "My Store"}
                  value={typeof s.logo_text === "string" ? s.logo_text : ""}
                  onChange={e => onUpdateSetting("logo_text", e.target.value)}
                />
              </div>
            )}

            {/* Logo height slider */}
            {typeof s.logo_url === "string" && s.logo_url && (
              <WbSlider
                label="Logo height"
                value={s.logo_height}
                onChange={v => onUpdateSetting("logo_height", v)}
                min={24}
                max={120}
                step={2}
                unit="px"
                /* What the header draws when none is set (HeaderSection),
                   so the slider never shows one height while the logo is
                   another. It said 40 over a 64px logo. */
                defaultValue={64}
              />
            )}

            {/* Custom logo horizontal position — desktop (clean inline) */}
            <WbToggle
              label="Custom logo horizontal position"
              value={s.logo_horizontal_offset_enabled}
              onChange={v => onUpdateSetting("logo_horizontal_offset_enabled", v)}
              info="Nudge the logo left or right inside the header."
            />
            {!!s.logo_horizontal_offset_enabled && (
              <WbSlider
                label="Horizontal offset"
                value={s.logo_horizontal_offset_px}
                onChange={v => onUpdateSetting("logo_horizontal_offset_px", v)}
                min={-120}
                max={120}
                step={1}
                unit="px"
                defaultValue={0}
              />
            )}

            {/* Mobile logo — always visible picker (no toggle). If the user
                uploads an image here it's automatically used for mobile
                devices; if left empty the main LOGO IMAGE is reused. */}
            <WbImagePicker
              label="MOBILE LOGO IMAGE"
              value={typeof s.mobile_logo_url === "string" ? s.mobile_logo_url : undefined}
              onChange={url => {
                onUpdateSetting("mobile_logo_url", url ?? "")
                // Auto-flip the legacy flag so the renderer picks up the
                // new image without requiring an explicit toggle.
                onUpdateSetting("use_mobile_logo", !!url)
              }}
              aspectRatio="logo"
              folder="logos"
            />
            {/* The phone's own logo height, for whichever logo it is: see HeaderSection. */}
            {((typeof s.mobile_logo_url === "string" && s.mobile_logo_url) || (typeof s.logo_url === "string" && s.logo_url)) && (
              <WbSlider
                label="Logo height on phones"
                value={s.mobile_logo_height}
                onChange={v => onUpdateSetting("mobile_logo_height", v)}
                min={20}
                max={80}
                step={2}
                unit="px"
                defaultValue={typeof s.mobile_logo_url === "string" && s.mobile_logo_url ? 32 : Math.min(80, Math.max(20, Number(s.logo_height) || 64))}
              />
            )}

            {/* Custom logo horizontal position — mobile (clean inline) */}
            <WbToggle
              label="Custom mobile logo horizontal position"
              value={s.mobile_logo_horizontal_offset_enabled}
              onChange={v => onUpdateSetting("mobile_logo_horizontal_offset_enabled", v)}
              info="Nudge the mobile logo left or right inside the header."
            />
            {!!s.mobile_logo_horizontal_offset_enabled && (
              <WbSlider
                label="Mobile horizontal offset"
                value={s.mobile_logo_horizontal_offset_px}
                onChange={v => onUpdateSetting("mobile_logo_horizontal_offset_px", v)}
                min={-80}
                max={80}
                step={1}
                unit="px"
                defaultValue={0}
              />
            )}
          </div>
        )

      case "nav": {
        /* Shopify's header: it shows a menu, and the menu is edited in Menus (lib/website-builder/main-menu.ts). */
        return (
          <div className="space-y-1.5" data-header-menu="">
            <span className="block text-xs font-medium text-muted-foreground">Menu</span>
            <MenuPickerControl
              label="Menu"
              value={typeof s.menu === "string" ? s.menu : ""}
              noneLabel={null}
              onChange={v => onPickMenu(v)}
            />
          </div>
        )
      }

      case "header": {
        const currentLayout = (typeof s.header_layout === "string" ? s.header_layout : "logo_left_nav_right")
        const colorSchemes: { id: string; label: string; bg: string; text: string }[] = [
          { id: "white",     label: "White",     bg: "#ffffff", text: "#0f172a" },
          { id: "light",     label: "Light",     bg: "#f1f5f9", text: "#0f172a" },
          { id: "dark",      label: "Dark",      bg: "#1f2937", text: "#ffffff" },
          { id: "black",     label: "Black",     bg: "#000000", text: "#ffffff" },
          { id: "highlight", label: "Highlight", bg: "#6366f1", text: "#ffffff" },
        ]
        const layoutOptions: { id: string; label: string; preview: React.ReactNode }[] = [
          {
            id: "logo_left_nav_right",
            label: "Logo left · Nav + icons right",
            preview: (
              <div className="flex items-center justify-between w-full h-full px-3">
                <div className="h-3 w-10 bg-gray-700 rounded-sm" />
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-4 bg-gray-500 rounded-full" />
                  <div className="h-1.5 w-4 bg-gray-500 rounded-full" />
                  <div className="h-1.5 w-4 bg-gray-500 rounded-full" />
                  <div className="h-2 w-2 bg-gray-700 rounded-full ml-1" />
                </div>
              </div>
            ),
          },
          {
            id: "logo_left_nav_inline",
            label: "Logo left · Nav inline · Icons right",
            preview: (
              <div className="flex items-center w-full h-full px-3 gap-3">
                <div className="h-3 w-8 bg-gray-700 rounded-sm" />
                <div className="h-1.5 w-4 bg-gray-500 rounded-full" />
                <div className="h-1.5 w-4 bg-gray-500 rounded-full" />
                <div className="h-1.5 w-4 bg-gray-500 rounded-full" />
                <div className="flex-1" />
                <div className="h-2 w-2 bg-gray-700 rounded-full" />
              </div>
            ),
          },
          {
            id: "logo_left_nav_center",
            label: "Logo left · Nav centered · Icons right",
            preview: (
              <div className="flex items-center justify-between w-full h-full px-3">
                <div className="h-3 w-8 bg-gray-700 rounded-sm" />
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-4 bg-gray-500 rounded-full" />
                  <div className="h-1.5 w-4 bg-gray-500 rounded-full" />
                  <div className="h-1.5 w-4 bg-gray-500 rounded-full" />
                </div>
                <div className="h-2 w-2 bg-gray-700 rounded-full" />
              </div>
            ),
          },
          {
            id: "nav_left_logo_center",
            label: "Nav left · Logo centered · Icons right",
            preview: (
              <div className="flex items-center justify-between w-full h-full px-3">
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-4 bg-gray-500 rounded-full" />
                  <div className="h-1.5 w-4 bg-gray-500 rounded-full" />
                </div>
                <div className="h-3 w-8 bg-gray-700 rounded-sm" />
                <div className="h-2 w-2 bg-gray-700 rounded-full" />
              </div>
            ),
          },
          {
            id: "logo_center_nav_below",
            label: "Logo centered · Nav below",
            preview: (
              <div className="flex flex-col items-center justify-center gap-1 w-full h-full px-3">
                <div className="h-3 w-10 bg-gray-700 rounded-sm" />
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-4 bg-gray-500 rounded-full" />
                  <div className="h-1.5 w-4 bg-gray-500 rounded-full" />
                  <div className="h-1.5 w-4 bg-gray-500 rounded-full" />
                </div>
              </div>
            ),
          },
        ]
        const currentLayoutMeta = layoutOptions.find(l => l.id === currentLayout) ?? layoutOptions[0]

        const currentMobileLayout = (typeof s.mobile_header_layout === "string" ? s.mobile_header_layout : "logo_center_hamburger_left")
        const currentMobileLayoutLabel =
          currentMobileLayout === "hamburger_left_logo_left" ? "Hamburger left · Logo left"
          : "Logo centered · Hamburger left"
        const mobilePreviewSummary = MOBILE_LAYOUT_PREVIEW_NODE(currentMobileLayout)
        const showCta = s.show_cta_button !== false
        // Border & shadow — preserve legacy `show_border` default (true) so a
        // pre-existing store that never saved `show_bottom_border` keeps
        // showing its border after the upgrade.
        const bottomBorderEnabled = typeof s.show_bottom_border === "boolean"
          ? s.show_bottom_border
          : (typeof s.show_border === "boolean" ? s.show_border : true)
        const borderStyleValue = typeof s.border_style === "string" ? s.border_style : "solid"
        const borderVisibilityValue = typeof s.border_visibility === "string" ? s.border_visibility : "all"
        const depthShadowEnabled = s.header_depth_shadow !== false
        /* The placeholder and the behaviour describe the search icon, so
           they are not offered while it is off. */
        const showSearchIcon = headerIconOn(s.show_search_icon, s.show_search)
        return (
          <div className="space-y-6">
            {/* ── 1. Header layout (desktop) ── */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Header layout (desktop)</p>
              <button
                type="button"
                onClick={() => setLayoutPickerOpen(true)}
                className="w-full group border border-border rounded-xl bg-background hover:border-foreground/30 transition-colors overflow-hidden"
              >
                <div className="h-14 bg-muted/30 border-b border-border">
                  {currentLayoutMeta.preview}
                </div>
                <div className="flex items-center justify-between px-3 py-2.5 text-left">
                  <span className="text-xs font-medium text-foreground">{currentLayoutMeta.label}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </button>
              {/* Links in the row, or a menu button and a drawer: lib/website-builder/header-settings.ts. */}
              <WbSelect
                label="Menu on larger screens"
                value={typeof s.desktop_menu === "string" ? s.desktop_menu : "inline"}
                onChange={v => onUpdateSetting("desktop_menu", v)}
                options={[
                  { label: "Links in the header", value: "inline" },
                  { label: "Menu button, drawer from the left", value: "drawer_left" },
                  { label: "Menu button, drawer from the right", value: "drawer_right" },
                  { label: "Menu button, drops down from the top", value: "drawer_top" },
                ]}
              />
            </div>

            {/* ── 2. Header layout (mobile) ── */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Header layout (mobile)</p>
              <button
                type="button"
                onClick={() => setMobileLayoutPickerOpen(true)}
                className="w-full group border border-border rounded-xl bg-background hover:border-foreground/30 transition-colors overflow-hidden"
              >
                <div className="h-14 bg-muted/30 border-b border-border">
                  {mobilePreviewSummary}
                </div>
                <div className="flex items-center justify-between px-3 py-2.5 text-left">
                  <span className="text-xs font-medium text-foreground">{currentMobileLayoutLabel}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </button>
              {/* Where the phone's menu comes from: lib/website-builder/header-settings.ts. */}
              <WbSelect
                label="Menu on phones"
                value={typeof s.mobile_menu_style === "string" ? s.mobile_menu_style : "left"}
                onChange={v => onUpdateSetting("mobile_menu_style", v)}
                options={[
                  { label: "Slides in from the left", value: "left" },
                  { label: "Slides in from the right", value: "right" },
                  { label: "Drops down from the top", value: "top" },
                  { label: "Covers the screen", value: "full" },
                ]}
              />
            </div>

            <div className="h-px bg-border" />

            {/* ── 3. Colors ──
                Moved above Width & spacing so the section that "sets the
                tone" of the header (scheme + hover style) sits right next to
                the layout pickers — matches the visual priority ordering the
                user asked for in the sidebar. */}
            <div className="space-y-3">
              <SectionDesignPanel
                compact
                section={section}
                schema={{ ...(schema ?? {}), supports_typography_overrides: false }}
                theme={theme}
                onUpdateSetting={onUpdateSetting}
                onEditScheme={onEditScheme}
              />
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-foreground block">Menu link hover style</label>
                <div className="relative">
                  <select
                    className="w-full h-8 px-2.5 pr-8 text-[13px] border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 appearance-none cursor-pointer transition-colors"
                    value={typeof s.menu_link_hover_style === "string" ? s.menu_link_hover_style : "inherit"}
                    onChange={e => onUpdateSetting("menu_link_hover_style", e.target.value)}
                  >
                    <option value="inherit">Inherit (theme default)</option>
                    <option value="none">None</option>
                    <option value="underline">Underline</option>
                    <option value="underline_reverse">Underline (reverse)</option>
                    <option value="fade_siblings">Fade siblings</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Controls how desktop menu links react when hovered.
                </p>
              </div>
            </div>

            <div className="h-px bg-border" />

            {/* ── 4. Width & spacing ── */}
            <div className="space-y-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Width &amp; spacing</p>
              {/* Header width — controls the maximum width of the header
                  content on desktop / large screens. Narrow/Medium/Wide map
                  to 960/1140/1280px caps; Full is edge-to-edge. */}
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-foreground block">Header width</label>
                <div className="relative">
                  <select
                    className="w-full h-8 px-2.5 pr-8 text-[13px] border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 appearance-none cursor-pointer transition-colors"
                    value={typeof s.header_width === "string" ? s.header_width : "wide"}
                    onChange={e => onUpdateSetting("header_width", e.target.value)}
                  >
                    <option value="narrow">Narrow (960px)</option>
                    <option value="medium">Medium (1140px)</option>
                    <option value="wide">Wide (1280px)</option>
                    <option value="full">Full width</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Controls the maximum width of the header on desktop (large) screens.
                </p>
              </div>
              {/*
                PIXELS, ONE NUMBER PER DEVICE. These were `vw`, which is a
                different amount on every screen and, inside the editor, is
                measured against the browser rather than the canvas — so the
                slider was never what the phone preview showed, and the phone
                preview was never what the phone showed. See
                lib/website-builder/header-spacing.ts.
              */}
              <WbSlider
                label="Vertical padding, desktop"
                value={headerPad(s.vertical_padding, s.vertical_padding_vw, "desktop")}
                onChange={v => onUpdateSetting("vertical_padding", {
                  desktop: v,
                  tablet: headerPad(s.vertical_padding, s.vertical_padding_vw, "tablet"),
                  mobile: headerPad(s.vertical_padding, s.vertical_padding_vw, "mobile"),
                })}
                min={0}
                max={64}
                step={1}
                unit="px"
                defaultValue={16}
              />
              <WbSlider
                label="Vertical padding, phone"
                value={headerPad(s.vertical_padding, s.vertical_padding_vw, "mobile")}
                onChange={v => onUpdateSetting("vertical_padding", {
                  desktop: headerPad(s.vertical_padding, s.vertical_padding_vw, "desktop"),
                  tablet: headerPad(s.vertical_padding, s.vertical_padding_vw, "tablet"),
                  mobile: v,
                })}
                min={0}
                max={64}
                step={1}
                unit="px"
                defaultValue={12}
              />
              <WbSlider
                label="Space between menu links"
                value={headerGap(s.link_spacing, s.link_spacing_vw)}
                onChange={v => onUpdateSetting("link_spacing", v)}
                min={4}
                max={64}
                step={1}
                unit="px"
                defaultValue={18}
              />
            </div>

            <div className="h-px bg-border" />

            {/* ── 4. Sticky behaviour ── */}
            <div className="space-y-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Sticky behaviour</p>
              <WbToggle
                label="Enable sticky header"
                value={!!s.header_sticky_enabled && !s.header_sticky_on_scroll_up}
                onChange={v => {
                  if (v) {
                    onUpdateSetting("header_sticky_enabled", true)
                    onUpdateSetting("header_sticky_on_scroll_up", false)
                  } else {
                    onUpdateSetting("header_sticky_enabled", false)
                  }
                }}
                info="Keep the header pinned to the top as the visitor scrolls."
              />
              <WbToggle
                label="Sticky header on scroll up"
                value={!!s.header_sticky_on_scroll_up}
                onChange={v => {
                  if (v) {
                    onUpdateSetting("header_sticky_enabled", true)
                    onUpdateSetting("header_sticky_on_scroll_up", true)
                  } else {
                    onUpdateSetting("header_sticky_on_scroll_up", false)
                  }
                }}
                info="Only reveal the header when scrolling up. Hides on scroll down."
              />
              <WbToggle
                label="Make header transparent"
                value={s.header_transparent}
                onChange={v => onUpdateSetting("header_transparent", v)}
              />
              {!!s.header_transparent && (
                <WbSelect
                  label="Transparent on"
                  value={typeof s.header_transparent_scope === "string" ? s.header_transparent_scope : "all"}
                  onChange={v => onUpdateSetting("header_transparent_scope", v)}
                  options={[
                    { label: "Every page", value: "all" },
                    { label: "The home page only", value: "home" },
                  ]}
                />
              )}
            </div>

            <div className="h-px bg-border" />

            {/* ── 5. Border & shadow ──
                Three controls for the bottom edge of the header:
                  • toggle: is a bottom border drawn at all?
                  • radio:  solid (uses inset_border) vs subtle (50% alpha)
                  • select: where does it show (all / home only / inner only / none)
                Plus a separate toggle for the smooth depth shadow under the
                header (default ON — matches the "lifted off the page" feel). */}
            <div className="space-y-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Border &amp; shadow</p>
              <WbToggle
                label="Show bottom border"
                value={bottomBorderEnabled}
                onChange={v => onUpdateSetting("show_bottom_border", v)}
                info="Shows a 1px line at the bottom of the header to visually separate it from the page content."
              />
              {bottomBorderEnabled && (
                <>
                  <WbRadioSegment
                    label="Border style"
                    value={borderStyleValue}
                    onChange={v => onUpdateSetting("border_style", v)}
                    options={[
                      { label: "Solid",  value: "solid" },
                      { label: "Subtle", value: "subtle" },
                    ]}
                  />
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-medium text-foreground block">Show border on</label>
                    <div className="relative">
                      <select
                        className="w-full h-8 px-2.5 pr-8 text-[13px] border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 appearance-none cursor-pointer transition-colors"
                        value={borderVisibilityValue}
                        onChange={e => onUpdateSetting("border_visibility", e.target.value)}
                      >
                        <option value="all">All pages</option>
                        <option value="home_only">Homepage only</option>
                        <option value="inner_only">Inner pages only</option>
                        <option value="none">None</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                </>
              )}
              <WbToggle
                label="Subtle depth shadow"
                value={depthShadowEnabled}
                onChange={v => onUpdateSetting("header_depth_shadow", v)}
                info="Adds a soft shadow underneath the header so it feels gently lifted off the page."
              />
            </div>

            <div className="h-px bg-border" />

            {/* ── 7. Header elements ── */}
            <div className="space-y-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Header elements</p>
              {/*
                ═══════════════════════════════════════════════════════════
                 THESE WROTE KEYS THE HEADER DOES NOT READ
                ═══════════════════════════════════════════════════════════
                Search wrote `show_search` and the cart wrote `show_cart`;
                the header reads `show_search_icon` and `show_cart_icon`,
                which is what the section's schema declares. So turning
                either off changed a setting nothing looks at, and the icon
                stayed in the header. Two of the four toggles in this group
                did nothing at all.

                And all four SHOWED the wrong state. `value={s.show_x}` is
                undefined on a header that has never been touched, which a
                toggle draws as off, while the icon it describes was on:
                every one of them started by contradicting the header beside
                it. The default is on, so that is what they read now.

                `headerIconOn` keeps the old key as the fallback, so a
                creator who turned search off under the name that used to be
                written finds it still off rather than back.
              */}
              {/* The two below belong to the icon, so they go when it does. */}
              <WbToggle
                label="Show search icon"
                value={headerIconOn(s.show_search_icon, s.show_search)}
                onChange={v => onUpdateSetting("show_search_icon", v)}
                info="On a phone it sits in the header beside the cart, and as a row in the menu."
              />
              {showSearchIcon && (
                <>
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium text-foreground">When search is clicked</p>
                    <div className="relative">
                      <select
                        className="w-full h-8 pl-2.5 pr-8 text-[13px] border border-border rounded-md bg-background appearance-none focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 transition-colors"
                        value={typeof s.search_behaviour === "string" ? s.search_behaviour : "header"}
                        onChange={e => onUpdateSetting("search_behaviour", e.target.value)}
                      >
                        <option value="header">Open it in the header</option>
                        <option value="modal">Open a search window</option>
                        <option value="page">Go to the search page</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium text-foreground">Search placeholder</p>
                    <input
                      type="text"
                      className="w-full h-8 px-2.5 text-[13px] border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 transition-colors"
                      placeholder="Search"
                      value={typeof s.search_placeholder === "string" ? s.search_placeholder : ""}
                      onChange={e => onUpdateSetting("search_placeholder", e.target.value)}
                    />
                  </div>
                </>
              )}
              <WbToggle
                label="Show account icon"
                value={headerIconOn(s.show_account_icon)}
                onChange={v => onUpdateSetting("show_account_icon", v)}
                info="Desktop header icon, and Account and Create account in the menu on mobile."
              />
              <WbToggle
                label="Show wishlist icon"
                value={headerIconOn(s.show_wishlist_icon)}
                onChange={v => onUpdateSetting("show_wishlist_icon", v)}
                info="Desktop header only. Also appears in the mobile sidebar footer."
              />
              <WbToggle
                label="Show cart icon"
                value={headerIconOn(s.show_cart_icon, s.show_cart)}
                onChange={v => onUpdateSetting("show_cart_icon", v)}
                info="The bag and its drawer, on a phone as well as a desktop."
              />
            </div>

            <div className="h-px bg-border" />

            {/* ── 8. Call to action button (consolidated from former Button tab) ──
                Toggle gates the button visibility on the live header. The URL
                picker is the same component used by nav links, so users get
                the same Pages/Products/Categories dropdown experience. */}
            <div className="space-y-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Call to action button</p>
              <WbToggle
                label="Show call to action button"
                value={s.show_cta_button !== false}
                onChange={v => onUpdateSetting("show_cta_button", v)}
              />
              {showCta && (
                <>
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium text-foreground">Button text</p>
                    <input
                      type="text"
                      className="w-full h-8 px-2.5 text-[13px] border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 transition-colors"
                      placeholder="Shop Now"
                      value={typeof s.cta_text === "string" ? s.cta_text : ""}
                      onChange={e => onUpdateSetting("cta_text", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium text-foreground">Button URL</p>
                    <LinkFieldEditor
                      value={typeof s.cta_url === "string" ? s.cta_url : ""}
                      onChange={val => onUpdateSetting("cta_url", val)}
                    />
                  </div>
                  {/*
                    THE BUTTON'S COLOURS, HERE, WHERE THE BUTTON IS. This said
                    the colours were "inherited from your theme's global button
                    settings", which was not true, and the only place they could
                    be changed was two unlabelled dots under Advanced colors.
                    These are the same colours, the header's own overrides of
                    its scheme, written through the same setOverride.
                  */}
                  <div className="rounded-lg border border-border px-3 pt-2.5 pb-1">
                    <ButtonColorGroup
                      group={BUTTON_COLOR_GROUPS[0]}
                      settings={s}
                      theme={theme}
                      onApply={(next) => {
                        for (const key of new Set([...Object.keys(s), ...Object.keys(next)])) {
                          if (JSON.stringify(s[key]) !== JSON.stringify(next[key])) onUpdateSetting(key, next[key])
                        }
                      }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Shape and corners are set in Theme settings, Buttons.
                  </p>
                </>
              )}
            </div>

          </div>
        )
      }

      default:
        return null
    }
  }

  // ── Mobile layout picker sub-panel ─────────────────────────
  if (mobileLayoutPickerOpen) {
    const mobileLayoutOptions: { id: string; label: string }[] = [
      { id: "logo_center_hamburger_left", label: "Logo centered · Hamburger left" },
      { id: "hamburger_left_logo_left",   label: "Hamburger left · Logo left" },
    ]
    const currentMobileLayout = (typeof s.mobile_header_layout === "string" ? s.mobile_header_layout : "logo_center_hamburger_left")
    return (
      <div className="flex flex-col h-full">
        <PanelBack onBack={() => setMobileLayoutPickerOpen(false)}>
          <span className="text-[15px] font-semibold md:text-sm">Choose mobile header layout</span>
        </PanelBack>
        <div className="flex-1 overflow-y-auto wb-slim-scroll px-5 py-4 space-y-3">
          {mobileLayoutOptions.map(opt => {
            const active = currentMobileLayout === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  onUpdateSetting("mobile_header_layout", opt.id)
                  setMobileLayoutPickerOpen(false)
                }}
                className={cn(
                  "w-full text-left border rounded-xl overflow-hidden bg-white transition-all",
                  active ? "border-neutral-900 ring-1 ring-neutral-900" : "border-border hover:border-neutral-300",
                )}
              >
                <div className="h-20 bg-gray-50 border-b border-border flex items-center">
                  {MOBILE_LAYOUT_PREVIEW_NODE(opt.id)}
                </div>
                <div className="px-3 py-2.5 flex items-center justify-between">
                  <span className="text-xs font-medium">{opt.label}</span>
                  {active && (
                    <span className="text-[10px] font-semibold text-[#7c3aed] uppercase tracking-wider">Selected</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Layout picker sub-panel (inline, not modal) ────────────
  if (layoutPickerOpen) {
    // Re-use the same layoutOptions the "header" tab builds. We build
    // a minimal local set so this branch is independent — keeps the
    // rendering stable even if the "header" case wasn't mounted yet.
    const layoutOptions: { id: string; label: string }[] = [
      { id: "logo_left_nav_right",   label: "Logo left · Nav + icons right" },
      { id: "logo_left_nav_inline",  label: "Logo left · Nav inline · Icons right" },
      { id: "logo_left_nav_center",  label: "Logo left · Nav centered · Icons right" },
      { id: "nav_left_logo_center",  label: "Nav left · Logo centered · Icons right" },
      /* The header has always drawn this one; the picker never offered it. */
      { id: "logo_center_nav_below", label: "Logo centered · Nav below" },
    ]
    const currentLayout = (typeof s.header_layout === "string" ? s.header_layout : "logo_left_nav_right")
    const renderPreview = (id: string) => {
      switch (id) {
        case "logo_left_nav_right":
          return (
            <div className="flex items-center justify-between w-full h-full px-4">
              <div className="h-3 w-12 bg-gray-800 rounded-sm" />
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-5 bg-gray-500 rounded-full" />
                <div className="h-1.5 w-5 bg-gray-500 rounded-full" />
                <div className="h-1.5 w-5 bg-gray-500 rounded-full" />
                <div className="h-2 w-2 bg-gray-800 rounded-full ml-1.5" />
                <div className="h-2 w-2 bg-gray-800 rounded-full" />
              </div>
            </div>
          )
        case "logo_left_nav_inline":
          return (
            <div className="flex items-center w-full h-full px-4 gap-3">
              <div className="h-3 w-10 bg-gray-800 rounded-sm" />
              <div className="h-1.5 w-5 bg-gray-500 rounded-full" />
              <div className="h-1.5 w-5 bg-gray-500 rounded-full" />
              <div className="h-1.5 w-5 bg-gray-500 rounded-full" />
              <div className="flex-1" />
              <div className="h-2 w-2 bg-gray-800 rounded-full" />
              <div className="h-2 w-2 bg-gray-800 rounded-full" />
            </div>
          )
        case "logo_left_nav_center":
          return (
            <div className="flex items-center justify-between w-full h-full px-4">
              <div className="h-3 w-10 bg-gray-800 rounded-sm" />
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-5 bg-gray-500 rounded-full" />
                <div className="h-1.5 w-5 bg-gray-500 rounded-full" />
                <div className="h-1.5 w-5 bg-gray-500 rounded-full" />
              </div>
              <div className="h-2 w-2 bg-gray-800 rounded-full" />
            </div>
          )
        case "nav_left_logo_center":
          return (
            <div className="flex items-center justify-between w-full h-full px-4">
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-5 bg-gray-500 rounded-full" />
                <div className="h-1.5 w-5 bg-gray-500 rounded-full" />
              </div>
              <div className="h-3 w-10 bg-gray-800 rounded-sm" />
              <div className="h-2 w-2 bg-gray-800 rounded-full" />
            </div>
          )
        case "logo_center_nav_below":
          return (
            <div className="flex flex-col items-center justify-center gap-1.5 w-full h-full px-4">
              <div className="h-3 w-12 bg-gray-800 rounded-sm" />
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-5 bg-gray-500 rounded-full" />
                <div className="h-1.5 w-5 bg-gray-500 rounded-full" />
                <div className="h-1.5 w-5 bg-gray-500 rounded-full" />
              </div>
            </div>
          )
      }
      return null
    }

    return (
      <div className="flex flex-col h-full">
        <PanelBack onBack={() => setLayoutPickerOpen(false)}>
          <span className="text-[15px] font-semibold md:text-sm">Choose header layout</span>
        </PanelBack>
        <div className="flex-1 overflow-y-auto wb-slim-scroll px-5 py-4 space-y-3">
          {layoutOptions.map(opt => {
            const active = currentLayout === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  onUpdateSetting("header_layout", opt.id)
                  setLayoutPickerOpen(false)
                }}
                className={cn(
                  "w-full text-left border rounded-xl overflow-hidden bg-white transition-all",
                  active ? "border-neutral-900 ring-1 ring-neutral-900" : "border-border hover:border-neutral-300",
                )}
              >
                <div className="h-20 bg-gray-50 border-b border-border flex items-center">
                  {renderPreview(opt.id)}
                </div>
                <div className="px-3 py-2.5 flex items-center justify-between">
                  <span className="text-xs font-medium">{opt.label}</span>
                  {active && (
                    <span className="text-[10px] font-semibold text-[#7c3aed] uppercase tracking-wider">Selected</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Sub-panel view ─────────────────────────────────────────
  if (activeTab) {
    const tab = tabs.find(t => t.id === activeTab)
    if (!tab) return null

    return (
      <div
        key={`sub-${activeTab}`}
        className="flex flex-col h-full"
      >
        <PanelBack onBack={() => setActiveTab(null)}>
          <span className="text-[15px] font-semibold md:text-sm">{tab.label}</span>
        </PanelBack>
        <div className="flex-1 overflow-y-auto wb-slim-scroll px-5 py-4">
          {renderSubPanel(activeTab)}
        </div>
      </div>
    )
  }

  // ── Main tab list ──────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      <PanelBack onBack={onBack}>
        <span className="text-[15px] font-semibold md:text-sm">Header Settings</span>
      </PanelBack>

      <div className="flex-1 overflow-y-auto wb-slim-scroll">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className="w-full flex items-center justify-between px-5 py-4 border-b border-border text-left hover:bg-muted/30 transition-colors"
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="text-sm font-medium">{tab.label}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Types ────────────────────────────────────────────────────
type Panel = EditorPanel

// ── Main editor ──────────────────────────────────────────────
/**
 * ===========================================================================
 *  WHAT A BLOCK IS WHEN IT ARRIVES, AND WHETHER THERE IS ROOM FOR IT
 * ===========================================================================
 * Two limits, and they mean different things. `max_blocks` is how many blocks
 * a section will hold at all; `limit` on a block type is how many of THAT
 * kind it will hold. A slideshow that takes eight slides and one caption
 * needs both. Neither was enforced: the schema declared them, the sidebar hid
 * the Add button on one of them, and nothing checked either when a block was
 * actually added, so a section could be pushed past what its own template was
 * written for.
 */
function blockDefaults(def: BlockSchema | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of def?.fields ?? []) if (f.default !== undefined) out[f.id] = f.default
  return out
}

/**
 * Room under one owner (the section, or a block that holds blocks) for one
 * more block of a type, `size` blocks counting what is inside it. Four
 * rules: the owner's `max_blocks`, the type's `limit` there, the section's
 * total at every depth, and how deep blocks may nest.
 */
function blockRoom(
  owner: { name: string; max_blocks?: number } | undefined,
  siblings: readonly BlockInstance[],
  def: BlockSchema | undefined,
  blockType: string,
  section: { blocks?: BlockInstance[] },
  room: { depth: number; size: number; height: number },
): { ok: true } | { ok: false; reason: string } {
  const placed = siblings.filter((b) => !b.static)
  const max = owner?.max_blocks
  if (max && placed.length >= max) {
    return { ok: false, reason: `${owner!.name} holds ${max} block${max === 1 ? "" : "s"}.` }
  }
  const limit = def?.limit
  if (limit && placed.filter((b) => b.type === blockType).length >= limit) {
    return { ok: false, reason: `${owner?.name ?? "This section"} holds ${limit} ${def?.name ?? blockType}${limit === 1 ? "" : "s"}.` }
  }
  if (countAll(section.blocks) + room.size > LIMITS.blocksPerSection) {
    return { ok: false, reason: `A section holds ${LIMITS.blocksPerSection} blocks.` }
  }
  if (room.depth + room.height - 1 > MAX_BLOCK_DEPTH) {
    return { ok: false, reason: `Blocks nest ${MAX_BLOCK_DEPTH} deep at most.` }
  }
  return { ok: true }
}

/**
 * ===========================================================================
 *  ONE LEVEL OF A SECTION'S BLOCKS, AND EVERY LEVEL INSIDE IT
 * ===========================================================================
 * The section's blocks are one list; a block that holds blocks (a Group)
 * draws its own list inside its open row, with this same component, so the
 * sidebar is the tree the page is. Static blocks (placed by the template)
 * come first and cannot be moved or deleted; every other row drags, copies
 * and deletes at its own level. Add block under each list offers what that
 * level accepts: the section's own block types, or the theme blocks named
 * in `accepts`, each preset as its own entry.
 */
interface BlockOps {
  update: (key: string, field: string, value: unknown, staticType?: string) => void
  add: (choice: BlockChoice, parentKey: string | null) => void
  duplicate: (key: string) => void
  remove: (key: string) => void
  reorder: (next: BlockInstance[], parentKey: string | null) => void
  toggleHidden: (key: string, staticType?: string) => void
  /** Into another level: under `parentKey` (null for the section's own), at `index` or last. */
  moveTo: (key: string, parentKey: string | null, index?: number) => void
}

/** A word or two after a block's name: what it says, so twelve rows that are all "Heading" can be told apart. */
function blockDetail(settings: Record<string, unknown>): string | undefined {
  for (const id of ["author", "heading", "title", "question", "label", "text", "caption"]) {
    const v = settings[id]
    if (typeof v !== "string") continue
    const plain = v.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
    if (plain) return plain.length > 40 ? `${plain.slice(0, 39)}…` : plain
  }
  return undefined
}

/**
 * ===========================================================================
 *  A SECTION'S BLOCKS, AS ROWS OF THE SIDEBAR'S TREE
 * ===========================================================================
 * One level of the tree under a section (or under a block that holds
 * blocks), and every level inside it: the rows, and the Add block line at
 * the end of each level. Opening a block is selecting it: the sidebar then
 * shows that block's own settings panel (BlockSettings below). The rules
 * for what may be added where are the ones the panel's list used, through
 * the same `ops`.
 */
function BlockTreeFor({
  section,
  schema,
  catalog,
  parent,
  siblings,
  owner,
  statics,
  selectedKey,
  onSelect,
  canHide,
  ops,
  outer,
}: {
  section: SectionInstance
  schema: SectionSchema
  catalog: Record<string, BlockSchema>
  parent: string[]
  siblings: BlockInstance[]
  owner: { blocks?: BlockSchema[]; accepts?: string[]; max_blocks?: number }
  /** The level this one's parent sits in, so a block can be dragged out to it. Absent at the section's own level. */
  outer?: { owner: { blocks?: BlockSchema[]; accepts?: string[]; max_blocks?: number }; siblings: BlockInstance[] }
  statics: { type: string; id: string }[]
  selectedKey: string | null
  onSelect: (key: string) => void
  canHide: boolean
  ops: Pick<BlockOps, "add" | "reorder" | "toggleHidden" | "remove" | "moveTo">
}) {
  const parentKey = parent.length ? pathKey(parent) : null
  const defOf = (type: string) => (parent.length === 0 ? blockSchemaIn(schema, catalog, type) : catalog[type])
  const keyOf = (b: BlockInstance) => pathKey([...parent, b.id])
  const dynamic = siblings.filter((b) => !b.static)
  const fixed: BlockInstance[] = statics.map((st) => siblings.find((b) => b.static && b.id === st.id) ?? { id: st.id, type: st.type, settings: blockDefaults(catalog[st.type]), static: true })
  const stored = (b: BlockInstance) => siblings.some((x) => x.id === b.id)
  const options = addableBlocks(parent.length === 0 ? owner : { accepts: owner.accepts }, catalog)
  const full = !!owner.max_blocks && dynamic.length >= owner.max_blocks
  const holds = (b: BlockInstance) => {
    const def = defOf(b.type)
    return !!(def?.accepts?.length || def?.statics?.length) && stored(b)
  }
  /** Whether a level (by its owner and where it is) takes a block of this type, with room for it. */
  const levelTakes = (levelOwner: { blocks?: BlockSchema[]; accepts?: string[]; max_blocks?: number } | undefined, atRoot: boolean, held: BlockInstance[], b: BlockInstance, levelDepth: number) => {
    if (!levelOwner) return false
    const kinds = addableBlocks(atRoot ? levelOwner : { accepts: levelOwner.accepts }, catalog)
    if (!kinds.some((k) => k.type === b.type)) return false
    if (levelOwner.max_blocks && held.filter((x) => !x.static).length >= levelOwner.max_blocks) return false
    return levelDepth + depthOf([b]) <= MAX_BLOCK_DEPTH
  }
  /* Right: into the block above, when it holds blocks and takes this one. Left: out to the level outside, just after its parent. */
  const canNest = (i: number, dir: 1 | -1) => {
    const b = dynamic[i]
    if (!b) return false
    if (dir === 1) {
      const above = dynamic[i - 1]
      if (!above || !holds(above)) return false
      const def = defOf(above.type)
      return levelTakes(def ? { accepts: def.accepts, max_blocks: def.max_blocks } : undefined, false, above.blocks ?? [], b, parent.length + 1)
    }
    /* Out of a product's Details block to under the product: not offered (lib/website-builder/product-details-rule.ts). */
    if (parent.length === 1 && staysInDetails(section.type, section.blocks, outer?.siblings.find((x) => x.id === parent[0])?.type, schema.statics ?? [])) return false
    return parent.length > 0 && levelTakes(outer?.owner, parent.length === 1, outer?.siblings ?? [], b, parent.length - 1)
  }
  const onNest = (i: number, dir: 1 | -1) => {
    const b = dynamic[i]
    if (!b) return
    if (dir === 1) {
      const above = dynamic[i - 1]
      if (above) ops.moveTo(keyOf(b), keyOf(above))
      return
    }
    const outerKey = parent.length > 1 ? pathKey(parent.slice(0, -1)) : null
    const at = (outer?.siblings ?? []).findIndex((x) => x.id === parent[parent.length - 1])
    ops.moveTo(keyOf(b), outerKey, at < 0 ? undefined : at + 1)
  }
  return (
    <BlockTreeLevel<BlockInstance>
      blocks={dynamic}
      fixed={fixed}
      depth={parent.length + 1}
      canNest={canNest}
      onNest={onNest}
      rowKey={keyOf}
      title={(block) => ({ name: defOf(block.type)?.name ?? block.type, detail: blockDetail(block.settings) })}
      selectedKey={selectedKey}
      onSelect={onSelect}
      onReorder={(next) => ops.reorder(next, parentKey)}
      onToggleHidden={canHide ? (key, b) => ops.toggleHidden(key, b.static && !stored(b) ? b.type : undefined) : undefined}
      onRemove={(key) => ops.remove(key)}
      hasChildren={holds}
      children={(block) => {
        const def = defOf(block.type)
        if (!def) return null
        return (
          <BlockTreeFor
            section={section}
            schema={schema}
            catalog={catalog}
            parent={[...parent, block.id]}
            siblings={block.blocks ?? []}
            owner={{ accepts: def.accepts, max_blocks: def.max_blocks }}
            statics={def.statics ?? []}
            selectedKey={selectedKey}
            onSelect={onSelect}
            canHide={canHide}
            ops={ops}
            outer={{ owner, siblings }}
          />
        )
      }}
      add={
        !full && parent.length < MAX_BLOCK_DEPTH ? (
          <TreeAddBlock options={options} depth={parent.length + 1} onAdd={(choice) => ops.add(choice, parentKey)} />
        ) : null
      }
    />
  )
}

/**
 * The block a sidebar selection names, found level by level: a stored
 * block, or a static one the template places that nobody has edited yet,
 * drawn from its defaults (`virtual`, created the first time it changes).
 */
function resolveBlock(
  section: SectionInstance,
  schema: SectionSchema,
  catalog: Record<string, BlockSchema>,
  key: string,
): { block: BlockInstance; def: BlockSchema | undefined; virtual: string | undefined; stored: boolean } | null {
  const path = parsePath(key)
  if (!path.length) return null
  let siblings: BlockInstance[] = section.blocks ?? []
  let statics: { type: string; id: string }[] = schema.statics ?? []
  for (let i = 0; i < path.length; i++) {
    const id = path[i]
    let block = siblings.find((b) => b.id === id)
    let virtual = false
    if (!block) {
      const st = statics.find((x) => x.id === id)
      if (!st) return null
      block = { id, type: st.type, settings: blockDefaults(catalog[st.type]), static: true }
      virtual = true
    }
    const def = i === 0 ? blockSchemaIn(schema, catalog, block.type) : catalog[block.type]
    if (i === path.length - 1) return { block, def, virtual: virtual ? block.type : undefined, stored: !virtual }
    if (virtual) return null
    siblings = block.blocks ?? []
    statics = def?.statics ?? []
  }
  return null
}

/** One block's own settings, as its panel shows them. */
function BlockFields({
  section,
  schema,
  block,
  def,
  blockKey,
  virtual,
  theme,
  onUpdate,
}: {
  section: SectionInstance
  schema: SectionSchema
  block: BlockInstance
  def: BlockSchema | undefined
  blockKey: string
  virtual: string | undefined
  theme: ThemeSettingsValues
  onUpdate: (key: string, field: string, value: unknown, staticType?: string) => void
}) {
  const fields = visibleFields(def?.fields ?? [], block.settings, { fields: schema.fields ?? [], saved: section.settings })
  if (fields.length === 0) {
    return <p className="text-[12.5px] leading-5 text-muted-foreground">This block has no settings of its own.</p>
  }
  return (
    <SiblingSettingsProvider settings={block.settings}>
      {fields.map((field) => (
        <div key={field.id} data-block-field={field.id}>
          {field.type === "color" ? (
            <SectionColorSetting
              field={field}
              value={block.settings[field.id]}
              settings={section.settings}
              theme={theme}
              onChange={(val) => onUpdate(blockKey, field.id, val, virtual)}
            />
          ) : (
            <FieldEditor
              label={fieldCarriesOwnLabel(field) ? undefined : field.label}
              field={field}
              value={block.settings[field.id]}
              onChange={(val) => onUpdate(blockKey, field.id, val, virtual)}
            />
          )}
          {field.type !== "header" && field.type !== "paragraph" && field.info && (
            <p className="text-[11px] text-muted-foreground mt-1">{field.info}</p>
          )}
        </div>
      ))}
    </SiblingSettingsProvider>
  )
}

/**
 * Unique for the life of the page, and unique against a block copied from
 * another section: two blocks with one id are two rows the canvas, the
 * sidebar and every remove and reorder cannot tell apart.
 */
let blockSeq = 0
function newBlockId(): string {
  blockSeq += 1
  return `block-${Date.now().toString(36)}-${blockSeq}-${Math.random().toString(36).slice(2, 7)}`
}

/** How long the inspector's rings take to fade, either way. globals.css fades `.wb-ring` over the same. */
const INSPECT_FADE_MS = 200
/** The longest the editor's loader waits for an imported theme's first page to paint. */
const COMPAT_PAINT_CAP_MS = 8000
/** The longest one request for the website or a page's sections is waited for before it counts as failed. */
const SECTIONS_WAIT_MS = 20_000
/** How long Publish may take before the editor says so instead of spinning: the server writes it all in one step and moves the bookkeeping after its answer. */
const PUBLISH_MS = 45_000
/** The longest the canvas is held for a product opened from the address. */
const CANVAS_HOLD_CAP_MS = 6000
/** The longest the sections panel keeps the page being left's list while an imported theme's canvas draws the next page. */
const LIST_HOLD_MS = 3000
/** How long a page's sections, once read, open the page without asking again (handlePageChange). Only this editor, an agent or a push changes them, and the last two forget them. */
const PAGE_AHEAD_MS = 10 * 60_000
/** The same for a page the server builds from home and the settings (the shop, search, account pages): those follow a change to either. */
const GENERATED_AHEAD_MS = 15_000
/** How many of the site's other pages are read once the editor is idle, in the order the page list shows them. */
const READ_AHEAD_PAGES = 6

/*
  OUT OF THE FIRST PAINT. The AI conversation is drawn only once it has been
  opened, and Website settings only while it is open, so neither has to arrive
  before the editor can be used: each is its own chunk, fetched while the
  browser is idle after the editor is up (warmPanels), so the first open is
  not a wait. Together they are over 100 KB of the editor's code.
*/
const loadThemeChat = () => import("@/components/website-builder/theme-chat")
const loadProjectSettings = () => import("@/components/website-builder/project-settings")
/* An imported Shopify theme's canvas: only such a site needs it, and its code is asked for with the theme's files (warmCompat). */
const loadCompatCanvas = () => import("@/components/website-builder/compat/compat-canvas")
/* Until its code is in: the outline the canvas itself starts with, never a white page (canvas-problem.tsx). */
const CompatCanvas = dynamic(() => loadCompatCanvas().then((m) => m.CompatCanvas), { ssr: false, loading: () => <CompatCanvasWaiting /> })
function warmCompat(installId: string) {
  void loadCompatFiles(installId)
  void loadCompatCanvas().catch(() => {})
}
const ThemeChat = dynamic(() => loadThemeChat().then((m) => m.ThemeChat), { ssr: false })
const ProjectSettings = dynamic(() => loadProjectSettings().then((m) => m.ProjectSettings), { ssr: false })
function warmPanels(): () => void {
  const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
  const warm = () => {
    void loadThemeChat().catch(() => {})
    void loadProjectSettings().catch(() => {})
  }
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(warm, { timeout: 4000 })
    return () => w.cancelIdleCallback?.(id)
  }
  const t = window.setTimeout(warm, 1500)
  return () => window.clearTimeout(t)
}

export default function StoreEditorPage({ params }: { params: Promise<{ installId: string }> }) {
  useEffect(() => warmPanels(), [])
  const { installId } = use(params)
  const router = useRouter()

  const [install, setInstall] = useState<ThemeInstall | null>(null)
  const [sections, setSections] = useState<SectionInstance[]>([])
  const [settingsDraft, setSettingsDraft] = useState<ThemeSettingsValues>({})
  /**
   * THE MENUS ARE THE STORE'S (lib/website-builder/store-menus-server.ts).
   * `available` once the store keeps menus of its own; `synced` is the menus
   * as last saved there, so only a real change is sent.
   */
  const storeMenusRef = useRef<{ available: boolean; synced: string }>({ available: false, synced: "" })
  const [currentPage, setCurrentPage] = useState<PageKey>(() => {
    if (typeof window !== "undefined") {
      return parsePreviewFromSearch(window.location.search).page as PageKey
    }
    return "home"
  })
  const [selectedPanel, setSelectedPanel] = useState<Panel>({ type: "pages" })
  /**
   * WHICH BLOCK IS BEING EDITED. A section with twelve FAQ entries is twelve
   * near-identical rows in the sidebar and twelve near-identical rows on the
   * canvas, and until now nothing connected the two: clicking the third
   * question on the page selected the section, and finding that question
   * again in the sidebar meant counting. Clicking a block on the canvas now
   * selects the block, and the sidebar brings it into view and rings it.
   */
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  /**
   * WHICH SECTIONS ARE OPEN IN THE TREE, showing their blocks under them.
   * The one being edited is opened for you (the effect below), the way
   * Shopify's tree follows a selection; anything else stays as the person
   * left it.
   */
  const [treeOpen, setTreeOpen] = useState<ReadonlySet<string>>(() => new Set())
  /** The field a click on the canvas asked for: the sidebar scrolls to it and rings it. `n` makes a second click on the same thing count. */
  const [fieldFocus, setFieldFocus] = useState<{ sectionId: string; block: string | null; setting: string; n: number } | null>(null)
  const fieldFocusSeq = useRef(0)
  const [device, setDevice] = useState<DeviceMode>("desktop")
  // Inspector mode — when ON, hovering/clicking a section shows the blue
  // selection rectangle and opens its settings panel. When OFF the canvas
  // behaves like a plain preview (no outlines, no section-click interception).
  // Defaults to ON so first-time users see the editing affordances.
  const [inspectorEnabled, setInspectorEnabled] = useState<boolean>(true)
  /**
   * What the canvas draws, which trails the switch by one fade. The switch
   * (`inspectorEnabled`) answers at once: the button, the haptic, whether a
   * tap selects. The canvas's rings and toolbar fade out first and are taken
   * away after (`toggleInspector`), and on the way back they are put in and
   * fade up, so neither direction is a pop.
   */
  const [canvasInspecting, setCanvasInspecting] = useState<boolean>(true)
  const [loading, setLoading] = useState(true)
  /* The editor's first load ended without the website (a request that failed or never answered): said over the canvas, with Try again. */
  const [loadFailed, setLoadFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  /** Set the instant Exit is pressed. Going back can take a second or more
   *  on a phone, and a button that does nothing for that second is a button
   *  somebody presses again. */
  const [leaving, setLeaving] = useState(false)

  /**
   * =========================================================================
   *  LEAVING, WHEN THERE IS SOMETHING TO LOSE
   * =========================================================================
   * `window.confirm` used to ask this, and the browser's dialog is the one
   * part of a product nobody can design: the OS's font, "storelib.com says",
   * and no way to name what is unsaved. It is asked properly now, and only
   * when there is an actual answer — a draft still saving, a code file with
   * edits, or a save in flight.
   */
  const [pendingExit, setPendingExit] = useState<string | null>(null)
  /** Where this page is on its way to, read by the watchdog that finishes the job. */
  const leavingHref = useRef<string | null>(null)
  /** The leave dialog was answered (Save or Discard), so the browser's own question is not asked as well. */
  const leaveAnswered = useRef(false)
  /** Reported by the code editor in its frame; see its postMessage. */
  const [codeDirty, setCodeDirty] = useState(false)
  /**
   * THE SECTIONS THIS PERSON SAVED IN THE CODE EDITOR, path to source. The
   * canvas renders a .storelib section from these before the bundled
   * default, and the sidebar draws that section's panel from the saved
   * schema. Loaded once, and again whenever the code editor's frame says a
   * file was saved, reverted, renamed or deleted — the compile cache is
   * keyed by source text, so a changed file compiles once and an unchanged
   * one is a hit.
   */
  const [storelibSources, setStorelibSources] = useState<Record<string, string>>({})
  /* The first read of them has answered (or failed): an imported theme's canvas draws from them, so it waits for this (CompatCanvas sourcesReady). */
  const [storelibSourcesRead, setStorelibSourcesRead] = useState(false)
  /** Raised when an imported theme's files changed elsewhere (a push to GitHub), so its canvas reads them again. */
  const [compatFilesVersion, setCompatFilesVersion] = useState(0)
  /**
   * Raised when an imported theme's Theme settings panel may have been made
   * again on the server: its settings_schema.json changed, or its values did
   * (a colour scheme added), by a push or by Storelib AI. The panel reads its
   * one file again (CompatThemeSettings panelVersion).
   */
  const [compatPanelVersion, setCompatPanelVersion] = useState(0)
  /** Also hands back what it loaded, for a caller that needs it this tick: see handleWriteDone. */
  const loadStorelibSources = useCallback(async (): Promise<Record<string, string> | null> => {
    try {
      const res = await fetch(`/api/website-builder/themes/${installId}/files?sources=1`)
      if (!res.ok) return null
      const d = (await res.json()) as { files?: Record<string, string> }
      const files = d.files ?? {}
      setStorelibSources(files)
      return files
    } catch {
      /* the bundled sources still render; the next save reloads */
      return null
    } finally {
      setStorelibSourcesRead(true)
    }
  }, [installId])
  useEffect(() => { void loadStorelibSources() }, [loadStorelibSources])
  /*
    AN IMPORTED THEME'S FILES, FROM THE FIRST FRAME, the second time. Which
    installs are imported is remembered in this browser (a convenience only:
    a wrong or missing answer just means the files are asked for when the
    install says so, in loadData), so reopening one asks for its files beside
    everything else instead of a round trip later.
  */
  useEffect(() => {
    try {
      if (window.localStorage.getItem(`wb-compat:${installId}`) === "1") warmCompat(installId)
    } catch {
      /* no storage: the files are asked for once the install is in */
    }
  }, [installId])

  /**
   * THE LIBRARY THIS INSTALL CAN ADD FROM: the theme's ten categories, plus
   * whatever this creator wrote themselves in the code editor. A section they
   * saved is a section like any other — it is in the sidebar, in Add Section
   * under "Created by you", and on the page — as soon as its file compiles
   * and declares a preset.
   */
  /* The creator's own communities, for a community_picker and the Community card (null while communities are off). */
  const [builderCommunities, setBuilderCommunities] = useState<BuilderCommunities | null>(null)
  /* The creator's collections, for a collection_picker, a collection_list and the collections page (null while physical commerce is off). */
  const [builderCollections, setBuilderCollections] = useState<BuilderCollections | null>(null)
  const customSchemas = useMemo(() => customSectionSchemas(storelibSources), [storelibSources])
  /** The theme's blocks (blocks/*.storelib), this install's own files over them: what Add block can offer. */
  const blockCatalog = useMemo(() => themeBlockCatalog(storelibSources, { builtIn: !isCompatSource(storelibSources["layout/theme.storelib"]) }), [storelibSources])
  const librarySchemas = useMemo(() => ({ ...SECTION_SCHEMAS, ...customSchemas }), [customSchemas])
  const ownSectionTypes = useMemo(() => customAddableSections(customSchemas), [customSchemas])
  /* The Community card is offered only while communities are on, and the collection sections only while
     collections are (physical commerce): off, they would draw nothing on the site. */
  /** Which types are a header or a footer: the built-in two, and any section file that is one (lib/storelib-theme/section-groups.ts). */
  const kindOfType = useMemo(() => kindLookup(storelibSources, SECTION_SCHEMAS as never), [storelibSources])
  /**
   * WHERE "ADD SECTION" WAS PRESSED: the Header group, the page, or the
   * Footer group. Each offers what may go there, the way Shopify's section
   * groups do: the Header group its announcement bars and headers, the page
   * everything that goes on a page (an announcement bar too, which is then
   * put in the Header group, above the header).
   */
  const [addGroup, setAddGroup] = useState<SectionGroup>("template")
  /* Every section this creator wrote, a header of their own included, is filed under Created in the library. */
  const libraryOwnTypes = useMemo(() => Object.keys(customSchemas), [customSchemas])
  /* An imported Shopify theme draws only its own sections: Storelib's would have nothing to draw them with there. */
  const compatInstall = useMemo(() => isCompatSource(storelibSources["layout/theme.storelib"]), [storelibSources])
  /**
   * AN IMPORTED THEME'S PAGES ARE ITS OWN. Known from the install's settings
   * (`compat`) as soon as they load, which is before the first page's
   * sections, and from its files once those are in: a page with no sections
   * is then a page the theme draws from its Liquid template (Shopify's
   * Skeleton, an older theme), never one to be given Storelib's header,
   * footer and product section.
   */
  const importedTheme = useRef(false)
  if (compatInstall) importedTheme.current = true
  const libraryAddable = useMemo(() => {
    const all = compatInstall ? ownSectionTypes : [
      ...ADDABLE_SECTIONS.filter((t) => (t !== "community_card" || builderCommunities !== null) && (!COLLECTION_SECTIONS.has(t) || builderCollections !== null)),
      ...ownSectionTypes,
    ]
    const groupsOf = (t: string) => sectionGroupsFor(librarySchemas[t] as never, { type: t, kind: kindOfType(t) })
    if (addGroup === "template") {
      return all.filter((t) => {
        const g = groupsOf(t)
        return g.includes("template") || (g.includes("header") && !kindOfType(t))
      })
    }
    /*
      The built-in header (or footer) first, offered whether or not one is
      drawn: picking it where one is drawn replaces it, after asking. Then the
      creator's own header files, which Add section never offers for a page
      (customAddableSections leaves them out), and what else fits the group.
    */
    /* The Overlay group: what floats over the page, and nothing that is a header or a footer. */
    if (addGroup === "overlay") {
      const floats = all.filter((t) => groupsOf(t).includes("overlay") && !kindOfType(t))
      /* Only what may float over the page: what its schema says (enabled_on custom.overlay), and a type already in the site's Overlay group. */
      const placed = sections.filter((sec) => sec.group === "overlay").map((sec) => sec.type).filter((t) => all.includes(t))
      return [...new Set([...floats, ...placed])]
    }
    const own = addGroup as "header" | "footer"
    const ownKinds = Object.keys(customSchemas).filter((t) => (customSchemas[t].presets?.length ?? 0) > 0 && kindOfType(t) === own).sort()
    const fits = all.filter((t) => groupsOf(t).includes(own))
    return [...new Set([...(compatInstall ? [] : [own]), ...ownKinds, ...fits])]
  }, [ownSectionTypes, builderCommunities, builderCollections, addGroup, librarySchemas, kindOfType, customSchemas, compatInstall, sections])
  /** Whether anything this site can add floats over the page: the Overlay group is shown when it does. */
  const overlayAddable = useMemo(() => {
    /* An imported theme always has the Overlay group: a phone tab bar, a popup or back to top can be added there. */
    if (compatInstall) return ownSectionTypes.length > 0
    const all = [...ADDABLE_SECTIONS, ...ownSectionTypes]
    return all.some((t) => sectionGroupsFor(librarySchemas[t] as never, { type: t, kind: kindOfType(t) }).includes("overlay"))
  }, [compatInstall, ownSectionTypes, librarySchemas, kindOfType])
  /** A header (or footer) chosen while another is drawn: it replaces that one once the creator says so. */
  const [pendingReplace, setPendingReplace] = useState<{ type: string; presetIndex: number; kind: SectionKind; current: string; next: string } | null>(null)
  /**
   * Set when the creator deletes the header or the footer, so the next save
   * takes it off every other page too. Without it, a page with no header is
   * a page whose header has not been synced yet, and is left alone.
   */
  const chromeRemoved = useRef<{ header?: boolean; footer?: boolean; overlay?: boolean }>({})
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      // Same-origin only: the frame is our own page and nothing else may
      // tell the builder what its unsaved state is.
      if (e.origin !== window.location.origin) return
      const data = e.data as { type?: string; dirty?: boolean; path?: string } | null
      if (data?.type === "storelib:code-dirty") setCodeDirty(Boolean(data.dirty))
      /* A file saved in the code editor is a draft: the site has something to publish, whichever page is open. */
      if (data?.type === "storelib:file-saved") {
        void loadStorelibSources()
        setUnpublished(true)
        /* An imported theme's own file (its settings_schema.json, a stylesheet): its canvas and Theme settings read them again. */
        if (typeof data.path === "string" && data.path.startsWith("shopify/")) {
          setCompatFilesVersion((n) => n + 1)
          setCompatPanelVersion((n) => n + 1)
        }
      }
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [loadStorelibSources])
  /** `document` exists only after the first client render, and the leaving
   *  screen is portalled into it. */
  const [portalReady, setPortalReady] = useState(false)
  useEffect(() => setPortalReady(true), [])
  const publishBtnRef = useRef<HTMLDivElement | null>(null)
  const [previewMode, setPreviewMode] = useState<PreviewMode>("preview")
  useEffect(() => {
    // `?view=code` / `?view=settings` — the website page's "Edit code" and
    // "Website settings" open the editor straight onto that pane. Preview
    // stays the default; the pane is switched once, on arrival.
    const url = new URL(window.location.href)
    const v = url.searchParams.get("view")
    if (v === "code" || v === "settings") setPreviewMode(v)
    /* The switch alone drew the Settings segment as selected over a canvas
       with no settings on it: the page itself has to be opened too. */
    if (v === "settings") setProjectSettingsOpen(true)
    /* Once, on arrival: left on the address, every reload (the one after a
       backup is restored among them) would open the pane again. */
    if (v !== null) {
      url.searchParams.delete("view")
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash)
    }
  }, [])
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false)
  /** Website settings opened on one subject (a tab on the website page, or
      GitHub sending a creator back), and what GitHub said. */
  const [settingsSection, setSettingsSection] = useState<SettingsSection | null>(null)
  const [githubReturned, setGithubReturned] = useState<string | null>(null)
  /**
   * STRAIGHT TO ONE PAGE OF WEBSITE SETTINGS. `?settings=<page>` is how the
   * tabs above the cover on /app/website-builder land on Domains, SEO and
   * the rest, and how /api/github/setup sends a creator back
   * (?settings=connections&github=<result>, which opens Advanced, where
   * Connections lives now). The words are taken off the address so a reload
   * does not open it again.
   */
  useEffect(() => {
    const url = new URL(window.location.href)
    const wanted = settingsSectionFrom(url.searchParams.get("settings"))
    if (!wanted) return
    setGithubReturned(url.searchParams.get("github"))
    setSettingsSection(wanted)
    setPreviewMode("settings")
    setProjectSettingsOpen(true)
    url.searchParams.delete("settings")
    url.searchParams.delete("github")
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  /** Which path Connections opens on: GitHub from the GitHub button, else the default. */
  const [connectVia, setConnectVia] = useState<ConnectVia | null>(null)
  const openGitHub = () => {
    openConnections()
    setConnectVia("github")
  }
  const openConnections = () => {
    setConnectVia(null)
    setSettingsSection("connections")
    setPreviewMode("settings")
    setProjectSettingsOpen(true)
    setMobileSidebarOpen(false)
    // The phone's sheet makes way; the computer's pill folds away by itself while settings show.
    if (isMobileView) setAiOpen(false)
  }

  /**
   * A backup after every task Storelib AI completes, labelled with what was
   * asked. It waits for the draft to be written first (autosave is debounced),
   * because a backup of the state BEFORE the change is not a backup of the
   * task. Fire and forget: a backup that fails must never interrupt editing.
   */
  const backupAfterTask = useCallback(
    (prompt: string) => {
      window.setTimeout(() => {
        void fetch(`/api/website-builder/themes/${installId}/backups`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: "ai", label: prompt }),
        }).catch(() => {})
      }, 2500)
    },
    [installId],
  )
  const [isDirty, setIsDirty] = useState(false)

  /**
   * THE DRAFT IS AHEAD OF WHAT IS LIVE.
   *
   * `isDirty` used to serve both questions — "is there anything unsaved" and
   * "is the live site behind" — and one flag could, right up until autosave.
   * With autosave writing drafts every couple of seconds, `isDirty` is false
   * almost always, and a button reading its value would have said "Saved" on a
   * published theme whose visitors were still seeing last week's page. Somebody
   * would believe they had published when they had not.
   *
   * So: `isDirty` means "not written to the draft yet" and is cleared by
   * autosave. This means "the draft has changes the public site has not seen"
   * and is cleared only by publishing.
   *
   * Seeded from the server's own answer — `has_draft` is `draft_sections IS NOT
   * NULL`, and publishing nulls it — so it survives a reload rather than
   * resetting to a comfortable false.
   */
  const [unpublished, setUnpublished] = useState(false)

  /**
   * ANYTHING TO PUBLISH, ANYWHERE, AND WHAT THE LAST GITHUB SYNC DID.
   * `has_draft` above is the open page's alone, so a push or an agent that
   * changed a section file, a snippet or the settings left Publish reading
   * "Published" with the change sitting in the draft. The server's answer
   * covers every page, the settings and every file (the same drafts Publish
   * promotes), and holds after a reload: components/website-builder/
   * github-sync-notice.tsx, lib/github-sync/editor-status.ts.
   */
  const { status: syncStatus, refresh: refreshSync } = useSyncStatus(installId)
  useEffect(() => {
    if (syncStatus.pending?.any) setUnpublished(true)
  }, [syncStatus.pending])
  /** GitHub rewrote what is open here while it had an edit not saved yet: nothing autosaves until one is picked. */
  const [syncConflict, setSyncConflict] = useState<SyncConflict | null>(null)
  const syncConflictRef = useRef<SyncConflict | null>(null)
  syncConflictRef.current = syncConflict
  /** Changes a connected agent (not GitHub) made in this visit, for "3 changes from Claude Code. Publish to make them live." */
  const [agentNote, setAgentNote] = useState<AgentNote | null>(null)
  /** An imported theme's own files changed underneath the canvas (a push or an agent): it reads them again. */

  /**
   * A PAGE SWITCH IS IN FLIGHT.
   *
   * `handlePageChange` sets `currentPage` to the new page and only then awaits
   * that page's sections, so for a few hundred milliseconds `currentPage` says
   * "about" while `sections` still holds home's. An autosave firing in that
   * window writes HOME'S SECTIONS UNDER THE ABOUT PAGE KEY — real corruption,
   * and one that autosave created: before it, nothing wrote on a timer.
   *
   * A ref rather than state: it is read inside a timeout that must see the
   * value as of when it FIRES, not as of the render that scheduled it.
   */
  const switchingPage = useRef(false)
  const [expandedSettings, setExpandedSettings] = useState<string | null>(null)
  const [editSchemeKey, setEditSchemeKey] = useState<string | null>(null)
  const [addSectionOpen, setAddSectionOpen] = useState(false)
  /** A section just added, and where the page's sections were before it: see addSection. */
  const arrivalRef = useRef<{ id: string; before: Map<string, number>; bottomInset?: number } | null>(null)
  /** Changed to send the phone's sections sheet back to its middle stop: see riseOnAdded. */
  const [sheetRestKey, setSheetRestKey] = useState(0)
  /** The sheet panel a section just added opens in, which arrives without its slide: see panelMove. */
  const quietPanel = useRef<string | null>(null)
  // Absolute index in `sections` where a new section should be inserted.
  // Set when the user clicks an "insert between" divider in the sidebar.
  // null = append before the footer (default).
  const [pendingInsertIndex, setPendingInsertIndex] = useState<number | null>(null)
  /** A gap in the CANVAS, counted in body sections rather than in the list. */
  const [canvasInsertAt, setCanvasInsertAt] = useState<number | null>(null)
  /**
   * ASK STORELIB IS SHOWING. On a phone, its sheet is open; closed until
   * asked for. On a computer, its pill is on the canvas; there by default,
   * unless it was closed with its X (see ASK_DOCK_CLOSED_KEY).
   */
  const [aiOpen, setAiOpen] = useState(false)
  /**
   * Bumped to ask the computer's dock to open its conversation and put the
   * cursor in it: the Ask AI button on a section, or an answer to read.
   */
  const [aiAsk, setAiAsk] = useState(0)
  /**
   * A SECTION ASK AI IS WRITING, and the spot on this page it will land in.
   * The canvas draws a placeholder there until the file compiles, then the
   * section itself. `placedId` is set the moment it is placed and the
   * placeholder stays until the canvas is drawing that section, so there is
   * no frame with neither. See lib/website-builder/ai-placement.ts.
   */
  const [aiWriting, setAiWriting] = useState<
    { anchor: WritingAnchor; prompt: string; page: PageKey; placedId?: string } | null
  >(null)
  const aiWritingRef = useRef(aiWriting)
  /** The section that has just arrived, for the one animation it gets. */
  const [arrivedId, setArrivedId] = useState<string | null>(null)
  /** A file to open the code editor onto, set when the assistant writes one. */
  const [codeFilePath, setCodeFilePath] = useState<string | null>(null)
  /**
   * Mounted on first open and kept: the phone's AI sheet used to unmount the
   * instant it closed, which is a sheet that vanishes rather than one that
   * goes down. Kept mounted, it animates out like every other sheet and the
   * conversation survives being closed.
   */
  const [aiMounted, setAiMounted] = useState(false)
  useEffect(() => {
    if (aiOpen) setAiMounted(true)
  }, [aiOpen])
  /**
   * A REQUEST TO THE AI IS NOT STOPPED BY CLOSING ITS PANEL. On a desktop the
   * panel was drawn only while open, so closing it unmounted the chat and the
   * request went with it, half done. It stays mounted once opened, like the
   * phone's sheet, and hidden when closed; the button says it is still at
   * work, and the changes land on the canvas as they come.
   */
  const [aiBusy, setAiBusy] = useState(false)

  /**
   * ONE OPERATION FROM THE AI, APPLIED TO THE STATE THE PANELS ALREADY EDIT.
   *
   * `applyOp` is the SAME function the server used to produce this operation —
   * see lib/website-builder/agent/operations.ts for why there is exactly one
   * of it. What lands here is therefore what the model was working against.
   *
   * Split by kind because the editor keeps sections and theme settings in two
   * pieces of state, and no operation reads across them: `update_theme`
   * touches only settings, everything else touches only sections. Passing the
   * half it does not read keeps the shared applier's signature honest without
   * needing a joint updater React does not offer.
   *
   * Ordinary setState, so the preview repaints, `isDirty` flips, and Save
   * behaves exactly as it does for a change made by hand.
   */
  /**
   * The undo helpers are defined further down, after the state they close
   * over. This is how the handlers above them reach one, and it is the same
   * shape as `sectionsRef` and `undoRef` below.
   */
  const pushUndoRef = useRef<() => void>(() => {})

  const applyAiOp = useCallback((op: ThemeOp) => {
    /**
     * MARKED DIRTY, LIKE EVERY OTHER EDIT.
     *
     * `isDirty` is a manual flag: every hand-edit handler in this file sets it,
     * and this one did not. So the AI changed the page, the preview updated,
     * and Save stayed greyed out reading "Saved" — the work could not be saved,
     * and leaving the tab gave no warning either. The whole AI edit was lost on
     * reload while looking, on screen, like it had worked.
     *
     * (The comment here used to claim isDirty flipped. It did not. A comment
     * asserting the property that is missing is worse than no comment.)
     */
    setIsDirty(true)
    /**
     * AND UNDOABLE, LIKE EVERY OTHER EDIT.
     *
     * Eleven hand-edit handlers push an undo step. This one did not, so the
     * one kind of change a person did not make by hand was the one kind they
     * could not take back: an AI edit that rewrote a section left Undo
     * pointing at whatever they had done before it, and pressing it threw
     * away their own work instead of the model's.
     *
     * Debounced, because a single instruction arrives as a run of operations
     * and thirty of them should not fill a thirty-step history.
     */
    pushUndoRef.current()

    if (op.kind === "update_theme") {
      setSettingsDraft(previous => applyOp({ sections: [], settings: previous }, op).settings as ThemeSettingsValues)
      return
    }

    /**
     * THE LOGO LIVES IN TWO PLACES and the hand-edit path keeps them together.
     *
     * `updateSectionSetting` mirrors the header's logo fields into the theme
     * settings, because the header section and the theme both hold one. An AI
     * edit that skipped the mirror would leave the two disagreeing — the header
     * showing a new logo and the theme still holding the old one, which
     * surfaces later as the logo reverting on another page.
     */
    if (op.kind === "update_section") {
      const target = sections.find(s => s.id === op.id)
      if (target?.type === "header") {
        const mirrored: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(op.settings)) {
          const themeKey = LOGO_SYNC_HEADER_TO_THEME[key]
          if (themeKey) mirrored[themeKey] = value
        }
        if (Object.keys(mirrored).length > 0) {
          setSettingsDraft(previous => ({ ...previous, ...mirrored }) as ThemeSettingsValues)
        }
      }
    }

    /**
     * A SECTION THE AI DELETES CANNOT STAY SELECTED.
     *
     * `removeSection` clears the selection when it deletes the open one, and
     * this did not — so the inspector was left pointing at a section that no
     * longer exists. It degrades to a blank panel rather than crashing, but a
     * blank settings panel beside a page that just changed reads as the editor
     * having broken.
     */
    if (op.kind === "remove_section") {
      // Read from the panel state directly: `selectedSectionId` is derived
      // further down the component and is not in scope here.
      setSelectedPanel(previous =>
        previous.type === "section" && previous.sectionId === op.id ? { type: "pages" } : previous,
      )
    }

    /**
     * WITH THE LOOKUP. Without it an `add_section` of a type the creator
     * wrote found no schema and did nothing, while the chat reported it
     * added: the assistant could see their sections and not place one.
     */
    setSections(previous => applyOp({ sections: previous, settings: {} }, op, librarySchemas).sections)
  }, [sections, librarySchemas])

  /**
   * =========================================================================
   *  THE SIDEBAR IS AS WIDE AS YOU LEFT IT
   * =========================================================================
   * Dragged from its right edge, clamped so it can neither vanish nor eat
   * the canvas, written straight to the element while the pointer moves
   * (a React render per pointer event is a sidebar that lags its handle)
   * and committed to state and storage on release.
   */
  const [sidebarWidth, setSidebarWidth] = useState(288)
  const sidebarRef = useRef<HTMLDivElement | null>(null)
  const sidebarFoldRef = useRef<HTMLDivElement | null>(null)
  const SIDEBAR_MIN = 240
  const SIDEBAR_MAX = 560
  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem("wb:sidebar-width"))
      if (Number.isFinite(saved) && saved >= SIDEBAR_MIN && saved <= SIDEBAR_MAX) setSidebarWidth(saved)
    } catch {
      /* storage blocked: the default is fine */
    }
  }, [])
  const startSidebarResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = sidebarRef.current?.getBoundingClientRect().width ?? sidebarWidth
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
    let latest = startW
    const onMove = (ev: PointerEvent) => {
      latest = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, startW + (ev.clientX - startX)))
      if (sidebarRef.current) sidebarRef.current.style.width = `${latest}px`
      /* The fold around it (full screen) is capped at the width, so it moves with it. */
      if (sidebarFoldRef.current) sidebarFoldRef.current.style.maxWidth = `${latest}px`
    }
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove)
      handle.removeEventListener("pointerup", onUp)
      handle.removeEventListener("pointercancel", onUp)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      setSidebarWidth(latest)
      try {
        window.localStorage.setItem("wb:sidebar-width", String(Math.round(latest)))
      } catch {
        /* storage blocked */
      }
    }
    handle.addEventListener("pointermove", onMove)
    handle.addEventListener("pointerup", onUp)
    handle.addEventListener("pointercancel", onUp)
  }
  const [isMobileView, setIsMobileView] = useState(false)
  /**
   * ===========================================================================
   *  FULL SCREEN: THE SITE AND NOTHING ELSE
   * ===========================================================================
   * The third way of looking at the page, beside desktop and phone: the
   * sidebar folds away, the section toolbar, the rings and Ask Storelib's pill
   * with it, and the site fills everything under the bar at desktop width.
   * The bar stays, so the switch that turned it on is where it was, and Escape
   * turns it off. Remembered for the tab's session, like the sidebar's width
   * is remembered. A computer's idea: on a phone the canvas already fills the
   * screen, so it is not offered there and a remembered one waits.
   *
   * The sidebar goes by its own width to nothing (and its opacity with it),
   * not by unmounting: the canvas grows into the room continuously instead of
   * jumping, and the panel underneath keeps its scroll and its open rows for
   * when it comes back. FULL_SCREEN_MS in the check (scripts/check-full-screen.mjs).
   */
  const [fullScreen, setFullScreenState] = useState(false)
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(FULL_SCREEN_KEY) === "1") setFullScreenState(true)
    } catch {
      /* no storage: it starts off, which is the ordinary editor */
    }
  }, [])
  const setFullScreen = useCallback((on: boolean) => {
    setFullScreenState(on)
    if (on) setDevice("desktop")
    try {
      if (on) window.sessionStorage.setItem(FULL_SCREEN_KEY, "1")
      else window.sessionStorage.removeItem(FULL_SCREEN_KEY)
    } catch {
      /* not remembered, still applied */
    }
  }, [])
  /** Full screen as it applies right now: a computer, looking at the preview. */
  const fullView = fullScreen && !isMobileView && previewMode === "preview"
  /*
    The button beside the size: the canvas only (the owner: "it should not make
    the whole browser full screen, only the editor canvas"). The sidebar folds
    away on its own width and opacity (FULL_SCREEN_MS), the canvas grows into
    the room, and again or Escape brings it back the same way.
  */
  const toggleCanvasFullScreen = useCallback((on: boolean) => {
    if (on) setPreviewMode("preview")
    setFullScreen(on)
  }, [setFullScreen])
  /**
   * THE SECTIONS FOLLOW ONE FOLD LATER. Turning the canvas's inspector off
   * redraws every section, and doing that in the frame the fold starts made
   * that frame long: the first step of the fold was a third of it at once
   * (scripts/check-full-screen.mjs, 105px of 294). So the rings and the
   * toolbar are hidden at once by the stylesheet (`data-wb-full`), and the
   * sections are told only after the fold has finished, either way.
   */
  const [fullSettled, setFullSettled] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => setFullSettled(fullView), FULL_SCREEN_MS + 40)
    return () => window.clearTimeout(id)
  }, [fullView])

  /* Escape leaves it, unless the key belongs to something open on top (a dialog, a menu) or to a field. */
  useEffect(() => {
    if (!fullView) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return
      const t = e.target as HTMLElement | null
      if (t?.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="alertdialog"], [role="menu"]')) return
      setFullScreen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [fullView, setFullScreen])
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [username, setUsername] = useState("")
  /* The creator's four public facts, for `{{ creator.name }}` on the canvas. See the install route. */
  const [creatorFacts, setCreatorFacts] = useState<CreatorFacts | null>(null)
  /** The website's own name on Storelib, when it has one apart from the username. */
  const [siteHandle, setSiteHandle] = useState<string | null>(null)
  const [hasPublished, setHasPublished] = useState(false)
  /* Leaving the editor: a save still waiting on its cover asks for it now
     rather than never. See lib/website-builder/cover-refresh.ts. */
  useEffect(() => () => flushCoverRefresh(), [])

  // ── New: Sidebar mode, page browser, product/collection pages ──
  const [sidebarMode, setSidebarMode] = useState<"sections" | "settings">("sections")
  const [pageBrowserOpen, setPageBrowserOpen] = useState(false)
  const [products, setProducts] = useState<{ id: string; title: string; slug: string; thumbnail_url: string; price_cents: number; compare_at_cents: number | null; description: string; whats_included: string[]; gallery_urls: string[]; faqs?: unknown }[]>([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [selectedProductPage, setSelectedProductPage] = useState<string | null>(null)
  /** The id of the product the product page is showing: an imported theme's canvas draws exactly this one, not the shop's first. */
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
  const [editAllProductPages, setEditAllProductPages] = useState(false)
  const [editAllConfirmOpen, setEditAllConfirmOpen] = useState(false)
  const [sectionsLoading, setSectionsLoading] = useState(false)
  /*
    ═══════════════════════════════════════════════════════════════════════
     THE SECTIONS PANEL CHANGES PAGE WHEN THE CANVAS DOES
    ═══════════════════════════════════════════════════════════════════════
    A page switch emptied the panel the moment it was asked for (grey bars
    while the next page's sections were fetched), then showed the next
    page's list while an imported theme's canvas was still drawing that page
    behind the one on screen: About's page beside Home's list for a second.
    The panel now keeps the list it has, untouchable, until the canvas has
    the next page in front (CompatCanvas onPageShown), and both change in
    the same frame. A Storelib theme's canvas draws the new sections in the
    same render, so for it this is only the fetch. Never longer than
    LIST_HOLD_MS, whatever the canvas says.
  */
  const [compatShownPage, setCompatShownPage] = useState<string | null>(null)
  const panelPage = `${currentPage}|${currentPage === "product" ? selectedProductId ?? "" : ""}`
  const panelHeldForCanvas = importedTheme.current && compatShownPage !== null && compatShownPage !== panelPage
  const panelHeld = sectionsLoading || panelHeldForCanvas
  const panelSections = useRef(sections)
  if (!panelHeld) panelSections.current = sections
  useEffect(() => {
    if (!panelHeldForCanvas) return
    const t = window.setTimeout(() => setCompatShownPage(panelPage), LIST_HOLD_MS)
    return () => window.clearTimeout(t)
  }, [panelHeldForCanvas, panelPage])
  /**
   * The address of a link that points at no page of this site, so the canvas
   * can say so instead of appearing to ignore the click. Cleared by any
   * successful page change, because arriving somewhere answers it.
   */
  const [missingPath, setMissingPath] = useState<string | null>(null)
  /** Counts page and product switches, so only the last one asked for is drawn (a slower answer to an earlier one is dropped). */
  const pageNav = useRef(0)
  // If the editor is opened directly on a product deep-link, keep the canvas
  // in "loading" state from the very first render until the deep-link effect
  // has injected `_product_data` — otherwise the canvas would briefly render
  // the bare product template (placeholder "Product Title / $29.99 / Product
  // image") between `loadData` finishing and `handleSelectProductPage` being
  // called.
  const [canvasLoading, setCanvasLoading] = useState(() => {
    if (typeof window === "undefined") return false
    const parsed = parsePreviewFromSearch(window.location.search)
    return parsed.page === "product" && (!!parsed.productSlug || !!parsed.productTitle)
  })
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null)
  const notificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* A save that did not go through: the banner at the top of the canvas until the next one does (lib/website-builder/save-problem.ts). */
  const [saveProblem, setSaveProblem] = useState<SaveProblem | null>(null)
  const showNotification = useCallback((message: string, type: "success" | "error" = "success") => {
    if (notificationTimer.current) clearTimeout(notificationTimer.current)
    setNotification({ message, type })
    notificationTimer.current = setTimeout(() => setNotification(null), 4000)
  }, [])
  const [customPages, setCustomPages] = useState<{ id: string; name: string; key: PageKey }[]>([])
  /* Every page the install has a row for: an imported theme's switcher lists exactly these (compatPages). */
  const [rowPageKeys, setRowPageKeys] = useState<string[]>([])
  /**
   * Which of the builder's migrations have been run. Only used to SAY what
   * is missing where it costs something — the publish panel warns when a
   * publish will not be backed up — so a failure to ask leaves the editor
   * exactly as it was.
   */
  const [backupsReady, setBackupsReady] = useState<boolean | null>(null)
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const res = await fetch("/api/website-builder/setup")
        if (!res.ok) return
        const d = (await res.json()) as { setup?: { backups?: boolean } }
        if (alive && typeof d.setup?.backups === "boolean") setBackupsReady(d.setup.backups)
      } catch {
        /* the editor works the same either way; this only adds a sentence */
      }
    })()
    return () => { alive = false }
  }, [])
  const [addPageOpen, setAddPageOpen] = useState(false)
  const [newPageTitle, setNewPageTitle] = useState("")
  const [addingPage, setAddingPage] = useState(false)

  /**
   * ===========================================================================
   *  UNDO AND REDO, TAKEN FROM REFS SO THEY ARE NEVER STALE
   * ===========================================================================
   * `pushUndo` used to close over `sections` and `settingsDraft`, so it was a
   * new function on every keystroke — and any handler that wanted to call it
   * had to list it as a dependency or capture an old one that would snapshot
   * an old page. Several handlers did neither: they simply did not call it,
   * which is why hiding a section, dragging one, or nudging one up or down
   * could not be undone at all. Undo went back past them to whatever edit had
   * last bothered to record itself, which is worse than not offering it.
   *
   * Reading the latest values out of refs makes all three stable, so a
   * mutation can record itself without dragging a dependency chain behind it,
   * and every mutation below does.
   */
  const [undoStack, setUndoStack] = useState<{ sections: SectionInstance[]; settings: ThemeSettingsValues }[]>([])
  const [redoStack, setRedoStack] = useState<{ sections: SectionInstance[]; settings: ThemeSettingsValues }[]>([])

  const sectionsRef = useRef(sections)
  sectionsRef.current = sections
  /* A change drawn ahead of the deferred canvas is only ever what the editor holds now (lib/website-builder/live-settings.ts, echoes). */
  useLayoutEffect(() => {
    reconcileEchoes((id) => sectionsRef.current.find((s) => s.id === id))
  })
  const settingsRef = useRef(settingsDraft)
  settingsRef.current = settingsDraft
  const undoRef = useRef(undoStack)
  undoRef.current = undoStack
  const redoRef = useRef(redoStack)
  redoRef.current = redoStack

  /** The page as it is right now, deep copied so a later edit cannot reach it. */
  const snapshotNow = useCallback(
    () => ({
      sections: JSON.parse(JSON.stringify(sectionsRef.current)) as SectionInstance[],
      settings: JSON.parse(JSON.stringify(settingsRef.current)) as ThemeSettingsValues,
    }),
    [],
  )

  /** Thirty steps. Anything a person can remember doing, they can undo. */
  const pushUndo = useCallback(() => {
    setUndoStack(prev => [...prev.slice(-30), snapshotNow()])
    setRedoStack([])
  }, [snapshotNow])

  /**
   * One step for a run of edits, and the step is what came BEFORE the run
   * (lib/website-builder/undo-run.ts): taken half a second after the typing
   * stopped, it was the page after the edit, and Undo did nothing.
   *
   * Declared here, beside `pushUndo`, because callers above it in the file
   * need it in their dependency list and a `const` cannot be named before it
   * exists.
   */
  const pushUndoLatest = useRef(pushUndo)
  pushUndoLatest.current = pushUndo
  const [undoRun] = useState(() => createUndoRun(() => pushUndoLatest.current()))
  const endUndoRun = undoRun.end
  const debouncedPushUndo = undoRun.step

  /**
   * THE STACK BELONGS TO THE PAGE IT WAS RECORDED ON.
   *
   * A snapshot is the whole page: `sections` and the theme settings. Switch
   * page and `sections` is replaced wholesale, but the stack was never
   * cleared — so the next Undo wrote the PREVIOUS page's sections onto the
   * page now open, marked it dirty, and autosave persisted that a second and
   * a half later. Silent, and it destroys a page somebody was not even
   * looking at.
   *
   * Cleared on every page change, so Undo either undoes something you did on
   * this page or does nothing at all.
   */
  pushUndoRef.current = debouncedPushUndo

  const clearHistory = useCallback(() => {
    endUndoRun()
    setUndoStack([])
    setRedoStack([])
  }, [endUndoRun])

  const handleUndo = useCallback(() => {
    const stack = undoRef.current
    if (stack.length === 0) return
    /* An edit after an Undo is a step of its own, not the end of the run before it. */
    endUndoRun()
    const last = stack[stack.length - 1]
    setRedoStack(prev => [...prev, snapshotNow()])
    setSections(last.sections)
    setSettingsDraft(last.settings)
    setUndoStack(prev => prev.slice(0, -1))
    setIsDirty(true)
  }, [snapshotNow, endUndoRun])

  const handleRedo = useCallback(() => {
    const stack = redoRef.current
    if (stack.length === 0) return
    endUndoRun()
    const last = stack[stack.length - 1]
    setUndoStack(prev => [...prev, snapshotNow()])
    setSections(last.sections)
    setSettingsDraft(last.settings)
    setRedoStack(prev => prev.slice(0, -1))
    setIsDirty(true)
  }, [snapshotNow, endUndoRun])

  /**
   * Bring a section into the CANVAS, and only when none of it is on screen.
   *
   * `scrollIntoView` was the call here once, and it scrolls every ancestor
   * it needs to: the clipped wrapper around the card and, on iOS, the window
   * itself. One container, scrolled by hand (see revealWithin).
   *
   * And it used to bring the section to the top EVERY time, which is the
   * "I click something and it scrolls to it" in the report: a row picked in
   * the layer list, a section just added at a gap you were looking at, a
   * duplicate, each slid the page up under the eye to put a section that was
   * already showing at the top. Now a section any part of which is on
   * screen stays exactly where it is.
   */
  const revealSection = useCallback((sectionId: string) => {
    setTimeout(() => {
      const el = document.getElementById(`wb-section-${sectionId}`)
      const scroller = document.getElementById("wb-preview-root")
      if (el && scroller) revealWithin(scroller, el)
    }, 80)
  }, [])

  /**
   * A page section dragged onto another's place (sections-list.tsx, through
   * controls/use-reorder.ts, which also gives the taps: medium on pick up, a
   * light one each time the slot changes, medium on the drop).
   */
  const reorderSection = useCallback((fromId: string, toId: string) => {
    if (fromId === toId) return
    // After the no-op check, so a drag that lands back where it started is
    // not an undo step that undoes nothing.
    pushUndo()
    setSections(prev => {
      /* The page's own sections move; the Header and Footer groups keep their places around them. */
      const g = splitGroups(prev)
      const oldIdx = g.template.findIndex(s => s.id === fromId)
      const newIdx = g.template.findIndex(s => s.id === toId)
      if (oldIdx === -1 || newIdx === -1) return prev
      return [...g.header, ...arrayMove(g.template, oldIdx, newIdx), ...g.footer, ...g.overlay]
    })
    setIsDirty(true)
  }, [pushUndo])

  /**
   * Move a body section one place. The header and the footer are chrome and
   * do not take part; a step past either end is a no-op rather than an error,
   * because the buttons that call this are disabled at the ends and a guard
   * that throws would be a guard for a case that cannot happen.
   */
  const moveSectionBy = useCallback((sectionId: string, step: -1 | 1) => {
    /**
     * Recorded BEFORE the move, and only when there is a move to record: the
     * buttons are disabled at the ends, but a keyboard or a stale render can
     * still ask for a step past one, and an undo entry for a no-op is an undo
     * press that appears to do nothing.
     */
    /* Inside its own group: a page section among the page's, an announcement bar inside the Header group. */
    const own = sectionsRef.current.find((x) => x.id === sectionId)
    if (!own) return
    const group = groupOf(own)
    const body = splitGroups(sectionsRef.current)[group]
    const from = body.findIndex((x) => x.id === sectionId)
    const to = from + step
    if (from === -1 || to < 0 || to >= body.length) return
    pushUndo()
    hapticTap("light")
    setSections((prev) => {
      const g = splitGroups(prev)
      const list = g[group]
      const from = list.findIndex((x) => x.id === sectionId)
      const to = from + step
      if (from === -1 || to < 0 || to >= list.length) return prev
      const next = { ...g, [group]: arrayMove(list, from, to) }
      return [...next.header, ...next.template, ...next.footer, ...next.overlay]
    })
    setIsDirty(true)
  }, [pushUndo])

  // Returns sections array — callers can inject product data before setting state
  // Home is the source of truth for header/footer across the entire site.
  // Every non-home page in the editor (and on the live site) renders using
  // home's header/footer rather than its own persisted copy, so custom/about/
  // contact/product pages can never drift visually from home.
  const fetchHomeHeaderFooter = useCallback(async (): Promise<Chrome> => {
    /* Every wait here ends (lib/website-builder/load-guard.ts): a request that never answers is an error, not a canvas that never draws. */
    const res = await fetchWithin(`/api/website-builder/themes/${installId}/sections?page=home`, {}, SECTIONS_WAIT_MS)
    if (!res.ok) return {}
    const data = await res.json()
    const loaded: SectionInstance[] = data.sections ?? []
    /* The whole Header and Footer groups: an announcement bar above the header is on every page too. */
    return chromeOf(loaded)
  }, [installId])

  /**
   * The same rule the published site uses, imported rather than written
   * twice. It was two copies, and they had drifted: the editor merged home's
   * chrome and the live site rendered each page's own, so a stale footer was
   * invisible in the one place somebody would check it.
   */
  const mergeWithHomeHeaderFooter = withUniversalChrome

  /** Which pages the server answered with sections it built rather than stored (fetchPageSections). */
  const generatedPages = useRef(new Set<string>())
  const fetchPageSections = useCallback(async (page: PageKey): Promise<SectionInstance[]> => {
    const res = await fetchWithin(`/api/website-builder/themes/${installId}/sections?page=${page}`, {}, SECTIONS_WAIT_MS)
    /* A server error is not an empty page: drawn as one, the next autosave would have written it over the real one. */
    if (res.status >= 500) throw new Error(`the ${page} page answered ${res.status}`)
    if (!res.ok) return []
    const data = await res.json()
    // The server's own answer to "is the draft ahead of live". See `unpublished`.
    if (data.has_draft) setUnpublished(true)
    /* Built from home and the settings, not stored: kept for a moment only (pageCache, below). */
    if (data.generated === true) generatedPages.current.add(page)
    else generatedPages.current.delete(page)
    let loaded: SectionInstance[] = data.sections ?? []

    // `_product_data` is a runtime-only injection used by the preview; it
    // must never be trusted from storage (legacy installs persisted it). If
    // we leave stale data in, switching between product pages shows the
    // previous product because the injection only overwrites when the new
    // productData resolves — a transient API failure would otherwise reveal
    // the wrong product.
    loaded = loaded.map(sec => {
      if (!sec.settings || !("_product_data" in sec.settings)) return sec
      const { _product_data: _omit, ...rest } = sec.settings as Record<string, unknown>
      return { ...sec, settings: rest }
    })

    /**
     * A HEADER AND A FOOTER ON A PAGE THAT HAS NOTHING, not on every page.
     * A brand new page is given the theme's two. A page with sections and no
     * header is a site whose header was deleted, or one whose header is a
     * section file of its own (its Header group says which), and putting the
     * built-in back on it every time it opened was the second header.
     */
    const empty = loaded.length === 0 && !importedTheme.current
    if (empty) {
      const hs = SECTION_SCHEMAS["header"]
      if (hs) loaded = [{ id: `header-${Date.now()}`, type: "header", name: hs.name, settings: hs.presets?.[0]?.settings ?? {}, blocks: hs.presets?.[0]?.blocks ?? [], hidden: false }, ...loaded]
    } else {
      // Backfill default nav links for legacy headers that were seeded with empty blocks
      const hs = SECTION_SCHEMAS["header"]
      const preset = hs?.presets?.[0]
      loaded = loaded.map(sec => {
        if (sec.type !== "header" || importedTheme.current) return sec
        const needsNav = !sec.blocks || sec.blocks.length === 0
        if (!needsNav || !preset?.blocks?.length) return sec
        return {
          ...sec,
          blocks: preset.blocks.map(b => ({
            id: `${b.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            type: b.type,
            settings: { ...b.settings },
          })),
        }
      })
    }
    if (empty) {
      const fs = SECTION_SCHEMAS["footer"]
      if (fs) loaded = [...loaded, { id: `footer-${Date.now()}`, type: "footer", name: fs.name, settings: fs.presets?.[0]?.settings ?? {}, blocks: fs.presets?.[0]?.blocks ?? [], hidden: false }]
    }

    // Auto-add Product section on product pages if missing
    if (page === "product" && !importedTheme.current && !loaded.some(s => s.type === "product")) {
      const ps = SECTION_SCHEMAS["product"]
      if (ps) {
        const headerIdx = loaded.findIndex(s => s.type === "header")
        const newSection: SectionInstance = { ...mainProductSection(`product-${Date.now()}`), name: ps.name }
        if (headerIdx !== -1) loaded.splice(headerIdx + 1, 0, newSection)
        else loaded.unshift(newSection)
      }
    }

    /* A product section saved before it had blocks: the blocks its old
       switches describe, in the sidebar where the creator can change them,
       the same ones the live page draws (lib/website-builder/product-page.ts). */
    loaded = loaded.map((s) => withProductBlocks(s))
    /* Delivery and pickup on a product section saved before the block existed, in the sidebar as on the live page; removed by the creator, it stays removed (lib/website-builder/product-page.ts withDeliveryBlock). */
    loaded = loaded.map((s) => withDeliveryBlock(s))

    return loaded
  }, [installId])

  /*
    ═══════════════════════════════════════════════════════════════════════
     A PAGE ALREADY READ OPENS FROM WHAT WAS READ (round 25)
    ═══════════════════════════════════════════════════════════════════════
    "Navigating between pages in the editor takes too long." Every switch
    asked the server for the page's sections after the press, and a page
    opened a minute ago was asked for again. Read ahead only on a link's
    hover in an imported theme's canvas, kept 15 seconds, and thrown away at
    the next edit anywhere, so almost every switch began with a round trip.

    Each page is now kept once read, for PAGE_AHEAD_MS:
      read ahead on a link's hover in an imported theme's canvas (the
      bridge's "intent", canvas-bridge.ts), on a row's hover in the page
      list, and the site's other pages once the editor is idle (THE SITE'S
      OTHER PAGES, READ ONCE THE EDITOR IS IDLE, below);
      the page being left, as it stands once its save has landed, or with
      nothing unsaved: what a read of it would answer (handlePageChange).
    What a page holds changes only here, from an agent, or from a push: an
    agent's or a push's change forgets them all (handleAgentEvents), a page
    written from here other than by its own save (the assistant building it,
    a policy written into it, made, deleted) is forgotten (forgetPage), the
    reload button reads afresh, and a page the server builds from home and
    the settings (`generated`: the shop, search, account pages) is kept
    GENERATED_AHEAD_MS. An edit on one page changes no other page's own
    sections, and what every page shares, the header and footer, is never
    taken from what was read but from the page on screen (handlePageChange),
    so an edit to the header is on the next page at once, saved or not.
  */
  /* Whether something here is unsaved, or being saved, read by what runs later than a render (handleAgentEvents). */
  const isDirtyRef = useRef(isDirty)
  isDirtyRef.current = isDirty
  const savingRef = useRef(saving)
  savingRef.current = saving
  const pageCache = useRef(new Map<string, { at: number; ttl: number; read: Promise<SectionInstance[]> }>())
  /** A page written other than by its own save (or all of them): read afresh when it is next opened. */
  const forgetPage = useCallback((page?: string) => {
    if (page === undefined) pageCache.current.clear()
    else pageCache.current.delete(page)
  }, [])
  const cachedPage = useCallback((page: string): Promise<SectionInstance[]> | null => {
    const had = pageCache.current.get(page)
    if (had && Date.now() - had.at < had.ttl) return had.read
    if (had) pageCache.current.delete(page)
    return null
  }, [])
  const prefetchPageSections = useCallback((page: PageKey) => {
    if (page === "product" || page === currentPageRef.current || cachedPage(page)) return
    const read = fetchPageSections(page)
    const entry = { at: Date.now(), ttl: PAGE_AHEAD_MS, read }
    read.then(
      () => { if (generatedPages.current.has(page)) entry.ttl = GENERATED_AHEAD_MS },
      () => { if (pageCache.current.get(page) === entry) pageCache.current.delete(page) },
    )
    pageCache.current.set(page, entry)
  }, [fetchPageSections, cachedPage])
  /** A page's sections: what was read of it, a copy (the editor's state is never the copy kept), or asked for now. */
  const pageSectionsNow = (page: PageKey, fresh = false): Promise<SectionInstance[]> => {
    const had = fresh || page === "product" ? null : cachedPage(page)
    if (!had) {
      pageCache.current.delete(page)
      return fetchPageSections(page)
    }
    return had.then((list) => structuredClone(list), () => fetchPageSections(page))
  }
  /*
    THE HEADER AND FOOTER EVERY PAGE WEARS, FROM THE PAGE ON SCREEN. Every
    page in the editor is drawn in home's chrome (mergeWithHomeHeaderFooter),
    so the page on screen already wears the site's: as it stands, edits and
    all, which a read of home would only have once a save had landed. A
    group deleted here is an empty group, not one taken from the next page.
    Null on the password page, which wears none.
  */
  const siteChromeOf = (page: PageKey, list: SectionInstance[]): Chrome | null => {
    if (CHROMELESS_PAGES.has(page)) return null
    const c = chromeOf(list)
    const gone = chromeRemoved.current
    return {
      ...c,
      ...(gone.header && !c.headerGroup ? { headerGroup: [] } : {}),
      ...(gone.footer && !c.footerGroup ? { footerGroup: [] } : {}),
      ...(gone.overlay && !c.overlayGroup ? { overlayGroup: [] } : {}),
    }
  }
  /** The page being left, kept as a read of it would now answer: only once its save has landed (or with nothing to save). */
  const keepPageLeft = (page: PageKey, list: SectionInstance[], saved: boolean, wasDirty: boolean) => {
    if (page === "product") return
    if (!saved) { pageCache.current.delete(page); return }
    if (wasDirty) generatedPages.current.delete(page)
    const ttl = generatedPages.current.has(page) ? GENERATED_AHEAD_MS : PAGE_AHEAD_MS
    pageCache.current.set(page, { at: Date.now(), ttl, read: Promise.resolve(structuredClone(sectionsForSave(list))) })
  }

  /*
    AN IMPORTED THEME'S PAGE, DRAWN BEFORE THE PRESS (round 25). The pointer
    resting on a page's link (in the canvas, or a row of the page list) reads
    its sections, and once they are in, the canvas draws that page out of
    sight with exactly the sections a press would open it with (compat-
    canvas.tsx, KEPT PAGES), so the press shows a page already loaded. At a
    computer only: a finger has no resting.
  */
  const [compatWarm, setCompatWarm] = useState<{ pageKey: string; sections: StoredSection[] } | null>(null)
  const warmAsked = useRef(0)
  const warmCompatPage = useCallback((page: PageKey) => {
    if (!importedTheme.current || page === "product" || page === currentPageRef.current) return
    if (typeof window !== "undefined" && window.innerWidth < 768) return
    const read = cachedPage(page)
    if (!read) return
    const asked = ++warmAsked.current
    read.then((list) => {
      if (asked !== warmAsked.current || page === currentPageRef.current) return
      const chrome = siteChromeOf(currentPageRef.current, sectionsRef.current)
      if (!chrome) return
      const copy = structuredClone(list)
      setCompatWarm({ pageKey: page, sections: (CHROMELESS_PAGES.has(page) ? withoutChrome(copy) : mergeWithHomeHeaderFooter(copy, chrome)) as unknown as StoredSection[] })
    }, () => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cachedPage])
  const loadSections = useCallback(async (page: PageKey) => {
    const loaded = await fetchPageSections(page)
    setSections(loaded)
    setUndoStack([])
    setRedoStack([])
  }, [fetchPageSections])

  // Load install data.
  // Wrapped in try / finally so `loading` is ALWAYS cleared — even if the
  // fetch throws on a network error, a 5xx, or if the response JSON is
  // malformed. Without this the page would sit on the auth/loader spinner
  // forever, which is exactly what the user reported.
  /*
    `quiet`: read again under an editor that is already open (a push to the
    linked GitHub repository rewrote this page or the settings). The sidebar
    and the canvas keep what they show until the new draft is here and then
    take it in place, the open section stays open, and a read that fails
    leaves the editor as it was rather than covering it with Try again.
  */
  const loadData = useCallback(async (opts: { quiet?: boolean } = {}) => {
    const quiet = opts.quiet === true
    if (!quiet) setLoading(true)
    setLoadFailed(false)
    /*
      ALL AT ONCE, NOT ONE AFTER ANOTHER. The page's sections waited for the
      install to come back before they were even asked for, which put two
      signed-in round trips end to end in front of every opening of the
      editor (the "Fetching your sections" that stayed up). Neither needs the
      other, so both are asked for now. Caught here and read below, so an
      install that fails leaves nothing unhandled.
    */
    const sectionsAsked = Promise.all([
      fetchPageSections(currentPage),
      currentPage !== "home" ? fetchHomeHeaderFooter() : Promise.resolve<Chrome>({}),
    ]).then((v) => ({ ok: true as const, v }), (e: unknown) => ({ ok: false as const, e }))
    try {
    /* Asked again on a dropped connection or a 5xx, and never waited on forever; one that cannot be had is said over the canvas. */
    const res = await retrying(async () => {
      const r = await fetchWithin(`/api/website-builder/themes/${installId}`, {}, SECTIONS_WAIT_MS)
      if (r.status >= 500) throw new Error(`the website answered ${r.status}`)
      return r
    }, [700, 2000])
    if (!res.ok) {
      reportLoadProblem("editor", `the website answered ${res.status}`)
      if (!quiet) setLoadFailed(true)
      setLoading(false)
      return
    }
    const data = await res.json()
    const inst: ThemeInstall = data.install
    setInstall(inst)
    if (data.username) setUsername(data.username)
    if (data.creatorFacts && typeof data.creatorFacts === "object") setCreatorFacts(data.creatorFacts as CreatorFacts)
    setBuilderCommunities(data.communities && typeof data.communities === "object" ? (data.communities as BuilderCommunities) : null)
    setBuilderCollections(data.collections && typeof data.collections === "object" ? (data.collections as BuilderCollections) : null)
    setSiteHandle(typeof data.siteHandle === "string" && data.siteHandle ? data.siteHandle : null)

    /**
     * ═════════════════════════════════════════════════════════════════════
     *  THE PAGES A CREATOR MADE THEMSELVES
     * ═════════════════════════════════════════════════════════════════════
     * `customPages` was React state and nothing else: a page made in this
     * session showed up in the switcher, and on the next reload it was gone
     * from the list while its sections sat in the database, reachable by
     * nothing. The rows were always here in the response, and ignored.
     *
     * The four keys below are the theme's own. Everything else in the table
     * is a page a person made, and its name comes from its key because that
     * is what a key is: "size-guide" was typed as "Size guide".
     */
    const restored = (inst.pages ?? [])
      .map((pg) => String(pg.page_key))
      .filter((key) => key && !BUILT_IN_PAGE_KEYS.has(key))
      .sort((a, b) => a.localeCompare(b))
      .map((key) => ({ id: key, name: pageTitleFromKey(key), key: key as PageKey }))
    setCustomPages(restored)
    setRowPageKeys((inst.pages ?? []).map((pg) => String(pg.page_key)).filter(Boolean))

    // Load settings
    const settings = inst.settings
    const loadedSettings = settings?.draft_settings ?? settings?.settings ?? {}
    if (compatOf(loadedSettings)) {
      importedTheme.current = true
      /* An imported theme's own files and its canvas's code are the next wait: asked for now, beside the sections, not once the canvas mounts. */
      warmCompat(installId)
      try { window.localStorage.setItem(`wb-compat:${installId}`, "1") } catch { /* see the prefetch above */ }
    } else {
      try { window.localStorage.removeItem(`wb-compat:${installId}`) } catch { /* see the prefetch above */ }
    }
    /* Every theme shows the store's menus. Until the store has any, the live theme's are offered, or this theme's own when nothing is live yet. */
    const offered = data.storeMenus as { available?: boolean; stored?: boolean; menus?: unknown } | undefined
    if (offered?.available) {
      const menus = offered.menus && typeof offered.menus === "object" && !Array.isArray(offered.menus) ? (offered.menus as Record<string, unknown>) : {}
      if (offered.stored || Object.keys(menus).length > 0) (loadedSettings as Record<string, unknown>).menus = menus
      storeMenusRef.current = { available: true, synced: JSON.stringify(cleanMenus((loadedSettings as Record<string, unknown>).menus)) }
    }

    /*
      NO MADE UP SITE TITLE. This filled an empty one with "{username} |
      Storelib", so a new site's tab and search result named Storelib and a
      handle rather than the store. An empty site title now means the
      store's name, on the live page and in SEO & Social's preview alike
      (lib/website-builder/tab-title.ts). Two titles this used to write
      before that, which nobody typed, are cleared to the same; whatever a
      creator saved is left as they saved it.
    */
    {
      const current = typeof loadedSettings.seo_title === "string" ? loadedSettings.seo_title.trim() : ""
      /* "{username} | Storelib" (and the site's own handle) is the one this wrote most: the same old default, cleared too. */
      const madeUp = [inst.name, data.username, data.siteHandle].filter((v): v is string => typeof v === "string" && !!v).map((v) => `${v} | Storelib`.toLowerCase())
      if (current === "My Store | Storelib" || madeUp.includes(current.toLowerCase())) loadedSettings.seo_title = ""
    }

    // Load sections for current page. If not on home, fetch home's
    // header/footer in parallel and splice them in — home is the universal
    // source of truth for header/footer.
    const asked = await sectionsAsked
    if (!asked.ok) throw asked.e
    const [loadedRaw, homeHF] = asked.v
    /**
     * HOME GETS THE RULE TOO, and that is not a no-op.
     *
     * This read `currentPage !== "home" ? merge : loadedRaw`, so every page
     * on the site had its header put first and its footer put last except
     * the one page the chrome is copied FROM. A header dragged into the
     * middle of home therefore rendered in the middle on home and at the top
     * everywhere else — which is the header that "is not universal". Home's
     * own chrome is the source, so it is what home is dressed in.
     */
    /* The password page wears no chrome, on the live site or here (lib/website-builder/universal-chrome). */
    const loaded = CHROMELESS_PAGES.has(currentPage) ? withoutChrome(loadedRaw) : mergeWithHomeHeaderFooter(loadedRaw, currentPage !== "home" ? homeHF : chromeOf(loadedRaw))

    // Sync logo between header section and theme settings on initial load
    const header = loaded.find(s => s.type === "header")
    if (header) {
      // Settings bag values are typed loosely (unknown | Record<string, unknown>);
      // coerce via string() to keep downstream types happy.
      const headerLogo = typeof header.settings.logo_url === "string" ? header.settings.logo_url : ""
      const themeLogo = loadedSettings.logo_url
      // If header has a logo but theme settings doesn't, populate theme settings
      if (headerLogo && !themeLogo) {
        loadedSettings.logo_url = headerLogo
        if (header.settings.logo_height) loadedSettings.logo_width = header.settings.logo_height
      }
      // If theme settings has a logo but header doesn't, populate header
      else if (themeLogo && !headerLogo) {
        header.settings.logo_url = themeLogo
        if (loadedSettings.logo_width) header.settings.logo_height = loadedSettings.logo_width
      }

      // Mobile logo sync (header ↔ theme)
      const headerMobileLogo = header.settings.mobile_logo_url
      const themeMobileLogo = loadedSettings.mobile_logo_url
      if (headerMobileLogo && !themeMobileLogo) {
        loadedSettings.mobile_logo_url = headerMobileLogo as string
        if (header.settings.mobile_logo_height) loadedSettings.mobile_logo_width = header.settings.mobile_logo_height as number
      } else if (themeMobileLogo && !headerMobileLogo) {
        header.settings.mobile_logo_url = themeMobileLogo
        if (loadedSettings.mobile_logo_width) header.settings.mobile_logo_height = loadedSettings.mobile_logo_width
      }
      // use_mobile_logo flag sync — header is source of truth when set
      if (typeof header.settings.use_mobile_logo === "boolean") {
        loadedSettings.use_mobile_logo = header.settings.use_mobile_logo
      } else if (typeof loadedSettings.use_mobile_logo === "boolean") {
        header.settings.use_mobile_logo = loadedSettings.use_mobile_logo
      }
    }

    /* Read under an open editor: an edit made while it was on its way is not written over (the conflict line asks which to keep). */
    if (quiet && (isDirtyRef.current || savingRef.current)) {
      setSyncConflict((c) => c ?? { what: "this page", by: "GitHub" })
      return
    }
    setSettingsDraft(loadedSettings)
    setSections(loaded)
    } catch (err) {
      console.error("[editor] loadData failed:", err)
      reportLoadProblem("editor", err)
      if (!quiet) setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }, [installId, currentPage, fetchPageSections, fetchHomeHeaderFooter])

  // `loadData` is intentionally fired exactly ONCE on mount. Re-running it
  // whenever its dep identity changes (which happens every time
  // `setCurrentPage` flips to a new page key) would refetch the bare page
  // template and overwrite the `_product_data` that `handleSelectProductPage`
  // just injected — producing the random "Product Title / $29.99 / Product
  // image" placeholder flash when switching to a product page. Page
  // navigation is already handled by `handlePageChange` /
  // `handleSelectProductPage`, so we do not need an automatic refetch here.
  const initialLoadRef = useRef(false)
  useEffect(() => {
    if (initialLoadRef.current) return
    initialLoadRef.current = true
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Username is loaded from API in loadData

  // Check mobile view. When the editor itself is being opened on a phone,
  // force the preview into "mobile" device mode — otherwise we'd render the
  // 1200-wide desktop layout inside a 390px viewport and every header row
  // turns into a squished mess.
  useEffect(() => {
    /**
     * Crossing the line between a phone and a computer changes what
     * `aiOpen` means (a sheet, or the pill), so it is set for the side it
     * lands on: the pill shown on a computer unless it was closed, and the
     * sheet closed on a phone. Only on a crossing, never on an ordinary
     * resize, which must not reopen something somebody closed.
     */
    let wasMobile: boolean | null = null
    const checkMobile = () => {
      const mobile = window.innerWidth < 768
      setIsMobileView(mobile)
      if (mobile) setDevice("mobile")
      if (mobile !== wasMobile) setAiOpen(!mobile && !askDockClosed())
      wasMobile = mobile
    }
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  /**
   * The editor's idle motions (the AI button's ring, the connection dot)
   * stop while the tab is hidden. An attribute on <html>, written straight
   * to the DOM: a state here would render all of the editor on every tab
   * switch to change one CSS rule.
   */
  useEffect(() => {
    const root = document.documentElement
    const sync = () => root.toggleAttribute("data-tab-hidden", document.visibilityState === "hidden")
    sync()
    document.addEventListener("visibilitychange", sync)
    return () => {
      document.removeEventListener("visibilitychange", sync)
      root.removeAttribute("data-tab-hidden")
    }
  }, [])

  /**
   * CLOSING THE TAB, RELOADING, TYPING ANOTHER ADDRESS. The browser's own
   * question is the only one a closing tab can ask, so it is asked for the
   * same three things the builder's dialog asks about: edits not saved yet,
   * a code file with changes, a save still going. Not after somebody has
   * already answered Discard or Save in that dialog (`leaveAnswered`).
   */
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (leaveAnswered.current) return
      if (isDirty || codeDirty || saving || publishing) { e.preventDefault(); e.returnValue = "" }
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [isDirty, codeDirty, saving, publishing])

  /**
   * THE SAME CARDS THE PUBLISHED PAGE IS GIVEN. The canvas draws a section
   * that reads `products`, a product picker, a product list or a collection
   * from these, and they come from the functions the live site calls
   * (`shopProducts` and `catalogCards` in lib/website-builder/shop-products.ts,
   * through /api/website-builder/products?cards=1). They were mapped here from
   * the page browser's list, which has no kind, no options, no gallery beyond
   * the first picture and no community filter, so the canvas drew cards the
   * site does not: an add button that read no kind, a second picture that was
   * never there, a count of products the shop does not list.
   *
   * Until they arrive the page browser's list stands in, through the same
   * `toCard`, so a product grid is never empty for the length of a request.
   * They are read again when the builder's tab comes back into view, because
   * a price or a photo is usually changed in another tab, and kept as the
   * same objects when nothing changed, so a section does not draw again for a
   * read that found what it already had.
   */
  const [liveCards, setLiveCards] = useState<{ shop: ProductCard[]; catalog: ProductCard[] } | null>(null)
  /* The first read of them has answered (or failed): an imported theme's first page waits for it (CompatCanvas dataReady). */
  const [liveCardsRead, setLiveCardsRead] = useState(false)
  const liveCardsKey = useRef("")
  const loadCards = useCallback(async () => {
    try {
      const res = await fetch("/api/website-builder/products?cards=1", { cache: "no-store" })
      if (!res.ok) return
      const data = await res.json()
      const shop = Array.isArray(data?.shop) ? (data.shop as ProductCard[]) : []
      const catalog = Array.isArray(data?.catalog) ? (data.catalog as ProductCard[]) : shop
      const key = JSON.stringify([shop, catalog])
      if (key === liveCardsKey.current) return
      liveCardsKey.current = key
      setLiveCards({ shop, catalog })
    } catch {
    } finally {
      setLiveCardsRead(true)
    }
  }, [])
  useEffect(() => {
    void loadCards()
    let last = Date.now()
    const again = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 15_000) return
      last = Date.now()
      void loadCards()
    }
    document.addEventListener("visibilitychange", again)
    window.addEventListener("focus", again)
    return () => {
      document.removeEventListener("visibilitychange", again)
      window.removeEventListener("focus", again)
    }
  }, [loadCards])
  const standIn = useMemo(
    () => products.map((p) => toCard({
      id: p.id,
      title: p.title,
      slug: p.slug,
      price_cents: p.price_cents,
      compare_at_cents: p.compare_at_cents,
      thumbnail_url: p.thumbnail_url,
      gallery_urls: p.gallery_urls,
      status: "published",
    })),
    [products],
  )
  /* What a section reads as `products`, and what a picker may name. */
  const shopCards = liveCards?.shop ?? standIn
  const catalogCardsForCanvas = liveCards?.catalog ?? standIn

  // Fetch products and collections for page browser
  const loadProducts = useCallback(async () => {
    setProductsLoading(true)
    try {
      const res = await fetch("/api/website-builder/products?limit=100")
      if (res.ok) {
        const data = await res.json()
        setProducts((data.products ?? []).map((p: any) => ({
          id: p.id,
          title: p.title || "Untitled Product",
          slug: p.slug || p.id,
          thumbnail_url: p.thumbnail_url || "",
          price_cents: p.price_cents ?? 0,
          compare_at_cents: p.compare_at_cents ?? null,
          description: p.description || "",
          whats_included: p.whats_included ?? [],
          gallery_urls: p.gallery_urls ?? [],
          faqs: p.faqs ?? null,
        })))
      }
    } catch {}
    setProductsLoading(false)
  }, [])

  useEffect(() => { loadProducts() }, [loadProducts])

  // Deep-link handler: when the editor is opened directly at
  // `?page=product&product=<title>` (refresh, reopened tab, or shared link),
  // the initial load path only fetches the generic product template — it
  // never reads the `product=` param, so the canvas shows "Product Title /
  // $29.99 / Product image" placeholders. Once the products list and the
  // initial data have loaded, look up the product from the URL and run the
  // same injection flow the sidebar click uses.
  const deepLinkHandledRef = useRef(false)
  useEffect(() => {
    if (deepLinkHandledRef.current) return
    if (loading) return
    if (products.length === 0) return
    if (currentPage !== "product") return
    if (typeof window === "undefined") return
    const parsed = parsePreviewFromSearch(window.location.search)
    // New format supplies a product slug; legacy format supplies a title.
    const match =
      (parsed.productSlug && products.find(p => p.slug === parsed.productSlug)) ||
      (parsed.productTitle && products.find(p => p.title === parsed.productTitle)) ||
      null
    if (!match) return
    deepLinkHandledRef.current = true
    handleSelectProductPage(match.id, match.title)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, products, currentPage])

  // Update browser URL to reflect current page.
  // Writes the canonical `?previewPath=…` format. We also clear the legacy
  // `?page=` / `?product=` params so the URL bar doesn't grow stale junk.
  const updatePageUrl = useCallback((page: string, productSlug?: string) => {
    const url = new URL(window.location.href)
    url.searchParams.set("previewPath", previewPathForState(page, productSlug))
    url.searchParams.delete("page")
    url.searchParams.delete("product")
    /* Without the router's own mark, so the router takes the new address in; with the leave guard's (below), so the entry is still known as one. */
    const guard = (window.history.state as { wbLeaveGuard?: boolean } | null)?.wbLeaveGuard
    window.history.replaceState(guard ? { wbLeaveGuard: true } : {}, "", url.toString())
  }, [])

  const handlePageChange = async (page: PageKey) => {
    /**
     * WHAT YOU WERE WORKING ON IS SAVED BEFORE YOU LEAVE IT.
     *
     * This function replaces `sections` with the new page's, so anything not
     * yet written was simply gone — no warning, no save. Autosave narrowed the
     * window to a second and a half; it did not close it, and a second and a
     * half is exactly long enough to change a heading and click another page.
     *
     * Awaited, not fired and forgotten: the write is started while
     * `currentPage` and `sections` still agree about which page they describe
     * (saveDraft reads them as it starts), and the next page is not put in
     * until it has landed. The next page's sections are read AT THE SAME
     * TIME (round 25): they are another page's row, which this save does not
     * touch, so the switch costs the longer of the two, not both.
     */
    /* An edit here and GitHub's version of the same page: switching would save one over the other unasked. */
    if (syncConflictRef.current) {
      showNotification("Pick which version to keep first", "error")
      return
    }
    const leaving = currentPage
    const leavingSections = sections
    const leavingDirty = isDirty && !saving && !publishing
    const saved: Promise<boolean> = leavingDirty ? saveDraft({ quiet: true }) : Promise.resolve(true)
    switchingPage.current = true
    // The history describes the page being left. See `clearHistory`.
    clearHistory()
    /** Arriving somewhere answers "that page does not exist". */
    setMissingPath(null)
    /**
     * try/finally, because the fetches below can reject — a dropped
     * connection, a 500 — and a flag left true would switch autosave off for
     * the rest of the session. Every change after that would sit unsaved
     * behind a guard nobody could see.
     */
    try {

      // IMPORTANT: do NOT flip `canvasLoading` on for simple page switches —
      // the skeleton should only appear on the very first editor mount
      // (handled by the `loading` state) or on a direct product deep-link
      // (handled by the `canvasLoading` useState initializer). Leave the
      // previously-rendered sections on screen until the new page is ready
      // so the editor feels instant instead of flashing a spinner every
      // time the user clicks a different page.
      setSectionsLoading(true)

      /*
        The header and footer from the page being left (siteChromeOf): home
        was read again for them on every switch that did not start at home.
        From the password page, which wears none, home is read.
      */
      const siteChrome = siteChromeOf(leaving, leavingSections)

      /**
       * The sidebar's half of the switch happens now, because it is what the
       * click was aimed at: the menu shuts, the panel goes back to the list.
       * None of it touches the canvas.
       */
      setSelectedPanel({ type: "pages" })
      setPageBrowserOpen(false)

      // Load new page sections, then — if not home — splice in home's
      // header/footer so every page renders identically to home.
      const nav = ++pageNav.current
      const [loaded, homeHF, savedOk] = await Promise.all([
        /* The reload button (the same page again) reads afresh. */
        pageSectionsNow(page, page === leaving),
        siteChrome
          ? Promise.resolve(siteChrome)
          : page !== "home" ? fetchHomeHeaderFooter() : Promise.resolve<Chrome>({}),
        saved,
      ])
      if (page !== leaving) keepPageLeft(leaving, leavingSections, savedOk, leavingDirty)
      /* Another page or product was picked while this one loaded: that one draws, this one never does. */
      if (nav !== pageNav.current) return
      /* Home included, for the reason on the initial load above. */
      const merged = CHROMELESS_PAGES.has(page) ? withoutChrome(loaded) : mergeWithHomeHeaderFooter(loaded, siteChrome ?? (page !== "home" ? homeHF : chromeOf(loaded)))

      /**
       * ═══════════════════════════════════════════════════════════════════
       *  THE PAGE AND ITS SECTIONS CHANGE IN ONE RENDER
       * ═══════════════════════════════════════════════════════════════════
       * THIS IS THE BUMP. `setCurrentPage` used to run BEFORE the fetch, so
       * for one render — plus however long the network took — the canvas
       * drew the OLD page's sections under the NEW page's template. That is
       * a real visual change: `page.template` decides what a theme-language
       * section renders, the header's active link moves to the page you
       * have not arrived at yet, and a product page stops being one. Then
       * the sections landed and everything changed a second time.
       *
       * Two changes where the eye expects none reads as a flash, and the
       * middle one is of a page that never existed: this page's name over
       * that page's content.
       *
       * So nothing that describes WHICH PAGE IS SHOWN moves until the
       * content for it is in hand. React batches these into one commit, so
       * the canvas goes from the old page straight to the new one with no
       * frame in between.
       *
       * And the old one is held over it, copied, until the new one is drawn
       * with its first pictures in, then faded off it (lib/website-builder/
       * canvas-still.ts). Not over an imported theme's canvas, whose frames
       * cross-fade on their own (compat-canvas.tsx).
       */
      if (!importedTheme.current) holdCanvasStill(() => currentPageRef.current === page)
      setCurrentPage(page)
      setSelectedProductPage(null)
      setSelectedProductId(null)
      setEditAllProductPages(false)
      setSections(merged)
      updatePageUrl(page)

      setSectionsLoading(false)
      setCanvasLoading(false)
    } catch (err) {
      /* The page you were on stays, and says why it is still there; the sidebar's skeleton and the canvas's hold go. */
      pageOpenFailed(err)
    } finally {
      switchingPage.current = false
    }
  }

  /** A page or product that could not be opened: nothing is left waiting on it, and it is said once. */
  function pageOpenFailed(err: unknown) {
    console.error("[editor] a page could not be opened:", err)
    reportLoadProblem("editor", err)
    setSectionsLoading(false)
    setCanvasLoading(false)
    openingPage.current = false
    toast.error("Couldn't open that page. Try again.", { id: "wb-page-open" })
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   *  YOU ARRIVE AT THE TOP OF A PAGE YOU OPENED
   * ═══════════════════════════════════════════════════════════════════════
   * Opening a page kept the scroll position of the one before it, so a
   * footer link followed from halfway down a long home page landed halfway
   * down the privacy policy with its heading above the fold. Nothing about
   * that says a page changed; it reads as the canvas having glitched.
   *
   * A LAYOUT EFFECT ON THE PAGE, not a requestAnimationFrame after the
   * setState that changed it. rAF runs before the next paint but React's
   * commit is scheduled separately, so the callback could land either side
   * of the new sections being in the DOM: scroll the old content and the
   * new page arrives already scrolled, scroll after and the content moves
   * under the eye. An effect keyed on the page runs after the commit that
   * changed it, every time, which is the one moment this is correct.
   *
   * `useLayoutEffect`, so it is done before the browser paints: a scroll
   * corrected after a paint is a scroll somebody saw.
   */
  /** A section to scroll to on the page being opened, from a link like `/about#section-x`. */
  const pendingAnchor = useRef<string | null>(null)
  useLayoutEffect(() => {
    /* The page is here, so the hold that kept the canvas still while it was
       being fetched ends now, before the one move it was protecting. */
    openingPage.current = false
    document.getElementById("wb-preview-root")?.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior })
  }, [currentPage, selectedProductPage])
  /**
   * ANOTHER PAGE FADES IN, briefly, rather than replacing the last one in a
   * single frame. Opacity only, on the page inside the canvas, never below a
   * third: it is the same canvas, showing a different page. Not on the
   * editor's first draw, which is not a change of page.
   */
  const pageShown = useRef<string | null>(null)
  useLayoutEffect(() => {
    const key = `${currentPage}|${selectedProductPage ?? ""}`
    const before = pageShown.current
    pageShown.current = key
    if (before === null || before === key) return
    /*
      NOT FOR AN IMPORTED THEME. Its canvas still shows the page being left
      at this moment (the next one is drawing under it, compat-canvas.tsx)
      and swaps them itself once the next is drawn, so this dimmed the old
      page to a third and brought it back, a white flash over About before
      Home had even appeared (scripts/check-canvas20.ts).
    */
    if (importedTheme.current) return
    const page = document.getElementById("wb-preview-root")?.firstElementChild as HTMLElement | null
    const calm = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches
    /* The page being left is held over this one and fades off it (canvas-still.ts): fading this one up as well showed the white behind both. */
    if (document.querySelector(`[${CANVAS_STILL_ATTR}]`)) return
    if (page && !calm && typeof page.animate === "function") page.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 180, easing: "ease-out" })
  }, [currentPage, selectedProductPage])
  /* Opened by a link to one of its sections (`/about#section-x`): from the
     top down to it, once the canvas has drawn it. The canvas draws a
     deferred copy, so it is looked for over a few frames. */
  useEffect(() => {
    const scroller = document.getElementById("wb-preview-root")
    const anchor = pendingAnchor.current
    pendingAnchor.current = null
    if (!anchor || !scroller) return
    let tries = 0
    let frame = 0
    const look = () => {
      const root = themeRootOf(scroller.querySelector("[data-storelib-theme]"))
      if (root && scrollToHash(root, anchor, { scroller })) return
      if (++tries < 30) frame = requestAnimationFrame(look)
    }
    frame = requestAnimationFrame(look)
    return () => cancelAnimationFrame(frame)
  }, [currentPage, selectedProductPage])

  const handleSelectProductPage = async (productId: string, productTitle: string) => {
    /* The latest click wins: a slower answer for a product picked before it never draws over it. */
    const nav = ++pageNav.current
    setSectionsLoading(true)
    // A product page is another page: the history describes the one being
    // left. See `clearHistory`.
    clearHistory()
    // Only flip `canvasLoading` on when the user is landing here via a
    // product deep-link (URL already has product=...) — otherwise keep the
    // previous page visible so switching to a product page feels instant.
    // The deep-link case is already covered by the `canvasLoading` useState
    // initializer, so we don't need to set it here.

    // Product pages always use home's header/footer. If leaving home, grab
    // them from in-memory state; otherwise refetch from the API.
    const leavingHomeHF = currentPage === "home" ? chromeOf(sections) : null

    /**
     * The sidebar's half, which the click was aimed at and which does not
     * touch the canvas. Everything that says WHICH PAGE IS SHOWN waits for
     * the content: see the same note in handlePageChange. Without it the
     * canvas drew the page you were leaving under the product page's
     * template, and then changed again when the sections landed.
     */
    setSelectedPanel({ type: "pages" })
    setPageBrowserOpen(false)
    // Prefer slug for the previewPath so the URL matches the live site's
    // /products/{slug} shape; fall back to id if the product wasn't found
    // in the in-memory list yet.
    const slugForUrl =
      products.find(p => p.id === productId)?.slug ?? productId

    // Build fallback product data from the products list immediately. We
    // include id + slug so the Buy Now / Add to Cart buttons remain wired
    // up even when the dedicated product API call momentarily fails.
    const listProduct = products.find(p => p.id === productId)
    const fallbackData = listProduct ? {
      id: listProduct.id,
      slug: listProduct.slug,
      title: listProduct.title,
      description: listProduct.description,
      price_cents: listProduct.price_cents,
      compare_at_cents: listProduct.compare_at_cents,
      thumbnail_url: listProduct.thumbnail_url,
      gallery_urls: listProduct.gallery_urls,
      whats_included: listProduct.whats_included,
      files: [],
    } : null

    // Fetch sections, product data, and home's header/footer in parallel.
    // The product fetch retries once on a transient failure so a single flaky
    // request doesn't strand the canvas on placeholder content.
    const fetchProductWithRetry = async (): Promise<{ product?: unknown } | null> => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const r = await fetchWithin(`/api/website-builder/products?id=${productId}`, { cache: "no-store" }, SECTIONS_WAIT_MS)
          if (r.ok) return await r.json()
        } catch {}
      }
      return null
    }

    let pageSections: SectionInstance[], productRes: { product?: unknown } | null, homeHF: Chrome
    try {
      ;[pageSections, productRes, homeHF] = await Promise.all([
        fetchPageSections("product"),
        fetchProductWithRetry(),
        leavingHomeHF ? Promise.resolve(leavingHomeHF) : fetchHomeHeaderFooter(),
      ])
    } catch (err) {
      if (nav === pageNav.current) pageOpenFailed(err)
      return
    }
    if (nav !== pageNav.current) return

    // Use API response first, fall back to list data
    const productData = productRes?.product ?? fallbackData

    // Always clear any stale _product_data from the fetched template, then
    // inject the new product. Without the clear step, switching products
    // would show the prior product whenever the new product's API call
    // fails — the screenshot bug where selecting "Deep House..." still
    // rendered "Free Ambience Sample Pack Vol I".
    for (let i = 0; i < pageSections.length; i++) {
      if (pageSections[i].type !== "product") continue
      const { _product_data: _omit, ...restSettings } = (pageSections[i].settings ?? {}) as Record<string, unknown>
      pageSections[i] = {
        ...pageSections[i],
        settings: productData
          ? { ...restSettings, _product_data: productData }
          : restSettings,
      }
    }

    // Splice home's header/footer around this product template
    const merged = mergeWithHomeHeaderFooter(pageSections, homeHF)

    /** One commit: the page, the product it is showing, and its sections, under the page being left (see handlePageChange). */
    if (!importedTheme.current) holdCanvasStill(() => selectedProductIdRef.current === productId)
    setSelectedProductPage(productTitle)
    setSelectedProductId(productId)
    setCurrentPage("product")
    setSections(merged)
    updatePageUrl("product", slugForUrl)

    setSectionsLoading(false)
    setCanvasLoading(false)
  }

  // ── Editor-internal navigation ─────────────────────────────
  // Clicking a nav link / CTA inside a section while editing should NEVER
  // perform a full browser navigation (that would blow the user out of the
  // editor). Instead, map the href to the appropriate editor page/action.
  // External URLs and `#` anchors are simply ignored in edit mode.
  /**
   * ═══════════════════════════════════════════════════════════════════════
   *  READ AT THE MOMENT OF THE CLICK, NOT AT THE RENDER THAT BUILT THIS
   * ═══════════════════════════════════════════════════════════════════════
   * `handleEditorNavigate` has to stay stable: it is handed to every section
   * and SectionRenderer is memoized on it, so a new identity per render
   * re-renders the whole canvas on every keystroke. It was kept stable by
   * leaving things out of its dependency list, and the things left out went
   * stale.
   *
   * THAT IS WHAT BROKE THE LOGO. The decision reads which page is open, the
   * dependency list did not mention it, so the callback kept the page from
   * the editor's first render, which is home. Every link to "/" was then
   * answered "you are already there", from every page, for the rest of the
   * session: the logo did nothing, Home in the menu did nothing, Home in the
   * mobile drawer did nothing, while /about and /products worked, because no
   * other address reads the page.
   *
   * The two page handlers were left out for the same reason and were stale in
   * the same way — `handlePageChange` saves the page being left before it
   * leaves it, and a stale one saves whatever was open when the editor
   * started. The same refs the undo stack uses, assigned in render, so the
   * callback stays stable and still reads what is true now.
   */
  const currentPageRef = useRef(currentPage)
  currentPageRef.current = currentPage

  /**
   * ASK STORELIB'S UNDO, FOR ONE RUN. A run pushes one undo step before its
   * first change, as every AI edit always has, and that snapshot is also kept
   * here under the run's id with the page it was made on. The chat's Undo
   * puts it back: through the editor's own Undo when nothing has happened
   * since, and otherwise by restoring it with the page as it is now kept on
   * the redo stack, so Redo brings the run back. Only on the page the run
   * was made on; anywhere else it answers false and the chat stops offering.
   */
  const aiRuns = useRef(new Map<string, { page: string; before: { sections: SectionInstance[]; settings: ThemeSettingsValues } }>())
  const startAiRun = useCallback(
    (runId?: string) => {
      const before = snapshotNow()
      setUndoStack(prev => [...prev.slice(-30), before])
      setRedoStack([])
      if (runId) aiRuns.current.set(runId, { page: currentPageRef.current, before })
    },
    [snapshotNow],
  )
  const undoAiRun = useCallback(
    (runId: string) => {
      const run = aiRuns.current.get(runId)
      if (!run || run.page !== currentPageRef.current) return false
      aiRuns.current.delete(runId)
      const stack = undoRef.current
      if (stack[stack.length - 1] === run.before) {
        handleUndo()
        return true
      }
      setRedoStack(prev => [...prev, snapshotNow()])
      setSections(run.before.sections)
      setSettingsDraft(run.before.settings)
      setIsDirty(true)
      return true
    },
    [handleUndo, snapshotNow],
  )

  const pageChangeRef = useRef(handlePageChange)
  pageChangeRef.current = handlePageChange
  const selectedProductIdRef = useRef(selectedProductId)
  selectedProductIdRef.current = selectedProductId
  const selectProductRef = useRef(handleSelectProductPage)
  selectProductRef.current = handleSelectProductPage
  const productsRef = useRef(products)
  productsRef.current = products

  /**
   * THE PRODUCT THE PRODUCT PAGE SHOWS, READ AGAIN WHEN THE BUILDER COMES
   * BACK INTO VIEW. Stock, a price or an option is usually changed in
   * Products in another tab; the cards are read again then (loadCards), and
   * so is this product, so the canvas says what a visitor sees now: the
   * price, the options, Sold out, Only 3 left, delivery and pickup. Only its
   * `_product_data` is replaced, which is never saved (sectionsForSave), so
   * nothing becomes unsaved and nothing goes on the undo stack.
   */
  useEffect(() => {
    let last = Date.now()
    const again = async () => {
      const id = selectedProductIdRef.current
      if (document.visibilityState !== "visible" || Date.now() - last < 15_000 || !id || currentPageRef.current !== "product") return
      last = Date.now()
      try {
        const r = await fetch(`/api/website-builder/products?id=${encodeURIComponent(id)}`, { cache: "no-store" })
        if (!r.ok) return
        const fresh = ((await r.json()) as { product?: unknown } | null)?.product
        if (!fresh || selectedProductIdRef.current !== id || currentPageRef.current !== "product") return
        const key = JSON.stringify(fresh)
        setSections((prev) => {
          let changed = false
          const next = prev.map((sec) => {
            if (sec.type !== "product") return sec
            const s = (sec.settings ?? {}) as Record<string, unknown>
            if (JSON.stringify(s._product_data) === key) return sec
            changed = true
            return { ...sec, settings: { ...s, _product_data: fresh } }
          })
          return changed ? next : prev
        })
      } catch {}
    }
    const onBack = () => void again()
    document.addEventListener("visibilitychange", onBack)
    window.addEventListener("focus", onBack)
    return () => {
      document.removeEventListener("visibilitychange", onBack)
      window.removeEventListener("focus", onBack)
    }
  }, [])
  const customPagesRef = useRef(customPages)
  customPagesRef.current = customPages
  const inspectorRef = useRef(inspectorEnabled)
  inspectorRef.current = inspectorEnabled

  /**
   * ===========================================================================
   *  THE INSPECTOR, ON AND OFF, WITHOUT A POP
   * ===========================================================================
   * "When I click the inspector it should feel smooth; when I unclick it,
   * smooth." It flipped every section's outline, its Selected badge and the
   * section toolbar on the same frame as the press, and the frame carried a
   * render of the whole canvas.
   *
   * Now the press is felt and seen first: a tick under the finger and the
   * button's own change, which is CSS (`.wb-inspector` in globals.css). The
   * canvas follows through `data-wb-inspect` on the canvas's <main>:
   *
   *   off   the rings fade to nothing where they are ("leaving"), and only
   *         when they are invisible is the canvas drawn without them, as a
   *         transition so it never holds up a frame;
   *   on    the canvas is drawn with them as a transition, and they fade up
   *         once they are there ("entering").
   *
   * The attribute is written straight to the element: it is a styling hook,
   * and a render of this editor to change one attribute is the cost this is
   * getting rid of. INSPECT_FADE_MS is the one number the CSS fades over.
   */
  const canvasMainRef = useRef<HTMLElement | null>(null)
  const inspectTimer = useRef(0)
  const setInspectPhase = (phase: "on" | "off" | "entering" | "leaving") => {
    canvasMainRef.current?.setAttribute("data-wb-inspect", phase)
  }
  const toggleInspector = useCallback((e?: React.MouseEvent<HTMLElement>) => {
    const next = !inspectorRef.current
    hapticTap("soft")
    /* From now on the icon answers each change (`.wb-inspector[data-toggled]`). */
    e?.currentTarget.setAttribute("data-toggled", "")
    window.clearTimeout(inspectTimer.current)
    setInspectorEnabled(next)
    const still = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    if (next) {
      setInspectPhase("entering")
      startTransition(() => setCanvasInspecting(true))
      inspectTimer.current = window.setTimeout(() => setInspectPhase("on"), still ? 0 : INSPECT_FADE_MS + 80)
    } else {
      setInspectPhase(still ? "off" : "leaving")
      inspectTimer.current = window.setTimeout(() => {
        setInspectPhase("off")
        startTransition(() => setCanvasInspecting(false))
      }, still ? 0 : INSPECT_FADE_MS)
    }
  }, [])
  useEffect(() => () => window.clearTimeout(inspectTimer.current), [])

  /**
   * A finger on the canvas releases either of the two pins below: the one
   * taken when a section is selected, and the one taken while a page is
   * opening. A hold that fights a deliberate scroll is worse than whatever
   * it was absorbing. Declared here because both of them read it.
   */
  const touchingCanvas = useRef(false)

  /**
   * ═══════════════════════════════════════════════════════════════════════
   *  THE CANVAS STANDS STILL WHILE A PAGE IS ON ITS WAY
   * ═══════════════════════════════════════════════════════════════════════
   * A page is fetched, so there are a few hundred milliseconds between the
   * link being followed and the new page being on screen. Nothing is
   * supposed to move in them, and the report says something does: the scroll
   * jumps a little, and then the page changes.
   *
   * Selecting a section already holds the canvas for exactly this reason —
   * the page moving under somebody who asked for something that is not a
   * scroll. Following a link is the same ask and had no hold, so it gets the
   * same one, for longer, because this one waits for the network rather than
   * for a tap to settle.
   *
   * RELEASED WHEN THE PAGE ARRIVES, not when the timer ends: the effect that
   * puts the new page at the top clears this first, so the hold stops on the
   * same frame and the jump to the top is the one movement anybody sees. A
   * finger on the canvas releases it too, because a hold that fights a
   * deliberate scroll is worse than the nudge it was there to absorb.
   */
  const openingPage = useRef(false)
  const holdCanvasWhileOpening = useCallback(() => {
    const el = document.getElementById("wb-preview-root")
    if (!el) return
    openingPage.current = true
    touchingCanvas.current = false
    pinScroll(
      el,
      PIN_WHILE_OPENING_MS,
      (cb) => window.requestAnimationFrame(cb),
      () => Date.now(),
      () => touchingCanvas.current || !openingPage.current,
    )
  }, [])

  const handleEditorNavigate = useCallback((href: string, fromNav = false) => {
    /* WHERE it goes is decided by a pure function, so it can be asked the
       question without an editor around it: lib/website-builder/editor-navigation.
       Everything below is the doing. */
    const decision = resolveEditorHref(href, {
      currentPage: currentPageRef.current,
      inspectorEnabled: inspectorRef.current,
      fromNav,
      shopPath: SHOP_PATH,
      customPageKeys: customPagesRef.current.map((p) => p.key),
    })

    switch (decision.kind) {
      case "ignore":
        return

      /* A section of this page: the same scroll, curve and landing the live
         site has (lib/website-builder/section-motion), inside the canvas. */
      case "anchor": {
        const scroller = document.getElementById("wb-preview-root")
        const root = scroller ? themeRootOf(scroller.querySelector("[data-storelib-theme]")) : null
        if (scroller && root) scrollToHash(root, decision.id, { scroller })
        return
      }

      /* Home, while home is open. Nothing to load, so this is the one thing
         a browser does on a same page navigation: go to the top. Doing
         nothing at all is what read as a logo that does not work. */
      case "top": {
        const scroller = document.getElementById("wb-preview-root")
        scroller?.scrollTo({ top: 0, behavior: "smooth" })
        return
      }

      case "product": {
        const match = productsRef.current.find(
          (p) => p.slug === decision.slug || p.id === decision.slug,
        )
        if (match) {
          holdCanvasWhileOpening()
          selectProductRef.current(match.id, match.title)
        }
        return
      }

      case "page":
        /* The page that is already open, with no section named: what a browser
           does on a same page link, which is go to the top, as "top" does for
           home. Opening it again would only throw the scroll away. */
        if (decision.key === currentPageRef.current && !decision.anchor) {
          document.getElementById("wb-preview-root")?.scrollTo({ top: 0, behavior: "smooth" })
          return
        }
        /* Opened at its top as always, then taken to the section the hash
           names once it is drawn: see the effect after "you arrive at the top". */
        pendingAnchor.current = decision.anchor ?? null
        holdCanvasWhileOpening()
        pageChangeRef.current(decision.key as PageKey)
        return

      case "missing":
        setMissingPath(decision.path)
        return

      /* A button to one product's checkout: that product's real checkout, beside the editor, so the creator sees exactly where the buyer lands. */
      case "checkout":
        window.open(decision.href, "_blank", "noopener")
        return
    }
    /* Every branch returns, and the switch is exhaustive over the decision's
       kinds, so a kind added later is a type error here rather than a link
       that silently does nothing. */
  }, [])

  // ── Memoized section buckets ─────────────────────────────────
  /**
   * How many sections are neither chrome — for the empty-page prompt below.
   *
   * The editor used to split `sections` into header/body/footer here and lay
   * the three out itself, which meant it decided where a header went. It does
   * not any more: ThemePage owns that, and owns it for the published page
   * too, so the two cannot disagree about a header dragged into the middle.
   */
  const bodyCount = useMemo(
    () => sections.filter((s) => groupOf(s) === "template").length,
    [sections],
  )

  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  A SITE SAVED WITH TWO HEADERS IS OPENED WITH ONE
   * ═════════════════════════════════════════════════════════════════════════
   * An imported theme, or a site saved before section groups, can hold the
   * built-in header and a header written as a section file sitting on the
   * page under it, both drawn. When the page is open and its files are known
   * (a section file says it is a header by its kind, its name or its
   * markup), the header goes into the Header group and one header is drawn:
   * the creator's own when it has their work in it, otherwise the built-in.
   * The other is hidden, never removed, and its eye brings it back. The same
   * for footers. Saved with the next save, which copies the groups to every
   * page. Not an undo step: it is how the site was always meant to read.
   */
  useEffect(() => {
    if (loading || sectionsLoading || switchingPage.current) return
    /* An imported Shopify theme says where each section goes in its own group files: nothing here is a duplicate to hide. */
    if (compatInstall) return
    const fixed = repairChrome(sections, kindOfType)
    if (!fixed.changed) return
    setSections(fixed.sections)
    setIsDirty(true)
    const names = (ids: string[]) => ids.map((id) => {
      const s = fixed.sections.find((x) => x.id === id)
      return s ? sectionDisplayName(s, librarySchemas) : id
    })
    if (fixed.hidden.length > 0) {
      showNotification(`Hid ${names(fixed.hidden).join(" and ")}, a duplicate`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, kindOfType, loading, sectionsLoading, compatInstall])

  /*
    A SETTING SET TO WHAT IT ALREADY IS CHANGES NOTHING. Clicking the option
    that is already chosen, or leaving a number box without typing, used to
    make a new section (or a new theme, for every section on the page) with
    the same values in it: an undo step for nothing, the page marked unsaved,
    and the canvas drawing again. Now it is dropped here.
  */
  const updateSetting = (key: string, value: unknown) => {
    /* A finger still on a slider or a colour: drawn now, committed once when it lifts (lib/website-builder/live-settings.ts). */
    if (isLive()) {
      setLiveThemeSetting(key, value)
      deferLive(`theme:${key}`, () => updateSettingRef.current(key, value))
      return
    }
    /* The favicon is one value in Website settings and in an imported theme's own settings (lib/website-builder/favicon-sync.ts): a write of one carries the other. */
    const follows = faviconFollows(settingsRef.current as Record<string, unknown>, key, value)
    if (sameSettingValue(settingsRef.current[key], value) && !follows) return
    debouncedPushUndo()
    setSettingsDraft(prev => ({ ...prev, [key]: value, ...faviconFollows(prev as Record<string, unknown>, key, value) }))

    // If updating logo in theme settings, also sync to header section
    if (key in LOGO_SYNC_THEME_TO_HEADER) {
      const sectionKey = LOGO_SYNC_THEME_TO_HEADER[key]
      setSections(prev => prev.map(s =>
        s.type === "header" ? { ...s, settings: { ...s.settings, [sectionKey]: value } } : s
      ))
    }

    setIsDirty(true)
  }
  const updateSettingRef = useRef(updateSetting)
  updateSettingRef.current = updateSetting

  /* One function for the life of the editor, so the memoised canvas is not
     drawn again by every change anywhere else in the editor. */
  /** Sections, Pages and Theme: one segmented control, for the desktop sidebar and the phone sheet. */
  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  A TAB ANSWERS ON THE PRESS; ITS PANEL FOLLOWS WHEN IT IS READY
   * ═════════════════════════════════════════════════════════════════════════
   * Switching between Sections, Pages and Theme re-rendered this whole editor
   * in the click's own frame, and the Theme panel is a heavy form: the press
   * waited for it, which is the lag the owner felt. Now the tab you pressed
   * answers at once (`tabIntent`, an urgent update: the white indicator
   * slides under it) and the panel it asks for is a transition, so React draws
   * it in the background and the one you are leaving stays until the new one
   * is ready. No blank frame, no held click.
   *
   * The indicator moves on the CSS `translate` property, not `transform`:
   * globals.css flattens transforms inside a `.group` on touch screens, and
   * this control sits in the phone sheet too.
   *
   * Pages also puts the sidebar back in Sections mode. It left the mode
   * alone, so Theme, then Pages, then a page, landed on the global Theme
   * settings with the Theme tab lit, rather than on the page you picked.
   */
  const committedTab: "sections" | "pages" | "settings" = pageBrowserOpen ? "pages" : sidebarMode
  const [tabIntent, setTabIntent] = useState<"sections" | "pages" | "settings" | null>(null)
  /* Once the panel has caught up (or anything else moved the tab), the committed tab is the truth again. */
  useEffect(() => setTabIntent(null), [committedTab])
  const shownTab = tabIntent ?? committedTab

  const renderSidebarTabs = (after?: () => void) => {
    const index = shownTab === "sections" ? 0 : shownTab === "pages" ? 1 : 2
    const tab = (active: boolean) =>
      cn(
        "relative z-[1] flex items-center justify-center gap-1.5 h-8 rounded-md text-[13px] font-medium transition-colors duration-200",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )
    const go = (next: "sections" | "pages" | "settings") => {
      setTabIntent(next)
      startTransition(() => {
        if (next === "pages") {
          setSidebarMode("sections")
          setPageBrowserOpen(true)
          setSelectedPanel({ type: "pages" })
        } else if (next === "sections") {
          setSidebarMode("sections")
          setPageBrowserOpen(false)
          setSelectedPanel({ type: "pages" })
        } else {
          setSidebarMode("settings")
          setPageBrowserOpen(false)
          setSelectedPanel({ type: "theme_settings" })
        }
      })
      after?.()
    }
    return (
      <div role="tablist" aria-label="Sidebar" className="relative grid grid-cols-3 p-0.5 bg-neutral-100 rounded-lg">
        <span
          aria-hidden
          data-wb-tab-indicator=""
          className="pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc((100%-4px)/3)] rounded-md bg-white shadow-sm transition-[translate] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
          style={{ translate: `${index * 100}% 0` }}
        />
        <button
          type="button"
          role="tab"
          aria-selected={shownTab === "sections"}
          className={tab(shownTab === "sections")}
          onClick={() => go("sections")}
        >
          <Layers className="h-3.5 w-3.5" />
          Sections
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={shownTab === "pages"}
          className={tab(shownTab === "pages")}
          onClick={() => go("pages")}
        >
          <FileText className="h-3.5 w-3.5" />
          Pages
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={shownTab === "settings"}
          className={tab(shownTab === "settings")}
          onClick={() => go("settings")}
        >
          <Settings className="h-3.5 w-3.5" />
          Theme
        </button>
      </div>
    )
  }

  /**
   * A TAB CHANGE ON THE DESKTOP: the new panel starts at its top, and eases in
   * on opacity alone over 160ms. Only a TAB change: clicking a section is
   * still a cut, as asked (see "NO ANIMATION ON A PANEL SWAP" below), and
   * nothing moves sideways or down, so no scrollbar appears for a frame.
   * The Theme group that was open is shown open without replaying its
   * entrance when you come back to it.
   */
  useEffect(() => {
    if (sidebarMode !== "settings" || selectedPanel.type !== "section") return
    const id = (selectedPanel as { sectionId?: string }).sectionId
    if (!sections.some((s) => s.id === id)) setSelectedPanel({ type: "pages" })
  }, [sidebarMode, selectedPanel, sections])
  const desktopPanelRef = useRef<HTMLDivElement>(null)
  const desktopScrollRef = useRef<HTMLDivElement>(null)
  /* Clicking into a field the sidebar already shows never moves the sidebar (lib/website-builder/steady-focus.ts). */
  useEffect(() => installSteadyFocus(), [])
  const lastTabRef = useRef(committedTab)
  useLayoutEffect(() => {
    if (lastTabRef.current === committedTab) return
    lastTabRef.current = committedTab
    const scroller = desktopScrollRef.current
    if (scroller) scroller.scrollTop = 0
    const panel = desktopPanelRef.current
    if (!panel || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    panel.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 160, easing: "cubic-bezier(0.32, 0.72, 0, 1)" })
  }, [committedTab])

  const createMissingPage = useCallback((path: string) => {
    setNewPageTitle(pageTitleFromKey(path.replace(/^\//, "").replace(/\/$/, "")))
    setAddPageOpen(true)
  }, [])

  // Section settings change
  /* A name of the creator's own for a section, from the title of its settings; null goes back to its code's name. */
  const renameSection = (sectionId: string, label: string | null) => {
    pushUndo()
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s
      if (label) return { ...s, label }
      const { label: _gone, ...rest } = s
      return rest
    }))
    setIsDirty(true)
  }

  const updateSectionSetting = (sectionId: string, key: string, value: unknown) => {
    if (isLive()) {
      setLiveSectionSetting(sectionId, key, value)
      deferLive(`section:${sectionId}:${key}`, () => updateSectionSettingLatest.current(sectionId, key, value))
      return
    }
    const current = sectionsRef.current.find(s => s.id === sectionId)
    if (current && sameSettingValue(current.settings?.[key], value)) return
    /* Drawn by its section now, ahead of the deferred canvas (live-settings.ts, echoes). */
    if (current) echoSectionSetting(sectionId, key, value)
    debouncedPushUndo()
    setSections(prev => {
      const section = prev.find(s => s.id === sectionId)
      // If updating header section logo settings, also sync to theme settings
      if (section?.type === "header" && key in LOGO_SYNC_HEADER_TO_THEME) {
        const themeKey = LOGO_SYNC_HEADER_TO_THEME[key]
        setSettingsDraft(p => ({ ...p, [themeKey]: value }))
      }
      return prev.map(s =>
        s.id === sectionId ? { ...s, settings: { ...s.settings, [key]: value } } : s
      )
    })
    setIsDirty(true)
  }

  /**
   * ===========================================================================
   *  BLOCKS
   * ===========================================================================
   * The repeatable part of a section: FAQ entries, slides, logos, team
   * members. Every one of these records an undo step, because none of them
   * used to — adding, deleting or reordering a block simply could not be
   * taken back, and Undo went past them to whatever edit had last bothered to
   * record itself, which is worse than not offering it at all. That was fixed
   * for sections once and never for the blocks inside them.
   */

  /**
   * BLOCKS INSIDE BLOCKS. Every operation below takes a block's PATH (its
   * id, and its parents' ids above it, joined by "/": block-tree.ts), or a
   * bare id, which means the first block with that id: what the header's
   * link editor and Website Settings › Navigation still send. A static block
   * the template places and nobody has edited yet does not exist in the
   * data; editing it, or hiding it, is what creates it, as `static: true`.
   */
  const blockDefAt = (schema: SectionSchema | undefined, path: readonly string[], type: string): BlockSchema | undefined =>
    path.length <= 1 ? blockSchemaIn(schema, blockCatalog, type) : blockCatalog[type]
  const ownerOf = (schema: SectionSchema | undefined, section: SectionInstance, parent: readonly string[]) => {
    if (parent.length === 0) {
      return { owner: schema ? { name: schema.name, max_blocks: schema.max_blocks } : undefined, siblings: section.blocks ?? [] }
    }
    const hit = blockAt(section.blocks, parent)
    if (!hit) return null
    const def = blockDefAt(schema, parent, hit.block.type)
    return { owner: def ? { name: def.name, max_blocks: def.max_blocks } : undefined, siblings: hit.block.blocks ?? [] }
  }

  // Block settings change (debounced undo push, as for a section's own)
  const updateBlockSetting = (sectionId: string, blockKey: string, key: string, value: unknown, staticType?: string) => {
    const section = sectionsRef.current.find(s => s.id === sectionId)
    if (!section) return
    /* A static block nobody has edited yet is created by its first commit, so it is not drawn live. */
    if (isLive() && resolvePath(section.blocks, blockKey)) {
      setLiveBlockSetting(sectionId, blockKey, key, value)
      deferLive(`block:${sectionId}:${blockKey}:${key}`, () => updateBlockSettingLatest.current(sectionId, blockKey, key, value, staticType))
      return
    }
    const path = resolvePath(section.blocks, blockKey)
    if (!path) {
      if (!staticType) return
      const target = parsePath(blockKey)
      debouncedPushUndo()
      setSections(prev => prev.map(s =>
        s.id === sectionId
          ? { ...s, blocks: insertBlockAt(s.blocks, target.slice(0, -1), { id: target[target.length - 1], type: staticType, settings: { [key]: value }, static: true }) }
          : s
      ))
      setIsDirty(true)
      return
    }
    const block = blockAt(section.blocks, path)?.block
    if (block && sameSettingValue(block.settings?.[key], value)) return
    /* Drawn by its section now, ahead of the deferred canvas (live-settings.ts, echoes). */
    if (block) echoBlockSetting(sectionId, blockKey, key, value)
    debouncedPushUndo()
    setSections(prev => prev.map(s =>
      s.id === sectionId
        ? { ...s, blocks: updateAt(s.blocks, path, b => ({ ...b, settings: { ...b.settings, [key]: value } })) }
        : s
    ))
    setIsDirty(true)
  }

  const updateSectionSettingLatest = useRef(updateSectionSetting)
  updateSectionSettingLatest.current = updateSectionSetting
  const updateBlockSettingLatest = useRef(updateBlockSetting)
  updateBlockSettingLatest.current = updateBlockSetting

  const addBlock = (
    sectionId: string,
    blockType: string,
    initialSettings: Record<string, unknown> = {},
    opts: { parent?: string | null; preset?: SectionPreset } = {},
  ) => {
    const section = sectionsRef.current.find(s => s.id === sectionId)
    if (!section) return
    const schema = schemaFor(section.type, storelibSources, librarySchemas)
    const asked = opts.parent ? resolvePath(section.blocks, opts.parent) : []
    if (!asked) return
    let parent: string[] = asked
    /*
      INTO THE PRODUCT'S DETAILS, NOT UNDER THE PRODUCT. A theme's product
      section (Horizon's "Product information") is a media block and a Details
      block, both static, side by side; a block added to the section itself
      lands after both, under the picture and the details (the owner: "it
      puts the blocks under the section instead of in the information side").
      Added to the section, a block goes into its Details block when that
      block can hold it, as Shopify's editor offers it.
    */
    if (!opts.parent && !PRODUCT_DETAILS_BLOCK.test(blockType) && !/media|gallery/i.test(blockType)) {
      const details = (section.blocks ?? []).find((b) => b.static && PRODUCT_DETAILS_BLOCK.test(b.type))
      if (details) {
        const into = [details.id]
        const owner = ownerOf(schema, section, into)
        const inner = owner ? blockDefAt(schema, [...into, blockType], blockType) : null
        if (owner && inner && blockRoom(owner.owner, owner.siblings, inner, blockType, section, { depth: 2, size: 1, height: 1 }).ok) parent = into
      }
    }
    const at = ownerOf(schema, section, parent)
    if (!at) return
    const def = blockDefAt(schema, [...parent, blockType], blockType)
    /**
     * A NEW BLOCK ARRIVES FILLED IN. Its defaults come from the block's own
     * schema, the same way a section's do when it is added, then the preset
     * picked in Add block, with the blocks that preset holds. Without this
     * the preset blocks had their question and answer and a block you added
     * by hand was blank, which reads as the section being broken rather than
     * as a row waiting to be typed into.
     */
    const children = freshBlocks(opts.preset?.blocks, newBlockId)
    const newBlock: BlockInstance = {
      id: newBlockId(),
      type: blockType,
      settings: { ...blockDefaults(def), ...(opts.preset?.settings ?? {}), ...initialSettings },
      ...(children.length ? { blocks: children } : {}),
    }
    const room = blockRoom(at.owner, at.siblings, def, blockType, section, { depth: parent.length + 1, size: countAll([newBlock]), height: depthOf([newBlock]) })
    if (!room.ok) { toast.error(room.reason); return }
    pushUndo()
    setSections(prev => prev.map(s =>
      s.id === sectionId ? { ...s, blocks: insertBlockAt(s.blocks, parent, newBlock) } : s
    ))
    setSelectedBlockId(pathKey([...parent, newBlock.id]))
    setIsDirty(true)
  }

  /**
   * A PRODUCT'S BLOCKS STAY IN ITS DETAILS COLUMN (lib/website-builder/
   * product-details-rule.ts). A page saved with blocks at a product section's
   * own level (they were drawn under the product), and anything a drag, an
   * undo or Storelib AI puts there, is moved into the Details block, so the
   * sidebar, the canvas and the website agree. Not an edit of its own: it is
   * saved with the next one, and the website already draws it this way.
   */
  useEffect(() => {
    let changed = false
    const next = sections.map((s) => {
      const schema = schemaFor(s.type, storelibSources, librarySchemas)
      const takes = (detailsType: string, type: string) => {
        const def = blockSchemaIn(schema, blockCatalog, detailsType)
        return addableBlocks({ accepts: def?.accepts }, blockCatalog).some((k) => k.type === type)
      }
      const homed = blocksIntoDetails(s.type, s.blocks, takes, schema?.statics ?? [])
      if (!homed) return s
      changed = true
      /* The block being edited keeps being edited, at its new address. */
      const details = homed.find((b) => b.static && PRODUCT_DETAILS_BLOCK.test(b.type))
      const kept = new Set(homed.map((b) => b.id))
      const moved = (s.blocks ?? []).filter((b) => !kept.has(b.id)).map((b) => b.id)
      if (details) setSelectedBlockId((key) => (key && moved.includes(key) ? pathKey([details.id, key]) : key))
      return { ...s, blocks: homed }
    })
    if (changed) setSections(next)
  }, [sections, storelibSources, librarySchemas, blockCatalog])

  /** The same block again, right below it, with its own ids all the way down. */
  const duplicateBlock = (sectionId: string, blockKey: string) => {
    const section = sectionsRef.current.find(s => s.id === sectionId)
    if (!section) return
    const path = resolvePath(section.blocks, blockKey)
    const hit = path ? blockAt(section.blocks, path) : null
    if (!path || !hit || hit.block.static) return
    const schema = schemaFor(section.type, storelibSources, librarySchemas)
    const parent = path.slice(0, -1)
    const at = ownerOf(schema, section, parent)
    if (!at) return
    const copy = cloneTree(hit.block, newBlockId)
    const room = blockRoom(at.owner, at.siblings, blockDefAt(schema, path, hit.block.type), hit.block.type, section, { depth: path.length, size: countAll([copy]), height: depthOf([copy]) })
    if (!room.ok) { toast.error(room.reason); return }
    pushUndo()
    setSections(prev => prev.map(s => s.id !== sectionId ? s : {
      ...s,
      blocks: withChildren(s.blocks, parent, (children) => {
        const next = [...children]
        next.splice(next.findIndex(b => b.id === hit.block.id) + 1, 0, copy)
        return next
      }),
    }))
    setSelectedBlockId(pathKey([...parent, copy.id]))
    setIsDirty(true)
  }

  /**
   * One level in its new order. A list hands back only the blocks it can
   * move; the static ones at that level are kept, since their place is in
   * the template, not in this order.
   */
  const reorderBlocks = (sectionId: string, blocks: BlockInstance[], parentKey: string | null = null) => {
    const section = sectionsRef.current.find(s => s.id === sectionId)
    const parent = parentKey ? (section ? resolvePath(section.blocks, parentKey) : null) : []
    if (!parent) return
    pushUndo()
    setSections(prev => prev.map(s =>
      s.id === sectionId
        ? { ...s, blocks: withChildren(s.blocks, parent, (children) => [...children.filter(c => c.static && !blocks.some(b => b.id === c.id)), ...blocks]) }
        : s
    ))
    setIsDirty(true)
  }

  const removeBlock = (sectionId: string, blockKey: string) => {
    const section = sectionsRef.current.find(s => s.id === sectionId)
    const path = section ? resolvePath(section.blocks, blockKey) : null
    if (!section || !path || blockAt(section.blocks, path)?.block.static) return
    pushUndo()
    // Everything inside it goes with it, and so do header links whose parent_id names it.
    setSections(prev => prev.map(s => (s.id === sectionId ? { ...s, blocks: removeAt(s.blocks, path) } : s)))
    const key = pathKey(path)
    setSelectedBlockId(prev => (prev && (prev === key || prev === blockKey || prev.startsWith(`${key}/`)) ? null : prev))
    setIsDirty(true)
  }

  /**
   * A block to another level: into a group, or out of one. Its children go
   * with it. Refused, with nothing changed, when the result would break the
   * tree's own rules (depth, a block inside itself), which the tree checks too.
   */
  const moveBlockTo = (sectionId: string, blockKey: string, parentKey: string | null, index?: number) => {
    const section = sectionsRef.current.find(s => s.id === sectionId)
    const path = section ? resolvePath(section.blocks, blockKey) : null
    const found = section && path ? blockAt(section.blocks, path) : null
    if (!section || !path || !found || found.block.static) return
    const parent = parentKey ? resolvePath(section.blocks, parentKey) : []
    if (!parent) return
    if (pathKey(parent) === pathKey(path) || pathKey(parent).startsWith(`${pathKey(path)}/`)) return
    if (parent.length + depthOf([found.block]) > MAX_BLOCK_DEPTH) return
    pushUndo()
    hapticTap("medium")
    setSections(prev => prev.map(s => (s.id === sectionId ? { ...s, blocks: insertBlockAt(removeAt(s.blocks, path), parent, found.block, index) } : s)))
    const was = pathKey(path)
    const now = pathKey([...parent, found.block.id])
    setSelectedBlockId(prev => (prev === was || prev === blockKey ? now : prev && prev.startsWith(`${was}/`) ? now + prev.slice(was.length) : prev))
    setIsDirty(true)
  }

  /** Kept, not drawn: hiding a block is not deleting it. A static block nobody has edited is created hidden. */
  const toggleBlockHidden = (sectionId: string, blockKey: string, staticType?: string) => {
    const section = sectionsRef.current.find(s => s.id === sectionId)
    if (!section) return
    const path = resolvePath(section.blocks, blockKey)
    pushUndo()
    if (!path) {
      if (!staticType) return
      const target = parsePath(blockKey)
      setSections(prev => prev.map(s =>
        s.id === sectionId
          ? { ...s, blocks: insertBlockAt(s.blocks, target.slice(0, -1), { id: target[target.length - 1], type: staticType, settings: {}, static: true, hidden: true }) }
          : s
      ))
    } else {
      setSections(prev => prev.map(s =>
        s.id === sectionId
          ? {
              ...s,
              blocks: updateAt(s.blocks, path, (b) => {
                if (b.hidden) { const { hidden: _shown, ...rest } = b; return rest }
                return { ...b, hidden: true }
              }),
            }
          : s
      ))
    }
    setIsDirty(true)
  }

  const toggleSectionHidden = (sectionId: string) => {
    // Hiding a section changes the page as much as deleting one does, and it
    // was the one change Undo could not take back.
    pushUndo()
    /* Showing a header hides the one that is drawn: never two (lib/storelib-theme/section-groups.ts). */
    setSections(prev => toggleShown(prev, sectionId, kindOfType))
    setIsDirty(true)
  }

  const removeSection = (sectionId: string) => {
    pushUndo()
    /* The header or the footer itself, deleted: the next save takes it off every page. */
    const gone = sectionsRef.current.find((s) => s.id === sectionId)
    if (gone) {
      for (const kind of ["header", "footer"] as const) {
        if (groupOf(gone) !== kind || !isKind(gone, kind, kindOfType)) continue
        const others = sectionsRef.current.filter((s) => s.id !== sectionId && groupOf(s) === kind && isKind(s, kind, kindOfType))
        if (others.length === 0) chromeRemoved.current[kind] = true
      }
      /* The last thing in the Overlay group gone: the other pages lose it too on the next save. */
      if (groupOf(gone) === "overlay" && !sectionsRef.current.some((s) => s.id !== sectionId && groupOf(s) === "overlay")) chromeRemoved.current.overlay = true
    }
    setSections(prev => prev.filter(s => s.id !== sectionId))
    if (selectedSectionId === sectionId) {
      setSelectedPanel({ type: "pages" })
    }
    setIsDirty(true)
  }

  /**
   * `fromCanvas` is the toolbar over the canvas. A press there never moves
   * the canvas: the copy lands directly under the section that was pressed,
   * and the person is looking at the place it lands. From the layer list it
   * is revealed, and only if none of it is on screen.
   */
  const duplicateSection = (sectionId: string, fromCanvas = false) => {
    pushUndo()
    const idx = sections.findIndex(s => s.id === sectionId)
    if (idx === -1) return
    const orig = sections[idx]
    /**
     * ITS BLOCKS ARE COPIED, NOT SHARED. A spread copies the reference to the
     * blocks array and every block object inside it, so the duplicate and the
     * original were the same twelve blocks under the same twelve ids: a
     * `data-block-id` that matched two places on the page, and a click on
     * either selecting whichever the canvas found first.
     */
    const copy: SectionInstance = {
      ...orig,
      id: `${orig.type}-${Date.now()}`,
      name: `${orig.name} (copy)`,
      blocks: (orig.blocks ?? []).map((b) => cloneTree(b, newBlockId)),
    }
    const next = [...sections]
    next.splice(idx + 1, 0, copy)
    setSections(next)
    setIsDirty(true)
    if (fromCanvas) return
    // Two frames: one for React's commit, one for the layout after it.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => revealSection(copy.id))
    })
  }

  const addSection = (type: string, presetIndex = 0, replaceConfirmed = false) => {
    const schema = librarySchemas[type]
    if (!schema) return
    /**
     * WHERE IT GOES, BY WHAT IT IS (lib/storelib-theme/section-groups.ts). An
     * announcement bar goes in the Header group above the header from
     * wherever it was added; a header is the header. A header chosen while
     * one is drawn asks first, and the one it replaces is hidden, not deleted.
     */
    const kind = kindOfType(type)
    const groups = sectionGroupsFor(schema as never, { type, kind })
    if (kind && !replaceConfirmed) {
      const current = visibleOfKind(sections, kind, kindOfType)
      if (current) {
        setPendingReplace({ type, presetIndex, kind, current: sectionDisplayName(current, librarySchemas), next: schema.name })
        return
      }
    }
    pushUndo()
    const preset = schema.presets?.[presetIndex] ?? schema.presets?.[0]
    const newSection: SectionInstance = {
      id: `${type}-${Date.now()}`,
      type,
      name: schema.name,
      settings: newSectionSettings(type, preset?.settings, storelibSources),
      /* The preset's blocks as this section's own: new ids, so adding the same preset twice is two sets of blocks, not one shared. */
      blocks: freshBlocks(preset?.blocks, newBlockId),
      hidden: false,
    }
    /**
     * A canvas gap counts body sections, so it is turned into a list index
     * here — where the list is — rather than in the canvas, which does not
     * know how much chrome is above it. Then it is counted inside the page's
     * own sections, which is where placeSection takes it, so an insert can
     * never land above the header or below the footer.
     */
    const insertAt =
      canvasInsertAt != null ? bodyGapToListIndex(sections, canvasInsertAt) : pendingInsertIndex
    const before = splitGroups(sections)
    const requested: SectionGroup = canvasInsertAt != null ? "template" : addGroup
    const placed = placeSection(sections, newSection, {
      groups,
      kind,
      group: requested,
      at: requested === "template" && insertAt != null ? Math.max(0, Math.min(before.template.length, insertAt - before.header.length)) : null,
      kindOfType,
    })
    const next = placed.sections
    setPendingInsertIndex(null)
    setCanvasInsertAt(null)
    if (kind) chromeRemoved.current[kind] = false
    if (placed.replaced.length > 0) {
      showNotification(`Replaced the ${kind}. Old one hidden.`)
    }
    /**
     * Where every section is BEFORE this one goes in, so the canvas can open
     * the page where it lands instead of jumping (lib/website-builder/
     * section-arrival.ts). The canvas plays it in the frame the section is
     * committed, and brings it on screen if it is not.
     */
    const scroller = document.getElementById("wb-preview-root")
    arrivalRef.current = scroller
      ? {
          id: newSection.id,
          before: measureSectionTops(scroller),
          /* On a phone the sheet is about to rise over the foot of the canvas: the section goes above it. */
          bottomInset: isMobileView ? sheetCoverAbovePeek(document.documentElement.style) : undefined,
        }
      : null
    setSections(next)
    setSelectedPanel({ type: "section", sectionId: newSection.id })
    quietPanel.current = `section:${newSection.id}`
    /* Its settings are where the sidebar is looking, whichever tab it was on. */
    setPageBrowserOpen(false)
    setSidebarMode("sections")
    setIsDirty(true)
    if (!scroller) revealSection(newSection.id)
    if (isMobileView) riseOnAdded(newSection.id)
  }

  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  ON A PHONE, A SECTION JUST ADDED COMES UP WITH ITS SETTINGS OPEN
   * ═════════════════════════════════════════════════════════════════════════
   * "It adds it smoothly and takes me to it, but not with the mobile bottom
   * sheet open on that section's settings; it just shows me the section
   * with it selected. It then needs to open, from the bottom, smoothly, the
   * sections mobile bottom sheet."
   *
   * In order, one thing at a time. The library closes (it started on the
   * tap). The section is selected the moment it is added, so the sheet's
   * panel changes to its settings then, while the sheet is still down at its
   * peek and that panel is out of sight. The canvas brings the section into
   * the room the risen sheet will leave (the arrival's `bottomInset`, from
   * the number the sheet publishes). Then, with the library gone and the
   * canvas still, the sheet rises to the stop it always opens to: one
   * movement, already on the panel it stays on, over a page that does not
   * move under it. A sheet that was already open goes back to that stop, so
   * it does not cover the section it was brought up for.
   */
  const cancelRise = useRef<(() => void) | null>(null)
  useEffect(() => () => cancelRise.current?.(), [])
  const riseOnAdded = (sectionId: string) => {
    cancelRise.current?.()
    cancelRise.current = afterAddSettles(
      { waitMs: sheetMoveMs(), scroller: document.getElementById("wb-preview-root"), sectionId },
      () => {
        cancelRise.current = null
        /* The library was opened again in the meantime: it owns the bottom of the screen. */
        if (addSectionOpenRef.current) return
        setAiOpen(false)
        setMobileSidebarOpen(true)
        setSheetRestKey((n) => n + 1)
      },
    )
  }

  // Add custom page
  const handleAddCustomPage = async () => {
    if (!newPageTitle.trim()) return
    setAddingPage(true)

    /**
     * ═════════════════════════════════════════════════════════════════════
     *  THE NAME BECOMES THE ADDRESS, SO IT HAS TO BE A FREE ONE
     * ═════════════════════════════════════════════════════════════════════
     * The key was a title with its spaces and punctuation taken out, and
     * nothing checked what came back. A page called "Home" made the key
     * "home" and saved a header and a footer over the draft of the home
     * page. A page called "!!!" made an empty key, which the API refuses
     * and the failure was swallowed, so the page appeared in the switcher
     * and existed nowhere.
     */
    const pageKey = toPageSlug(newPageTitle) as PageKey
    const taken =
      !pageKey ||
      pageKeyFromSegment(pageKey) === null ||
      BUILT_IN_PAGE_KEYS.has(pageKey) ||
      customPages.some((p) => p.key === pageKey)
    if (taken) {
      showNotification(
        pageKey && (BUILT_IN_PAGE_KEYS.has(pageKey) || customPages.some((p) => p.key === pageKey))
          ? `There is already a page at /${pageKey}.`
          : "Use letters or numbers in the name.",
        "error",
      )
      setAddingPage(false)
      return
    }
    const newPage = { id: pageKey, name: newPageTitle.trim(), key: pageKey }

    // Reuse the current session's header/footer so new pages inherit the
    // exact same nav links, logo, colors, and footer that the rest of the
    // site already uses. Falling back to the schema preset would show a
    // blank factory header on the new page until the next sync, breaking
    // the "universal header" contract.
    // The whole Header and Footer groups, announcement bars included. A site
    // whose header was deleted gets a page without one, as every other page.
    const currentGroups = splitGroups(sections)
    const headerSchema = SECTION_SCHEMAS["header"]
    const footerSchema = SECTION_SCHEMAS["footer"]
    const defaultSections: SectionInstance[] = []
    const freshSite = sections.length === 0
    if (currentGroups.header.length > 0) {
      defaultSections.push(...currentGroups.header)
    } else if (freshSite && headerSchema) {
      defaultSections.push({
        id: `header-${Date.now()}`,
        type: "header",
        name: headerSchema.name,
        settings: headerSchema.presets?.[0]?.settings ?? {},
        blocks: headerSchema.presets?.[0]?.blocks ?? [],
        hidden: false,
      })
    }
    if (currentGroups.footer.length > 0) {
      defaultSections.push(...currentGroups.footer)
    } else if (freshSite && footerSchema) {
      defaultSections.push({
        id: `footer-${Date.now() + 1}`,
        type: "footer",
        name: footerSchema.name,
        settings: footerSchema.presets?.[0]?.settings ?? {},
        blocks: footerSchema.presets?.[0]?.blocks ?? [],
        hidden: false,
      })
    }

    /* Shopify's default page template: the header, a Page content section
       holding the title just typed, and the footer (lib/website-builder/shop-page). */
    const starterSections = customPageSections(
      defaultSections.find(s => s.type === "header"),
      defaultSections.find(s => s.type === "footer"),
      newPageTitle,
      `page_content-${Date.now()}`,
    )

    // Save sections for the new page. A page that did not save is not a
    // page, so the switcher is not told about one.
    try {
      const res = await fetch(`/api/website-builder/themes/${installId}/sections`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_key: pageKey, sections: starterSections, mode: "draft" }),
      })
      if (!res.ok) throw new Error(String(res.status))
    } catch {
      showNotification("Could not create the page. Try again.", "error")
      setAddingPage(false)
      return
    }

    forgetPage(pageKey)
    setCustomPages(prev => [...prev, newPage])
    setAddPageOpen(false)
    setNewPageTitle("")
    setAddingPage(false)

    // Navigate to new page
    setSectionsLoading(true)
    setCurrentPage(pageKey)
    setSelectedPanel({ type: "pages" })
    setPageBrowserOpen(false)
    setSections(starterSections)
    setSectionsLoading(false)
  }

  /**
   * ===========================================================================
   *  DELETING A PAGE SOMEBODY MADE
   * ===========================================================================
   * The row is taken out of the list AND out of the database. It used to be
   * only the list: the page came back on the next reload, and if the site had
   * been published it stayed live at its own address with no way to reach it
   * from the editor. The switcher asks before calling this.
   *
   * If the page being deleted is the one on screen, the editor goes home
   * first, because the alternative is editing a page that no longer exists.
   */
  const handleDeletePage = useCallback(async (key: string) => {
    const before = customPages
    // Out of the list at once: the click has to land, and the request is the
    // slow part. Put back below if the server refuses.
    setCustomPages(prev => prev.filter(p => p.key !== key))
    if (currentPage === key) await handlePageChange("home")
    /* Kept as it was left (pageCache): a page made again under this name starts from what the server has. */
    forgetPage(key)

    try {
      const res = await fetch(
        `/api/website-builder/themes/${installId}/sections?page=${encodeURIComponent(key)}`,
        { method: "DELETE" },
      )
      if (!res.ok) throw new Error(String(res.status))
      showNotification("Page deleted")
    } catch {
      setCustomPages(before)
      showNotification("Could not delete the page. Try again.", "error")
    }
  }, [customPages, currentPage, handlePageChange, installId, showNotification, forgetPage])

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); handleUndo() }
      if ((e.metaKey || e.ctrlKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); handleRedo() }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [handleUndo, handleRedo])

  /**
   * Every change puts the draft ahead of the public site.
   *
   * Derived from `isDirty` going true rather than added to the twelve handlers
   * that set it — twelve call sites is twelve chances for the next one to
   * forget, and forgetting here means a creator is told they have published
   * when they have not.
   */
  useEffect(() => {
    if (isDirty) setUnpublished(true)
  }, [isDirty])

  /**
   * ===========================================================================
   *  AUTOSAVE — THE DRAFT ONLY, NEVER THE LIVE SITE
   * ===========================================================================
   * `handleSave` PUBLISHES when the theme is live. Autosave calling it would
   * push every keystroke to the public site: a half-written headline visible to
   * customers, and no way to work on something without shipping it. So this
   * calls `saveDraft` directly and publishing stays a decision somebody makes.
   *
   * Debounced rather than run on every change. A drag produces a change per
   * frame, and a request per frame would be a request storm that arrives out of
   * order — the last one to land wins, and that is not necessarily the last one
   * sent.
   *
   * Not while a save is already going, and not while the AI is mid-run: both
   * would write a state nobody has finished producing.
   */
  useEffect(() => {
    /* Not over a version GitHub just wrote, until the creator picks (syncConflict). */
    if (!isDirty || saving || publishing || loading || syncConflict) return
    const timer = setTimeout(() => {
      // Checked when it FIRES, not when it was scheduled: the switch may have
      // started in between, and that is the whole window this guards.
      if (switchingPage.current) return
      void saveDraft({ quiet: true })
    }, AUTOSAVE_DELAY_MS)
    return () => clearTimeout(timer)
    // `saveDraft` is redefined on every render and is not a dependency worth
    // tracking: what should restart the timer is a CHANGE, not a re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, saving, publishing, loading, sections, settingsDraft, syncConflict])

  // Save header/footer to all pages so they stay universal
  const syncHeaderFooterToAllPages = async (mode: "draft" | "publish" = "draft") => {
    /**
     * THE HEADER AND FOOTER GROUPS, whole: an announcement bar above the
     * header, a header written as a section file, a header hidden because
     * another replaced it. An empty group is sent only when the creator
     * deleted the header (or footer) here; otherwise an empty one means
     * "nothing to copy", and the other pages keep theirs.
     */
    const g = splitGroups(sections)
    const headerGroup = g.header.length > 0 ? g.header : chromeRemoved.current.header ? [] : null
    const footerGroup = g.footer.length > 0 ? g.footer : chromeRemoved.current.footer ? [] : null
    /* The Overlay group is the site's too: a popup or a bottom bar is on every page, as Shopify's groups are. */
    const overlayGroup = g.overlay.length > 0 ? g.overlay : chromeRemoved.current.overlay ? [] : null
    if (!headerGroup && !footerGroup && !overlayGroup) return

    // Fetch all pages for this install
    const res = await fetchWithin(`/api/website-builder/themes/${installId}/sections/sync-global`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        header: null,
        footer: null,
        header_group: headerGroup,
        footer_group: footerGroup,
        overlay_group: overlayGroup,
        current_page: currentPage,
        mode,
      }),
    }, 20_000).catch(() => null)
    if (!res?.ok) {
      console.warn("Failed to sync header/footer to other pages")
    }
  }

  // Strip runtime-only `_product_data` that the preview injects into
  // product sections — we don't want a specific product's data baked into
  // the page template because every product page renders from the same
  // saved template and injects its own data at view time.
  const sectionsForSave = (input: SectionInstance[]): SectionInstance[] =>
    input.map(sec => {
      if (!sec.settings || !("_product_data" in sec.settings)) return sec
      const { _product_data: _omit, ...rest } = sec.settings as Record<string, unknown>
      return { ...sec, settings: rest }
    })

  /**
   * ===========================================================================
   *  A SAVE ASKS THE SERVER FOR A NEW COVER
   * ===========================================================================
   * The website page's cover is two screenshots of this site's saved home
   * page — a laptop's width and a phone's — taken by a real browser on the
   * server after the saving has stopped (lib/website-builder/cover-refresh.ts,
   * app/api/website-builder/themes/[installId]/cover).
   *
   * This used to photograph the editor's own canvas in the page, three ways
   * wrong in turn: blank below the header, because the theme's entrance
   * animation replayed inside the picture; phone-shaped from a phone; and
   * then a hidden copy of the page to work round that. The server opens the
   * page the way a visitor does, so none of it applies, and it does not
   * matter which page of the site is open here or which device this is.
   */
  const snapshotAfterSave = () => {
    scheduleCoverRefresh(installId)
  }

  const saveDraft = async (options: { quiet?: boolean; keepMine?: boolean } = {}): Promise<boolean> => {
    /* Never over GitHub's version while the creator has not picked (syncConflict), unless saving IS their pick. */
    if (syncConflictRef.current) {
      if (!options.keepMine) {
        showNotification("Pick which version to keep first", "error")
        return false
      }
      setSyncConflict(null)
    }
    /* Timed for /admin/performance (lib/perf/mark): how long a save took, or that it failed. */
    const t0 = performance.now()
    try {
      /*
        THE THREE WRITES AT ONCE (round 25), as Publish already sends them:
        the settings, this page, and the header and footer on every other
        page are different rows, and each was waited for before the next
        was sent, three round trips in front of every save and of every page
        switch with something unsaved. Each is a whole value written again
        (idempotent), so one that fails leaves the edit unsaved and the next
        save sends all three again; what is said is the first that failed.
      */
      const [settingsRes, sectionsRes] = await Promise.all([
        putJsonWithRetry(`/api/website-builder/themes/${installId}/settings`, { draft_settings: settingsDraft }),
        putJsonWithRetry(`/api/website-builder/themes/${installId}/sections`, { page_key: currentPage, sections: sectionsForSave(sections), mode: "draft" }),
        // Sync header/footer to all other pages
        syncHeaderFooterToAllPages("draft"),
      ])
      if (!settingsRes.ok) {
        perfFail("/step/editor/save", `http_${settingsRes.status}`)
        const d = await settingsRes.json().catch(() => ({}))
        setSaveProblem(explainSaveProblem(settingsRes.status, d))
        return false
      }

      if (!sectionsRes.ok) {
        perfFail("/step/editor/save", `http_${sectionsRes.status}`)
        const d = await sectionsRes.json().catch(() => ({}))
        // A FAILED autosave is not quiet. Silence here is how somebody keeps
        // working for an hour against a server that stopped accepting writes.
        setSaveProblem(explainSaveProblem(sectionsRes.status, d, sectionsForSave(sections)))
        return false
      }

      setIsDirty(false)
      setSaveProblem(null)
      snapshotAfterSave()
      /**
       * Autosave says nothing. A toast every couple of seconds is noise that
       * trains somebody to ignore the one that matters — the bar already shows
       * the state.
       */
      perfStep("/step/editor/save", performance.now() - t0)
      if (!options.quiet) showNotification("Saved")
      return true
    } catch {
      perfFail("/step/editor/save", typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "network")
      setSaveProblem(explainSaveProblem(typeof navigator !== "undefined" && navigator.onLine === false ? null : 503, null))
      return false
    }
  }

  const publishChanges = async () => {
    /* Two versions of the same page: which one goes live is the creator's to say first. */
    if (syncConflictRef.current) {
      showNotification("Pick which version to keep first", "error")
      return
    }
    setPublishing(true)
    try {
      /*
        1. Save what is in the editor and not saved yet. Only then: with
        nothing unsaved, the draft on the server already is this editor's
        work, plus whatever GitHub or an agent wrote since, and writing this
        copy again would put the editor's older copy of the settings and
        this page over a push it had not read yet. Publish publishes the
        draft, exactly. The writes go to different rows, so at the same time;
        each one ends (lib/website-builder/save-request).
      */
      if (isDirty) {
      const [settingsRes, sectionsRes] = await Promise.all([
        putJsonWithRetry(`/api/website-builder/themes/${installId}/settings`, { draft_settings: settingsDraft }),
        putJsonWithRetry(`/api/website-builder/themes/${installId}/sections`, { page_key: currentPage, sections: sectionsForSave(sections), mode: "draft" }),
        syncHeaderFooterToAllPages("draft"),
      ])
      if (!settingsRes.ok) {
        const d = await settingsRes.json().catch(() => ({}))
        setSaveProblem(explainSaveProblem(settingsRes.status, d))
        setPublishing(false)
        return
      }
      if (!sectionsRes.ok) {
        const d = await sectionsRes.json().catch(() => ({}))
        setSaveProblem(explainSaveProblem(sectionsRes.status, d, sectionsForSave(sections)))
        setPublishing(false)
        return
      }
      }

      /*
        2. Publish: every page's draft, the settings, the saved section files
           and the live switch, in one step on the server. It ends too: a
           publish that has not answered in PUBLISH_MS is said, not spun on
           forever, and pressing Publish again is safe (the server writes it
           all or nothing).
      */
      const res = await fetchWithin(`/api/website-builder/themes/${installId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish" }),
      }, PUBLISH_MS)

      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        showNotification(d.error ?? "Failed to publish", "error")
        setPublishing(false)
        return
      }

      // Update local install status so subsequent saves also publish
      if (install) {
        setInstall({ ...install, status: "published", published_at: new Date().toISOString() })
      }

      setIsDirty(false)
      setUnpublished(false)
      setHasPublished(true)
      setAgentNote(null)
      snapshotAfterSave()
      showNotification("Changes saved and published")
      /* Nothing left to publish now; the server says so, and the GitHub line goes with it. */
      void refreshSync()
    } catch (e) {
      showNotification(
        e instanceof LoadTimeout
          ? "Publishing is taking longer than it should. Your edits are saved. Press Publish again in a moment."
          : "Failed to publish",
        "error",
      )
    }
    setPublishing(false)
  }

  const handleSave = async () => {
    setSaving(true)
    if (install?.status === "published") {
      await publishChanges()
    } else {
      await saveDraft()
    }
    setSaving(false)
  }

  const activeThemeSettings: ThemeSettingsValues = settingsDraft

  /**
   * ===========================================================================
   *  THE CONTROL ANSWERS THE FINGER; THE CANVAS CATCHES UP
   * ===========================================================================
   * Every control in the editor ends in the same place: a setting changes and
   * the canvas re-renders every section of the page to show it. That is the
   * right thing to happen and it is not cheap — it is a page — and while it
   * happens nothing else can run, because it is all one render.
   *
   * So on a phone, dragging a slider in the sheet meant a page re-render
   * between one touch and the next, and the thumb fell behind the finger.
   * Reported as the sheet lagging, which it was, just not because of anything
   * the sheet does.
   *
   * These two are the canvas's copy of the state, and they are deferred.
   * React renders the urgent update first — the control, the number beside
   * it, the sheet — and paints it; the canvas is re-rendered afterwards, at
   * low priority, and if another touch arrives in the meantime that work is
   * thrown away and started again from the newer value. EditorCanvasPage is
   * memoised, so an unchanged deferred value costs nothing at all.
   *
   * What it buys is that the canvas can be up to a frame or two behind
   * during a drag. That is the trade, and it is the right way round: a
   * preview catching up is invisible, a control that stutters is the whole
   * feel of the product.
   *
   * Not `selectedSectionId`, and not `inspectorEnabled`. Selecting a section
   * has to light up the canvas at once, because the tap WAS on the canvas.
   */
  const canvasThemeSettings = useDeferredValue(activeThemeSettings)
  /*
    EXCEPT ACROSS A PAGE CHANGE. `handlePageChange` puts the new page and its
    sections in one commit so no frame shows one page's name over another's
    content; deferring the sections alone undid that, and for a frame or two
    the canvas drew the page being left under the page being opened
    (scripts/check-page-switch.mjs, "the page's name never moves ahead of its
    content"). The deferred copy is used only while it belongs to the page on
    screen; a page's first render takes its sections at once.
  */
  const sectionsOnPage = useMemo(
    () => ({ page: `${currentPage}|${selectedProductPage ?? ""}`, sections }),
    [currentPage, selectedProductPage, sections],
  )
  const deferredOnPage = useDeferredValue(sectionsOnPage)
  const deferredSections = deferredOnPage.page === sectionsOnPage.page ? deferredOnPage.sections : sections

  /**
   * THE PLACEHOLDER GOES IN HERE AND NOWHERE ELSE. `sections` is what is
   * saved, undone and published; this is only what the canvas draws. It is
   * shown on the page it was started from, and until the canvas is drawing
   * the section that replaced it.
   */
  const writingShown =
    aiWriting !== null &&
    aiWriting.page === currentPage &&
    !(aiWriting.placedId && deferredSections.some((s) => s.id === aiWriting.placedId))
  /* Theme settings › Breadcrumbs, drawn here as the live site draws it (theme-breadcrumbs.ts); never in `sections`. */
  const crumbTheme = settingsDraft as Record<string, unknown>
  const crumbsOn = crumbTheme.breadcrumbs_enabled
  const crumbsSep = crumbTheme.breadcrumbs_separator
  const crumbsAlign = crumbTheme.breadcrumbs_align
  const canvasSections = useMemo(
    () => (writingShown && aiWriting ? withWritingPlaceholder(deferredSections, aiWriting.anchor, aiWriting.prompt) : deferredSections),
    [writingShown, aiWriting, deferredSections],
  )

  /** Placed and drawn, or placed and left behind on another page: either way, done. */
  useEffect(() => {
    if (!aiWriting?.placedId) return
    if (aiWriting.page !== currentPage || deferredSections.some((s) => s.id === aiWriting.placedId)) {
      aiWritingRef.current = null
      setAiWriting(null)
    }
  }, [aiWriting, currentPage, deferredSections])
  useEffect(() => {
    if (!arrivedId) return
    const t = setTimeout(() => setArrivedId(null), 700)
    return () => clearTimeout(t)
  }, [arrivedId])

  /**
   * The canvas's two callbacks, made once.
   *
   * They exist as their own useCallbacks because EditorCanvasPage below is
   * memoised, and a memoised component handed a freshly built arrow function
   * on every render is a memoised component that re-renders on every render.
   * Neither closes over a section, so neither has a reason to be rebuilt.
   */
  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  CLICKING THE CANVAS DOES NOT MOVE THE CANVAS
   * ═════════════════════════════════════════════════════════════════════════
   * This used to call `scrollToSection`, which brought the clicked section to
   * the top of the card. Think about when that runs: you are looking at the
   * section, you put a finger on it, and the page slides out from under the
   * finger — to show you the thing you were already looking at. Tap a button
   * halfway down a hero and the hero jumps; tap the next thing and it jumps
   * again. There is nothing to reveal, so there is nothing to scroll for.
   *
   * The five other callers stay, because each has something you cannot see:
   * a section just ADDED or DUPLICATED is somewhere else on the page, and a
   * row picked in the SIDEBAR is a section you pointed at from a list rather
   * than from the page. Selecting from a list is the case where scrolling is
   * the whole answer.
   */
  const selectSectionFromCanvas = useCallback(
    (sectionId: string, blockId?: string | null, field?: ClickTarget | null) => {
      /* Switched off, and the rings are still fading: a tap now is a preview's tap. */
      if (!inspectorRef.current) return
      const el = document.getElementById("wb-preview-root")
      /* The breadcrumb bar is the theme's, not the page's: it opens where it is set. */
      if (sectionId === THEME_BREADCRUMBS_ID) {
        setSidebarMode("settings")
        setPageBrowserOpen(false)
        setSelectedPanel({ type: "theme_settings" })
        /* Breadcrumbs are under Layout now. */
        setExpandedSettings("layout")
        if (isMobileViewRef.current) setMobileSidebarOpen(true)
        return
      }
      if (el) {
        /**
         * SELECTING A SECTION MOVES NOTHING. ANYWHERE.
         *
         * It brought the section to the top of the canvas on a phone for one
         * deploy, and even done smoothly and on purpose that is the same
         * thing the accidental jumps were: the page moving under a thumb
         * that asked for a section and not for a scroll. What was tapped is
         * already in front of the person who tapped it. The canvas is held
         * where they left it, and a finger or a wheel releases the hold at
         * once.
         */
        touchingCanvas.current = false
        pinScroll(
          el,
          PIN_AFTER_SELECT_MS,
          (cb) => window.requestAnimationFrame(cb),
          () => Date.now(),
          () => touchingCanvas.current,
        )
      }
      setSelectedPanel({ type: "section", sectionId })
      setSelectedBlockId(blockId ?? null)
      /**
       * A CLICK ON ONE THING OPENS ITS FIELD. A heading clicked lands the
       * sidebar on Heading, a picture on Image (the effect below). On a phone
       * that is the one tap that brings the sheet up: the person pointed at
       * something to change, not at the section as a whole. A tap on the
       * section's empty space still leaves the sheet where it was.
       */
      if (field) {
        setFieldFocus({ sectionId, block: field.block, setting: field.setting, n: ++fieldFocusSeq.current })
        if (isMobileViewRef.current) {
          setAiOpen(false)
          setMobileSidebarOpen(true)
        }
      }
    },
    [],
  )
  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  THE SIDEBAR LANDS ON THE FIELD
   * ═════════════════════════════════════════════════════════════════════════
   * The panel for the section (or the block's row) is drawn a render or two
   * after the click, so the field is looked for each frame until it is there,
   * for half a second at most. Then its own scroller is moved, and nothing
   * above it (the reason the block row above scrolls by hand too), the field
   * takes a violet ring that fades, and on a computer its input takes the
   * focus without scrolling anything a second time. On a phone the input is
   * not focused: that would bring the keyboard up over the sheet.
   */
  useEffect(() => {
    if (!fieldFocus) return
    let frame = 0
    let tries = 0
    const find = (): HTMLElement | null => {
      const panel = document.querySelector<HTMLElement>(`[data-wb-section-panel="${window.CSS.escape(fieldFocus.sectionId)}"]`)
      if (!panel) return null
      if (fieldFocus.block) {
        const row = panel.querySelector<HTMLElement>(`[data-block-row="${window.CSS.escape(fieldFocus.block)}"]`)
        if (!row) return null
        return Array.from(row.querySelectorAll<HTMLElement>(`[data-block-field="${window.CSS.escape(fieldFocus.setting)}"]`)).find((f) => f.closest("[data-block-row]") === row) ?? null
      }
      return Array.from(panel.querySelectorAll<HTMLElement>(`[data-setting-field="${window.CSS.escape(fieldFocus.setting)}"]`)).find((f) => !f.closest("[data-block-row]")) ?? null
    }
    const land = () => {
      const el = find()
      if (!el) {
        if (++tries < 40) frame = requestAnimationFrame(land)
        return
      }
      const scroller = el.closest("[data-sheet-scroll], [data-wb-sidebar-scroll]") as HTMLElement | null
      if (scroller) {
        const r = el.getBoundingClientRect()
        const box = scroller.getBoundingClientRect()
        /* What of the scroller is on the screen: on a phone the sheet's lower part is below it at the half stop. */
        const seenBottom = Math.min(box.bottom, window.visualViewport?.height ?? window.innerHeight)
        /* A third of the way down, so the field is read with what is above it; not moved when it is already in plain view. */
        const fits = r.top >= box.top + 8 && r.bottom <= seenBottom - 8
        if (!fits) scroller.scrollBy({ top: r.top - box.top - Math.min((seenBottom - box.top) / 3, 120), behavior: "smooth" })
      }
      /* Taken off and put back, so a second click on the same thing rings it again. */
      el.removeAttribute("data-sl-flash")
      void el.offsetWidth
      const stamp = String(fieldFocus.n)
      el.setAttribute("data-sl-flash", stamp)
      window.setTimeout(() => {
        if (el.getAttribute("data-sl-flash") === stamp) el.removeAttribute("data-sl-flash")
      }, FIELD_FLASH_MS)
      if (!isMobileViewRef.current) {
        const input = el.querySelector<HTMLElement>('input:not([type="hidden"]):not([type="range"]):not([type="checkbox"]), textarea, [contenteditable="true"]')
        input?.focus({ preventScroll: true })
      }
    }
    /* Two frames: the block list opens its row in an effect of its own. On a
       phone, after the sheet has finished rising, so what is on the screen is
       measured where it stays. */
    const wait = isMobileViewRef.current ? window.setTimeout(() => { frame = requestAnimationFrame(land) }, sheetMoveMs()) : 0
    if (!wait) frame = requestAnimationFrame(() => { frame = requestAnimationFrame(land) })
    return () => {
      window.clearTimeout(wait)
      cancelAnimationFrame(frame)
    }
  }, [fieldFocus])
  /**
   * AND THE SIDEBAR GOES TO IT. Selecting the ninth FAQ entry on the canvas
   * is only half an answer if its row is four screens down a list of twelve
   * that all look alike. The row opens, takes the ring, and is brought into
   * view; `nearest` rather than `center`, so a row already on screen does not
   * move under the cursor.
   */
  useEffect(() => {
    if (!selectedBlockId) return
    const row = document.querySelector(`[data-block-row="${window.CSS.escape(selectedBlockId)}"]`)
    if (!row) return
    const id = requestAnimationFrame(() => {
      /**
       * THE SIDEBAR'S OWN SCROLLER, AND NOTHING ABOVE IT. `scrollIntoView`
       * walks every scrollable ancestor, so on a phone — where the sidebar
       * is a sheet over the canvas — it could bring the canvas along with
       * it, which is the movement clicking a section is not supposed to
       * cause. Scrolling the one container by hand cannot reach past it.
       */
      const scroller = row.closest("[data-sheet-scroll], [data-wb-sidebar-scroll]") as HTMLElement | null
      if (!scroller) return
      const r = row.getBoundingClientRect()
      const box = scroller.getBoundingClientRect()
      if (r.top >= box.top && r.bottom <= box.bottom) return // already in view
      const delta = r.top < box.top ? r.top - box.top : r.bottom - box.bottom
      scroller.scrollBy({ top: delta, behavior: "smooth" })
    })
    return () => cancelAnimationFrame(id)
  }, [selectedBlockId])

  /** The name the canvas chip shows for a section: the one its row in the sidebar has. */
  const hoverNameOf = useCallback((id: string) => {
    const sec = sectionsRef.current.find((s) => s.id === id)
    return sec ? sectionDisplayName(sec, librarySchemas) : ""
  }, [librarySchemas])
  const openAddSection = useCallback(() => {
    setAddGroup("template")
    setAddSectionOpen(true)
  }, [])
  /**
   * STABLE, SO THE LIBRARY STAYS PUT. The library is mounted for the life of
   * the editor (its sheet keeps it, so opening it is instant), and it was
   * handed a new `onOpenChange` and `addSection` on every render of the
   * editor. Each card is memoised on `onAdd`, so every keystroke anywhere
   * re-rendered thirty-eight cards and their previews.
   */
  const addSectionOpenRef = useRef(addSectionOpen)
  addSectionOpenRef.current = addSectionOpen
  const onAddSectionOpenChange = useCallback((o: boolean) => {
    setAddSectionOpen(o)
    if (!o) {
      /**
       * NOT AT ONCE. A section chosen in the library is added on the frame
       * after the library starts to close (the close goes first, so it is
       * already with the compositor), and it needs to know which gap it was
       * chosen for. Clearing the gap here, in the same commit as the close,
       * is what sent every section tapped into a gap to the end of the page
       * instead (scripts/check-add-section.mjs: "at 9 of 11"). Two frames
       * later the add has used it and cleared it itself; a library closed
       * without a choice is cleared then too, unless it was opened again.
       */
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (addSectionOpenRef.current) return
        setPendingInsertIndex(null)
        setCanvasInsertAt(null)
      }))
    }
  }, [])
  const addSectionRef = useRef<(type: string, presetIndex?: number) => void>(() => {})
  const addSectionStable = useCallback((type: string, presetIndex?: number) => addSectionRef.current(type, presetIndex), [])
  addSectionRef.current = addSection

  /**
   * Everywhere on this site a link can point, for the link fields.
   *
   * Built from exactly what the page browser already lists, so the two cannot
   * disagree about what pages a site has: if it is somewhere you can open in
   * the editor, it is somewhere you can link to.
   */
  /**
   * THE SECTIONS OF THE PAGE THAT IS OPEN, for "Sections on this page". From
   * the sections being edited, so a heading changed a second ago is the name
   * in the list. Kept the same array while nothing a link shows has changed,
   * or every keystroke anywhere would draw every link field again.
   */
  const openPagePath = selectedProductPage ? null : editorPagePath(currentPage, SHOP_PATH)
  const sectionTargetsRef = useRef<{ key: string; list: LinkTarget[] }>({ key: "", list: [] })
  const sectionTargets = useMemo(() => {
    const list = sectionLinkTargets(sections, openPagePath, (s) => sectionDisplayName(s, librarySchemas))
    const key = JSON.stringify(list)
    if (key !== sectionTargetsRef.current.key) sectionTargetsRef.current = { key, list }
    return sectionTargetsRef.current.list
  }, [sections, openPagePath, librarySchemas])
  /**
   * Another page's sections, read when somebody opens that page's row in a
   * link field. Its saved draft, through the same route the page switcher
   * uses, once per page while this page is open.
   */
  const pageSectionsCache = useRef(new Map<string, Promise<LinkTarget[]>>())
  useEffect(() => { pageSectionsCache.current.clear() }, [currentPage])
  const baseTargetsRef = useRef<LinkTarget[]>([])
  const sectionSource = useMemo<SectionLinkSource>(() => ({
    currentPath: openPagePath,
    load: (path: string) => {
      const key = editorPageKeyOf(path, { shopPath: SHOP_PATH, customPageKeys: customPagesRef.current.map((p) => p.key) })
      if (!key) return Promise.resolve([])
      const hit = pageSectionsCache.current.get(key)
      if (hit) return hit
      const label = baseTargetsRef.current.find((t) => t.kind === "page" && t.href === path)?.label
      const read = fetch(`/api/website-builder/themes/${installId}/sections?page=${encodeURIComponent(key)}`)
        .then((r) => (r.ok ? r.json() : { sections: [] }))
        .then((d: { sections?: SectionInstance[] }) =>
          sectionLinkTargets(d.sections ?? [], path, (s) => sectionDisplayName(s, librarySchemas), label),
        )
        .catch(() => {
          pageSectionsCache.current.delete(key)
          return [] as LinkTarget[]
        })
      pageSectionsCache.current.set(key, read)
      return read
    },
  }), [openPagePath, installId, librarySchemas])
  /* The published collections, as a link goes to them: /collections/<handle>. None while collections are off. */
  const siteCollectionTargets = useMemo(
    () => Object.values(builderCollections?.cards ?? {}).map((c) => ({ handle: c.handle, title: c.title, image: c.image })),
    [builderCollections],
  )
  const linkTargets = useMemo<LinkTarget[]>(
    /* The store's pages, collections and products, the same list Navigation offers (lib/website-builder/link-targets.ts). */
    () => [
      ...sectionTargets,
      ...storeLinkTargets({
        customPages: customPages.map((p) => ({ key: p.key as string, name: p.name })),
        products,
        collections: siteCollectionTargets,
      }),
    ],
    [customPages, products, sectionTargets, siteCollectionTargets],
  )
  baseTargetsRef.current = linkTargets
  /**
   * Insert at a gap in the canvas. `at` counts BODY sections — 0 is above the
   * first — and `addSection` clamps whatever lands here into the range
   * between the header and the footer, so this does not need to know where
   * the chrome is. Stable, for the same reason as the two above.
   */
  const openAddSectionAt = useCallback((at: number) => {
    setAddGroup("template")
    setPendingInsertIndex(null)
    setCanvasInsertAt(at)
    setAddSectionOpen(true)
  }, [])

  // Narrow the selected section id safely
  const selectedSectionId: string | null =
    selectedPanel.type === "section" ? (selectedPanel as { type: "section"; sectionId: string }).sectionId : null
  /* The section being edited is open in the tree when you go back to it, its blocks showing, as Shopify's tree follows a selection. */
  useEffect(() => {
    if (!selectedSectionId) return
    setTreeOpen((prev) => (prev.has(selectedSectionId) ? prev : new Set(prev).add(selectedSectionId)))
  }, [selectedSectionId])

  /**
   * =========================================================================
   *  A SECTION ASK AI WRITES LANDS ON THE PAGE
   * =========================================================================
   * It used to land in Add Section under "Created by you", with nothing on
   * the canvas for the thirty seconds it took and nothing there after. Now
   * the spot is held while it is written, and the section is put in it the
   * moment it compiles: added, selected, saved with the page like a section
   * added by hand, and one Undo away from gone.
   *
   * The spot: the gap the creator picked, or under the section they have
   * open, or the end of the page above the footer.
   */
  const handleWriteStart = useCallback(
    (prompt: string) => {
      const current = sectionsRef.current
      const chosenIndex =
        canvasInsertAt != null ? bodyGapToListIndex(current, canvasInsertAt) : pendingInsertIndex
      const next = {
        anchor: writingAnchor(current, { chosenIndex, selectedId: selectedSectionId }),
        prompt,
        page: currentPageRef.current,
      }
      aiWritingRef.current = next
      setAiWriting(next)
      /* On a phone the chat covers the canvas, and the canvas is the point. */
      if (isMobileView) setAiOpen(false)
      revealSection(WRITING_SECTION_ID)
    },
    [canvasInsertAt, pendingInsertIndex, selectedSectionId, isMobileView, revealSection],
  )

  /**
   * True when the section is on the page. False sends the chat's other
   * message, "add it from Add Section": the creator went to another page
   * while it was written, or its file could not be read back just now.
   */
  const handleWriteDone = useCallback(
    /* The new section's id when it is on the page: the chat hands it back to aiRunFinished, which glides to it and rings it once. */
    async ({ type }: { type: string; name: string; path: string }): Promise<string | false> => {
      const writing = aiWritingRef.current
      /* The file is new, so the canvas has to fetch it before it can draw it. */
      const files = await loadStorelibSources()
      const schema = files ? customSectionSchemas(files)[type] : undefined
      if (!writing || !schema || writing.page !== currentPageRef.current) {
        aiWritingRef.current = null
        setAiWriting(null)
        return false
      }
      const id = `${type}-${Date.now()}`
      pushUndo()
      setSections((previous) => placeWrittenSection(previous, writing.anchor, instanceFromSchema(id, type, schema)))
      const placed = { ...writing, placedId: id }
      aiWritingRef.current = placed
      setAiWriting(placed)
      setSelectedPanel({ type: "section", sectionId: id })
      setIsDirty(true)
      setArrivedId(id)
      revealSection(id)
      return id
    },
    [loadStorelibSources, pushUndo, revealSection],
  )

  /**
   * The reason is in the chat. A phone closed the chat to show the canvas, so
   * it opens again; on a desktop the chat may have been closed meanwhile,
   * and then the reason is said here instead of the spot vanishing unexplained.
   * Refs, because this runs from a request that started several renders ago.
   */
  const aiOpenRef = useRef(aiOpen)
  aiOpenRef.current = aiOpen
  const isMobileViewRef = useRef(isMobileView)
  isMobileViewRef.current = isMobileView
  const handleWriteFailed = useCallback(
    (reason: string, answered?: boolean) => {
      aiWritingRef.current = null
      setAiWriting(null)
      /* An answer is read where it was asked: the chat opens on it, and it
         is never a red error notice. */
      if (isMobileViewRef.current || answered) setAiOpen(true)
      else if (!aiOpenRef.current) showNotification(reason, "error")
    },
    [showNotification],
  )

  /**
   * =========================================================================
   *  SECTIONS A CONNECTED AGENT WRITES
   * =========================================================================
   * Claude Code, Codex or another agent connected under Website settings ›
   * Connections saves section files through app/api/mcp, or pushes them to a
   * linked GitHub repository (app/api/github/webhook). Either way it cannot place them
   * on a page itself: the page's sections are this editor's, and a server
   * write under an open editor would be overwritten by its next autosave.
   *
   * So the editor listens (useSiteActivity: quick while changes arrive,
   * slower while nothing happens, never while the tab is hidden, not at all
   * while nothing is connected). A NEW section is put on the page that is
   * open, above the footer, the way Add Section would, and arrives with the
   * same animation Ask AI's sections do. A change to an existing one redraws
   * it. Every change is a line in the notice under the connection's mark.
   *
   * The canvas is NOT scrolled to a new section. The person may be working
   * somewhere else on the page while an agent writes, and a page that moves
   * by itself is the "it autoscrolls" report. The notice's line for it
   * selects it and brings it into view when they want it.
   *
   * Nothing is replayed: the first answer is only a cursor, so opening the
   * builder does not add everything agents wrote last week.
   */
  const [liveBatch, setLiveBatch] = useState<LiveBatch | null>(null)
  const handleAgentEvents = async (events: ActivityEvent[]) => {
    let replacedHere = false
    /*
      EVERYTHING AN AGENT OR A PUSH WRITES IS A DRAFT (a section file's
      draft_content, a page's draft_sections, the draft settings), so the
      site now differs from what is live: Publish says so, as it does for an
      edit made here.
    */
    if (events.length > 0) setUnpublished(true)
    /* Any page may have been written: each is read afresh when it is next opened (pageCache). */
    if (events.length > 0) forgetPage()
    /* An imported theme draws from its own files too: a file changed there is read again (CompatCanvas filesVersion). */
    if (compatInstall && events.some((ev) => !ev.path.startsWith("pages/") && ev.path !== "settings")) setCompatFilesVersion((n) => n + 1)
    /* And its Theme settings, made from its settings_schema.json and its values, both of which a push may have changed. */
    if (compatInstall && events.some((ev) => !ev.path.startsWith("pages/"))) setCompatPanelVersion((n) => n + 1)
    /* Which of what is open was rewritten, for the conflict line: a page, home's header and footer, or the settings. */
    let replacedWhat: string | null = null
    /* An agent's own changes, counted for the "Publish to make them live" line (a push says its own, from the server). */
    const byAgents = events.filter((ev) => !isGitHubName(ev.agent_name))
    if (byAgents.length) {
      const who = byAgents[byAgents.length - 1].agent_name
      setAgentNote((prev) => (prev && prev.who === who ? { who, count: prev.count + byAgents.length } : { who, count: byAgents.length }))
    }
    const files = await loadStorelibSources()
    const custom = files ? customSectionSchemas(files) : {}
    /* One poll can hold two writers; each gets its own run of lines. */
    let who = events[0]?.agent_name ?? ""
    let changes: LiveChange[] = []
    const flush = () => {
      if (!changes.length) return
      const lines = changes
      const by = who
      setLiveBatch((b) => addToBatch(b, by, lines, Date.now()))
      changes = []
    }
    for (const ev of events) {
      if (ev.agent_name !== who) {
        flush()
        who = ev.agent_name
      }
      /**
       * A PAGE CHANGE is already in the draft. This copy of the page would be
       * saved over it on the next autosave, so the same operations are
       * replayed here, through the same applier the assistant's go through
       * (applyAiOp: undo, unsaved, the header's logo kept in step). An add of
       * the creator's own section type takes the schemas just loaded, which
       * the applier's may not have yet. See pageEventPlan.
       */
      const plan = pageEventPlan(ev, currentPageRef.current)
      for (const op of [...plan.themeOps, ...plan.pageOps]) {
        if (op.kind === "add_section" && custom[op.sectionType]) {
          pushUndo()
          setSections((previous) => applyOp({ sections: previous, settings: {} }, op, { ...librarySchemas, ...custom }).sections)
          setIsDirty(true)
          setArrivedId(op.id)
        } else {
          applyAiOp(op)
        }
      }
      if (plan.newPage && !customPages.some((p) => p.key === plan.newPage) && !BUILT_IN_PAGE_KEYS.has(plan.newPage)) {
        const key = plan.newPage as PageKey
        setCustomPages((prev) => (prev.some((p) => p.key === key) ? prev : [...prev, { id: key, name: pageTitleFromKey(key), key }]))
      }
      const type = sectionTypeOf(ev.path)
      const schema = type ? custom[type] : undefined
      /* Placed by the agent itself: the page change that follows puts it where it asked. */
      if (type && ev.action === "created" && schema && !ev.detail?.placed && !sectionsRef.current.some((sec) => sec.type === type)) {
        const id = `${type}-${Date.now()}`
        pushUndo()
        setSections((previous) => placeWrittenSection(previous, writingAnchor(previous), instanceFromSchema(id, type, schema)))
        setIsDirty(true)
        setArrivedId(id)
      }
      changes.push({ key: ev.path, text: describeChange(ev, (t) => custom[t]?.name ?? SECTION_SCHEMAS[t]?.name), sectionType: type })
      /* A page or the settings rewritten whole: this one, home's header and footer, or the settings, are on screen now. */
      if (ev.detail?.replaced) {
        const page = ev.detail.page ?? null
        if (page === null || page === currentPageRef.current || page === "home") {
          replacedHere = true
          replacedWhat = page === null ? "the theme settings" : page === currentPageRef.current ? "this page" : "the header and footer"
        }
      }
    }
    /*
      REWRITTEN WHOLE, NOT EDITED (a push to the linked GitHub repository,
      lib/github-sync/sync.ts). There are no operations to replay, and the
      copy held here would be autosaved over the new draft, so it is read
      again from the draft. An edit made here and not saved yet is kept
      instead, and the line says how to take GitHub's version.

      In place: the sidebar and the canvas keep showing the page until the
      draft is here, then take it, with the open section still open. The
      editor is not loaded again around it.
    */
    if (replacedHere) {
      if (!isDirtyRef.current && !savingRef.current && !publishing) {
        clearHistory()
        await loadData({ quiet: true })
      } else {
        /*
          BOTH CHANGED IT. The edit here is not saved yet and the draft under
          it is GitHub's now. Autosave would have written this copy over
          theirs without a word; it waits instead, and the creator picks.
        */
        setSyncConflict({ what: replacedWhat ?? "this page", by: who })
        changes.push({ key: "github-conflict", text: "Your unsaved edit is kept until you pick a version.", sectionType: null })
      }
    }
    flush()
    void refreshSync()
  }
  /** The conflict line's two buttons. */
  const keepMyVersion = () => setSyncConflict(null)
  const takeGitHubVersion = async () => {
    setSyncConflict(null)
    setIsDirty(false)
    /* Their pick: the edit here is let go now, not on the next render. */
    isDirtyRef.current = false
    clearHistory()
    await loadData({ quiet: true })
  }
  /**
   * One button of the sync line, through the requests Website settings ›
   * GitHub already uses (rate limited per site there): Pull, Push, and a
   * built-in back to Storelib's version. Reconnect and Pick repository open
   * that panel. Resolves to the words to show when it did not work.
   */
  const runSyncAction = async (action: SyncAction, file?: ReportFile): Promise<string | null> => {
    if (action === "open") {
      if (file?.url) window.open(file.url, "_blank", "noopener,noreferrer")
      return null
    }
    if (action === "reconnect" || action === "repo") {
      openGitHub()
      return null
    }
    const post = async (body: Record<string, unknown>) => {
      try {
        const r = await fetch(`/api/website-builder/themes/${encodeURIComponent(installId)}/github`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        const d = (await r.json().catch(() => ({}))) as { error?: string }
        return { status: r.status, error: r.ok ? null : (d.error ?? "That didn't work. Try again in a minute.") }
      } catch {
        return { status: 0, error: "Couldn't reach Storelib. Check your connection and try again." }
      }
    }
    let result: { status: number; error: string | null }
    if (action === "reset" && file) {
      /* The site's own copy goes, or, when it never took one, Storelib's text goes back to GitHub with a Push. */
      result = await post({ action: "reset-override", path: file.path })
      if (result.status === 404) result = await post({ action: "export" })
    } else if (action === "push" || (action === "retry" && syncStatus.github?.direction === "to_github")) {
      result = await post({ action: "export" })
    } else {
      result = await post({ action: "pull" })
    }
    await refreshSync()
    if (!result.error) void loadStorelibSources()
    return result.error
  }
  const { brief: connectionsBrief, following: agentConnected, settled: connectionsSettled } = useSiteActivity({
    installId,
    recheck: projectSettingsOpen,
    onEvents: handleAgentEvents,
    onSyncChanged: () => void refreshSync(),
  })
  /**
   * WHAT IS OPEN, for a connected agent's storelib_read_selected_section.
   * Only while an agent is connected, only when it changes, and a moment
   * after it settles, so clicking down a page is one request, not ten.
   */
  const focusKey = [
    currentPage,
    selectedPanel.type === "section" ? selectedPanel.sectionId : "",
    selectedPanel.type === "section" ? parsePath(selectedBlockId).pop() ?? "" : "",
  ].join("|")
  const sentFocus = useRef("")
  useEffect(() => {
    if (!agentConnected || focusKey === sentFocus.current) return
    const t = setTimeout(() => {
      const [page_key, section_id, block_id] = focusKey.split("|")
      sentFocus.current = focusKey
      fetch(`/api/website-builder/themes/${encodeURIComponent(installId)}/focus`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_key, section_id: section_id || null, block_id: block_id || null }),
        keepalive: true,
      }).catch(() => {
        sentFocus.current = ""
      })
    }, 700)
    return () => clearTimeout(t)
  }, [agentConnected, focusKey, installId])
  const connection = useMemo(() => pickConnection(connectionsBrief), [connectionsBrief])
  const connectionButtonRef = useRef<HTMLButtonElement>(null)
  /** A line in the notice is only a way in when its section is on the open page. */
  const liveShown = useMemo<LiveBatch | null>(
    () =>
      liveBatch && {
        ...liveBatch,
        changes: liveBatch.changes.map((c) =>
          c.sectionType && sections.some((sec) => sec.type === c.sectionType) ? c : { ...c, sectionType: null },
        ),
      },
    [liveBatch, sections],
  )
  const selectFromNotice = (type: string) => {
    const target = sectionsRef.current.find((sec) => sec.type === type)
    if (!target) return
    setSidebarMode("sections")
    setPageBrowserOpen(false)
    setSelectedPanel({ type: "section", sectionId: target.id })
    revealSection(target.id)
    if (isMobileView) setMobileSidebarOpen(true)
  }
  /** The mark opens the path its connection lives on. */
  const openConnection = () => (connection.online && connection.kind !== "github" ? openConnections() : openGitHub())

  // ── Sidebar panel rendering ─────────────────────────────────

  /**
   * EVERY PAGE THE SITE HAS, for the bar's page switcher and the Pages tab:
   * the theme's own and the creator's, each with the address it is served at.
   */
  const sitePages = useMemo<SwitcherPage[]>(
    () => compatInstall ? compatPages(rowPageKeys, customPages.filter((p) => !rowPageKeys.includes(p.key)).map((p) => p.key)) : [
      /* The collections page is listed while collections are on (physical commerce); off, the site has none to show. */
      ...(Object.keys(PAGE_META) as PageKey[]).filter((k) => (k !== "collections" && k !== "collection") || builderCollections !== null).map((k) => ({ key: k, name: PAGE_META[k].label, path: pagePath(k) })),
      ...customPages.map((p) => ({ key: p.key as string, name: p.name, path: `/${p.key}`, custom: true })),
    ],
    [customPages, builderCollections, compatInstall, rowPageKeys],
  )
  const switcherProducts = useMemo(() => products.map((p) => ({ id: p.id, title: p.title })), [products])
  /* A page's row under the pointer: read before the press (pageCache). */
  const pageIntent = useCallback((key: string) => {
    prefetchPageSections(key as PageKey)
    warmCompatPage(key as PageKey)
  }, [prefetchPageSections, warmCompatPage])
  /*
    THE SITE'S OTHER PAGES, READ ONCE THE EDITOR IS IDLE (round 25). A
    page switch that has its sections in hand starts drawing on the press.
    The pages the site has stored, in the order the list shows them,
    READ_AHEAD_PAGES of them, one after another while nothing else is
    going on, and none on a connection that asks to save data.
  */
  useEffect(() => {
    if (loading) return
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
    if (conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType ?? "")) return
    /* Only pages the site has stored: one the server builds (the shop, search) is kept a moment only, and is not worth the request. */
    const listed = sitePages.map((p) => p.key)
    const keys = [...listed.filter((k) => rowPageKeys.includes(k)), ...rowPageKeys.filter((k) => !listed.includes(k))]
      .filter((k) => k !== currentPageRef.current && k !== "product")
      .slice(0, READ_AHEAD_PAGES)
    const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
    let cancelled = false
    let idle = 0
    const next = (i: number) => {
      if (cancelled || i >= keys.length) return
      const run = () => {
        if (cancelled) return
        prefetchPageSections(keys[i] as PageKey)
        const read = pageCache.current.get(keys[i])?.read ?? Promise.resolve()
        read.then(() => next(i + 1), () => next(i + 1))
      }
      idle = w.requestIdleCallback ? w.requestIdleCallback(run, { timeout: 4000 }) : window.setTimeout(run, 300)
    }
    /* After the first page has had the network to itself. */
    const start = window.setTimeout(() => next(0), 1200)
    return () => {
      cancelled = true
      window.clearTimeout(start)
      if (w.cancelIdleCallback) w.cancelIdleCallback(idle)
      else window.clearTimeout(idle)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])
  const selectProductById = (id: string) => {
    const p = products.find((x) => x.id === id)
    if (p) void handleSelectProductPage(p.id, p.title)
  }

  /**
   * THE PAGES TAB IS THE PAGE SWITCHER'S OWN LIST (components/website-builder/
   * page-switcher.tsx), light, and 48px a row on a phone, where this tab is
   * the page switcher. It was a list of its own: a "Custom Pages" box holding
   * Home, About and Contact beside the creator's pages, a "Product Pages" box,
   * and no account, sign in or wishlist at all.
   */
  const renderPageBrowser = () => (
    <div className="flex h-full flex-col">
    <PageList
      className="min-h-0 flex-1"
      tone="light"
      boxed
      touch={isMobileView}
      pages={sitePages}
      current={currentPage}
      currentProduct={selectedProductPage}
      products={switcherProducts}
      onSelect={(key) => { void handlePageChange(key as PageKey) }}
      onSelectProduct={selectProductById}
      onCreate={() => setAddPageOpen(true)}
      onDelete={(key) => { void handleDeletePage(key) }}
      onIntent={pageIntent}
    />
    {/* The store's menus sit beside its pages, the way Shopify keeps Navigation next to Pages. */}
    <div className="shrink-0 border-t border-border p-2">
      <button
        type="button"
        data-open-navigation=""
        onClick={() => { setPageBrowserOpen(false); openMenus() }}
        className="flex h-10 w-full items-center gap-2.5 rounded-md px-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/15 max-sm:h-12"
      >
        <MenuIcon className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium max-sm:text-[15px]">Navigation</span>
        </span>
        <span className="text-[12px] text-muted-foreground">Menus</span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
      </button>
    </div>
    </div>
  )

  /**
   * WHICH PANEL IS IN THE SIDEBAR, as one string.
   *
   * Used as a React key so a panel replacing another remounts and replays its
   * entrance. Without it the swap is a cut — the same element with different
   * children on the next frame — which reads as a glitch rather than as
   * navigation, because nothing connects the two states.
   */
  const sidebarPanelKey = pageBrowserOpen
    ? "pages"
    : selectedPanel.type === "section"
      ? `section:${(selectedPanel as { sectionId?: string }).sectionId ?? ""}`
      : `${sidebarMode}:${selectedPanel.type}`

  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  WHICH WAY THE PANEL JUST MOVED, FOR THE PHONE ONLY
   * ═════════════════════════════════════════════════════════════════════════
   * On the desktop a panel swap is a cut, deliberately: the sidebar is always
   * there, clicking sections is the most common thing anybody does, and a
   * slide on every click is a twitch (see the note above).
   *
   * In the sheet it is navigation. There is one surface, it shows the list or
   * it shows one section's settings, and going in and coming back are moves
   * with a direction. Without one the settings are simply there, and so is
   * the list again, and the sheet reads as if it re-rendered rather than as
   * if you went somewhere. Asked for as the back feeling "a little bit more
   * smooth" and opening a section "a little smooth, not so direct".
   *
   * A position, not a history, so the direction is subtraction. The ref is
   * only ever written when the key changes, so a re-render for any other
   * reason keeps the class it already had and cannot cut an animation short
   * halfway.
   *
   * THE THREE TABS ARE POSITIONS TOO. They were all 0, so moving between
   * Sections, Pages and Settings subtracted to nothing and the panel was
   * replaced with a cut — a heavy form appearing in one frame, which is what
   * "dragging left and right between them is glitchy" describes. They are
   * where they are drawn now, so the panel arrives from the side the tab you
   * tapped is on, exactly as going into a section already did.
   *
   * A section's settings sit past all three, because they are somewhere you
   * went from whichever tab you were on rather than a fourth tab.
   */
  const TAB_POSITION: Record<string, number> = { sections: 0, pages: 1, settings: 2 }
  const panelDepth = (key: string) => {
    if (key.startsWith("section:")) return 10
    if (key === "pages") return TAB_POSITION.pages
    const tab = key.split(":")[0]
    return TAB_POSITION[tab] ?? 0
  }
  const panelMove = useRef<{ key: string; dir: number }>({ key: sidebarPanelKey, dir: 0 })
  if (panelMove.current.key !== sidebarPanelKey) {
    /* A section just added changes the panel while nobody can see it (under the library, or below the
       peek), so it arrives without a slide to be caught halfway as the sheet comes into view. */
    const quiet = quietPanel.current === sidebarPanelKey
    quietPanel.current = null
    panelMove.current = {
      key: sidebarPanelKey,
      dir: quiet ? 0 : panelDepth(sidebarPanelKey) - panelDepth(panelMove.current.key),
    }
  }
  const panelDir = panelMove.current.dir

  /**
   * NO ANIMATION ON A PANEL SWAP.
   *
   * Selecting a section slid its settings in from the side, and at 180ms
   * over a panel full of text that is not navigation, it is a flinch: the
   * whole sidebar twitches every time you click a section, which is the most
   * common thing anybody does in this editor. Reported as looking cheap, and
   * it was.
   *
   * The direction was meant to say which way you moved through the stack.
   * That is worth saying in a sheet that slides over a page; it is not worth
   * saying in a panel that simply shows a different thing, and the price was
   * a moving target every time the mouse landed.
   *
   * The `key` stays, because that is not decoration: it is what makes React
   * build a new panel rather than reconcile one section's fields into
   * another's.
   */
  /**
   * `useRef`, not `React.useRef`. This file imports the hooks it uses by
   * name and never imports React itself, so `React` is not a binding here:
   * these two lines threw "React is not defined" the moment the editor
   * rendered, which took the whole builder down for everybody.
   *
   * It reached production because TypeScript accepts the spelling — the
   * React types declare `React` as a UMD global — and the build does not
   * fail on type errors. tests/react-binding.test.ts is what catches it now.
   */

  /*
    NEVER A BLANK SIDEBAR. A section panel whose section is gone (deleted,
    another page opened, the page still loading) drew nothing at all: the
    Sections tab with an empty column under it. It draws the sections list
    instead, and the effect below puts the panel state right once the page
    has loaded.
  */
  const panelSectionGone = selectedPanel.type === "section" && !sections.some((s) => s.id === (selectedPanel as { sectionId: string }).sectionId)
  const shownPanel: Panel = panelSectionGone && sidebarMode !== "settings" ? { type: "pages" } : selectedPanel
  useEffect(() => {
    if (panelSectionGone && !sectionsLoading) setSelectedPanel({ type: "pages" })
  }, [panelSectionGone, sectionsLoading])
  const renderSidebarContent = () => {
    const selectedPanel = shownPanel
    // ── Page browser mode ──
    if (pageBrowserOpen) return renderPageBrowser()

    // ── Navigation: the store's menus, its own panel (a section's Edit, the header's Menu) ──
    if (selectedPanel.type === "navigation") {
      const back = selectedPanel.back
      const backTo: Panel = back && (back.type !== "section" || sections.some((s) => s.id === back.sectionId)) ? back : { type: "pages" }
      return (
        <div className="flex flex-col h-full" data-wb-navigation-panel="">
          <PanelBack onBack={() => setSelectedPanel(backTo)}>
            <p className="truncate text-[15px] font-semibold md:text-sm">Navigation</p>
          </PanelBack>
          <div data-sheet-scroll className="flex-1 overflow-y-auto wb-slim-scroll px-3.5 py-3.5">
            <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground max-sm:text-[13px]" data-navigation-note="">
              {storeMenusRef.current.available
                ? "Menus belong to your store, so every theme shows the same ones. Changes go live right away."
                : "Menus are saved with this theme."}
            </p>
            <MenusEditor
              value={(settingsDraft as Record<string, unknown>).menus}
              onChange={(next) => updateSetting("menus", next)}
              openHandle={selectedPanel.handle ?? null}
            />
          </div>
        </div>
      )
    }

    /*
      AN IMPORTED SHOPIFY THEME'S SETTINGS, the theme's own groups read at
      import (components/website-builder/compat/compat-theme-settings.tsx).
      `atTop`: the Theme tab's own list, which has nothing to go back to.
    */
    function compatThemePanel(atTop: boolean) {
      const shopifyValues = ((settingsDraft as Record<string, unknown>).shopify ?? {}) as Record<string, unknown>
      return (
        <CompatThemeSettings
          installId={installId}
          panelVersion={compatPanelVersion}
          values={shopifyValues}
          open={expandedSettings}
          onOpen={(name) => (name === "__back__" ? (atTop ? undefined : setSelectedPanel({ type: "pages" })) : setExpandedSettings(name))}
          onChange={(id, v) => {
            /* Read when it changes, so two settings moved in one frame both land. */
            const now = ((settingsRef.current as Record<string, unknown>).shopify ?? {}) as Record<string, unknown>
            updateSetting("shopify", { ...now, [id]: v })
          }}
          renderField={(field, value, change) => (
            <FieldEditor label={fieldCarriesOwnLabel(field) ? undefined : field.label} field={field} value={value} onChange={change} />
          )}
          back={(label, onBack) =>
            atTop && label === "Theme settings" ? (
              <div className="shrink-0 border-b border-border px-4 py-3">
                <p className="text-sm font-semibold">Theme settings</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{compatOf(settingsDraft)?.theme || "The theme"}&apos;s own settings</p>
              </div>
            ) : (
              <PanelBack onBack={onBack}>
                <span className="text-[15px] font-semibold md:text-sm">{label}</span>
              </PanelBack>
            )
          }
        />
      )
    }

    // ── General Settings mode ──
    if (sidebarMode === "settings") {
      // Show section settings if a section is selected
      /* A section that has gone (deleted, or its page changed) falls back to the
         theme settings here, and the effect below puts the panel state right:
         setting state during render drew a blank frame and a React warning. */
      const staleSection = selectedPanel.type === "section" && !sections.some(s => s.id === (selectedPanel as any).sectionId)
      if (selectedPanel.type === "section" && !staleSection) {
        // This will fall through to the existing SECTION panel code below
      } else {
        // Global theme settings
        /* An imported Shopify theme's settings are its own (config/settings_schema.json). */
        if (compatInstall) return compatThemePanel(true)
        /*
          A LIST OF GROUPS, AND A GROUP OPENS AS ITS OWN PANEL. It was an
          accordion: a chevron turning on every row and the groups under an
          opened one sliding down by its height, which is the movement the
          owner did not like. Now, as Shopify's theme settings do, the list is
          still and a group replaces it, with Back to return, sliding in from
          the side. `expandedSettings` names the open group, as it did.
        */
        const generalGroups = THEME_SETTINGS_GROUPS.filter(group => group.id !== "colors" && group.id !== "menus").filter(group => !group.shownWhen || settingsDraft[group.shownWhen as keyof ThemeSettingsValues] === true)
        const openGeneral = generalGroups.find(g => g.id === expandedSettings) ?? null
        if (openGeneral) {
          const group = openGeneral
          return (
            <div className="flex flex-col h-full" data-theme-group-open={group.id}>
              <PanelBack onBack={() => setExpandedSettings(null)}>
                <p className="truncate text-[15px] font-semibold md:text-sm">{group.label}</p>
              </PanelBack>
              <div key={group.id} data-sheet-scroll data-theme-group={group.id} className="flex-1 overflow-y-auto wb-slim-scroll px-3.5 py-3.5 space-y-4 animate-in fade-in-0 slide-in-from-right-2 duration-200 motion-reduce:animate-none">

                <>
                  {/* Custom Color Schemes editor */}
                  {group.id === "color_schemes" ? (
                    <ColorsPanel
                      theme={settingsDraft}
                      updateSetting={updateSetting}
                      onRemapSections={(from, to) => {
                        debouncedPushUndo()
                        setSections(prev => remapScheme(prev, from, to))
                        setIsDirty(true)
                      }}
                      initialActive={editSchemeKey}
                      onInitialActiveConsumed={() => setEditSchemeKey(null)}
                      advanced={THEME_SETTINGS_GROUPS.find(g => g.id === "colors")?.fields.map(field => (
                        <div key={field.id}>
                          <FieldEditor
                            label={fieldCarriesOwnLabel(field) ? undefined : field.label}
                            field={field}
                            value={settingsDraft[field.id as keyof ThemeSettingsValues] ?? field.default}
                            onChange={v => updateSetting(field.id, v)}
                          />
                        </div>
                      ))}
                    />
                  ) : group.id === "typography" ? (
                    <TypographyPanel
                      theme={settingsDraft}
                      updateSetting={updateSetting}
                      fonts={group.fields.map(field => (
                        <FontPreviewPicker
                          key={field.id}
                          label={field.label}
                          value={settingsDraft[field.id as keyof ThemeSettingsValues] ?? field.default}
                          onChange={v => updateSetting(field.id, v)}
                          options={field.options ?? []}
                        />
                      ))}
                    />
                  ) : (
                    <>
                    {group.id === "branding" && (
                      <BrandingTabPanel
                        settingsDraft={settingsDraft}
                        updateSetting={updateSetting}
                      />
                    )}
                    {/* All other groups, and the branding group's fields BrandingTabPanel does not draw, use modern Wb* components */}
                    {/* Social links: the platforms as a list you add to (editor/social-links-editor), the two placement switches after it. */}
                    {group.id === "social" && (
                      <SocialLinksEditor values={settingsDraft as Record<string, unknown>} onChange={(key, v) => updateSetting(key, v)} />
                    )}
                    {visibleFields(group.fields, settingsDraft as Record<string, unknown>).filter(field => group.id !== "branding" || !BRANDING_PANEL_FIELDS.has(field.id)).filter(field => group.id !== "social" || !SOCIAL_FIELD_IDS.has(field.id)).map(field => {
                      const val = settingsDraft[field.id as keyof ThemeSettingsValues] ?? field.default
                      return (
                        <div key={field.id}>
                          {field.type === "toggle" ? (
                            <WbToggle
                              label={field.label}
                              value={val}
                              onChange={v => updateSetting(field.id, v)}
                              info={field.info}
                            />
                          ) : field.type === "range" ? (
                            <WbSlider
                              label={field.label}
                              value={val}
                              onChange={v => updateSetting(field.id, v)}
                              min={field.min ?? 0}
                              max={field.max ?? 100}
                              step={field.step ?? 1}
                              unit={field.unit ?? ""}
                              defaultValue={typeof field.default === "number" ? field.default : 0}
                            />
                          ) : (field.type === "select" || field.type === "font") && /^font_(heading|body|accent)$/.test(field.id) ? (
                                <FontPreviewPicker
                                  label={field.label}
                                  value={val}
                                  onChange={v => updateSetting(field.id, v)}
                                  options={field.options ?? []}
                                />
                              ) : field.type === "select" || field.type === "font" ? (
                            <WbSelect
                              label={field.label}
                              value={val}
                              onChange={v => updateSetting(field.id, v)}
                              options={field.options ?? []}
                            />
                          ) : field.type === "radio" ? (
                            <WbRadioSegment
                              label={field.label}
                              value={val}
                              onChange={v => updateSetting(field.id, v)}
                              options={field.options ?? []}
                            />
                          ) : field.type === "image" ? (
                            <>
                              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{field.label}</label>
                              <ImagePickerControl
                                value={typeof val === "string" ? val : ""}
                                onChange={url => updateSetting(field.id, url)}
                                label={field.label}
                              />
                            </>
                          ) : field.type === "color" ? (
                            /* No label here: fieldCarriesOwnLabel(field) is true for a
                               colour, because ColorField's own row is the label. */
                            <FieldEditor field={field} value={val} onChange={v => updateSetting(field.id, v)} />
                          ) : field.type === "header" || field.type === "paragraph" || field.type === "menus" ? (
                            <FieldEditor field={field} value={val} onChange={v => updateSetting(field.id, v)} />
                          ) : (
                            <FieldEditor label={field.label} field={field} value={val} onChange={v => updateSetting(field.id, v)} />
                          )}
                          {field.type !== "toggle" && field.info && (
                            <p className="text-[11px] text-muted-foreground mt-1">{field.info}</p>
                          )}
                        </div>
                      )
                    })}
                    </>
                  )}
                </>

              </div>
            </div>
          )
        }
        return (
          <div className="flex flex-col h-full">
            <div className="px-4 py-3 border-b border-border shrink-0">
              <p className="text-sm font-semibold">General Settings</p>
              <p className="text-xs text-muted-foreground mt-0.5">Colors, fonts, buttons, spacing</p>
            </div>
            <div data-sheet-scroll className="flex-1 overflow-y-auto wb-slim-scroll p-2 animate-in fade-in-0 duration-150 motion-reduce:animate-none">
              {generalGroups.map(group => <ThemeGroupRow key={group.id} group={group} onOpen={() => setExpandedSettings(group.id)} />)}
            </div>
          </div>
        )
      }
    }

    // ── Sections mode — PAGES panel (default — shows section list) ──
    if (selectedPanel.type === "pages") {
      const pageLabel = selectedProductPage
        ? selectedProductPage
        : (PAGE_META[currentPage]?.label ?? currentPage)

      return (
        <div className="flex flex-col h-full">
          {/* Page selector — opens Pages panel */}
          <div className="px-2.5 py-2.5 border-b border-border shrink-0">
            <button
              className="w-full flex h-8 max-sm:h-11 items-center justify-between px-2.5 rounded-md border border-border bg-background hover:bg-muted/50 transition-colors text-[13px] max-sm:text-[15px] font-medium cursor-pointer"
              onClick={() => setPageBrowserOpen(true)}
            >
              <span className="truncate">{pageLabel}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground ml-2" />
            </button>
          </div>

          {/* Skeleton loading when switching pages */}
          {/**
            * THE SAME WAIT LOOKS THE SAME WHEREVER IT CAME FROM.
            *
            * This was `sectionsLoading` alone, which is a page SWITCH. Landing
            * on the editor or refreshing it is `loading`, and that showed no
            * skeleton at all: the sidebar arrived empty, with a page name and
            * an Add section button, and the list appeared under them a moment
            * later. An empty list and a list that has not arrived look
            * identical, and the first thing somebody does on a refresh is
            * wonder where their sections went.
            */}
          {/*
            And it is a quiet wait: the rows do not pulse, and they are not
            there at all for a load that takes less than a moment (the app's
            own `skeleton-deferred`), so a quick switch shows the list, not a
            flash of grey before it.
          */}
          {/* The first load only: a page switch keeps the list it has (panelHeld, above) and swaps it in place. */}
          {loading ? (
            <div data-sheet-scroll className="flex-1 overflow-y-auto wb-slim-scroll skeleton-deferred px-2 py-2 space-y-1.5" aria-busy="true">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-8 rounded-md bg-[#f3f4f6]" />
              ))}
            </div>
          ) : (
            <div data-sheet-scroll className="flex-1 overflow-y-auto wb-slim-scroll px-2 py-2" aria-busy={panelHeld || undefined} data-sections-held={panelHeld ? "" : undefined} style={panelHeld ? { pointerEvents: "none" } : undefined}>
              {/* Header, Page and Footer, each with its rows: components/website-builder/editor/sections-list.tsx. */}
              <SectionsList
                sections={panelHeld ? panelSections.current : sections}
                nameOf={(s) => sectionDisplayName(s, librarySchemas)}
                selectedId={selectedSectionId}
                onSelect={(id) => { setSelectedBlockId(null); setSelectedPanel({ type: "section", sectionId: id }); revealSection(id) }}
                expanded={treeOpen}
                onToggleExpand={(id) => setTreeOpen((prev) => {
                  const next = new Set(prev)
                  if (next.has(id)) next.delete(id)
                  else next.add(id)
                  return next
                })}
                blocksOf={(s) => {
                  /* The header's links are its menu, edited in its own panel; every other section with blocks shows them here. */
                  if (s.type === "header") return null
                  const sch = schemaFor(s.type, storelibSources, librarySchemas)
                  if (!sch || !(sch.blocks?.length || sch.accepts?.length || sch.statics?.length)) return null
                  return (
                    <BlockTreeFor
                      section={s}
                      schema={sch}
                      catalog={blockCatalog}
                      parent={[]}
                      siblings={s.blocks ?? []}
                      owner={{ blocks: sch.blocks, accepts: sch.accepts, max_blocks: sch.max_blocks }}
                      statics={sch.statics ?? []}
                      selectedKey={selectedBlockId}
                      onSelect={(key) => {
                        setSelectedPanel({ type: "section", sectionId: s.id })
                        setSelectedBlockId(key)
                        revealSection(s.id)
                      }}
                      canHide={isStorelibSection(s.type, storelibSources)}
                      ops={{
                        add: (choice, parentKey) => addBlock(s.id, choice.type, {}, { parent: parentKey, preset: choice.preset }),
                        reorder: (next, parentKey) => reorderBlocks(s.id, next, parentKey),
                        toggleHidden: (key, staticType) => toggleBlockHidden(s.id, key, staticType),
                        remove: (key) => removeBlock(s.id, key),
                        moveTo: (key, parentKey, index) => moveBlockTo(s.id, key, parentKey, index),
                      }}
                    />
                  )
                }}
                onToggleHide={toggleSectionHidden}
                onDuplicate={duplicateSection}
                onRemove={removeSection}
                onMove={moveSectionBy}
                kindOfType={kindOfType}
                overlayAddable={overlayAddable}
                onAdd={(at, group = "template") => {
                  /* `at` counts the page's own sections; the list index is after the Header group. */
                  setAddGroup(group)
                  setPendingInsertIndex(at === null || group !== "template" ? null : splitGroups(sections).header.length + at)
                  setCanvasInsertAt(null)
                  setAddSectionOpen(true)
                }}
                dnd={{ onReorder: reorderSection }}
              />
            </div>
          )}
        </div>
      )
    }

    // SECTION panel - Header gets special treatment
    if (selectedPanel.type === "section") {
      const section = sections.find(s => s.id === selectedPanel.sectionId)
      if (!section) return null
      const schema = schemaFor(section.type, storelibSources, librarySchemas)

      // Special Header Section UI matching the screenshot
      if (section.type === "header") {
        return (
          <HeaderSectionSettings
            section={section}
            schema={schema}
            onBack={() => setSelectedPanel({ type: "pages" })}
            onUpdateSetting={(key, val) => updateSectionSetting(section.id, key, val)}
            onPickMenu={pickHeaderMenu}
            theme={settingsDraft}
            onEditScheme={(schemeKey) => {
              if (schemeKey) setEditSchemeKey(schemeKey)
              setSidebarMode("settings")
              setExpandedSettings("color_schemes")
              setSelectedPanel({ type: "pages" })
            }}
          />
        )
      }

      /*
       * ═════════════════════════════════════════════════════════════════
       *  A BLOCK'S OWN PANEL
       * ═════════════════════════════════════════════════════════════════
       * Opened from its row in the tree or by clicking it on the canvas:
       * the block's settings and nothing else, with the section it is in
       * named under its own name (tap it for the section's settings), and
       * Hide, Duplicate and Delete pinned at the foot like a section's.
       * Same `data-wb-section-panel` and `data-block-row` marks the panel's
       * old list carried, so a click on a block's heading on the canvas
       * still lands on that field here.
       */
      const blockHit = selectedBlockId && section.type !== "header" && schema ? resolveBlock(section, schema, blockCatalog, selectedBlockId) : null
      if (blockHit && schema) {
        const key = selectedBlockId as string
        const name = blockHit.def?.name ?? blockHit.block.type
        const canHide = isStorelibSection(section.type, storelibSources)
        return (
          <div className="flex flex-col h-full" data-wb-section-panel={section.id} data-wb-block-panel={key}>
            {/* Back goes up one level, as a second tap on the canvas does: the block around this one, then its section. */}
            <PanelBack onBack={() => { const up = parsePath(key).slice(0, -1); setSelectedBlockId(up.length ? pathKey(up) : null) }}>
              <p className="truncate text-[15px] font-semibold md:text-sm">{name}</p>
            </PanelBack>
            <div className="border-b border-border px-3.5 py-2">
              <button
                type="button"
                data-block-parent-section=""
                onClick={() => setSelectedBlockId(null)}
                className="inline-flex max-w-full items-center gap-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <span className="truncate">In {sectionDisplayName(section, librarySchemas)}</span>
                <ChevronRight className="h-3 w-3 shrink-0" />
              </button>
            </div>
            <div data-sheet-scroll className="flex-1 overflow-y-auto wb-slim-scroll">
              <div className="px-3.5 py-3.5 space-y-3.5" data-block-row={key}>
                <BlockFields
                  section={section}
                  schema={schema}
                  block={blockHit.block}
                  def={blockHit.def}
                  blockKey={key}
                  virtual={blockHit.virtual}
                  theme={settingsDraft}
                  onUpdate={(k, field, value, staticType) => updateBlockSetting(section.id, k, field, value, staticType)}
                />
              </div>
            </div>
            <div className="sticky bottom-0 z-10 shrink-0 border-t border-[#e5e7eb] bg-white px-3 pt-3 pb-3.5 flex gap-2" data-block-actions="">
              {canHide && (
                <button
                  type="button"
                  className={cn(
                    "flex-auto min-w-0 h-10 md:h-9 px-1.5 flex items-center justify-center rounded-lg text-[13px] font-semibold transition-colors duration-150",
                    blockHit.block.hidden
                      ? "bg-[#1a1a2e] text-white active:bg-[#2a2a44]"
                      : "bg-[#f3f4f6] text-[#1a1a2e] hover:bg-[#e9eaee] active:bg-[#e3e4e9]",
                  )}
                  onClick={() => toggleBlockHidden(section.id, key, blockHit.virtual)}
                >
                  <span className="truncate">{blockHit.block.hidden ? "Show" : "Hide"}</span>
                </button>
              )}
              {!blockHit.block.static && (
                <>
                  <button
                    type="button"
                    className="flex-auto min-w-0 h-10 md:h-9 px-1.5 flex items-center justify-center rounded-lg bg-[#f3f4f6] text-[13px] font-semibold text-[#1a1a2e] transition-colors duration-150 hover:bg-[#e9eaee] active:bg-[#e3e4e9]"
                    onClick={() => duplicateBlock(section.id, key)}
                  >
                    <span className="truncate">Duplicate</span>
                  </button>
                  <button
                    type="button"
                    className="flex-auto min-w-0 h-10 md:h-9 px-1.5 flex items-center justify-center rounded-lg bg-[#f3f4f6] text-[13px] font-semibold text-[#1a1a2e] transition-colors duration-150 hover:bg-[#fee2e2] hover:text-[#dc2626] active:bg-[#fecaca] active:text-[#b91c1c]"
                    onClick={() => removeBlock(section.id, key)}
                  >
                    <span className="truncate">Delete</span>
                  </button>
                </>
              )}
              {blockHit.block.static && !canHide && (
                <p className="flex-1 py-2 text-center text-[12px] text-muted-foreground">Placed by the section, so it stays where it is.</p>
              )}
            </div>
          </div>
        )
      }

      return (
        <div className="flex flex-col h-full" data-wb-section-panel={section.id}>
          {/**
            * ═══════════════════════════════════════════════════════════════
            *  THE SECTION IS NAMED ONCE
            * ═══════════════════════════════════════════════════════════════
            * This drew "Feature grid" and then "Feature grid" again, in two
            * sizes, and it did it for every section on the list. Not a
            * coincidence: `sectionDisplayName` PREFERS the schema's name,
            * and the line under it was the schema's name, so the two agreed
            * by construction every time a section's own file was present,
            * which is every time.
            *
            * The one case where they differ is a section whose schema is
            * gone: a type retired, or a file deleted from under a page that
            * still uses it. There the name falls back to the stored copy and
            * the type underneath is the only thing that says what it was. So
            * the second line is kept for exactly that, and shown only when it
            * says something the first does not.
            *
            * The bar is then one line tall on a phone, where it is a sheet
            * over the canvas and every row of chrome is a row of settings
            * nobody can see.
            */}
          {/* Back is the whole left of the row, the name included, on a
              quiet tile: components/website-builder/panel-back.tsx. */}
          <PanelBack onBack={() => setSelectedPanel({ type: "pages" })}>
            <SectionTitleRename name={sectionDisplayName(section, librarySchemas)} onRename={(next) => renameSection(section.id, next)} />
            {(schema?.name ?? section.type) !== sectionDisplayName(section, librarySchemas) && (
              <p className="text-[11px] text-muted-foreground truncate">{schema?.name ?? section.type}</p>
            )}
          </PanelBack>

          <div data-sheet-scroll className="flex-1 overflow-y-auto wb-slim-scroll">
            {/* A built-in this site has its own copy of (edited in GitHub or the code editor): said, with the way back. */}
            {!compatInstall && isEditedBuiltIn(section.type, storelibSources, { defaults: DEFAULT_THEME_SOURCES as Record<string, string>, drawnByStorelib: (t) => !!SECTION_SCHEMAS[t] }) && (
              <EditedBuiltInNote installId={installId} type={section.type} onReset={() => void loadStorelibSources()} />
            )}
            {/* The section's design: its scheme, Customize, heading and body style. Storelib's own:
                an imported theme reads none of them, and its scheme and any such settings of its
                own are drawn below as the theme declares them. */}
            {!compatInstall && <SectionDesignPanel
              section={section}
              schema={schema}
              theme={settingsDraft}
              onUpdateSetting={(key, val) => updateSectionSetting(section.id, key, val)}
              onEditScheme={(schemeKey) => {
                if (schemeKey) setEditSchemeKey(schemeKey)
                setSidebarMode("settings")
                setExpandedSettings("color_schemes")
                setSelectedPanel({ type: "pages" })
              }}
            />}

            {schema?.fields && schema.fields.length > 0 && (() => {
              /**
               * THE SECTION'S OWN COLOURS ARE SHOWN; ONLY THE COPIES ARE NOT.
               *
               * Every colour field used to be hidden here, on the reasoning
               * that colours come from the scheme. That also hid the colours
               * a section declares for itself (stars, a timeline's dot, the
               * scrim over a photo), so a section could not offer a colour
               * just for itself at all. What is hidden now is only an older
               * field that Advanced colors above already edits under its new
               * name (bg_color as Background, button_color as the primary
               * button's fill: section-overrides.ts), so no colour is in the
               * panel twice. Design settings the panel above draws are
               * hidden too, and a "header" divider left with nothing under it.
               */
              const DESIGN_FIELDS = new Set(["color_scheme", "heading_style", "body_style", "custom_heading", "custom_body", "color_overrides"])
              const support = designSupport(schema)
              const covered = new Set(support.colorOverrides.flatMap(k => LEGACY_OVERRIDE_FIELDS[k] ?? []))
              // And a setting whose `visible_if` does not hold for this section's values.
              /* An imported theme's section shows every setting it declares, its scheme among them: the panel above is not drawn for it. */
              const visible = visibleFields(schema.fields, section.settings).filter(f => compatInstall || (f.type !== "color_scheme" && !DESIGN_FIELDS.has(f.id) && !(f.type === "color" && covered.has(f.id))))
              const clean: typeof visible = []
              for (let i = 0; i < visible.length; i++) {
                const f = visible[i]
                if (f.type === "header" || f.type === "paragraph") {
                  const next = visible[i + 1]
                  // Drop a header if nothing meaningful follows before the
                  // next header (i.e. the whole group was colors).
                  if (!next || next.type === "header") continue
                }
                clean.push(f)
              }
              if (clean.length === 0) return null
              return (
                <SiblingSettingsProvider settings={section.settings}>
                <div className="px-3.5 py-3.5 space-y-3.5">
                  {clean.map(field => (
                    <div key={field.id} data-setting-field={field.id}>
                      {field.type === "color" ? (
                        <SectionColorSetting
                          field={field}
                          value={section.settings[field.id]}
                          settings={section.settings}
                          theme={settingsDraft}
                          onChange={val => updateSectionSetting(section.id, field.id, val)}
                        />
                      ) : (
                      <FieldEditor
                        label={fieldCarriesOwnLabel(field) ? undefined : field.label}
                        field={field}
                        value={section.settings[field.id]}
                        onChange={val => updateSectionSetting(section.id, field.id, val)}
                      />
                      )}
                      {field.type !== "header" && field.type !== "paragraph" && field.info && (
                        <p className="text-[11px] text-muted-foreground mt-1">{field.info}</p>
                      )}
                    </div>
                  ))}
                </div>
                </SiblingSettingsProvider>
              )
            })()}

            {/* A section's blocks are not here any more: they are rows under the
                section in the sidebar's tree, and each opens its own panel
                (BlockTreeFor, BlockFields). A short line says where they went,
                for anyone who looks for them where they used to be. */}
            {schema && section.type !== "header" && (schema.blocks?.length || schema.accepts?.length || schema.statics?.length) ? (
              <div className="border-t border-border px-3.5 py-3" data-block-hint="">
                <button
                  type="button"
                  onClick={() => {
                    setTreeOpen((prev) => (prev.has(section.id) ? prev : new Set(prev).add(section.id)))
                    setSelectedPanel({ type: "pages" })
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1.5 text-left text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  <span>
                    {countAll(section.blocks)} block{countAll(section.blocks) === 1 ? "" : "s"} in this section, under it in the list
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                </button>
              </div>
            ) : null}
          </div>

          {/* ── The section's actions, pinned under its settings ──
              THE ROW IS MEASURED, NOT GUESSED.

              This was three equal columns, each with a 16px icon, an 8px gap
              and its label. Measured in Chromium at 13px/600, "Duplicate" is
              69.8px wide, so that button needed 93.8px of content. At the
              sidebar's default 288px a third of the row is 82.6px, and at its
              240px minimum it is 66.7px. Measured in the browser, Duplicate
              ran 23.1px past its button at the default width and 39.1px past
              it at the minimum, and Delete 1.3px and 17.3px. That is the icon
              sitting on the word, and it is what was reported.

              Two things follow from those numbers. The icons go: with them,
              the three labels need 275px at a width that offers 216, and no
              amount of tightening closes that. And the columns stop being
              equal: `flex: 1 1 auto` starts each button at its own label's
              width and shares only the space left over, so "Hide" (33.5px)
              stops reserving as much room as "Duplicate" and every button
              fits at every width the sidebar can be dragged to. Total at the
              240px minimum: 203px of 216. See scripts/check-section-actions.mjs.

              Delete is grey at rest and red under the pointer. Both halves
              of that matter, and they were argued out separately: a button
              that is red before anyone has reached for it is a warning label
              stuck on the end of a row of controls, shouting at somebody who
              has not decided anything yet. With the bin gone, though,
              position is the only thing left telling a destructive action
              apart from a duplicate, so the colour arrives at the moment the
              hand is on it and not before. */}
          {/* ── AND IT STAYS ON SCREEN ──
              On a desktop this row is the last flex child of a column that
              fills the sidebar, so it has always been at the bottom. On a
              phone the same panel is inside the sheet's own scroller, and
              the sheet can be at any height its detents allow: at anything
              short of full, the row was below the fold and the only way to
              reach Hide, Duplicate or Delete was to drag the sheet all the
              way up and then scroll a settings panel to its end. Three
              destructive-adjacent controls that far from where you selected
              the thing is how somebody deletes the wrong section.

              `sticky` rather than `fixed`: it belongs to the panel, so it
              leaves with the panel when you go back to the list, and it is
              bounded by the panel's own box rather than by the viewport —
              nothing to undo when a different sheet opens over it. It costs
              nothing where the column already fits, because an element
              already at the bottom of its scrollport has nowhere to stick
              to. */}
          <div className="sticky bottom-0 z-10 shrink-0 border-t border-[#e5e7eb] bg-white px-3 pt-3 pb-3.5 flex gap-2">
            <button
              type="button"
              className={cn(
                "flex-auto min-w-0 h-10 md:h-9 px-1.5 flex items-center justify-center rounded-lg text-[13px] font-semibold transition-colors duration-150",
                section.hidden
                  ? "bg-[#1a1a2e] text-white active:bg-[#2a2a44]"
                  : "bg-[#f3f4f6] text-[#1a1a2e] hover:bg-[#e9eaee] active:bg-[#e3e4e9]",
              )}
              onClick={() => toggleSectionHidden(section.id)}
            >
              <span className="truncate">{section.hidden ? "Show" : "Hide"}</span>
            </button>
            <button
              type="button"
              className="flex-auto min-w-0 h-10 md:h-9 px-1.5 flex items-center justify-center rounded-lg bg-[#f3f4f6] text-[13px] font-semibold text-[#1a1a2e] transition-colors duration-150 hover:bg-[#e9eaee] active:bg-[#e3e4e9]"
              onClick={() => duplicateSection(section.id)}
            >
              <span className="truncate">Duplicate</span>
            </button>
            <button
              type="button"
              className="flex-auto min-w-0 h-10 md:h-9 px-1.5 flex items-center justify-center rounded-lg bg-[#f3f4f6] text-[13px] font-semibold text-[#1a1a2e] transition-colors duration-150 hover:bg-[#fee2e2] hover:text-[#dc2626] active:bg-[#fecaca] active:text-[#b91c1c]"
              onClick={() => removeSection(section.id)}
            >
              <span className="truncate">Delete</span>
            </button>
          </div>
        </div>
      )
    }

    // THEME SETTINGS panel
    if (selectedPanel.type === "theme_settings" && compatInstall) return compatThemePanel(false)

    if (selectedPanel.type === "theme_settings") {
      /* The same list and panels as General Settings above. */
      const panelGroups = THEME_SETTINGS_GROUPS.filter(group => group.id !== "menus" && (!group.shownWhen || settingsDraft[group.shownWhen as keyof ThemeSettingsValues] === true))
      const openPanelGroup = panelGroups.find(g => g.id === expandedSettings) ?? null
      if (openPanelGroup) {
        const group = openPanelGroup
        return (
          <div className="flex flex-col h-full" data-theme-group-open={group.id}>
            <PanelBack onBack={() => setExpandedSettings(null)}>
              <span className="text-[15px] font-semibold md:text-sm">{group.label}</span>
            </PanelBack>
            <div key={group.id} data-sheet-scroll data-theme-group={group.id} className="flex-1 overflow-y-auto wb-slim-scroll px-3.5 py-3.5 space-y-4 animate-in fade-in-0 slide-in-from-right-2 duration-200 motion-reduce:animate-none">

                  <>
                    {group.id === "branding" ? (
                      <BrandingTabPanel
                        settingsDraft={settingsDraft}
                        updateSetting={updateSetting}
                      />
                    ) : (
                      [
                        group.id === "social" ? (
                          <SocialLinksEditor key="social-links" values={settingsDraft as Record<string, unknown>} onChange={(key, v) => updateSetting(key, v)} />
                        ) : null,
                        ...visibleFields(group.fields, settingsDraft as Record<string, unknown>).filter(field => group.id !== "social" || !SOCIAL_FIELD_IDS.has(field.id)).map(field => {
                        const val = settingsDraft[field.id as keyof ThemeSettingsValues] ?? field.default
                        return (
                          <div key={field.id}>
                            {field.type === "toggle" ? (
                              <WbToggle
                                label={field.label}
                                value={val}
                                onChange={v => updateSetting(field.id, v)}
                                info={field.info}
                              />
                            ) : field.type === "range" ? (
                              <WbSlider
                                label={field.label}
                                value={val}
                                onChange={v => updateSetting(field.id, v)}
                                min={field.min ?? 0}
                                max={field.max ?? 100}
                                step={field.step ?? 1}
                                unit={field.unit ?? ""}
                                defaultValue={typeof field.default === "number" ? field.default : 0}
                              />
                            ) : (field.type === "select" || field.type === "font") && /^font_(heading|body|accent)$/.test(field.id) ? (
                                <FontPreviewPicker
                                  label={field.label}
                                  value={val}
                                  onChange={v => updateSetting(field.id, v)}
                                  options={field.options ?? []}
                                />
                              ) : field.type === "select" || field.type === "font" ? (
                              <WbSelect
                                label={field.label}
                                value={val}
                                onChange={v => updateSetting(field.id, v)}
                                options={field.options ?? []}
                              />
                            ) : field.type === "radio" ? (
                              <WbRadioSegment
                                label={field.label}
                                value={val}
                                onChange={v => updateSetting(field.id, v)}
                                options={field.options ?? []}
                              />
                            ) : field.type === "image" ? (
                              <>
                                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{field.label}</label>
                                <ImagePickerControl
                                  value={typeof val === "string" ? val : ""}
                                  onChange={url => updateSetting(field.id, url)}
                                  label={field.label}
                                />
                              </>
                            ) : field.type === "color" ? (
                              /* No label here: fieldCarriesOwnLabel(field) is true for a
                                 colour, because ColorField's own row is the label. */
                              <FieldEditor field={field} value={val} onChange={v => updateSetting(field.id, v)} />
                            ) : field.type === "header" || field.type === "paragraph" || field.type === "menus" ? (
                              <FieldEditor field={field} value={val} onChange={v => updateSetting(field.id, v)} />
                            ) : (
                              <FieldEditor label={field.label} field={field} value={val} onChange={v => updateSetting(field.id, v)} />
                            )}
                            {field.type !== "toggle" && field.info && (
                              <p className="text-[11px] text-muted-foreground mt-1">{field.info}</p>
                            )}
                          </div>
                        )
                      }),
                      ]
                    )}
                  </>

            </div>
          </div>
        )
      }
      return (
        <div className="flex flex-col h-full">
          <PanelBack onBack={() => setSelectedPanel({ type: "pages" })}>
            <span className="text-[15px] font-semibold md:text-sm">Theme settings</span>
          </PanelBack>
          <div data-sheet-scroll className="flex-1 overflow-y-auto wb-slim-scroll p-2 animate-in fade-in-0 duration-150 motion-reduce:animate-none">
            {panelGroups.map(group => <ThemeGroupRow key={group.id} group={group} onOpen={() => setExpandedSettings(group.id)} />)}
          </div>
        </div>
      )
    }

    return null
  }

  // ── Loading state — no separate screen, render the shell with skeleton ──

  // ── Website URL display ────────────────────────────────────
  /* The website's own name when it has one, else the creator's username. */
  const siteName = siteHandle || username
  /* Opening the live site from the editor is not a visit to it (lib/analytics/own-site). */
  useOwnMarker()
  const websiteUrl = siteName ? getWebsiteShareUrl(siteName) : ""
  const websiteUrlDisplay = siteName ? getWebsiteUrlDisplay(siteName) : ""

  /**
   * ═══════════════════════════════════════════════════════════════════════
   *  WHAT THE NEWER CONTROLS AND THE CANVAS KNOW ABOUT THE SHOP
   * ═══════════════════════════════════════════════════════════════════════
   * The product list offers these products, the menu picker these menus
   * (the header's links as main-menu), and a dynamic source is offered by
   * the page that is open. The canvas draws with the same facts the live
   * site is drawn with (lib/website-builder/storefront-data.ts), so a
   * heading holding `{{ shop.name }}` reads as the shop's name here too,
   * and on the product page as the product being previewed.
   */
  /* The pickers list the products the canvas draws: the same cards, so a picture, a price and an address in the sidebar are the ones on the page. */
  const pickerProducts = useMemo(
    () => catalogCardsForCanvas.map((c) => ({ id: c.id, title: c.settings.title, price: c.settings.price, image: c.settings.image, url: c.settings.url })),
    [catalogCardsForCanvas],
  )
  const canvasMenus = useMemo(() => siteMenus(activeThemeSettings, sections), [activeThemeSettings, sections])
  /* An imported Shopify theme (lib/storelib-theme/compat/install.ts): its canvas, its collections. */
  const canvasCompat = useMemo(() => compatOf(canvasThemeSettings), [canvasThemeSettings])
  const compatCollections = useMemo(
    () => Object.values(builderCollections?.cards ?? {}).map((c) => ({ id: c.id, title: c.title, handle: c.handle, description: c.description, image: c.image, url: c.url, products_count: c.products_count, products: c.products })),
    [builderCollections],
  )
  /* The store's menus under the names a Shopify theme reads them by, as the live site gives them (lib/storelib-theme/compat/menus.ts). */
  const compatCanvasMenus = useMemo(() => compatMenus(canvasMenus as never, rowPageKeys), [canvasMenus, rowPageKeys])
  /*
    A LINK PRESSED IN AN IMPORTED THEME'S PAGE opens that page here, as on the
    live site: always from the header or the footer, which are the site's
    navigation, and from anywhere while the inspector is off. A link with the
    inspector on selects its section instead, as on a page of Storelib's own.
  */
  const rowPageKeysRef = useRef(rowPageKeys)
  rowPageKeysRef.current = rowPageKeys
  /*
    CHECKOUT IN AN IMPORTED THEME'S CANVAS: Add to cart and the cart drawer
    work there (lib/storelib-theme/compat/canvas-cart.ts), and Check out, Buy
    it now and a link to /checkout say where checkout is instead of doing
    nothing. One toast at a time, however often it is pressed.
  */
  const liveOnlyInCompatCanvas = useCallback((what: "checkout" | "account" = "checkout") => {
    /* The account pages draw in the canvas so they can be styled; signing in there is the live site's. */
    if (what === "account") toast("Sign in works on your live site", { id: "compat-live-only-account", description: "You can see and style these pages here." })
    else toast("Checkout only works on your live site", { id: "compat-live-only", description: "Adding to cart works here, so you can try your cart drawer." })
  }, [])
  /* True when another page is opening: the canvas keeps the page being left still until it is drawn (compat-canvas.tsx). */
  const navigateCompatCanvas = useCallback((href: string, chrome: boolean): boolean => {
    if (inspectorRef.current && !chrome) return false
    const to = compatPageForHref(href, rowPageKeysRef.current)
    if (!to) {
      /* A visitor's account and checkout are Storelib's own pages: said, rather than a click that does nothing. */
      const path = href.split(/[?#]/)[0]
      if (/^\/(account|wishlist|checkout)(\/|$)|^\/pages\/wishlist$/.test(path)) {
        if (path.startsWith("/checkout")) liveOnlyInCompatCanvas("checkout")
        else toast(/wishlist/.test(path) ? "The wishlist opens on your live site" : "Sign in and accounts open on your live site", { id: "compat-own-page" })
        return false
      }
      /*
        NEVER A CLICK THAT DOES NOTHING. A link to another website, or to a
        page this one has none of, said nothing at all, which from the
        creator's side is a broken header (scripts/check-builder-nav19.ts).
      */
      const other = href.trim().match(/^(?:https?:)?\/\/([^/?#]+)/i)
      if (other) toast(`Opens ${other[1].replace(/^www\./, "")} on your live site`, { id: "compat-link-out" })
      else if (path.startsWith("/")) toast(`No page at ${path} yet`, { id: "compat-link-missing", description: "Add it in Pages, or point the link somewhere else in Menus." })
      return false
    }
    /* A link to a product opens that product's page, as on the website, not the shop's first product. */
    const linked = to.product ? productsRef.current.find((p) => p.slug === to.product || p.id === to.product) : null
    if (linked) {
      if (currentPageRef.current === "product" && selectedProductIdRef.current === linked.id) return false
      holdCanvasWhileOpening()
      void selectProductRef.current(linked.id, linked.title)
      return true
    }
    /* A product the shop does not sell (one of the store the theme came from) is the shop, as the live site sends it (lib/storelib-theme/compat/links.ts). */
    if (to.product && productsRef.current.length > 0) {
      const shop = rowPageKeysRef.current.includes("collection") ? "collection" : "home"
      if (shop === currentPageRef.current) return false
      holdCanvasWhileOpening()
      pageChangeRef.current(shop as PageKey)
      return true
    }
    if (to.key === currentPageRef.current) {
      if (!to.product) document.querySelector<HTMLIFrameElement>("[data-compat-frame='front']")?.contentWindow?.postMessage({ storelib: 1, type: "scroll", top: 0 }, "*")
      return false
    }
    holdCanvasWhileOpening()
    pageChangeRef.current(to.key as PageKey)
    return true
  }, [holdCanvasWhileOpening, liveOnlyInCompatCanvas])
  /* The pointer on a link in the canvas: that page's sections read ahead, so its switch does not wait for them after the press. */
  const intentInCompatCanvas = useCallback((href: string) => {
    const to = compatPageForHref(href, rowPageKeysRef.current)
    if (to && !to.product) {
      prefetchPageSections(to.key as PageKey)
      warmCompatPage(to.key as PageKey)
    }
  }, [prefetchPageSections, warmCompatPage])
  const selectFromCompatCanvas = useCallback(
    (sectionId: string, blockPath: string[]) => selectSectionFromCanvas(sectionId, blockPath.length ? pathKey(blockPath) : null, null),
    [selectSectionFromCanvas],
  )
  /** Which menu Menus opens at, when something asked for one (the header's Edit, a section's menu picker). */
  const [menuRequest, setMenuRequest] = useState<{ handle: string; n: number } | null>(null)
  /* Navigation is its own panel, opened at the menu asked for; Back returns to whatever asked. */
  const openMenus = useCallback((handle?: string) => {
    setSelectedPanel((prev) => ({ type: "navigation", handle, back: prev.type === "navigation" ? prev.back : prev }))
    /* No menu asked for opens the list, not whichever menu was asked for last time. */
    setMenuRequest((r) => (handle ? { handle, n: (r?.n ?? 0) + 1 } : null))
    if (isMobileViewRef.current) setMobileSidebarOpen(true)
  }, [])
  /**
   * `?panel=navigation` lands straight on the store's menus: it is where
   * /app/website-builder/navigation sends people. Read once the page has
   * loaded, so nothing that settles the first panel can take it back, and
   * taken off the address so a reload opens the page, not the menus again.
   */
  useEffect(() => {
    if (loading) return
    const url = new URL(window.location.href)
    if (url.searchParams.get("panel") !== "navigation") return
    setSidebarMode("sections")
    setPageBrowserOpen(false)
    openMenus()
    url.searchParams.delete("panel")
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash)
  }, [loading, openMenus])
  /**
   * A CHANGE TO THE MENUS IS SAVED TO THE STORE, on its own and soon after
   * the typing stops, whichever way it came: the Navigation panel, a header
   * picking the Main menu, Ask Storelib, Undo. It goes live on every theme,
   * as Shopify's Navigation does. Where the store does not keep menus yet,
   * they are saved with the theme as they always were.
   */
  const menusJson = useMemo(() => JSON.stringify(cleanMenus((settingsDraft as Record<string, unknown>).menus)), [settingsDraft])
  useEffect(() => {
    const st = storeMenusRef.current
    if (loading || !st.available || menusJson === st.synced) return
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/website-builder/menus", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ menus: JSON.parse(menusJson) }),
        })
        if (res.ok) st.synced = menusJson
        else if (res.status === 409) st.available = false
        else toast.error("Could not save menus. Try again.")
      } catch {
        toast.error("Could not save menus. Try again.")
      }
    }, 700)
    return () => window.clearTimeout(timer)
  }, [menusJson, loading])
  /**
   * THE HEADER READS THE MAIN MENU (lib/website-builder/main-menu.ts). The
   * first time the Main menu is written, or picked for the header, the
   * header's own links are written out as the Main menu and the header is
   * pointed at it. Its blocks stay where they are.
   */
  const headerSection = sections.find((s) => s.type === "header") ?? null
  const headerRef = useRef(headerSection)
  headerRef.current = headerSection
  const updateSectionSettingRef = useRef(updateSectionSetting)
  updateSectionSettingRef.current = updateSectionSetting
  const linkHeaderToMain = useCallback(() => {
    const header = headerRef.current
    if (!header || headerReadsMenu(header)) return
    updateSectionSettingRef.current(header.id, "menu", MAIN_MENU)
  }, [])
  const pickHeaderMenu = (handle: string) => {
    const header = headerRef.current
    if (!header) return
    if (handle === MAIN_MENU) {
      const adopted = adoptHeaderLinks(settingsDraft.menus, header)
      if (adopted && adopted.menus !== (settingsDraft.menus as unknown)) updateSetting("menus", adopted.menus)
    }
    updateSectionSetting(header.id, "menu", handle)
  }
  const compatShopify = compatInstall ? ((settingsDraft as Record<string, unknown>).shopify as Record<string, unknown> | undefined) : undefined
  const compatSchemes = useMemo(() => (compatInstall ? themeSchemeList(compatShopify) : null), [compatInstall, compatShopify])
  /* An imported theme's own pictures by name, so a picture setting saved as its old store's address shows the theme's copy (lib/website-builder/picture-address.ts). */
  const [compatMedia, setCompatMedia] = useState<Record<string, string> | null>(null)
  useEffect(() => {
    if (!compatInstall) return
    let live = true
    loadCompatFiles(installId).then((files) => { if (live) setCompatMedia(assetAddresses(files)) }, () => {})
    return () => { live = false }
  }, [compatInstall, installId, compatFilesVersion])
  const fieldEnv = useMemo<EditorFieldEnv>(
    () => ({
      products: pickerProducts,
      menus: canvasMenus,
      template: templateForPage(currentPage),
      openMenus,
      menuRequest,
      header: headerSection,
      linkHeaderToMain,
      communities: builderCommunities?.choices ?? null,
      collections: builderCollections?.choices ?? null,
      /* An imported theme's sections pick from its own schemes, not Storelib's (lib/storelib-theme/compat/scheme-list.ts). */
      colorSchemes: compatSchemes,
      pictureMedia: compatInstall ? compatMedia : null,
    }),
    [pickerProducts, canvasMenus, currentPage, openMenus, menuRequest, headerSection, linkHeaderToMain, builderCommunities, builderCollections, compatSchemes, compatInstall, compatMedia],
  )
  const previewedProduct = useMemo(() => {
    if (currentPage !== "product") return null
    const p = (selectedProductId ? products.find((x) => x.id === selectedProductId) : undefined) ?? products.find((x) => x.title === selectedProductPage) ?? products[0]
    return p
      ? productFacts({ id: p.id, title: p.title, slug: p.slug, description: p.description, price_cents: p.price_cents, compare_at_cents: p.compare_at_cents, thumbnail_url: p.thumbnail_url, gallery_urls: p.gallery_urls, whats_included: p.whats_included, faqs: p.faqs })
      : null
  }, [currentPage, products, selectedProductPage, selectedProductId])
  const canvasDynamic = useMemo(
    () => dynamicContext({
      theme: activeThemeSettings,
      creator: creatorFacts,
      siteUrl: websiteUrl,
      productCount: products.length,
      product: previewedProduct,
      pageTitle: pageTitleFromKey(currentPage),
      template: templateForPage(currentPage),
    }),
    [activeThemeSettings, creatorFacts, websiteUrl, products.length, previewedProduct, currentPage],
  )
  /* Storelib Reviews: a page with a review section draws the store's reviews, or samples (components/website-builder/use-canvas-reviews.ts). */
  const canvasReviews = useCanvasReviews(canvasSections.some((s) => s.type.startsWith("reviews_")), previewedProduct?.id ?? null)
  /*
    THE CANVAS IN ANOTHER LANGUAGE OF THE WEBSITE (the language button beside
    the page switcher): the approved translations laid over the page, its
    menus and its products, as /fr draws them on the website. Drawn only;
    what is edited and saved is always the website's own language.
  */
  const previewLang = usePreviewLanguage(installId)
  const previewMap = previewLang.map
  const canvasMenusShown = useMemo(() => (previewMap ? (localizeMenus(canvasMenus as never, previewMap, { approvedOnly: true }) as typeof canvasMenus) : canvasMenus), [canvasMenus, previewMap])
  const catalogCardsShown = useMemo(() => localizeCards(catalogCardsForCanvas, previewMap, { approvedOnly: true }), [catalogCardsForCanvas, previewMap])
  const canvasData = useMemo(
    () => storefrontData({ dynamic: canvasDynamic, catalog: catalogCardsShown, menus: canvasMenusShown, communities: builderCommunities?.cards, collections: builderCollections?.cards, reviews: canvasReviews }),
    [canvasDynamic, catalogCardsShown, canvasMenusShown, builderCommunities, builderCollections, canvasReviews],
  )
  /* What the canvas draws: the page with its placeholders filled. Never saved. */
  const drawnSections = useMemo(
    () => withThemeBreadcrumbs(
      withDynamicSources(searchListsTheShop(canvasSections), (type) => schemaFor(type, storelibSources, librarySchemas), canvasDynamic),
      { breadcrumbs_enabled: crumbsOn, breadcrumbs_separator: crumbsSep, breadcrumbs_align: crumbsAlign },
      templateForPage(currentPage),
    ),
    [canvasSections, storelibSources, librarySchemas, canvasDynamic, crumbsOn, crumbsSep, crumbsAlign, currentPage],
  )
  /* The page in the language previewed: the text settings with an approved translation, read with the same schemas the website reads. */
  const drawnShown = useMemo(
    () =>
      previewMap
        ? localizeSections(
            drawnSections,
            previewMap,
            (t) => schemaFor(t, storelibSources, librarySchemas)?.fields,
            (st, bt) => schemaFor(st, storelibSources, librarySchemas)?.blocks?.find((b) => b.type === bt)?.fields,
            { approvedOnly: true },
          )
        : drawnSections,
    [drawnSections, previewMap, storelibSources, librarySchemas],
  )
  const shopCardsShown = useMemo(() => localizeCards(shopCards, previewMap, { approvedOnly: true }), [shopCards, previewMap])
  const compatLanguage = useMemo(
    () => (previewLang.locale ? { locale: previewLang.locale, defaultLanguage: previewLang.defaultLanguage, languages: previewLang.languages, map: previewMap } : null),
    [previewLang.locale, previewLang.defaultLanguage, previewLang.languages, previewMap],
  )

  /**
   * Undo and redo, as one pair. On a desktop they sit on the right beside the
   * AI; on a phone they are the middle of the bar, because the middle is the
   * only place on a 390px bar where two buttons can be found without looking.
   * One definition, two homes, so they cannot drift apart.
   */
  const undoRedo = (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="wb-depth h-8 w-8 flex items-center justify-center rounded-lg text-white/80 hover:text-white active:scale-90 transition-[scale,color] duration-150 disabled:active:scale-100 shrink-0"
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            aria-label="Undo"
          >
            <Undo2 className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Undo</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="wb-depth h-8 w-8 flex items-center justify-center rounded-lg text-white/80 hover:text-white active:scale-90 transition-[scale,color] duration-150 disabled:active:scale-100 shrink-0"
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            aria-label="Redo"
          >
            <Redo2 className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Redo</TooltipContent>
      </Tooltip>
    </>
  )

  const canvasBusy = loading || canvasLoading
  /*
    A PRODUCT OPENED FROM THE ADDRESS holds the canvas until its product is
    in (the `canvasLoading` initializer). A product that is not in the list
    (deleted, renamed, a shop with none) never let go of it: the loader
    stayed for good. It lets go by CANVAS_HOLD_CAP_MS whatever happened, and
    shows the product page as it is.
  */
  useEffect(() => {
    if (!canvasLoading || loading) return
    const t = window.setTimeout(() => {
      setCanvasLoading(false)
      reportLoadProblem("editor", "a product opened from the address never arrived")
    }, CANVAS_HOLD_CAP_MS)
    return () => window.clearTimeout(t)
  }, [canvasLoading, loading])
  /*
    AN IMPORTED THEME'S FIRST PAGE IS PART OF THE SAME WAIT. Its canvas is a
    frame that still has the theme's files to read and its page to draw once
    the editor has loaded, and that used to be a second loading screen after
    the first: the squares, then a grey outline of a page, then the page. Now
    the one loader stays over the canvas until the theme's page has painted
    (CompatCanvas, onPainted) and fades straight onto it. Never for longer
    than COMPAT_PAINT_CAP_MS: a theme that never says it has drawn falls back
    to the canvas's own placeholder rather than a loader that stays.
  */
  const [compatPainted, setCompatPainted] = useState(false)
  const onCompatPainted = useCallback(() => setCompatPainted(true), [])
  const compatFirstPaint = !compatPainted && !!compatOf(settingsDraft)
  useEffect(() => {
    if (!compatFirstPaint || canvasBusy) return
    const id = window.setTimeout(() => setCompatPainted(true), COMPAT_PAINT_CAP_MS)
    return () => window.clearTimeout(id)
  }, [compatFirstPaint, canvasBusy])
  const canvasLoaderUp = canvasBusy || compatFirstPaint
  /*
    THE EDITOR OPENING, TIMED for /admin/performance (lib/perf/mark): from
    the screen opening (the page load, or the tap that opened it) to the
    canvas showing the page, and from the editor's data arriving to that.
    Once per editor.
  */
  const openTimed = useRef<{ dataAt: number | null; done: boolean }>({ dataAt: null, done: false })
  useEffect(() => {
    const t = openTimed.current
    if (t.done) return
    if (!loading && t.dataAt === null) t.dataAt = performance.now()
    if (canvasLoaderUp) return
    t.done = true
    perfStep("/step/editor/open", sinceScreenStart())
    if (t.dataAt !== null) perfStep("/step/editor/canvas", performance.now() - t.dataAt)
  }, [loading, canvasLoaderUp])
  /**
   * See `useDelayedFlag`: a fast load should show nothing at all. Half a
   * second, the wait every other loader in Storelib keeps before it shows
   * (SPINNER_WAIT_MS): only a load that is genuinely slow gets one.
   */
  const showCanvasLoader = useDelayedFlag(canvasLoaderUp, SPINNER_WAIT_MS)
  /**
   * The loader's surface stays for a beat after the page has arrived, so it
   * can fade over the page rather than vanish from in front of it.
   */
  const canvasLoaderLingers = useLinger(canvasLoaderUp, 280)
  /** Light chrome on a phone, wherever the clock can still be read. */
  /**
   * THE BAR IS DARK, EVERYWHERE.
   *
   * It was white for one round, on the argument that the surround has to be
   * the panels' own colour for the corner at the seam to open onto anything
   * that belongs there, and that the bar should match it.
   *
   * Only the first half of that was true. The surround is still white and the
   * corner still opens onto it; the bar is a separate surface ABOVE all of
   * that, with its own edge, and nothing at the seam opens onto it. So it can
   * be what it was: dark, which is what tells you at a glance which part of
   * the window is the product and which part is the page you are building.
   */
  const chromeTone = usePhoneChromeTone(isMobileView)

  /**
   * ===========================================================================
   *  NOTHING KEEPS THE EDITOR DISABLED ONCE YOU ARE BACK IN IT
   * ===========================================================================
   * `leaving` puts two things over the editor: `.wb-editor-leaving`, which is
   * `pointer-events: none` on the whole of it, and `.wb-leaving`, a fixed
   * scrim at z-index 300 with no pointer-events rule at all. Together they
   * are a deliberate, total block — correct for the second and a half between
   * pressing Back and the next page arriving.
   *
   * It was set and never cleared. The only thing that ever un-set it was the
   * component being destroyed, which is fine exactly as long as the
   * navigation happens AND the editor is thrown away. Neither is guaranteed:
   *
   *   - Back out of the page it pushed and the browser may restore this one
   *     from its back/forward cache, with every piece of React state exactly
   *     as it was. `leaving` comes back true, and so does the scrim.
   *   - A push that is cancelled, or refused, or simply slow leaves the
   *     editor sitting under its own blocker with nothing to lift it.
   *
   * Either way the editor is alive, looks nearly normal, and takes no input:
   * the canvas will not scroll and nothing in it can be pressed. That is the
   * freeze that gets reported as "the preview stopped working".
   *
   * Three ways back, because they cover different failures. `pageshow` with
   * `persisted` is the bfcache restore and is the specific one. `popstate` is
   * any in-history return. And the watchdog is the general answer to "the
   * navigation did not happen": a push that works takes this component with
   * it, so still being here after three seconds means it did not, and the
   * blocker has outlived its reason.
   */
  useEffect(() => {
    if (!leaving) return
    const revive = () => {
      setLeaving(false)
      setPendingExit(null)
      /* Still here, so the next way out asks again. */
      leaveAnswered.current = false
    }
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) revive()
    }
    window.addEventListener("pageshow", onPageShow)
    window.addEventListener("popstate", revive)
    /**
     * AND IF IT IS STILL HERE LONG AFTER THE PUSH, IT COMES BACK TO LIFE.
     * Loading the address for real is the ceiling's job, counted from the
     * push (leaveFor, lib/website-builder/navigate-ceiling). This watchdog
     * used to do it itself, 3s after the press: the very moment the push
     * started, after the old 3s hold. So a way back that was already on its
     * way was thrown out for a whole page load, unless the router happened to
     * finish within the same few milliseconds: the "random" reload going back
     * to Website (round 23, measured in scripts/nav23-real-router).
     */
    const watchdog = window.setTimeout(revive, LEAVING_SEEN_MS + NAVIGATE_CEILING_MS + 2000)
    return () => {
      window.removeEventListener("pageshow", onPageShow)
      window.removeEventListener("popstate", revive)
      window.clearTimeout(watchdog)
    }
  }, [leaving])

  /**
   * ===========================================================================
   *  COMING BACK TO THE EDITOR, FROM ANYWHERE
   * ===========================================================================
   * Put the app in the background with the code editor open and a keyboard
   * up, come back a minute later, and the canvas would not scroll. The state
   * that does it is not the editor's: it is whatever inline lock was on the
   * document when the webview was suspended, still there when it is resumed,
   * with the layer that set it long gone.
   *
   * The builder never locks the document inline — `wb-fullscreen` is a class
   * and a stylesheet — so an inline `overflow`, `position` or
   * `pointer-events` on the document at this moment belongs to something that
   * did not clean up after itself. It goes, unless a layer is genuinely open
   * right now and means it.
   *
   * `visibilitychange` is the app returning to the foreground, in the native
   * shell and in a browser tab alike. `pageshow` is the back/forward cache.
   * Both end in a resize, because the canvas measures itself and what it
   * measured before the suspension may no longer be true.
   */
  useEffect(() => {
    const revive = () => {
      if (document.visibilityState !== "visible") return
      /**
       * THE GUARD USED TO TALK ITSELF OUT OF EVER RUNNING ON A PHONE. It
       * skipped whenever it found `[data-mobile-bottom-sheet]`, and the
       * builder's sections sheet is mounted for the whole life of the
       * editor because it has a peek. So on a phone this never ran once.
       * `clearStaleDocumentLocks` asks the narrower question that actually
       * matters: is a layer open that SETS a body lock — which the sheet
       * never does. See lib/website-builder/stuck-layer.ts.
       */
      clearStaleDocumentLocks(document)
      window.dispatchEvent(new Event("resize"))
    }
    const onPageShow = () => revive()
    document.addEventListener("visibilitychange", revive)
    window.addEventListener("pageshow", onPageShow)
    return () => {
      document.removeEventListener("visibilitychange", revive)
      window.removeEventListener("pageshow", onPageShow)
    }
  }, [])

  /**
   * ===========================================================================
   *  THE CANVAS SCROLLER PUTS ITSELF RIGHT
   * ===========================================================================
   * Every layer that has ever covered the canvas and left it frozen on the
   * way out — the leaving scrim, the code pane, project settings, a keyboard
   * — has been given its own fix, and the report keeps coming back. So the
   * scroller no longer depends on each cause being found: whenever a layer
   * that covered it goes away it is put back into a known-good state, and on
   * a phone it watches for the failure itself and recovers on the very next
   * drag. See lib/website-builder/canvas-scroll.ts for what "known-good"
   * means and why the layer is re-created.
   */
  const reviveCanvas = useCallback(() => {
    /**
     * THE DOCUMENT FIRST, and this is the half that was missing.
     *
     * Both the code editor and project settings are opened from a dropdown
     * menu, and Radix's dismissable layer sets `body { pointer-events: none }`
     * while that menu is open. Mounting a full-screen pane over it tears the
     * menu down mid-close, so the restore can be skipped and the body stays
     * dead to every press. Reviving the SCROLLER cannot help with that: the
     * touches were never reaching it.
     */
    clearStaleDocumentLocks(document)
    const el = document.getElementById("wb-preview-root")
    if (!el) return
    // A wrapper that a script scrolled is an offset no finger can undo.
    resetClippedAncestors(el, (node) => window.getComputedStyle(node as Element))
    reviveScroller(el, (cb) => window.requestAnimationFrame(cb))
    // A keyboard that was up inside the code frame leaves its scroll offset
    // on the webview; nothing the builder owns can scroll it back but this.
    if (window.scrollY !== 0) window.scrollTo(0, 0)
  }, [])

  /**
   * The gentle half of the above: the document unlocked, the window put
   * back, a script-scrolled wrapper put back. It never touches the
   * scroller's own overflow, so it is safe to run near a gesture. The
   * keyboard closing uses this one.
   */
  const settleCanvas = useCallback(() => {
    clearStaleDocumentLocks(document)
    const el = document.getElementById("wb-preview-root")
    if (el) resetClippedAncestors(el, (node) => window.getComputedStyle(node as Element))
    if (window.scrollY !== 0) window.scrollTo(0, 0)
  }, [])

  /**
   * AND THE PRESS THAT FINDS THE PAGE DEAD IS THE PRESS THAT REVIVES IT.
   *
   * With `pointer-events: none` on the body a press hit-tests through to the
   * root element, so it still reaches a listener on the DOCUMENT even though
   * it reaches nothing inside the page. That is the only signal available
   * from inside a frozen page, and it is enough — whatever left the lock
   * there, and whether or not this file ever learns what did.
   */
  useEffect(() => watchForStuckLayer(document, () => {
    window.dispatchEvent(new Event("resize"))
  }), [])

  // Coming back from the code pane or from project settings.
  const coveredRef = useRef(false)
  useEffect(() => {
    const covered = previewMode === "code" || projectSettingsOpen
    const wasCovered = coveredRef.current
    coveredRef.current = covered
    if (wasCovered && !covered) {
      /**
       * On a desktop the canvas card faded to nothing under the pane, and
       * WebKit can drop a scroller's layer after that, so the full revive
       * with its overflow toggle is right there. On a phone the card never
       * faded, and the toggle is the one thing that must not run: a person
       * coming back from the code editor scrolls within the second, and an
       * overflow toggle landing inside that gesture kills the native scroll
       * it lands in. The phone gets the gentle settle: document unlocked,
       * window put back, and nothing done to the scroller itself.
       */
      const back = isMobileView ? settleCanvas : reviveCanvas
      // After the pane's own close transition, and once more for a keyboard
      // that was still on its way down.
      const a = window.setTimeout(back, 340)
      const b = window.setTimeout(back, 900)
      return () => { window.clearTimeout(a); window.clearTimeout(b) }
    }
  }, [previewMode, projectSettingsOpen, isMobileView, reviveCanvas, settleCanvas])

  /**
   * ===================================================================
   *  NO WATCHDOG ON THE CANVAS. IT WAS THE FREEZE.
   * ===================================================================
   * For one week a listener here judged a drag "dead" when the canvas had
   * not moved after 24px of finger travel, and revived the scroller on the
   * spot by toggling its overflow. On iOS the native scroll runs on another
   * thread and the page's scroll position lags the finger by a few frames,
   * so a flick reaches 24px before the position has moved. The revive then
   * tore down the scroller's native scrolling node in the middle of the
   * gesture, which killed the scroll that had just begun, and did it again
   * on the next drag, and the next. Reports from the phone described it
   * exactly: touches reaching the scroller, scripts able to move it,
   * nothing cancelling the gesture, no native scroll ever beginning, a
   * fresh element as dead as the old one. That was the code judging a
   * healthy scroll dead and then making it so.
   *
   * Scrolling worked before that listener and it works without it. The two
   * repairs that stay run on discrete events, never during a gesture:
   * coming back from the code pane or project settings (above), and the
   * keyboard closing (below), which only unlocks the document and puts the
   * window back.
   */

  /**
   * AND THE KEYBOARD, which was the layer nobody had named.
   *
   * Focus a field in the sidebar sheet, the assistant, or a section's own
   * form and iOS scrolls the WINDOW to lift it above the keyboard, locked
   * document or not, then leaves it there when the keyboard goes. The fixed
   * surface is offset from the viewport, the scroller half off screen, and
   * the next touch moves nothing. The two revives above only ran when the
   * code pane or project settings closed; a keyboard closing did the same
   * damage with no handler. Twice, staggered: once as it goes, once after
   * the keyboard animation has finished putting the viewport back.
   */
  useEffect(() => watchKeyboard(window, document, () => {
    settleCanvas()
    window.setTimeout(settleCanvas, 420)
  }), [settleCanvas])

  /** What leaving would cost right now, if anything. */
  const leaveReason: LeaveReason = {
    draft: isDirty,
    code: codeDirty,
    busy: saving || publishing,
  }

  /**
   * One door out, used by both exits. Asks only when there is something to
   * lose; otherwise it goes, which is what somebody pressing Back meant.
   */
  /**
   * =====================================================================
   *  THE CODE EDITOR IS A PAGE ON A PHONE, WITH ITS OWN ADDRESS
   * =====================================================================
   * On a desktop it opens over the canvas and closes back onto it. On a
   * phone that pane was a fixed, full-screen iframe layer, and coming back
   * from it was the one thing that reliably left the canvas deaf. So on a
   * phone it is not a layer at all: it is the code editor's own route,
   * reached by navigation and left by navigation, and the builder mounts
   * fresh on the way back with nothing left over from the pane. The draft
   * is saved before leaving when there is anything to save, and if that
   * save fails the person stays here with the error, rather than losing
   * their work to a page change.
   */
  const openCode = async (path?: string | null) => {
    if (path) setCodeFilePath(path)
    if (!isMobileView) {
      setPreviewMode("code")
      setMobileSidebarOpen(false)
      /* Ask Storelib's pill folds away by itself while the code is showing, and comes back after. */
      return
    }
    if (isDirty && !saving && !publishing) {
      const ok = await saveDraft({ quiet: true })
      if (!ok) return
    }
    const q = new URLSearchParams({ back: "editor" })
    if (path) q.set("path", path)
    // NOT `setLeaving(true)`: that is the "Going back" screen, for leaving the
    // builder. Opening the code editor is going forward, and the code page
    // says it is loading in its own words when it arrives.
    router.push(`/website-builder/code/${installId}?${q.toString()}`)
  }

  /**
   * EVERY WAY OUT GOES THROUGH HERE, AND EVERY WAY OUT ENDS.
   *
   * The soft navigation first: instant when the route is warm, and it keeps
   * the app's state. If this page is still here when the ceiling is reached,
   * the address is loaded for real. See navigate-ceiling.ts for why, and the
   * prefetch below for why the ceiling is rarely reached.
   */
  const cancelCeiling = useRef<(() => void) | null>(null)
  const leaveFor = useCallback((href: string) => {
    leavingHref.current = href
    setLeaving(true)
    cancelCeiling.current?.()
    /**
     * THE SCREEN THAT SAYS YOU ARE LEAVING IS WORTH SEEING.
     *
     * Prefetching the way out made the navigation instant, and an instant
     * navigation paints the next page before this one has drawn the screen
     * that says where you are going. What was left was a press, a pause,
     * and then somewhere else. The navigation waits a moment for that screen
     * to be on the glass: long enough to read the first word, short enough
     * that nobody waits for it. The ceiling starts from the push.
     */
    const start = window.setTimeout(() => {
      cancelCeiling.current = navigateWithCeiling(
        () => router.push(href),
        () => window.location.assign(href),
        (cb, ms) => window.setTimeout(cb, ms),
        (id) => window.clearTimeout(id),
      )
    }, LEAVING_SEEN_MS)
    cancelCeiling.current = () => window.clearTimeout(start)
  }, [router])
  // Navigating unmounts this page, and that cancels the fallback: a hard load
  // happens only when the soft one did not.
  useEffect(() => () => cancelCeiling.current?.(), [])

  /**
   * The two addresses out of here, warmed while nothing else is happening, so
   * the way back is a repaint rather than a round trip.
   */
  useEffect(() => {
    const warm = () => {
      try {
        router.prefetch("/app/website-builder")
        router.prefetch("/app")
      } catch {
        // A router that will not prefetch still navigates; this is only a head start.
      }
    }
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(warm, { timeout: 4000 })
      return () => (w as unknown as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback?.(id)
    }
    const id = window.setTimeout(warm, 1500)
    return () => window.clearTimeout(id)
  }, [router])

  const requestExit = useCallback(
    (href: string) => {
      if (hasSomethingToLose({ draft: isDirty, code: codeDirty, busy: saving || publishing })) {
        setPendingExit(href)
        return
      }
      leaveFor(href)
    },
    [isDirty, codeDirty, saving, publishing, leaveFor],
  )

  /**
   * ===========================================================================
   *  THE BROWSER'S BACK, AND A PHONE'S, ASK TOO
   * ===========================================================================
   * Back in the bar went through `requestExit`; the browser's Back, Android's
   * back button and an iOS edge swipe did not, and took unsaved edits with
   * them. A history entry for the same address is put on top while there is
   * something to lose. Back then lands on the entry under it, which is still
   * this editor, and the question is asked there: Cancel puts the entry back,
   * Save and Discard go on back. With nothing to lose the press carries on at
   * once, so one press of Back is still one press.
   *
   * The entry carries the router's own state, so Next lets the push through
   * and does nothing with it (the reason components/onepage/onepage-editor.tsx
   * replaces state the same way).
   */
  const BACK_EXIT = "__back__"
  const loseNow = hasSomethingToLose({ draft: isDirty, code: codeDirty, busy: saving || publishing })
  const loseRef = useRef(loseNow)
  loseRef.current = loseNow
  const guardArmed = useRef(false)
  const goingBack = useRef(false)
  const armBackGuard = useCallback(() => {
    if (guardArmed.current || typeof window === "undefined") return
    try {
      const state = (window.history.state ?? {}) as Record<string, unknown>
      window.history.pushState({ ...state, wbLeaveGuard: true }, "", window.location.href)
      guardArmed.current = true
    } catch {
      /* A history that refuses the entry: Back is then the browser's alone, and beforeunload still asks. */
    }
  }, [])
  useEffect(() => {
    if (loseNow) armBackGuard()
  }, [loseNow, armBackGuard])
  /* Arrived back ON a guard entry (back from the code editor on a phone): it is this editor's, and armed. */
  useEffect(() => {
    if ((window.history.state as { wbLeaveGuard?: boolean } | null)?.wbLeaveGuard) guardArmed.current = true
  }, [])
  const goBackForReal = useCallback(() => {
    goingBack.current = true
    leaveAnswered.current = true
    backThen(() => leaveFor("/app/website-builder"))
  }, [leaveFor])
  useEffect(() => {
    const onPop = () => {
      if (!guardArmed.current || goingBack.current) return
      /* Forward onto the guard again: nothing has been left. */
      if ((window.history.state as { wbLeaveGuard?: boolean } | null)?.wbLeaveGuard) return
      guardArmed.current = false
      if (!loseRef.current) {
        goBackForReal()
        return
      }
      setPendingExit(BACK_EXIT)
    }
    /* Brought back from the back/forward cache: the editor is in use again, and its next Back is asked about again. */
    const onShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return
      goingBack.current = false
      leaveAnswered.current = false
      if (loseRef.current) armBackGuard()
    }
    window.addEventListener("popstate", onPop)
    window.addEventListener("pageshow", onShow)
    return () => {
      window.removeEventListener("popstate", onPop)
      window.removeEventListener("pageshow", onShow)
    }
  }, [goBackForReal, armBackGuard])

  /**
   * AND A LINK IN THE BUILDER'S OWN PANELS. The bar's Back and the actions
   * menu go through `requestExit`, and so does Website settings; a plain link
   * somewhere in a panel (a control's "Manage" link to another part of the
   * app) did not, and was a full page load past the question. Same-origin
   * links that leave the editor are sent through the same door. The canvas
   * is not touched: it has its own rules for links (lib/website-builder/
   * canvas-intercept.ts).
   */
  const requestExitRef = useRef(requestExit)
  requestExitRef.current = requestExit
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return
      if (a.closest("#wb-preview-root")) return
      let url: URL
      try {
        url = new URL(a.href, window.location.href)
      } catch {
        return
      }
      if (url.origin !== window.location.origin) return
      if (url.pathname.startsWith("/website-builder/")) return
      e.preventDefault()
      requestExitRef.current(url.pathname + url.search + url.hash)
    }
    /* Capture, so it is ahead of a Next <Link>, which stands down for a click already prevented. */
    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [])

  /** Save, from the leave dialog: the draft is written and then the page goes where it was going. */
  const saveThenLeave = async (): Promise<boolean> => {
    /* Save, pressed on the way out, keeps this editor's version. */
    const ok = await saveDraft({ quiet: true, keepMine: true })
    if (!ok) return false
    const href = pendingExit
    setPendingExit(null)
    if (href === BACK_EXIT) goBackForReal()
    else if (href) {
      leaveAnswered.current = true
      leaveFor(href)
    }
    return true
  }

  /**
   * ===========================================================================
   *  THE ACTIONS MENU, BUILT ONLY WHEN WHAT IT SAYS CHANGES
   * ===========================================================================
   * Its rows were an array literal in the bar, so every render of this
   * editor (an autosave, a poll, a keystroke in a field) handed the menu a
   * new list and a new trigger, and an open phone sheet redrew its rows
   * underneath a finger that was dragging it. The rows depend on five facts;
   * the functions they call are read at the moment of the press, through a
   * ref, so they can be as new as they like without the list changing.
   */
  const calls = {
    openCode,
    setPreviewMode,
    openThemeSettings: () => {
      setSidebarMode("settings")
      setPageBrowserOpen(false)
      setSelectedPanel({ type: "theme_settings" })
      if (isMobileView) setMobileSidebarOpen(true)
    },
    openSettings: () => {
      setPreviewMode("settings")
      setProjectSettingsOpen(true)
      setMobileSidebarOpen(false)
      if (isMobileView) setAiOpen(false)
    },
    openConnections,
    openConnection,
    handleUndo,
    handleRedo,
    requestExit,
    previewIn: (code: string) => previewLang.setLocale(code),
  }
  const actionCalls = useRef(calls)
  actionCalls.current = calls
  const inCode = previewMode === "code"
  const previewLangs = previewLang.languages
  const previewLocaleShown = previewLang.locale ?? previewLang.defaultLanguage
  const actionItems = useMemo<ActionMenuItem[]>(() => {
    return [
      {
        label: inCode ? "Back to preview" : "View code",
        icon: <Code2 className="h-4 w-4" />,
        onClick: () => {
          if (inCode) actionCalls.current.setPreviewMode("preview")
          else void actionCalls.current.openCode()
        },
      },
      {
        label: "Theme settings",
        icon: <Settings className="h-4 w-4" />,
        onClick: () => actionCalls.current.openThemeSettings(),
      },
      {
        // The desktop pill has a Website Settings segment. A phone has
        // no pill, so this is the phone's way in; on a desktop it is
        // the same page from a second door.
        label: "Website settings",
        icon: <SlidersHorizontal className="h-4 w-4" />,
        onClick: () => actionCalls.current.openSettings(),
      },
      /* A phone's way to the canvas's language (the desktop's is the button beside the page switcher): the next one, round. */
      ...(isMobileView && previewLangs.length > 1
        ? (() => {
            const now = previewLangs.indexOf(previewLocaleShown)
            const next = previewLangs[(now + 1) % previewLangs.length]
            return [{
              label: `Preview in ${languageName(next, "en")}`,
              icon: <Languages className="h-4 w-4" />,
              onClick: () => actionCalls.current.previewIn(next),
            }]
          })()
        : []),
      {
        label: "Connect Claude Code or Codex",
        icon: <Plug className="h-4 w-4" />,
        onClick: () => actionCalls.current.openConnections(),
      },
      /* The bar's connection mark, for a phone, whose bar has no room. */
      ...(isMobileView
        ? [{
            label: connection.online ? connection.label : "GitHub",
            icon: <ConnectionMarkIcon kind={connection.kind} className="h-4 w-4" />,
            onClick: () => actionCalls.current.openConnection(),
          }]
        : []),
      {
        label: "Undo",
        icon: <Undo2 className="h-4 w-4" />,
        onClick: () => actionCalls.current.handleUndo(),
        separatorBefore: true,
      },
      {
        label: "Redo",
        icon: <Redo2 className="h-4 w-4" />,
        onClick: () => actionCalls.current.handleRedo(),
      },
      ...(websiteUrl
        ? [{
            label: "View live site",
            icon: <ExternalLink className="h-4 w-4" />,
            href: ownOpen(websiteUrl),
            target: "_blank" as const,
            separatorBefore: true,
          }]
        : []),
      {
        label: "Back to Dashboard",
        icon: <ArrowLeft className="h-4 w-4" />,
        onClick: () => actionCalls.current.requestExit("/app"),
        separatorBefore: !websiteUrl,
      },
    ]
  }, [inCode, isMobileView, connection.online, connection.label, connection.kind, websiteUrl, previewLangs, previewLocaleShown])
  /**
   * The three dots. 32px drawn, and on a phone a 44px press area around it
   * (an invisible band, so the bar does not move). It presses in the way the
   * bar's other buttons do: a step smaller, on `scale`, which is what the
   * transition names.
   */
  const actionsTrigger = useMemo(
    () => (
      <button
        type="button"
        className="relative h-8 w-8 flex items-center justify-center rounded-lg text-[var(--wb-chrome-fg-3)] hover:bg-[var(--wb-chrome-hover)] hover:text-[var(--wb-chrome-fg)] active:scale-[0.92] active:bg-[var(--wb-chrome-active)] transition-[background-color,scale,color] duration-150 shrink-0 after:absolute after:-inset-1.5 after:content-[''] md:after:hidden [-webkit-tap-highlight-color:transparent]"
        title="Theme options"
        aria-label="Actions"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
    ),
    [],
  )

  /*
    ASK STORELIB'S CALLBACKS, STABLE. The chat is memoised, so it renders
    when what it is given changes and not on every edit the editor makes;
    an arrow written inline here would be a new prop every render and undo
    that. `openCode` is a plain function of this render, reached through a
    ref for the same reason.
  */
  const openCodeRef = useRef(openCode)
  openCodeRef.current = openCode
  const closeAiSheet = useCallback(() => setAiOpen(false), [])
  /** Closed with its X on a computer: the pill goes, and stays gone until the bar's Ask AI. */
  const closeAiDock = useCallback(() => {
    setAiOpen(false)
    rememberAskDockClosed(true)
  }, [])
  /*
    THE ASSISTANT BUILT ANOTHER PAGE (build_page): it is a draft on the server, so the site has unpublished changes and the
    page belongs in the list. Its sections load from the server when it is opened, as every page's do.
  */
  const aiPageWritten = useCallback((key: string, title: string) => {
    setUnpublished(true)
    forgetPage(key)
    if (key === "home" || key in PAGE_META) return
    setCustomPages((prev) => (prev.some((p) => p.key === key) ? prev : [...prev, { id: key, name: title || pageTitleFromKey(key), key: key as PageKey }]))
  }, [forgetPage])
  const reloadAiSources = useCallback(() => {
    void loadStorelibSources()
    /* An imported theme draws from its own files and its panel is made from its schema: both read again after a run that wrote code. */
    if (compatInstall) {
      setCompatFilesVersion((n) => n + 1)
      setCompatPanelVersion((n) => n + 1)
    }
  }, [loadStorelibSources, compatInstall])
  /**
   * A SECTION FILE THE RUN HAS JUST WRITTEN, drawn now. It was compiled and
   * drawn on the server before it was sent, and it is saved when the run
   * ends; `reloadAiSources` then reads back what was stored. Only the one
   * file changes, so every other section keeps its compiled copy and the
   * canvas updates in place, with no reload and no flash.
   */
  const aiSourceWritten = useCallback((path: string, source: string) => {
    setStorelibSources((previous) => (previous[path] === source ? previous : { ...previous, [path]: source }))
  }, [])
  /**
   * WHAT STORELIB AI IS WORKING ON, AND WHAT IT JUST CHANGED: a faint sheen
   * over the first while the run works, a violet ring that fades once over
   * the second (components/website-builder/editor/ai-working-overlay.tsx).
   * When the run ends the first section it changed is brought into view if
   * it is not on screen, smoothly, by the same reveal Add section uses.
   */
  const [aiWorkingIds, setAiWorkingIds] = useState<string[]>([])
  const [aiSettledIds, setAiSettledIds] = useState<string[]>([])
  /* What the run is about ("Editing Pricing", "New section: Hero with flag"), shown on the section it marks. */
  const [aiWorkingLabel, setAiWorkingLabel] = useState<string | undefined>(undefined)
  const aiWorkingChange = useCallback((ids: string[], label?: string) => {
    setAiWorkingIds((was) => (was.length === ids.length && was.every((id, i) => id === ids[i]) ? was : ids))
    setAiWorkingLabel(ids.length ? label : undefined)
  }, [])
  const aiRunFinished = useCallback(
    (ids: string[]) => {
      /* A section placed this moment is on the page from the next render: looked for again a frame later. */
      const settle = (again: boolean) => {
        const order = sectionsRef.current.map((s) => s.id)
        const onPage = ids.filter((id) => order.includes(id)).sort((a, b) => order.indexOf(a) - order.indexOf(b))
        if (onPage.length === 0) {
          if (again) requestAnimationFrame(() => requestAnimationFrame(() => settle(false)))
          return
        }
        setAiSettledIds(onPage)
        revealSection(onPage[0])
      }
      settle(true)
    },
    [revealSection],
  )
  useEffect(() => {
    if (aiSettledIds.length === 0) return
    const done = setTimeout(() => setAiSettledIds([]), SETTLE_MS + 100)
    return () => clearTimeout(done)
  }, [aiSettledIds])
  const openAiCodeFromSheet = useCallback((path: string) => {
    setAiOpen(false)
    void openCodeRef.current(path)
  }, [])
  const openAiCodeFromDock = useCallback((path: string) => {
    void openCodeRef.current(path)
  }, [])
  /** Ask Storelib's Connect AI: Website settings on Connections, where Claude Code and Codex are connected. */
  const connectAiFromChat = useCallback(() => actionCalls.current.openConnections(), [])
  /** What Ask Storelib's suggestions know about the store. Unknown while the list loads. */
  const aiStore = useMemo(
    () => ({ productCount: productsLoading ? null : products.length }),
    [productsLoading, products.length],
  )
  const aiSettings = settingsDraft as Record<string, unknown>
  const aiSelected = selectedSectionId ?? undefined

  // ── Main editor layout ─────────────────────────────────────
  return (
    <div
      /**
       * This surface polices its own touch. `CapacitorBounceGuard` listens on
       * the document and cancels a vertical gesture whenever the DOCUMENT is
       * not scrollable — and this one never is, by design. Everything the
       * guard would do here is already done: html and body are locked with
       * `overscroll-behavior: none`, the canvas is `touch-action: pan-y` with
       * `overscroll-behavior: contain`, and it nudges itself off either end
       * at touchdown. See the opt-out in that component.
       */
      data-wb-no-bounce-guard=""
      /* Full screen: the canvas's rings go at once, in the stylesheet, while the sections are told a fold later (fullSettled). */
      data-wb-full={fullView ? "" : undefined}
      className={cn(
        // `fixed inset-0`, not `h-svh`. A 100svh element is CONTENT, and the
        // body adds its safe-area padding underneath it — one screen plus
        // 34px, a document that scrolls, a top bar that slides back under
        // the status bar. Fixed is measured against the viewport and adds
        // nothing to the document. FullScreenLock below zeroes that padding
        // so nothing else can put the scroll back.
        /**
         * ONE TONE, BECAUSE THERE IS ONLY ONE THING IN HERE WITH A COLOUR.
         *
         * This carried three: a grey root, a darker row between the panels,
         * and white panels on top of them. The idea was that an arc is only
         * visible if what it opens onto differs from what is beside it, so
         * each ring of corners got its own backdrop.
         *
         * It is true and it was the wrong conclusion. The corner at the seam
         * is not there to be seen, it is there so the page has a shape. Give
         * the surround a tone of its own and that corner opens onto a colour
         * belonging to neither panel, which is the wedge that kept being
         * reported however it was drawn or filled.
         *
         * So the surround is white, the same white as the panels standing on
         * it, and the four pixels between them are that white showing
         * through. Below the bar the only thing with a colour of its own is
         * the page somebody is building.
         *
         * The BAR is dark, and is not part of this. It sits above the row
         * with its own edge, and nothing at the seam opens onto it.
         */
        "wb-editor fixed inset-0 flex flex-col bg-[#eef1f5] overflow-hidden wb-editor-enter",
        chromeTone === "light" && "wb-chrome-light",
        // Leaving fades the editor while the next page is fetched, so the
        // hand-off is a dissolve rather than a hard cut when it lands.
        leaving && "wb-editor-leaving",
      )}
    >
      <FullScreenLock tone={chromeTone} fromFirstPaint />
      <CanvasTopLayerGuard />
      {/* ── Top bar ── */}
      {/* Dark, like the reference: the bar is chrome, and chrome that is the
          same colour as the page it frames is chrome you keep mistaking for
          the page. Everything on it is white-on-dark from here down. */}
      {/* data-sheet-clear: the phone sheets' tallest stop covers this bar or
          clears it, never cuts across its buttons (sheet-gestures, clearOfBar). */}
      <header className="wb-editor-topbar relative bg-[var(--wb-chrome-bg)] text-[var(--wb-chrome-fg)] border-b border-[var(--wb-chrome-line)] flex items-center px-3 md:px-4 gap-2 shrink-0 z-50" data-sheet-clear="">
        {/* LEFT: Exit + sidebar mode toggles (desktop only) */}
        <div className="flex items-center gap-1.5 min-w-0">
          {/* Exit button — X on mobile (Shopify-style editor close), back arrow on desktop */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="h-8 w-8 flex items-center justify-center rounded-lg text-[var(--wb-chrome-fg-2)] hover:bg-[var(--wb-chrome-hover)] hover:text-[var(--wb-chrome-fg)] active:scale-90 active:bg-[var(--wb-chrome-active)] transition-[background-color,scale,color] duration-150 shrink-0"
                onClick={() => requestExit("/app/website-builder")}
                aria-label="Back"
              >
                {isMobileView ? (
                  <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={2} />
                ) : (
                  <BackWithBarIcon className="h-4 w-4" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Exit</TooltipContent>
          </Tooltip>

<div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-medium text-[var(--wb-chrome-fg)] truncate hidden md:block max-w-[180px]">{install?.name}</span>
          {/*
            THE DOT IS THE WHOLE BADGE.

            "Live" in a bordered pill is a word, a border and a colour all
            saying one thing, sitting next to the theme's name where the name
            is what you are reading. The dot says it in one glyph, and the
            word is still there for anyone who hovers or is using a screen
            reader — where it belongs, rather than occupying the bar.
          */}
          {install?.status === "published" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="hidden md:flex h-4 w-4 shrink-0 items-center justify-center"
                  aria-label="Site is live"
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">Site is live</TooltipContent>
            </Tooltip>
          )}
          {/* Built once per state of what it lists (see `actionItems`), so the
              builder re-rendering under an open sheet does not rebuild it. */}
          <ResponsiveActionMenu
            title="Actions"
            align="center"
            menuWidth="w-52"
            trigger={actionsTrigger}
            items={actionItems}
          />
          {/* A phone puts undo and redo here, straight after the menu, rather
              than in the middle of the bar. Centred, they were an island
              between the project's name and the page's; here they are the
              end of the row of things you do TO the project, which is where
              a thumb already is. */}
          {isMobileView && undoRedo}
          {/* No running commentary on the save. The Publish button already
              says whether the public site is behind, in the one place
              somebody goes to do something about it, and a sentence of grey
              text beside the project's name only pushed the name and its
              menu away from the switcher they belong next to. */}
        </div>
          {/* Preview, the code, or the project. It follows the project's own
              name and menu rather than preceding them: the row reads left to
              right as which project, what to do with it, then how you are
              looking at it. A phone has no room for it and reaches Code and
              Website settings from the menu. */}
          {!isMobileView && (
            <div className="ml-1.5 shrink-0">
              <PreviewModeSwitch
                mode={previewMode}
                onChange={(m) => {
                  setPreviewMode(m)
                  if (m === "settings") setProjectSettingsOpen(true)
                }}
              />
            </div>
          )}
        </div>

        {/* CENTER: theme name + Live badge + 3-dots menu + unsaved indicator */}
        

        {/*
          CENTRE: WHICH PAGE, AND HOW YOU ARE LOOKING AT IT.

          The page you are editing is the most important fact on this bar, so
          it is in the middle and it is named rather than implied. Everything
          immediately around it is about LOOKING at that page — the format you
          are viewing it in on the left, reloading it and opening it for real
          on the right — and everything about the PROJECT stays on the edges.
        */}
        <div className="flex flex-1 items-center justify-center gap-1.5 min-w-0">
          {/*
            HOW YOU ARE LOOKING: ONE ICON, TWO SIZES (round 22, the owner: "keep only mobile and desktop"). It shows the size
            you are looking at, and a click moves to the other. Large (the page full screen with the sidebar folded) is no
            longer one of the stops: the desktop canvas already takes the room the editor has, and the live site is one
            click to the right. A session that was left in Large comes back to Desktop on the first click or Escape. A
            phone has no room for it, and its canvas is already the screen.
          */}
          {!isMobileView && (() => {
            const SIZES = [
              { key: "desktop", label: "Desktop", Icon: Monitor },
              { key: "mobile", label: `Phone (${DEVICE_WIDTH.mobile}px)`, Icon: Smartphone },
            ] as const
            const at = fullView || device !== "mobile" ? 0 : 1
            const now = SIZES[at]
            const next = fullView ? SIZES[0] : SIZES[(at + 1) % SIZES.length]
            const go = (key: (typeof SIZES)[number]["key"]) => {
              if (fullView) setFullScreen(false)
              setDevice(key)
            }
            return (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Preview size: ${now.label}. Switch to ${next.label}`}
                    data-wb-device-switch=""
                    data-wb-device={now.key}
                    onClick={() => go(next.key)}
                    className="hidden sm:flex h-8 w-8 aspect-square shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-[var(--wb-chrome-fg)] transition-[background-color,color] duration-150 hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
                  >
                    <now.Icon key={now.key} className="h-[15px] w-[15px] animate-in fade-in zoom-in-90 duration-150" strokeWidth={1.75} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{`${now.label} · click for ${next.label}`}</TooltipContent>
              </Tooltip>
            )
          })()}

          {/* FULL SCREEN, beside the size (the owner: "a fullscreen button next to desktop and mobile"): the sidebar folds away and the canvas takes the room; again, or Escape, and it all comes back. */}
          {!isMobileView && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={fullView ? "Exit full screen" : "Full screen"}
                  aria-pressed={fullView}
                  data-wb-full-toggle=""
                  onClick={() => toggleCanvasFullScreen(!fullView)}
                  className="hidden sm:flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-[var(--wb-chrome-fg)] transition-[background-color,color] duration-150 hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
                >
                  {fullView ? <Minimize2 className="h-[14px] w-[14px]" strokeWidth={1.75} /> : <Maximize2 className="h-[14px] w-[14px]" strokeWidth={1.75} />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{fullView ? "Exit full screen" : "Full screen"}</TooltipContent>
            </Tooltip>
          )}

          {/* The language the canvas is drawn in, for a website with more than one. */}
          {!isMobileView && <PreviewLanguageSwitch lang={previewLang} />}

          {!isMobileView && (
          <PageSwitcher
            pages={sitePages}
            current={currentPage}
            onSelect={(key) => { void handlePageChange(key as PageKey) }}
            onCreate={() => setAddPageOpen(true)}
            onDelete={(key) => { void handleDeletePage(key) }}
            onReload={() => { void handlePageChange(currentPage) }}
            reloading={sectionsLoading}
            disabled={sectionsLoading}
            products={switcherProducts}
            currentProduct={selectedProductPage}
            onSelectProduct={selectProductById}
            onIntent={pageIntent}
          />
          )}

          {/* Open the real thing, to the right of the page it opens. */}
          {websiteUrl && (
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={ownOpen(websiteUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden sm:flex h-8 w-8 items-center justify-center rounded-lg text-[var(--wb-chrome-fg-3)] transition-colors hover:bg-[var(--wb-chrome-hover)] hover:text-[var(--wb-chrome-fg)] shrink-0"
                  aria-label="Open the live page"
                >
                  <ExternalLink className="h-4 w-4" strokeWidth={1.75} />
                </a>
              </TooltipTrigger>
              <TooltipContent side="bottom">Open the live page</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* RIGHT: where the site is, and what to do with it. */}
        <div className="flex items-center gap-2 shrink-0">
          {/* The address, as an address.
              A globe icon said "there is a website somewhere"; the domain says
              WHICH website, which is the thing somebody actually wants to
              check before they publish — and it is one fewer hover to find
              out. Falls back to the icon where there is no room for text. */}
          {/* Device Switcher — pill toggle */}
          
          {/* Inspector toggle — filled when on.
              When ON (default): clicking a section highlights it with the
              blue selection rectangle and opens its settings panel.
              When OFF: canvas behaves like a pure preview — no outlines,
              no section-click interception. */}
          {/* Undo and redo are a pair and sit as one: the left button and
              the right button. On a desktop they are here; a phone puts them
              beside the menu, on the left. */}
          {!isMobileView && undoRedo}

          {/* The inspector, immediately beside the AI at every size. The two
              of them are the builder's own tools — everything else on this
              side is about the site — so they stand together, and the pair
              is what a thumb reaches for on a phone. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={cn(
                  "wb-depth wb-inspector h-8 w-8 flex items-center justify-center rounded-lg text-[var(--wb-chrome-fg-2)] hover:text-[var(--wb-chrome-fg)] shrink-0",
                  inspectorEnabled && "wb-inspector-on",
                )}
                onClick={toggleInspector}
                aria-label={inspectorEnabled ? "Disable section inspector" : "Enable section inspector"}
                aria-pressed={inspectorEnabled}
              >
                <MousePointerClick className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {inspectorEnabled ? "Inspector: on, click to disable" : "Inspector: off, click to enable"}
            </TooltipContent>
          </Tooltip>

          {/* What this site is connected to, by that company's own mark:
              Claude's, OpenAI's, or GitHub's, which is also the mark when
              nothing is connected yet. A green dot while the connection is
              live, pulsing while it is working. It opens Connections on the
              path that connection lives on. A phone reaches it from the menu.
              The notice of what is changing hangs from it. */}
          {!isMobileView && (
            <ConnectionButton
              mark={connection}
              working={!!liveBatch}
              onOpen={openConnection}
              buttonRef={connectionButtonRef}
            />
          )}
          <LiveChangeNotice
            batch={liveShown}
            phone={isMobileView}
            anchorRef={connectionButtonRef}
            onPick={selectFromNotice}
            onGone={() => setLiveBatch(null)}
          />

          {/* Ask AI */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={cn(
                  // Shown on every size. It was `hidden sm:flex`, which hid the
                  // AI from the device most likely to want it.
                  "wb-ai-button h-8 w-8 flex items-center justify-center rounded-lg transition-[scale,box-shadow] duration-150 cursor-pointer active:scale-90",
                  /*
                    The mark keeps its own colour in both states. Inverting the
                    button to solid black used to be fine for a line-art
                    sparkle and is not for a logo — a brand mark on a black
                    tile reads as a different brand.
                  */
                  aiOpen ? "wb-ai-button-open" : "",
                )}
                onClick={() => {
                  setAiOpen(open => !open)
                  // The section sheet and the AI sheet cannot both own the
                  // bottom of the screen.
                  if (isMobileView) setMobileSidebarOpen(false)
                  // On a computer this shows or hides the pill, and a pill
                  // brought back is no longer one that was closed.
                  else rememberAskDockClosed(aiOpen)
                }}
                aria-label="Ask Storelib"
                aria-pressed={aiOpen}
              >
                {/* The ring round its edge: a gradient drawn once and turned,
                    inside a mask drawn once. See `.wb-ai-ring` in globals.css. */}
                <span aria-hidden className="wb-ai-ring">
                  <span className="wb-ai-ring-spin" />
                </span>
                <StorelibLogo size={18} alt="" className={cn("transition-opacity", aiOpen ? "opacity-100" : "opacity-80")} />
                {/* Still working with the panel closed: the same live dot the connection mark uses. */}
                {aiBusy && !aiOpen && <span aria-hidden className="wb-live-dot" data-pulse="" data-ai-working="" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{aiOpen ? "Hide Storelib AI" : aiBusy ? "Storelib AI is working" : "Ask Storelib"}</TooltipContent>
          </Tooltip>
          {/* The button says what is actually true.
              On a LIVE theme it is Publish: the draft is saved automatically,
              so "Save" would be a button for something that has already
              happened, and greying it out would say "Saved" over a public site
              that is still showing last week's page. It is enabled exactly
              when the draft is ahead of what visitors see.
              On a theme that is not live there is nothing to publish TO, so it
              stays Save and follows `isDirty`. */}
          {(() => {
            const live = install?.status === "published"
            const pending = live ? unpublished : isDirty
            const busyNow = saving || publishing
            return (
              <div ref={publishBtnRef} className="relative">
                <Button
                  size="sm"
                  className={cn(
                    "h-8 cursor-pointer min-w-[92px] rounded-full transition-all duration-200 gap-2",
                    // White on purple whatever the chrome's tone; the chrome's
                    // own text only on the chrome's own surface.
                    live ? "bg-[#8B56FA] text-white hover:bg-[#7b46ec]" : "bg-[var(--wb-chrome-hover)] text-[var(--wb-chrome-fg)] hover:bg-[var(--wb-chrome-active)]",
                  )}
                  onClick={() => {
                    if (!live) { void handleSave(); return }
                    setPublishOpen((v) => !v)
                    if (isMobileView) { setMobileSidebarOpen(false); setAiOpen(false) }
                  }}
                  disabled={busyNow || (!live && !pending)}
                >
                  {busyNow ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : live ? (
                    <span className={cn("h-2 w-2 rounded-full", pending ? "bg-white" : "bg-white/50")} />
                  ) : null}
                  <span>{busyNow ? (live ? "Publishing" : "Saving") : live ? "Publish" : pending ? "Save" : "Saved"}</span>
                </Button>
                <PublishPanel
                  open={publishOpen}
                  installId={installId}
                  onOpenChange={setPublishOpen}
                  anchorRef={publishBtnRef}
                  backupsReady={backupsReady}
                  mobile={isMobileView}
                  live={live}
                  pending={pending}
                  publishedAt={install?.published_at ?? null}
                  websiteUrl={websiteUrl}
                  websiteUrlDisplay={websiteUrlDisplay}
                  busy={busyNow}
                  onPublish={() => { void handleSave() }}
                  /* The phone's sheet ends with what is connected, from the
                     same read as the bar's mark. Something connected opens
                     where the mark does; nothing yet opens Connections on
                     its first path, where Claude Code and Codex connect. */
                  connections={connectionsBrief}
                  connectionsSettled={connectionsSettled}
                  onConnections={() => {
                    setPublishOpen(false)
                    if (connection.online) openConnection()
                    else openConnections()
                  }}
                />
              </div>
            )
          })()}
        </div>

        {/* ── Thin page-load progress bar ──
            Single A→B sweep (NProgress-style), never looping. Creeps toward
            ~90% while the load is in flight, snaps to 100% and fades out.
            Lives on the bar's bottom edge so it has no height of its own.

            EVERY WAIT, NOT JUST ONE. It was wired to `sectionsLoading`, which
            is the page switch and nothing else, so arriving at the editor,
            following a footer link and opening a page from settings all
            waited with no sign that anything was happening. Every one of
            those is the canvas being replaced, and this is the one line of
            the editor whose job is to say so. */}
        <WbLoadProgressBar active={sectionsLoading || canvasBusy} />
      </header>

      <ProjectSettings
        open={projectSettingsOpen}
        onClose={() => {
          setProjectSettingsOpen(false)
          setSettingsSection(null)
          setGithubReturned(null)
          setConnectVia(null)
          setPreviewMode("preview")
        }}
        initialSection={settingsSection}
        githubReturned={githubReturned}
        connectVia={connectVia}
        installId={installId}
        name={install?.name ?? ""}
        onRenamed={(name) => setInstall((cur) => (cur ? { ...cur, name } : cur))}
        /* Policies are found in settings and edited in the builder. */
        onEditPage={(pageKey) => handlePageChange(pageKey as PageKey)}
        websiteUrl={websiteUrl}
        websiteUrlDisplay={websiteUrlDisplay}
        storeName={creatorFacts?.storeName}
        displayName={creatorFacts?.name}
        /* A new name on Storelib is a new address for the site, shown at once. */
        onAddressChanged={(handle) => setSiteHandle(handle && handle !== username.toLowerCase() ? handle : null)}
        live={install?.status === "published"}
        publishedAt={install?.published_at ?? null}
        // The draft on the server has just been replaced. The editor's own
        // copy of it is stale in every state it holds, and reloading is the
        // one honest way to pick all of it up at once.
        onRestored={() => window.location.reload()}
        /* The website's own settings, through the one writer the editor has:
           a favicon or a meta description set in Website Settings is a change
           like any other, saved with the draft, undone with Undo, and live
           when it is published. */
        settings={settingsDraft}
        onSettingChange={updateSetting}
        pages={[
          ...(Object.keys(PAGE_META) as PageKey[]).map((k) => ({
            key: k,
            name: PAGE_META[k].label,
            path: pagePath(k),
          })),
          ...customPages.map((p) => ({ key: p.key as string, name: p.name, path: `/${p.key}`, custom: true })),
        ]}
        productCount={productsLoading || products.length >= 100 ? null : products.length}
        onAddPage={() => setAddPageOpen(true)}
        /* A menu is edited in Navigation, beside Pages, with the page drawn next to it. */
        onEditMenu={(handle) => {
          setSidebarMode("sections")
          setPageBrowserOpen(false)
          openMenus(handle)
        }}
        /* The cookie banner is a theme setting: Policies opens it there. */
        onOpenThemeGroup={(group) => {
          setSidebarMode("settings")
          setPageBrowserOpen(false)
          setSelectedPanel({ type: "theme_settings" })
          setExpandedSettings(group)
          if (isMobileViewRef.current) setMobileSidebarOpen(true)
        }}
        onOpenCode={() => void openCode()}
        onPublish={() => setPublishOpen(true)}
        onUnpublished={() => setInstall((cur) => (cur ? { ...cur, status: "unpublished" } : cur))}
        onNavigate={requestExit}
        /* Website Settings › Navigation edits the header and footer through the same writers the sidebar uses. */
        navigation={{
          header: sections.find((sec) => sec.type === "header"),
          footer: sections.find((sec) => sec.type === "footer"),
          onSectionSetting: updateSectionSetting,
          onBlockSetting: updateBlockSetting,
          onAddBlock: addBlock,
          onRemoveBlock: removeBlock,
          onReorderBlocks: reorderBlocks,
          linkTargets,
          linkSections: sectionSource,
          /* Policies: the open page goes through the writers above, any other through the sections route. */
          currentPageKey: currentPage,
          currentSections: sections,
          onPageDraftSaved: (key) => {
            setUnpublished(true)
            forgetPage(key)
            setCustomPages((prev) => (prev.some((p) => p.key === key) || key in PAGE_META ? prev : [...prev, { id: key, name: pageTitleFromKey(key), key: key as PageKey }]))
          },
        }}
      />

      {/* Leaving. Rendered the moment Back is pressed: going back can take a
          second or more on a phone, and a second of nothing is a second in
          which the button gets pressed again. */}
      {/* Portalled, for the reason the sheets are: a z-index is only
          comparable inside one stacking context, and this has to cover sheets
          that render into the body. From in here it could not. */}
      {/* The outline and the section's name under the pointer: components/website-builder/canvas-hover.tsx. */}
      <CanvasHover enabled={inspectorEnabled && canvasInspecting && !fullView && !isMobileView && previewMode === "preview"} nameOf={hoverNameOf} />

      {/* A header (or footer) chosen while one is drawn: see addSection. */}
      <ReplaceChromeConfirm
        open={pendingReplace !== null}
        kind={pendingReplace?.kind ?? "header"}
        current={pendingReplace?.current ?? ""}
        next={pendingReplace?.next ?? ""}
        onCancel={() => setPendingReplace(null)}
        onReplace={() => {
          const r = pendingReplace
          setPendingReplace(null)
          if (r) addSection(r.type, r.presetIndex, true)
        }}
      />

      <LeaveConfirm
        open={pendingExit !== null}
        reason={leaveReason}
        onCancel={() => {
          /* Staying after the browser's Back: the entry that catches the next one goes back on top. */
          if (pendingExit === BACK_EXIT) armBackGuard()
          setPendingExit(null)
        }}
        onLeave={() => {
          const href = pendingExit
          setPendingExit(null)
          if (href === BACK_EXIT) goBackForReal()
          else if (href) {
            leaveAnswered.current = true
            leaveFor(href)
          }
        }}
        onSave={saveThenLeave}
      />

      {leaving && portalReady && createPortal(
        <div className="wb-leaving" role="status" aria-live="polite" aria-label="Going back">
          {/* `dark` is the surface this is ON, not the colour of the words:
              the glass is a near-black blur, so the loader draws in white.
              It said `light` and rendered dark grey on it, which is why
              going back looked like a blur with nothing written on it. */}
          <BuilderLoader
            className="wb-leaving-content"
            tone="dark"
            lines={["Going back", "Saving where you were", "Almost there"]}
          />
        </div>,
        document.body,
      )}

      {/* ── A save that did not go through: what happened and the one thing to do ── */}
      {/* ── What came in from GitHub or an agent, what didn't, and two versions of one page: lib/github-sync/editor-status.ts ── */}
      <div className="pointer-events-none fixed left-0 right-0 flex flex-col items-center gap-2" style={{ top: `calc(env(safe-area-inset-top, 0px) + ${saveProblem ? 116 : 60}px)`, zIndex: 100 }}>
        <SyncNotice
          installId={installId}
          report={syncStatus.github}
          pending={syncStatus.pending}
          live={install?.status === "published"}
          publishedAt={install?.published_at ?? null}
          unpublished={unpublished}
          agentNote={agentNote}
          conflict={syncConflict}
          phone={isMobileView}
          onPublish={() => {
            setPublishOpen(true)
            if (isMobileView) { setMobileSidebarOpen(false); setAiOpen(false) }
          }}
          onAction={runSyncAction}
          onKeepMine={keepMyVersion}
          onUseTheirs={() => void takeGitHubVersion()}
          onAgentNoteSeen={() => setAgentNote(null)}
        />
        {/* A site selling physical products buyers can't check out with yet (components/website-builder/editor/physical-readiness-notice). */}
        <PhysicalReadinessNotice />
      </div>
      {saveProblem ? (
        <div className="pointer-events-none fixed left-0 right-0 z-[99] flex justify-center" style={{ top: "calc(env(safe-area-inset-top, 0px) + 60px)", zIndex: 101 }}>
          <SaveProblemBanner
            problem={saveProblem}
            onClose={() => setSaveProblem(null)}
            onAction={(a: SaveAction) => {
              if (a === "retry") void saveDraft({ quiet: true })
              else if (a === "reload") window.location.reload()
              else if (a === "signin") window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`
              else if (a === "back") router.push("/app/website-builder")
              else if (a === "undo") { handleUndo(); setSaveProblem(null) }
            }}
          />
        </div>
      ) : null}

      {/* ── Top notification bar ── */}
      <div
        className={cn(
          "fixed top-0 left-0 right-0 z-[100] flex justify-center pointer-events-none transition-all duration-300 ease-out",
          notification ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0"
        )}
        // Same inset as the bar it appears under. Without it the toast is
        // one more thing rendered behind the status bar on a phone.
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div
          className={cn(
            /* Between 16px gutters on a phone, and one line: a longer message ends in "...". */
            "mx-4 mt-3 flex min-w-0 max-w-[calc(100vw-2rem)] items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg pointer-events-auto",
            notification?.type === "error"
              ? "bg-red-600 text-white"
              : "bg-neutral-900 text-white"
          )}
        >
          {notification?.type === "error" ? (
            <X className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <Check className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="min-w-0 truncate">{notification?.message}</span>
        </div>
      </div>

      {/* ── The panels stand on a shelf ──
          There was a hairline down the seam and a corner drawn on it, and
          between them they were the whole of eleven rounds. Then there was a
          gap of the panels' own white, which closed the argument about what to
          draw and opened a smaller one: a gap you cannot see is not a gap, and
          on a white page it made the sidebar, the space and the canvas one
          undifferentiated field.

          So the space has a tone. The panels are cards now, inset a little and
          rounded on both top corners, standing on a light grey the builder
          already uses for the surface a device preview sits on. That grey is
          why this shape works where every earlier version of it did not: a
          sliver of a third colour between one rounded panel and one flush one
          is a wedge, and the SAME sliver between two panels that both curve
          away from it, with the same surface running behind both of them, is a
          channel. The tone was never the problem on its own; the tone with
          only one side curving was.

          Open at the bottom on purpose. Padding on three sides is a shelf;
          padding on four is a frame, and a band of grey under the page is the
          gutter that failed to close.

          AND IT IS A DESKTOP IDEA. On a phone the canvas is not a card on a
          surface, it IS the surface: there is no sidebar beside it to be
          separated from, and six pixels of grey around a 390px screen is six
          pixels taken from the page and given to nothing. Flush there, with
          no radius, which is what the preview card already does. */}
      <div
        className={cn(
          "relative flex flex-1 min-h-0 overflow-hidden bg-[#eef1f5]",
          // Six, not eight. Eight read as a margin; six reads as a seam with
          // a surface behind it, which is what it is.
          !isMobileView && "gap-1.5 px-1.5 pt-1.5",
        )}
      >
        {/* ── Left sidebar (desktop — no vertical rail, switches live in topbar) ── */}
        {!isMobileView ? (
          <div
            ref={sidebarFoldRef}
            className={cn("relative flex-shrink-0 flex h-full", fullView ? "overflow-hidden" : "overflow-visible")}
            data-wb-sidebar-fold={fullView ? "folded" : "open"}
            aria-hidden={fullView || undefined}
            /* Full screen folds the sidebar by its own width, so the canvas grows into the room rather than jumping. */
            style={{
              maxWidth: fullView ? 0 : sidebarWidth,
              opacity: fullView ? 0 : 1,
              /* And the 6px seam beside it, so the canvas meets the edge. */
              marginRight: fullView ? -6 : 0,
              transition: `max-width ${FULL_SCREEN_MS}ms cubic-bezier(0.4, 0, 0.2, 1), margin-right ${FULL_SCREEN_MS}ms cubic-bezier(0.4, 0, 0.2, 1), opacity ${Math.round(FULL_SCREEN_MS * 0.6)}ms ease-out`,
            }}
            {...(fullView ? { inert: true } : {})}
          >
            {/* Clipped HERE, on the box with the width, so the list's own
                scrollbar stays inside it. The outer box stays
                `overflow-visible` for the grab edge that hangs past it.

                Rounded on both top corners, because it is a card standing on
                the shelf rather than a panel butted against the window: the
                grey runs behind it on the left as well as in the gap, and a
                card with one square corner and one round one reads as a
                mistake. Square at the bottom, where the shelf is open. */}
            <div
              ref={sidebarRef}
              className="flex-1 flex flex-col min-h-0 overflow-hidden bg-white rounded-t-[20px]"
              style={{ width: sidebarWidth, minWidth: SIDEBAR_MIN, maxWidth: SIDEBAR_MAX }}
            >
              {/*
                SECTIONS, PAGES AND THEME, AT THE TOP OF THE SIDEBAR THEY SWITCH.
                They were three icons in the black top bar, away from the panel
                they change, in the bar's chrome rather than the sidebar's. The
                phone sheet always had them here, as this same control.
              */}
              <div className="shrink-0 px-3 pt-3 pb-2" data-wb-sidebar-tabs="">
                {renderSidebarTabs()}
              </div>
              <div ref={desktopScrollRef} data-wb-sidebar-scroll className="flex-1 min-h-0 overflow-y-auto wb-slim-scroll overflow-x-hidden">
                <LinkTargetsProvider targets={linkTargets} sections={sectionSource}>
                <EditorFieldProvider value={fieldEnv}>
                  <div
                    key={sidebarPanelKey}
                    ref={desktopPanelRef}
                    className="h-full"
                  >
                    {renderSidebarContent()}
                  </div>
                </EditorFieldProvider>
                </LinkTargetsProvider>
              </div>
            </div>
            {/* The grab edge. Wider than it looks, so it can be found; drawn
                only under the pointer, so it is not a second border. */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize the sidebar"
              onPointerDown={startSidebarResize}
              onDoubleClick={() => {
                setSidebarWidth(288)
                if (sidebarRef.current) sidebarRef.current.style.width = "288px"
              }}
              className="group/resize absolute -right-1.5 top-0 z-20 h-full w-3 cursor-col-resize touch-none"
            >
              <div className="mx-auto h-full w-px bg-transparent transition-colors duration-150 group-hover/resize:bg-[#8B56FA]/70 group-active/resize:bg-[#8B56FA]" />
            </div>
          </div>
        ) : (
          /* Mobile — persistent bottom sheet (Shopify-style). Always visible
             with a small peek at the bottom when "closed", expands to ~50% of
             the viewport when opened. Drag the pill handle to move between
             states — finger tracks in real time. */
          /**
           * AND NOTHING OF THE EDITOR IS LEFT OVER A PAGE THAT COVERS THE
           * SCREEN. Website settings is a full surface; the sheet is a
           * separate layer in the body, so it kept its place at the bottom
           * of the screen and printed itself over the settings page. It is
           * not rendered while that page is open.
           */
          previewMode !== "code" && !projectSettingsOpen && (
          <MobileEditorSheet
            open={mobileSidebarOpen}
            restKey={sheetRestKey}
            onOpenChange={(next) => {
              setMobileSidebarOpen(next)
              // Two sheets cannot both own the bottom of the screen. Whichever
              // is being opened wins; the other gets out of the way.
              if (next) setAiOpen(false)
            }}
            /**
             * THE SHEET DOES NOT MOVE WHEN A SECTION IS SELECTED. It lifted
             * a little for one deploy, and it was wrong twice over: nobody
             * asked the sheet to open by tapping the canvas, and its peek is
             * what the canvas pads itself by, so changing it changed how much
             * room the canvas has to scroll. On a short page that turns a
             * scrollable canvas into one that fits, and the browser puts the
             * scroll back to zero — the jump to the top that selecting a
             * section was reported to cause.
             */
          >
            {/* Segmented tabs — Sections / Pages / Theme, the same control the desktop sidebar has */}
            <div className="px-3 pt-1 pb-2 shrink-0 bg-background">
              {renderSidebarTabs(() => setMobileSidebarOpen(true))}
            </div>

            {/* data-sheet-scroll as well as the sidebar's own marker. It is
                what the stylesheet hangs the room after the content on
                (--wb-sheet-hidden), and without it the bottom of this list
                sat below the screen at the half stop with no way to scroll
                it into view. scripts/check-sheet-reach.mjs measures it. */}
            <div data-wb-sidebar-scroll data-sheet-scroll className="flex-1 min-h-0 overflow-y-auto wb-slim-scroll overflow-x-hidden bg-background">
              <LinkTargetsProvider targets={linkTargets} sections={sectionSource}>
              <EditorFieldProvider value={fieldEnv}>
                  <div
                    key={sidebarPanelKey}
                    className="h-full wb-sheet-panel"
                    data-dir={panelDir > 0 ? "in" : panelDir < 0 ? "back" : "none"}
                  >
                    {renderSidebarContent()}
                  </div>
              </EditorFieldProvider>
                </LinkTargetsProvider>
            </div>
          </MobileEditorSheet>
          )
        )}

        {/* ── AI panel ──
            On a computer it is no longer a column beside the sidebar: it is
            Ask Storelib's pill, drawn over the bottom of the canvas inside
            <main> below, which opens into the conversation. Mounted once shown
            and kept, hidden rather than unmounted, so a conversation and a
            running change survive it being closed and reopened. */}
        {/* The AI on a phone.
            It was desktop-only — `!isMobileView` — so the one place somebody
            is most likely to want to describe a change rather than hunt for a
            control had no way to. It opens straight to the tallest stop,
            because a conversation is the case that needs the room and starting
            at half only ever has one answer.

            ITS TALLEST STOP IS THE WHOLE SCREEN BELOW THE STATUS BAR, not
            92% of it. At 92% its top edge landed 9px under the safe area,
            inside the editor bar, and the top pixel of the bar's buttons
            showed above the sheet as violet slivers at its corners. At 1 the
            sheet starts where the bar's buttons are not, and what shows
            around its corners is the bar's own dark strip. */}
        {isMobileView && aiMounted && (
          <MobileEditorSheet open={aiOpen} onOpenChange={(next) => setAiOpen(next)} openFull layer="raised" peekHeight={0} detents={AI_SHEET_DETENTS} fadeOnMove moveMs={320} keyboard="composer">
            <ThemeChat
              variant="sheet"
              installId={installId}
              page={currentPage}
              sections={sections}
              settings={aiSettings}
              selectedSectionId={aiSelected}
              store={aiStore}
              onRunStart={startAiRun}
              onRunEnd={backupAfterTask}
              onUndoRun={undoAiRun}
              onBusyChange={setAiBusy}
              onOp={applyAiOp}
              onClose={closeAiSheet}
              onConnectAi={connectAiFromChat}
              onSourcesChanged={reloadAiSources}
              onPageWritten={aiPageWritten}
              onSourceWritten={aiSourceWritten}
              onWorkingChange={aiWorkingChange}
              onRunFinished={aiRunFinished}
              onWriteStart={handleWriteStart}
              onWriteDone={handleWriteDone}
              onWriteFailed={handleWriteFailed}
              onOpenCodeEditor={openAiCodeFromSheet}
            />
          </MobileEditorSheet>
        )}

        {/* ── Canvas ──
            The `<main>` is NOT scrollable. It just paints the gray surround
            and centers the preview card. The preview card itself
            (`#wb-preview-root`) IS the scroll container on both desktop and
            mobile — which means:
              • Sticky headers inside the preview stick to the TOP of the
                card, not to the top of the editor viewport.
              • Scrolled content can never visually escape the card's
                rounded corners into the editor topbar.
        */}
        <main
          ref={canvasMainRef}
          className={cn(
            // `relative` so the code pane and the mode switch can sit over
            // the canvas without leaving the flex layout.
            "relative flex-1 min-w-0 overflow-hidden flex justify-center",
            // The same 20px the panels round by. Both corners, always: the
            // shelf runs behind this on the right whether the AI is open or
            // not, so there is never a side of it butted against the window.
            // Nothing on a phone, where there is no shelf to stand on.
            !isMobileView && "rounded-t-[20px]",
            /**
             * LIGHT. THE BUILDER IS A LIGHT PRODUCT.
             *
             * This has been dark twice, and both times for the same reason:
             * a card needs something behind it for its rounded corner to be
             * a corner, and dark is the easy way to get that. It is also the
             * wrong way here. The bar is chrome and is meant to be dark; the
             * canvas is the page you are working on, and a near-black field
             * around it makes the builder read as two products, one of them
             * with a hole in the middle. On a phone preview the hole is most
             * of the screen.
             *
             * ONE LIGHT GREY, for both jobs it has. It is the shelf the
             * panels stand on, seen in the gaps between them and around
             * their top corners; and in a device preview it is the surface
             * the device stands on, which is what it always was. The same
             * surface either way, so there is one tone below the bar and not
             * two.
             *
             * Rounded now. It was square for as long as a corner was being
             * drawn INSIDE it and had to paint outside its own arc; nothing
             * is drawn there any more, and the radius belongs on the box
             * whose colour it shapes.
             */
            isMobileView ? "bg-background" : "bg-[#eef1f5]",
            // On an actual mobile viewport the preview fills the viewport
            // (no gray gutter, no phone-chrome) — it IS the phone. On desktop
            // the tablet and phone buttons render a device-width card centred
            // vertically with gray gutters, and the sections inside measure
            // that card rather than the browser window.
            isMobileView
              ? "items-start p-0"
              /**
               * A CARD ON THE SHELF, LIKE THE PANELS EITHER SIDE OF IT.
               *
               * Rounded on both top corners and open at the bottom, which is
               * the shape the sidebar and the AI have. A device preview is a
               * card floating inside this one instead, so that one is
               * rounded all the way round.
               */
              : device === "desktop" ? "items-stretch p-0" : "items-center py-6 px-6",
          )}
          /**
           * The sheet is pinned to the viewport, so the canvas keeps its peek
           * clear itself — with the number the sheet PUBLISHES, measured on
           * this device, not a second computation of the same sum in CSS.
           * The 72px fallback is the peek before any inset, for the frame
           * before the sheet has measured itself.
           */
          style={isMobileView ? { paddingBottom: "var(--wb-sheet-peek, 72px)" } : undefined}
        >
          <CodePane
            installId={installId}
            visible={previewMode === "code"}
            fullScreen={isMobileView}
            onClose={() => setPreviewMode("preview")}
            codeFilePath={codeFilePath}
          />
          {/* ── The card's rounded corners survive its scrollbar ──
              A scrollbar is laid out and painted inside the scroll
              container's own box, and it is NOT held inside that box's
              border-radius. So while the card was itself the scroller, the
              bar painted a square 12px column straight through both
              right-hand arcs: measured in Chromium, every one of the 44
              pixels that the radius should have cut away was painted, at the
              top corner and the bottom one. The corner read square on the
              right and round on the left, which is what was reported.

              Styling the bar is not the way out of that. It was tried, and
              `::-webkit-scrollbar` rules are what convert a platform overlay
              scrollbar into a classic one, which then reserves a column of
              layout — the white strip down the right of the builder. This
              wrapper leaves the scrollbar alone entirely and clips it
              instead: the radius lives out here, on a box that does not
              scroll, and `overflow: hidden` cuts everything the arc excludes,
              the scrollbar included. Same measurement afterwards: 0 of 44 at
              the top, 1 at the bottom, that one being the arc's antialiasing.

              It carries the card's size and shape; the scroller inside it is
              simply 100% of it. See scripts/check-canvas-corner.mjs. */}
          <div
            className={cn(
              /* wb-canvas-frame: the window every section on the page sees.
                 A section's `position: fixed` menu, its 100vh and its width
                 queries all answer to this card, never to the editor around
                 it (app/globals.css, lib/storelib-theme/storelib/css.ts). */
              "wb-canvas-frame relative overflow-hidden transition-all duration-300",
              // Fading the whole card, not just the scroller, so the corner
              // clip goes with it.
              //
              // NOT ON A PHONE. There the code pane is a full-screen opaque
              // page over this, so the fade buys nothing, and it costs the
              // canvas: WebKit can drop the scrolling layer of a
              // `-webkit-overflow-scrolling: touch` scroller whose ancestor
              // animated opacity to zero and back, after which the preview
              // takes no touch input until layout is rebuilt. That is one of
              // the ways "the preview will not scroll after the code editor"
              // happens, and the one every earlier fix left in place.
              previewMode === "code" && !isMobileView && "opacity-0 pointer-events-none",
              isMobileView
                ? "w-full rounded-none"
                : device === "desktop"
                  ? "rounded-t-[20px] w-full"
                  // A phone or a tablet is a card floating on the canvas, so
                  // it needs the edge and the lift a card has. On the dark
                  // surround the contrast did that job; on a light one it has
                  // to be drawn.
                  : "rounded-2xl ring-1 ring-black/[0.06] shadow-[0_18px_50px_-20px_rgba(15,23,42,0.28)]",
            )}
            style={
              isMobileView
                ? { width: "100%", height: "100%" }
                : device === "desktop"
                  ? { height: "100%" }
                  : {
                      /**
                       * A device-shaped card at the device's real width. The
                       * sections inside measure THIS, so the width is the
                       * whole preview — not a frame drawn around a desktop
                       * layout.
                       *
                       * `maxWidth: 100%` so a narrow canvas — sidebar open,
                       * AI panel open, laptop screen — shrinks the tablet
                       * card instead of letting it overflow and clip. The
                       * layout it shows is then honest about the width it
                       * actually got.
                       */
                      width: `${DEVICE_WIDTH[device]}px`,
                      maxWidth: "100%",
                      height: "min(900px, 100%)",
                      flex: "0 1 auto",
                    }
            }
          >
          <div
            id="wb-preview-root"
            /**
             * THE SCROLL THAT STOPS.
             * iOS hands a scroll gesture to the parent when the scroller is
             * exactly at its top or bottom, and the parent here is
             * `overflow: hidden` on purpose — so the gesture goes nowhere,
             * and every touch after it until the finger reverses is eaten.
             * `overscroll-behavior: contain` is the modern answer and is set
             * below; this is the belt to its braces: nudge one pixel off
             * either end at touchdown so there is never a hand-off to make.
             *
             * This is the model the editor scrolled perfectly with, and it
             * is back exactly as it was. See "NO WATCHDOG ON THE CANVAS"
             * above for what was actually freezing it.
             */
            onTouchStart={(e) => {
              // A finger down is somebody scrolling on purpose: let go of the pin.
              touchingCanvas.current = true
              if (!isMobileView) return
              const el = e.currentTarget
              /* Not under the site's open menu: the canvas is held still for
                 it, and this nudge was the one thing still moving it. */
              if (el.hasAttribute(SITE_DRAWER_OPEN_ATTRIBUTE)) return
              const max = el.scrollHeight - el.clientHeight
              if (max <= 2) return
              if (el.scrollTop <= 0) el.scrollTop = 1
              else if (el.scrollTop >= max) el.scrollTop = max - 1
            }}
            onTouchEnd={() => { touchingCanvas.current = false }}
            onWheelCapture={() => { touchingCanvas.current = true }}
            /**
             * =============================================================
             *  WITH THE INSPECTOR ON, THE CANVAS IS NOT A PAGE YOU BROWSE
             * =============================================================
             * Two things a tap does by default, and both of them move the
             * canvas out from under the person who tapped.
             *
             * A LINK FOLLOWS. Sections written in the theme language have
             * their links intercepted; sections rendered by a React
             * component wire that up per link, and the ones that were
             * missed navigate for real. Measured by the probe: a tap on a
             * card in the features grid took the whole builder to
             * /products. An `href="#"` is worse in the quiet way, because
             * it goes nowhere and scrolls to the top on the way.
             *
             * A CONTROL TAKES FOCUS. A focused button or field is scrolled
             * into view by the browser itself, before any code here runs,
             * and on a short page the only place it can scroll to is the
             * top. That is the jump reported as "click a section and it
             * takes me back to the top, quick, like a glitch".
             *
             * So with the inspector on, a press inside the canvas does not
             * focus and a click does not follow a link. Both are capture
             * handlers on the scroller, which is the one place every
             * section passes through, whatever it is written in. Neither
             * touches `touchmove`, so scrolling is untouched: a mouse event
             * is synthesised after the browser has already decided the
             * gesture was not a scroll.
             *
             * With the inspector OFF the canvas is a preview again and both
             * are gone, which is the mode for walking the site.
             */
            /*
              EXCEPT ON SOMETHING YOU TYPE IN. Cancelling the press stops a
              control taking focus, which is the point: a focused button is
              scrolled into view by the browser and on a short page that is
              a jump to the top. A FIELD is the opposite case — refusing it
              focus means the caret never lands and nothing can be typed,
              which is the header's search field doing nothing with the
              inspector on.

              So a real editing control keeps its press. Everything else,
              which is every button and link the canvas draws, still loses
              it and still only selects.
            */
            /**
             * ═════════════════════════════════════════════════════════════
             *  A PRESS TAKES NO FOCUS, AND NOW ALSO ON A LINK BEING FOLLOWED
             * ═════════════════════════════════════════════════════════════
             * With the inspector on, nothing in the canvas takes a press:
             * a focused control is scrolled into view by the browser before
             * any code here runs, and on a short page the only place it can
             * scroll to is the top.
             *
             * With the inspector OFF the canvas is a preview, controls work
             * and this did nothing at all — which is the mode somebody is in
             * when they follow a link. A press on a footer link focused it,
             * the browser scrolled the canvas just far enough to bring a link
             * at the bottom of the page fully into view, and then the page
             * changed: the nudge in "it glitches up a little and then opens
             * the page".
             *
             * So the one exception now applies in both modes, and only where
             * focus cannot matter: a link the canvas is about to follow
             * itself. See isCanvasNavigationLink.
             */
            onMouseDownCapture={(e) => {
              const target = e.target as unknown as ClickTargetLike | null
              /* A field refused focus is a field the caret never reaches. */
              if (isTypingTarget(target)) return
              if (inspectorEnabled || isCanvasNavigationLink(target)) e.preventDefault()
            }}
            /**
             * And this pair is not about the inspector at all: the canvas
             * never takes the BROWSER anywhere, in either mode. A link goes
             * through the editor's own `onEditorNavigate`, which changes the
             * page being edited; a form in here has nowhere to post to, and
             * a section written in the theme language has no submit handler
             * running in the editor, so its button submits for real and the
             * builder is gone. That is the "it redirected me and I am back at
             * the top" in the report. Only the DEFAULT is blocked: every
             * handler, ours and the section's, still runs.
             */
            onClickCapture={(e) => {
              /**
               * ═════════════════════════════════════════════════════════════
               *  A LINK IN THE FOOTER IS A LINK, EVEN WHILE EDITING
               * ═════════════════════════════════════════════════════════════
               * With the inspector on a tap only selects, because a thumb
               * lands on the header's logo and its nav as often as beside
               * them, and every one of those taps used to change the page
               * under somebody who meant to select a section.
               *
               * THE HEADER AND THE FOOTER ARE NOT THAT. They are the site's
               * navigation: their links ARE their content, there is barely
               * any space around them to aim for, and a nav you cannot
               * follow while looking at the site is a nav you cannot check.
               * The three policy links every site now ships live in one of
               * them.
               *
               * This was the footer alone for one deploy, on the reasoning
               * that a thumb finds the header's logo by accident. It does,
               * and the accident it used to cause is fixed elsewhere: a tap
               * that navigates now lands at the TOP of the page it opened,
               * which is where a navigation is supposed to leave you, so it
               * reads as having gone somewhere rather than as a jump.
               *
               * `data-chrome` is header and footer and nothing else, which
               * is exactly the rule. A link in a hero or a feature card
               * still only selects: that one IS content being edited, and a
               * tap on it is far more often aimed at the section behind it.
               *
               * Only for a path inside this site. An external link still
               * does nothing, because leaving the editor is not what that
               * tap meant either.
               */
              const el = e.target as HTMLElement | null
              const anchor = el?.closest?.("a[href]") as HTMLAnchorElement | null
              const inNav = !!anchor?.closest?.("[data-chrome]")
              /**
               * ═════════════════════════════════════════════════════════════
               *  EXCEPT WHEN THE LINK IS IN AN OVERLAY, WHICH OWNS ITS EXIT
               * ═════════════════════════════════════════════════════════════
               * `stopPropagation` in the CAPTURE phase ends the dispatch: the
               * anchor's own handler never runs. For a link in a header bar
               * that is fine, there is nothing else to do. For a link in the
               * open mobile menu it is the bug.
               *
               * That menu is a dialog over the whole screen, and its handler
               * is what closes it. Swallowed, the page underneath changed and
               * the menu stayed up covering it — so a tap read as doing
               * nothing at all, which is exactly how it was reported. The
               * navigation had happened; nobody could see it.
               *
               * So a link inside a dialog is left to the dialog. It slides
               * out first and changes the page after, which is what a menu on
               * any site does. Measured by scripts/check-nav-drawer.mjs,
               * whose editor handler is a spy: it recorded no calls at all
               * while this branch took them.
               *
               * `data-self-nav` is the same rule for an overlay that is not
               * a dialog. The header's search panel is one: it replaces the
               * header row rather than covering the screen, so it is not
               * modal and must not claim to be, and its result links had the
               * same problem. Clicking one changed the page and left the
               * panel sitting open over the product it had just opened.
               */
              const ownsItsExit = !!anchor?.closest?.('[role="dialog"], [data-self-nav]')
              const href = anchor?.getAttribute("href")?.trim() ?? ""
              const internal = href.startsWith("/") && !/^\/\//.test(href)

              if (leavesThePage(e.target as unknown as ClickTargetLike | null)) e.preventDefault()

              /* A download in the preview opens the file in a tab of its own (canvas-intercept.ts, fileLinkHref). */
              const file = inspectorRef.current ? null : fileLinkHref(e.target as unknown as ClickTargetLike | null)
              if (file) {
                window.open(new URL(file, window.location.href).href, "_blank", "noopener,noreferrer")
                return
              }

              if (inNav && internal && !ownsItsExit) {
                e.stopPropagation()
                handleEditorNavigate(href, true)
              } else if (anchor && !ownsItsExit && href.includes("#")) {
                /*
                  A LINK TO A SECTION OF THIS PAGE SCROLLS THE CANVAS TO IT,
                  wherever the link is: a button in a hero, a footer link
                  written as `#faq`. Only when the editor's own rule says it
                  is an anchor here, which is never for a section's link
                  while the inspector is on (a tap there selects). A section
                  that also follows its own links asks for the same scroll,
                  and the second ask is the same scroll (section-motion.ts).
                */
                const decision = resolveEditorHref(href, {
                  currentPage: currentPageRef.current,
                  inspectorEnabled: inspectorRef.current,
                  fromNav: inNav,
                  shopPath: SHOP_PATH,
                  customPageKeys: customPagesRef.current.map((p) => p.key),
                })
                if (decision.kind === "anchor") handleEditorNavigate(href, inNav)
              }
            }}
            onSubmitCapture={(e) => e.preventDefault()}
            className={cn(
              /**
               * `isolate` is the whole reason the page switcher's panel stopped
               * being drawn over by the site's own header. A theme header is
               * `sticky z-[60]`, the editor's bar is `z-50`, and while this
               * card created no stacking context of its own those two numbers
               * were compared in the same place — so a site's header won, and
               * painted across a menu belonging to the editor. Isolating the
               * card means nothing inside it can ever climb out of it.
               */
              // No border. A hairline around a card that is flush with the
              // chrome is a seam, and at the rounded corner it is the little
              // hook of grey that kept showing up there.
              // Leaving for the code fades rather than cuts: `invisible`
              // removed the site between one frame and the next, which is the
              // flash you see as the code arrives. Opacity keeps the scroll
              // position and hands over on the same curve — it is on the
              // wrapper now, so the card fades as one piece.
              //
              // No border. A hairline around a card that is flush with the
              // chrome is a seam, and at the rounded corner it is the little
              // hook of grey that kept showing up there. The rounding itself
              // is the wrapper's; this box is square and simply fills it.
              "relative isolate bg-white flex flex-col overflow-y-auto overflow-x-hidden border-0 rounded-none w-full h-full",
              // On a desktop the native bar is hidden and CanvasScrollbar,
              // below, draws one over the card. A phone keeps its own.
              !isMobileView && "wb-canvas-hidebar",
            )}
            style={
              isMobileView
                ? {
                    // The card is the scroller. Say so to the browser: a
                    // vertical drag here is a scroll and nothing else, and a
                    // scroll that reaches the end stays in the card rather
                    // than bouncing the page, which on iOS is where a touch
                    // scroll gets stuck.
                    touchAction: "pan-y",
                    overscrollBehavior: "contain",
                    WebkitOverflowScrolling: "touch",
                  }
                : undefined
            }
          >
            {/* Inner wrapper — used to be the scroll container; now just
                a flex-col so the footer sits at the bottom. */}
            <div className="flex flex-col w-full flex-1">
            {/**
              * ONE SURFACE, AND THE LOADER IN THE MIDDLE OF IT.
              *
              * This was three stacked blocks in three tints, which drew a
              * hard edge across the canvas wherever one ended — the cut
              * between the white and the grey. A page that is loading is one
              * empty page, so it is one colour, and the only thing on it is
              * centred in the whole of it rather than in the top half.
              *
              * It waits a third of a second before appearing: below that a
              * person reads the pause as the interface being quick, and a
              * loader in that window makes a fast load feel slow.
              *
              * And it LEAVES rather than vanishes. Laid over the card, it
              * stays for a beat after the page has arrived and fades out
              * across it while the page rises in underneath — the swap used
              * to happen in one frame, which is the cut that read as cheap.
              */}
            {(canvasLoaderUp || canvasLoaderLingers) && (
              <div
                className="wb-canvas-loader absolute inset-0 z-10 flex items-center justify-center bg-white"
                data-leaving={!canvasLoaderUp}
                aria-hidden={!canvasLoaderUp}
              >
                {showCanvasLoader && (
                  <BuilderLoader
                    className="wb-loading-line"
                    tone="light"
                    lines={
                      loading
                        ? ["Loading the editor", "Fetching your sections", "Just a moment"]
                        : ["Loading the page", "Just a moment"]
                    }
                  />
                )}
              </div>
            )}

            {loadFailed && !loading && (
              <div className="absolute inset-0 z-10 bg-white">
                <CanvasProblem
                  kind="editor"
                  title="Your website didn't load"
                  body="Check your connection and try again."
                  onRetry={() => void loadData()}
                />
              </div>
            )}

            {!canvasBusy && (
              /**
               * ═══════════════════════════════════════════════════════════
               *  NOT KEYED BY THE PAGE. THAT WAS THE FLASH.
               * ═══════════════════════════════════════════════════════════
               * `key={currentPage}` threw away the ENTIRE canvas on every
               * page change and built a new one, which is a frame with
               * nothing in it followed by a 360ms rise-in of the whole page
               * from 6px down. On a switcher click, on a nav link, on the
               * logo: the site visibly fell into place every time, and no
               * amount of fixing the ORDER of the state updates could help,
               * because the remount happens whatever order they arrive in.
               *
               * Without the key React reconciles instead: the header and
               * footer are the same instances and do not move at all, and
               * only the body sections that actually differ are replaced.
               *
               * The rise-in is kept, and it still plays exactly once — when
               * this element mounts, which is when `canvasBusy` first goes
               * false and the editor finishes loading. Arriving at the
               * builder is worth an entrance; walking between two pages of
               * a site you are editing is not.
               */
              <div className="wb-canvas-in flex w-full flex-1 flex-col">
              {/**
               * THE SAME PAGE THE STOREFRONT RENDERS.
               *
               * The canvas used to assemble a page of its own: its own
               * announcement bar, its own header-first-footer-last rule, its
               * own wrapper — and it applied neither the theme's background
               * colour nor its body font, both of which the published page
               * did. So a creator designed against a white page in Inter and
               * published something else.
               *
               * ThemePage owns chrome, ordering and the theme's own CSS. What
               * stays here is the only thing that is genuinely the editor's:
               * how a section is rendered, with selection, hovering and the
               * device mode on it.
               */}
              {canvasCompat ? (
                /* An imported Shopify theme: drawn by the same function its website is (components/website-builder/compat/compat-canvas.tsx). */
                <CompatCanvas
                  installId={installId}
                  filesVersion={compatFilesVersion}
                  sources={storelibSources}
                  theme={canvasThemeSettings as Record<string, unknown>}
                  pageKey={currentPage}
                  sections={canvasSections as unknown as StoredSection[]}
                  products={shopCards}
                  catalog={catalogCardsForCanvas}
                  productId={currentPage === "product" ? selectedProductId : null}
                  collections={compatCollections}
                  menus={compatCanvasMenus}
                  pageKeys={rowPageKeys}
                  shopName={typeof canvasThemeSettings.brand_name === "string" && canvasThemeSettings.brand_name ? canvasThemeSettings.brand_name : creatorFacts?.storeName || creatorFacts?.name || "My store"}
                  selectedSectionId={selectedSectionId}
                  selectedBlockId={selectedBlockId}
                  /* The switch itself, not the fade behind it: the frame fades its own marks (canvas-bridge.ts), and a page that has stopped selecting must stop outlining on the same press. */
                  inspectorEnabled={inspectorEnabled && !fullView}
                  onSelect={selectFromCompatCanvas}
                  onNavigate={navigateCompatCanvas}
                  onPageShown={setCompatShownPage}
                  onIntent={intentInCompatCanvas}
                  onLiveOnly={liveOnlyInCompatCanvas}
                  onPainted={onCompatPainted}
                  sourcesReady={storelibSourcesRead}
                  dataReady={liveCardsRead}
                  siteUrl={websiteUrl}
                  warm={compatWarm}
                  language={compatLanguage}
                />
              ) : (
              <EditorCanvasPage
                theme={canvasThemeSettings}
                sources={storelibSources}
                pageTemplate={templateForPage(currentPage)}
                sections={drawnShown}
                storefrontData={canvasData}
                arrivedId={arrivedId}
                arrival={arrivalRef}
                inspectorEnabled={canvasInspecting && !fullSettled}
                selectedSectionId={selectedSectionId}
                device={device}
                /**
                 * What the canvas card's top corners are cut to, so the
                 * selection ring on the top section can be cut to the same
                 * thing. It was a literal 12 in there while the card moved
                 * from 16 to 22 to 20, and a 12px ring inside a 20px card
                 * pushes its corner out past the card's curve, where the
                 * card's own `overflow: hidden` takes a bite out of it. That
                 * is the chewed blue corner that was reported.
                 */
                canvasRadiusPx={isMobileView ? 0 : device === "desktop" ? 20 : 16}
                bodyCount={bodyCount + (writingShown ? 1 : 0)}
                onSelectSection={selectSectionFromCanvas}
                onAddSection={openAddSection}
                onAddSectionAt={openAddSectionAt}
                onEditorNavigate={handleEditorNavigate}
                missingPath={missingPath}
                /**
                 * Opening the create dialog with the address already typed
                 * in: the person has just told us what they want it called
                 * by clicking a link to it.
                 */
                onCreateMissingPage={createMissingPage}
                shopCards={shopCardsShown}
                installId={installId}
                words={previewLang.words}
              />
              )}
              {/* The sections Storelib AI is working on, and the ones it just changed. Over the page, never in its way. */}
              <AiWorkingOverlay working={aiWorkingIds} settled={aiSettledIds} label={aiWorkingLabel} />
              </div>
            )}
            </div>
          </div>
          {!isMobileView && <CanvasScrollbar targetId="wb-preview-root" />}
          {/* end of the rounded clipping wrapper */}
          </div>
          {/* The selected section's own toolbar, over the canvas. Only with
              the inspector on: with it off the canvas is a plain preview and
              nothing in it is selectable. */}
          {canvasInspecting && !fullView && !isMobileView && previewMode === "preview" && (() => {
            const current = sections.find((x) => x.id === selectedSectionId)
            if (!current) return null
            /* Moved inside its own group; the header and the footer themselves are not moved, copied or deleted from here. */
            const group = groupOf(current)
            const body = splitGroups(sections)[group]
            const idx = body.findIndex((x) => x.id === selectedSectionId)
            const chrome = (group === "header" || group === "footer") && isKind(current, group, kindOfType)
            return (
              <SectionToolbar
                sectionId={selectedSectionId}
                hidden={!!current.hidden}
                isChrome={chrome}
                canMoveUp={idx > 0}
                canMoveDown={idx > -1 && idx < body.length - 1}
                onMoveUp={() => selectedSectionId && moveSectionBy(selectedSectionId, -1)}
                onMoveDown={() => selectedSectionId && moveSectionBy(selectedSectionId, 1)}
                onDuplicate={() => selectedSectionId && duplicateSection(selectedSectionId, true)}
                onAskAi={() => {
                  setAiOpen(true)
                  if (isMobileView) setMobileSidebarOpen(false)
                  else {
                    rememberAskDockClosed(false)
                    setAiAsk((n) => n + 1)
                  }
                }}
                onToggleHide={() => selectedSectionId && toggleSectionHidden(selectedSectionId)}
                onRemove={() => selectedSectionId && removeSection(selectedSectionId)}
              />
            )
          })()}

          {/* ── Ask Storelib on a computer ──
              A frosted pill at the bottom centre of the canvas, over it and
              out of the layout, so the page does not move when it appears.
              Focusing it opens the conversation above it; Escape or a press
              elsewhere folds it back. Only over the preview: while the code
              or the settings fill the canvas it folds away by itself, still
              mounted, so a change it is making keeps going. The selected
              section's toolbar is drawn above it, and the pill steps out of
              its way when they meet. See components/website-builder/theme-chat.tsx. */}
          {!isMobileView && aiMounted && (
            <ThemeChat
              variant="dock"
              hidden={!aiOpen}
              suspended={previewMode !== "preview" || projectSettingsOpen || fullView}
              openRequest={aiAsk}
              installId={installId}
              page={currentPage}
              sections={sections}
              settings={aiSettings}
              selectedSectionId={aiSelected}
              store={aiStore}
              onRunStart={startAiRun}
              onRunEnd={backupAfterTask}
              onUndoRun={undoAiRun}
              onBusyChange={setAiBusy}
              onOp={applyAiOp}
              onClose={closeAiDock}
              onConnectAi={connectAiFromChat}
              onSourcesChanged={reloadAiSources}
              onPageWritten={aiPageWritten}
              onSourceWritten={aiSourceWritten}
              onWorkingChange={aiWorkingChange}
              onRunFinished={aiRunFinished}
              onWriteStart={handleWriteStart}
              onWriteDone={handleWriteDone}
              onWriteFailed={handleWriteFailed}
              onOpenCodeEditor={openAiCodeFromDock}
            />
          )}
        </main>
      </div>

      {/* ── Add a section: components/website-builder/editor/section-library.tsx ── */}
      <SectionLibrary
        open={addSectionOpen}
        onOpenChange={onAddSectionOpenChange}
        onAddSection={addSectionStable}
        schemas={librarySchemas}
        addable={libraryAddable}
        ownTypes={libraryOwnTypes}
        sources={storelibSources}
        compatInstallId={compatInstall ? installId : null}
        theme={settingsDraft}
      />

      {/* ── Add Custom Page Modal ── */}
      <Dialog open={addPageOpen} onOpenChange={setAddPageOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Add New Custom Page</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Page title</label>
              <Input
                placeholder="e.g. FAQ, Shipping, Terms..."
                value={newPageTitle}
                onChange={e => setNewPageTitle(e.target.value)}
                className="h-9"
                autoFocus
                onKeyDown={e => { if (e.key === "Enter" && newPageTitle.trim()) handleAddCustomPage() }}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => { setAddPageOpen(false); setNewPageTitle("") }} disabled={addingPage}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-foreground text-background hover:bg-foreground/90 min-w-[70px]"
              onClick={handleAddCustomPage}
              disabled={!newPageTitle.trim() || addingPage}
            >
              {addingPage ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  Adding...
                </>
              ) : (
                "Add"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Edit All Product Pages Confirmation Modal ── */}
      <Dialog open={editAllConfirmOpen} onOpenChange={setEditAllConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">Are you sure?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>Editing all product pages means that you can change all your store product pages at the same time from one place.</p>
            <p>For example, you can add a slideshow section to all your product pages simultaneously without needing to add it one by one.</p>
            <p>This is a great way to save a lot of effort while you make bulk changes.</p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setEditAllConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-foreground text-background hover:bg-foreground/90"
              onClick={() => {
                setEditAllProductPages(true)
                setEditAllConfirmOpen(false)
                setSelectedProductPage(null)
                setSelectedProductId(null)
              }}
            >
              Start Editing All
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Insert-between-sections divider ──────────────────────────
// A 16px tall hover target that reveals a thin line + plus button
// exactly between two sections. Clicking it opens the Add Section
// library with the insert position pre-set.
/**
 * ===========================================================================
 *  THE SAME THING, IN THE CANVAS
 * ===========================================================================
 * The sidebar has had an insert strip between its rows for a while. The
 * canvas had none, so adding a section in the middle of a page meant finding
 * the two rows it belongs between in a list on the left, rather than
 * pointing at the gap on the page where you want it.
 *
 * A full-width strip in the flow, so it takes its own space and cannot
 * overlap the sections on either side of it — the mistake the sidebar's own
 * version documents. At rest it is nothing at all: a page being designed
 * should not have a row of dotted lines running down it. Under the pointer a
 * line draws itself and a button turns in.
 *
 * The plus ROTATES rather than appearing: it comes in from -90°, which is
 * the quarter turn that reads as a control arriving rather than a graphic
 * being switched on. `rotate` and `scale` are named in the transition, not
 * `transform` — Tailwind v4 compiles those utilities to the standalone
 * properties, and a transition naming `transform` animates neither.
 */
function CanvasInsertStrip({ onClick }: { onClick: () => void }) {
  /**
   * ===========================================================================
   *  IT COSTS THE PAGE NO HEIGHT
   * ===========================================================================
   * This was `h-6 w-full` in flow, which is 24px of nothing inserted between
   * every pair of sections on the page. The canvas is meant to show what the
   * site looks like, and it was showing a site with a 24px gutter between
   * every section that the published page does not have. A person designing
   * against that is designing against the wrong page.
   *
   * So the element in flow is zero pixels tall and the hit area hangs off it,
   * straddling the boundary. Twelve pixels, six either side: enough to find
   * with a pointer, small enough that a click meant for the section above or
   * below almost never lands in it. Both the line and the button are
   * `pointer-events-none`, so the band is the only hover target and the
   * button being taller than it cannot flicker the hover the way the
   * sidebar's divider once did.
   */
  return (
    /* `wb-ring`: it fades and stops taking a press with the inspector's rings (globals.css, [data-wb-inspect]). */
    <div className="wb-ring relative isolate z-20 h-0 w-full">
    <div
      className="group absolute inset-x-0 -top-1.5 flex h-3 cursor-pointer select-none items-center justify-center"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      role="button"
      tabIndex={0}
      aria-label="Add a section here"
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return
        e.preventDefault()
        e.stopPropagation()
        onClick()
      }}
    >
      {/* Grey and near-black, not purple. A brand colour drawn across the
          middle of somebody's page is the editor talking over the thing it
          is meant to be showing: the line has to be findable, not loud, and
          the only strong mark is the 24px button that says what it does. */}
      <span className="pointer-events-none absolute inset-x-0 h-[2px] origin-center scale-x-0 bg-[#d4d7dd] opacity-0 transition-[opacity,scale] duration-200 ease-out group-hover:scale-x-100 group-hover:opacity-100 group-focus-visible:scale-x-100 group-focus-visible:opacity-100 motion-reduce:transition-none" />
      <span className="pointer-events-none relative z-10 flex h-6 w-6 -rotate-90 scale-75 items-center justify-center rounded-full bg-[#1a1a2e] text-white opacity-0 shadow-[0_2px_10px_-4px_rgba(15,23,42,0.7)] transition-[opacity,rotate,scale] duration-200 ease-out group-hover:rotate-0 group-hover:scale-100 group-hover:opacity-100 group-focus-visible:rotate-0 group-focus-visible:scale-100 group-focus-visible:opacity-100 motion-reduce:transition-none">
        <Plus className="h-3.5 w-3.5" strokeWidth={2.75} />
      </span>
    </div>
    </div>
  )
}

/**
 * ===========================================================================
 *  THE SELECTED SECTION'S OWN TOOLBAR
 * ===========================================================================
 *
 * Selecting a section in the canvas told you it was selected and then made
 * you go back to the sidebar to do anything about it. This is the handful of
 * things you actually want at that moment, next to the thing itself: move it
 * up, move it down, duplicate it, hide it, delete it.
 *
 * POSITIONED BY MEASUREMENT, NOT BY NESTING. Putting it inside the section
 * would mean threading five callbacks through every one of forty renderers,
 * and it would inherit the theme's own font, colour and stacking. So it
 * lives in the canvas and reads the section's rectangle: top-right of the
 * section, pushed down when the section starts above the fold so it never
 * scrolls out of reach, and hidden entirely when the section has scrolled
 * past.
 */
/** A button on the section toolbar, with its tooltip. */
function ToolbarItem({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation()
            onClick()
          }}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg transition-[background-color,color,scale] duration-150",
            "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 active:scale-90",
            "disabled:pointer-events-none disabled:opacity-30",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

/** How long the section toolbar takes to arrive, and to leave. */
const TOOLBAR_FADE_MS = 200

function SectionToolbar({
  sectionId,
  hidden,
  canMoveUp,
  canMoveDown,
  isChrome,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onToggleHide,
  onRemove,
  onAskAi,
}: {
  sectionId: string | null
  hidden: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  /** The header and the footer cannot be reordered or removed. */
  isChrome: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onDuplicate: () => void
  onToggleHide: () => void
  onRemove: () => void
  /** Opens the assistant on the section this toolbar belongs to. */
  onAskAi: () => void
}) {
  const [box, setBox] = useState<{ top: number; right: number } | null>(null)
  /**
   * =====================================================================
   *  IT ARRIVES AND LEAVES, RATHER THAN BLINKING
   * =====================================================================
   * This returned `null` the moment it had nowhere to point, so selecting a
   * section put the toolbar on screen in one frame and scrolling it out of
   * view took it away in one — a hard cut both ways, on the one piece of
   * chrome that follows the pointer around.
   *
   * An element removed from the tree cannot animate its departure, so it
   * stays mounted for the length of the fade and is unmounted after. Three
   * pieces of state, because they answer three different questions: where to
   * draw it, whether it is in the tree, and whether it is faded in.
   */
  const lastBox = useRef<{ top: number; right: number } | null>(null)
  if (box) lastBox.current = box
  /*
    PLACED IN WHAT IT IS PLACED IN. It is positioned in the canvas area,
    and its place was read against the scrolling page: the same box at
    Desktop, but in the phone preview the page is a narrower frame in the
    middle and the toolbar stood out at the canvas's right edge, 24px high.
    Read against its own containing box once it is in the page.
  */
  const barRef = useRef<HTMLDivElement>(null)
  const measureNow = useRef<() => void>(() => {})
  const present = box !== null
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (present) {
      setMounted(true)
      return
    }
    setVisible(false)
    const id = window.setTimeout(() => setMounted(false), TOOLBAR_FADE_MS)
    return () => window.clearTimeout(id)
  }, [present])

  /**
   * Faded in on the frame AFTER it is in the tree. Setting the final state
   * in the same commit that mounts it gives the browser one computed style
   * and nothing to interpolate from, which is the cut this exists to remove.
   */
  useEffect(() => {
    if (!mounted || !present) return
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [mounted, present])

  useEffect(() => {
    if (!sectionId) {
      setBox(null)
      return
    }
    const scroller = document.getElementById("wb-preview-root")
    if (!scroller) return

    let frame = 0
    const measure = () => {
      frame = 0
      const el = document.getElementById(`wb-section-${sectionId}`)
      /* A site drawer open over the canvas (its menu, its cart) covers the section: the toolbar is not drawn over the drawer. */
      if (!el || scroller.hasAttribute(SITE_DRAWER_OPEN_ATTRIBUTE)) {
        setBox(null)
        return
      }
      const s = scroller.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      // Gone past, above or below: nothing to point at.
      if (r.bottom < s.top + 8 || r.top > s.bottom - 8) {
        setBox(null)
        return
      }
      const top = Math.max(r.top + 10, s.top + 10)
      const host = (barRef.current?.offsetParent as HTMLElement | null) ?? scroller
      const h = host.getBoundingClientRect()
      setBox({ top: top - h.top, right: h.right - Math.min(r.right, s.right) + 10 })
    }
    measureNow.current = measure
    // Coalesced into a frame: a scroll fires far more often than the screen
    // is painted, and a measurement per event is a measurement thrown away.
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    measure()
    scroller.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onScroll) : null
    ro?.observe(scroller)
    /* And measured again when one opens or closes. */
    const mo = typeof MutationObserver !== "undefined" ? new MutationObserver(onScroll) : null
    mo?.observe(scroller, { attributes: true, attributeFilter: [SITE_DRAWER_OPEN_ATTRIBUTE] })
    return () => {
      if (frame) cancelAnimationFrame(frame)
      scroller.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      ro?.disconnect()
      mo?.disconnect()
    }
  }, [sectionId])
  /* Read again the moment it is in the page, against its own containing box. */
  useLayoutEffect(() => { if (mounted) measureNow.current() }, [mounted])

  /**
   * The last place it was, so a toolbar on its way out has somewhere to
   * fade FROM. While it is visible this is simply where it is now.
   */
  const draw = box ?? lastBox.current
  if (!mounted || !draw) return null

  /* The one component for every button here, made once outside this one (ToolbarItem): a component written inside it was a new kind of element on each render, so every press of a key in the sidebar took the toolbar's buttons out of the page and put new ones in. */
  const Item = ToolbarItem

  return (
    <div
      // Above the sections (9998) and the badge (9999), below the editor's
      // own chrome. It belongs to the editor, not to the page.
      className={cn(
        /**
         * BELOW THE CHROME, ABOVE THE CANVAS.
         *
         * This was `z-[60]`, and it outranked the editor's own top bar — so
         * with the Publish panel open, the toolbar and its tooltip painted
         * across it. The numbers looked safe and were not: `z-index` only
         * ranks things inside one stacking context, and `<main>` has
         * `position: relative` with NO z-index of its own, which creates no
         * context. So this was never being compared with its neighbours in
         * the canvas — it was competing directly with `<header>`'s `z-50` in
         * the editor's root context, and 60 beats 50.
         *
         * 30 puts it over the card (isolated) and the canvas scrollbar (20),
         * and under every piece of chrome. A tooltip cannot cover the panel
         * either once the button it belongs to is behind it.
         */
        "wb-section-toolbar wb-ring absolute z-30 flex items-center gap-0.5 rounded-xl border border-neutral-200/80 bg-white/95 p-1 shadow-[0_8px_28px_-10px_rgba(15,23,42,0.35)] backdrop-blur",
        /**
         * Opacity and transform only, and NOT `top`. It tracks its section
         * on every scrolled frame, so a transition on the position would
         * make it swim along behind the page it is pointing at. What
         * animates is its arrival: a few pixels down and a hair small, on
         * the curve a thrown thing settles on.
         */
        /**
         * `translate` and `scale`, NOT `transform`. Tailwind v4 compiles
         * `-translate-y-1` and `scale-[0.97]` to the standalone `translate:`
         * and `scale:` properties, so a transition naming `transform`
         * transitions nothing at all and the movement snaps while the fade
         * runs. Measured: with `transform` named, changing the class starts
         * one transition; with these named, three.
         */
        "transition-[opacity,translate,scale] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
        visible
          ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
          : // Deaf while it leaves: a toolbar nobody can see is not a
            // toolbar anybody should be able to press.
            "pointer-events-none -translate-y-1 scale-[0.97] opacity-0",
      )}
      ref={barRef}
      style={{ top: draw.top, right: draw.right }}
      onClick={(e) => e.stopPropagation()}
    >
      {/**
       * ASK STORELIB ABOUT THIS SECTION, from the section itself.
       *
       * The assistant already knows which section is selected; what it did
       * not have was a way in from the thing being looked at. Every other
       * button here changes the section by hand. This one asks for a change
       * in words, which is the same job by another route, so it sits with
       * them rather than in a menu somewhere else.
       */}
      <Item label="Ask AI" onClick={onAskAi}>
        <StorelibLogo size={16} alt="" />
      </Item>
      <span aria-hidden className="mx-0.5 h-5 w-px bg-neutral-200" />
      {!isChrome && (
        <>
          <Item label="Move up" onClick={onMoveUp} disabled={!canMoveUp}>
            <ArrowUp className="h-4 w-4" strokeWidth={1.75} />
          </Item>
          <Item label="Move down" onClick={onMoveDown} disabled={!canMoveDown}>
            <ArrowDown className="h-4 w-4" strokeWidth={1.75} />
          </Item>
          <span aria-hidden className="mx-0.5 h-5 w-px bg-neutral-200" />
          <Item label="Duplicate" onClick={onDuplicate}>
            <Copy className="h-4 w-4" strokeWidth={1.75} />
          </Item>
        </>
      )}
      <Item label={hidden ? "Show" : "Hide"} onClick={onToggleHide}>
        {hidden ? <Eye className="h-4 w-4" strokeWidth={1.75} /> : <EyeOff className="h-4 w-4" strokeWidth={1.75} />}
      </Item>
      {!isChrome && (
        <Item label="Delete" onClick={onRemove}>
          <Trash2 className="h-4 w-4" strokeWidth={1.75} />
        </Item>
      )}
    </div>
  )
}

/**
 * The theme's CSS variables written straight onto the canvas's theme root,
 * for a theme setting under a finger (lib/website-builder/live-settings.ts
 * useLiveTheme): a page width, a side padding or a corner radius moves on
 * the next frame, before any section has rendered again.
 */
function patchCanvasThemeVars(theme: ThemeSettingsValues) {
  const root = document.querySelector<HTMLElement>(`#wb-preview-root [${THEME_ROOT_ATTRIBUTE}]`)
  if (!root) return
  for (const [k, v] of Object.entries(themeVars(theme))) {
    if (root.style.getPropertyValue(k) !== v) root.style.setProperty(k, v)
  }
}

/**
 * ===========================================================================
 *  THE CANVAS, AND WHY IT IS ITS OWN COMPONENT
 * ===========================================================================
 *
 * Everything below this line used to be written inline in the editor's
 * render, which meant every one of the site's sections was re-rendered
 * whenever ANY of the editor's state changed. The editor has a great deal of
 * state that has nothing to do with the page: a toast, the publish sheet, the
 * width of the sidebar, which row the pointer is over, where the section
 * toolbar has measured itself to on the last scroll frame. A long page is
 * thirty or forty section renderers, several of them carousels and grids, so
 * on a mid-range phone that is thirty or forty renders of real work to move
 * a toolbar four pixels.
 *
 * Extracted and memoised, it re-renders when the page it is drawing changes
 * and not before. It is a component with props rather than a `useMemo` with a
 * dependency array on purpose: a prop this needs and does not get is a
 * compile error, where a missing dependency is a canvas that quietly stops
 * updating.
 *
 * The callbacks are the whole reason it works, so they must be stable in the
 * parent. `onSelectSection` and `onAddSection` take no closure over a
 * section; they are given the id.
 */
const EditorCanvasPage = memo(function EditorCanvasPage({
  theme: committedTheme,
  sections,
  arrivedId,
  arrival,
  sources,
  pageTemplate,
  inspectorEnabled,
  selectedSectionId,
  device,
  canvasRadiusPx,
  bodyCount,
  onSelectSection,
  onAddSection,
  onAddSectionAt,
  onEditorNavigate,
  missingPath,
  onCreateMissingPage,
  shopCards,
  installId,
  storefrontData: canvasStorefrontData,
  words,
}: {
  theme: ThemeSettingsValues
  sections: SectionInstance[]
  /** A section Ask AI has just put on the page, which arrives rather than appears. */
  arrivedId?: string | null
  /**
   * A section just added from the library, with where the page's sections
   * were before it went in. Played by the canvas in the commit that draws it
   * (lib/website-builder/section-arrival.ts).
   */
  arrival?: { current: { id: string; before: Map<string, number>; bottomInset?: number } | null }
  /** Saved .storelib files, path to source; see storelibSources in the editor. */
  sources: Record<string, string>
  /** Which page's sections these are, for `page.template` in a section. */
  pageTemplate: string
  inspectorEnabled: boolean
  selectedSectionId: string | null
  device: DeviceMode
  /** The canvas card's top radius, so a ring inside it is cut to match. */
  canvasRadiusPx: number
  bodyCount: number
  onSelectSection: (sectionId: string, blockId?: string | null, field?: ClickTarget | null) => void
  onAddSection: () => void
  onAddSectionAt: (at: number) => void
  onEditorNavigate: (href: string, fromNav?: boolean) => void
  /** An address the site has no page for, so the canvas can say so. */
  missingPath?: string | null
  onCreateMissingPage?: (path: string) => void
  /**
   * The creator's real products, for a section set to draw the shop. The
   * same list the published page gets, mapped through the same `toCard`, so
   * the canvas and the site cannot disagree about a price.
   */
  shopCards: ProductCard[]
  /** Which theme install the canvas is drawing, so a section can ask on its behalf. */
  installId: string
  /** The shop's own facts, the same the live site draws with: lib/website-builder/storefront-data.ts. */
  storefrontData?: import("@/lib/storelib-theme/types").StorefrontData
  /** The shop's own words in the language previewed (lib/markets/ui-words.ts). */
  words?: Record<string, string>
}) {
  /* A theme setting under a finger is drawn here, without the editor rendering again (lib/website-builder/live-settings.ts). */
  const theme = useLiveTheme(committedTheme, patchCanvasThemeVars)
  /**
   * The same navigate, already marked as coming from the site's navigation.
   * Memoised, because it is handed to every chrome section on every render
   * and SectionRenderer is memoised on its props.
   */
  const navigateFromChrome = useCallback((href: string) => onEditorNavigate(href, true), [onEditorNavigate])
  /**
   * A SECTION JUST ADDED ARRIVES. The canvas draws a deferred copy of the
   * page, so the commit that puts the new section here can be a frame or two
   * after the add; whichever commit it is, this runs before it is painted,
   * opens the page where the section went in and brings it on screen.
   */
  useLayoutEffect(() => {
    const plan = arrival?.current
    if (!plan) return
    const el = document.getElementById(`wb-section-${plan.id}`)
    if (!el) return
    arrival!.current = null
    const scroller = document.getElementById("wb-preview-root")
    if (!scroller) return
    /* On a phone the sections sheet covers the foot of the canvas by its peek.
       Read from the root's own style, where the sheet writes it: asking for
       the computed style here would make the browser restyle the page first. */
    const peek = parseFloat(document.documentElement.style.getPropertyValue("--wb-sheet-peek")) || 0
    /* Unless the add says what will cover it: on a phone, the sheet that rises on the new section. */
    void playArrival(scroller, el, plan.before, { bottomInset: plan.bottomInset ?? peek })
  }, [sections, arrival])
  /* One object per install. Inline, it was a new storefront context on every
     canvas render, and every section reading it rendered again past its memo. */
  const storefront = useMemo(() => ({ inEditor: true, installId, words }), [installId, words])
  /* The built-in header's logo, for a coded header or footer that reads theme.logo (lib/website-builder/chrome-logo.ts). */
  const canvasHeaderLogo = useMemo(() => headerLogoOf(sections), [sections])
  return (
    <StorelibLiveProvider sources={sources} page={{ template: pageTemplate }} inEditor products={shopCards} data={canvasStorefrontData} headerLogo={canvasHeaderLogo}>
    <ThemePage
      theme={theme}
      sections={sections}
      // Designing a page is not subscribing to it. See storefront-context.
      storefront={storefront}
      /**
       * The strip you hover to add a section right there. Only with the
       * inspector on: with it off the canvas is a plain preview, and nothing
       * in it is meant to be a control.
       */
      renderGap={
        inspectorEnabled
          ? (at) => {
              /* Counted without the placeholder, which is not in the page. */
              const gap = gapWithoutPlaceholder(sections, at)
              return gap === null ? null : <CanvasInsertStrip onClick={() => onAddSectionAt(gap)} />
            }
          : undefined
      }
      /**
       * `atTop` says whether this header has any chrome above it.
       * ThemePage answers that because ThemePage draws the chrome;
       * reading the theme's own flags from here is how the
       * announcement bar came to exist in four places at once.
       */
      renderSection={(section, role, atTop) => {
        /* The spot Ask AI is writing into. Not a section: nothing to select. */
        if (section.type === WRITING_SECTION_TYPE) {
          return (
            <div key={section.id} id={`wb-section-${section.id}`}>
              <WritingSection prompt={typeof section.settings.prompt === "string" ? section.settings.prompt : ""} />
            </div>
          )
        }
        const shared = {
          section,
          theme,
          // TRUE whether or not the Inspector is on — it tells a
          // section "you are inside the canvas card, use the
          // editor-scoped sticky mode". `isEditing` flips with the
          // toggle; this does not, which is what kept the header
          // from going `position: fixed` over the editor chrome.
          insideEditor: true,
          isEditing: inspectorEnabled,
          isSelected: inspectorEnabled && selectedSectionId === section.id,
          /**
           * CLICKING A BLOCK SELECTS THE BLOCK. Every section that has blocks
           * marks each one with `data-block-id`, so the nearest one above the
           * click is the block that was clicked; anywhere else in the section
           * is the section. Without this, the third question in an FAQ and the
           * twelfth were the same click, and finding that question again in
           * the sidebar meant counting rows.
           */
          onClick: inspectorEnabled
            ? (e: React.MouseEvent<HTMLElement>) => {
                /**
                 * A PRESS ON A FIELD IS FOR TYPING, NOT FOR SELECTING.
                 *
                 * An email box in a section could not be typed into with the
                 * inspector on: the press focused it, and the click then
                 * selected its section, which on a phone opens the settings
                 * sheet over the canvas and takes the focus and the keyboard
                 * with it. A field, or the label that points at one, now
                 * keeps its press; anywhere else in the section selects it.
                 */
                const target = e.target as HTMLElement | null
                if (isTypingTarget(target as unknown as ClickTargetLike) || target?.closest?.("label")) return
                /* A block inside a block: its path is its id and every block id around it, up to the section. */
                const path: string[] = []
                let hit = (e.target as HTMLElement | null)?.closest?.("[data-block-id]") ?? null
                while (hit && !hit.hasAttribute("data-section-id")) {
                  const bid = hit.getAttribute("data-block-id")
                  if (bid) path.unshift(bid)
                  hit = hit.parentElement?.closest?.("[data-block-id], [data-section-id]") ?? null
                }
                /* AND THE FIELD FOR WHAT WAS CLICKED: a heading opens at Heading (lib/website-builder/click-to-edit.ts). */
                const box = e.currentTarget as HTMLElement
                const field = clickTarget(
                  chainFrom(target as unknown as ElementLike, (el) => el === (box as unknown as ElementLike) || !!el.getAttribute("data-section-box")),
                  section,
                )
                onSelectSection(section.id, field ? field.block : path.length ? pathKey(path) : null, field)
              }
            : undefined,
          deviceMode: device,
          /**
           * THE HEADER AND THE FOOTER NAVIGATE; EVERYTHING ELSE SELECTS.
           *
           * The canvas already follows a link inside `[data-chrome]`, but the
           * header's nav never reaches that handler: it calls this prop and
           * then stops the event, so "Home" did nothing at all with the
           * inspector on. It is the site's navigation, so it is handed a
           * navigate that says so; a body section keeps the one that refuses
           * while the inspector is on, because a tap on a hero's button is
           * almost always aimed at the hero.
           */
          onEditorNavigate: role === "header" || role === "footer" ? navigateFromChrome : onEditorNavigate,
        }

        // The header takes `wrapperId` rather than sitting in a
        // wrapping div: the id has to land on the SectionWrapper's
        // own root, or `position: sticky` gets a containing block
        // exactly the header's height and never sticks.
        if (role === "header") {
          return (
            <SectionRenderer
              key={section.id}
              wrapperId={`wb-section-${section.id}`}
              {...shared}
              /**
               * Only when the header IS the top of the card. With an
               * announcement bar above it the header is a square band
               * in the middle of the page, and rounding its selection
               * ring there curves the corners of nothing — which is
               * the ring that looked arbitrary.
               *
               * THE CARD'S OWN NUMBER, passed in. This was a literal 12
               * while the card went 16, then 22, then 20, so the ring
               * was cut to a curve the card did not have: its corner
               * reached past the card's, and the card's `overflow:
               * hidden` bit a piece out of it.
               */
              canvasRoundedTopPx={atTop && canvasRadiusPx ? canvasRadiusPx : undefined}
            />
          )
        }

        /*
          NO WRAPPER OF THE EDITOR'S OWN. Each body section sat in a div of
          the editor's, which made the sections' boxes cousins instead of the
          siblings they are on the live page, so the theme's section gap (a
          rule between sibling boxes) applied on the live site and never in
          the canvas. The id and the arrival animation go on the box itself,
          which is the same element the live page draws.
        */
        return (
          <SectionRenderer
            key={section.id}
            {...shared}
            wrapperId={`wb-section-${section.id}`}
            boxClassName={section.id === arrivedId ? "wb-section-arrive" : undefined}
            canvasRoundedBottomPx={
              role === "footer" && device !== "desktop" ? 16 : undefined
            }
          />
        )
      }}
    >
      {/*
        THE PLACEHOLDER IS WHAT GROWS, so the footer lands at the bottom of the
        card rather than halfway down it with the editor's white underneath.
        Only ever on an empty page: with sections there is no placeholder, and
        the page keeps natural flow. See pageFill in ThemePage.
      */}
      {missingPath ? (
        <div className="flex-1 py-24 flex items-center justify-center text-center">
          <div className="max-w-[420px] px-6">
            <p className="mb-1 text-xl font-bold uppercase tracking-tight text-neutral-300">Page not found</p>
            <p className="mb-4 text-sm text-neutral-500">
              Nothing on this website answers to <span className="font-medium text-neutral-700">{missingPath}</span> yet.
              The link works; the page it points at has not been made.
            </p>
            <button
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              onClick={() => onCreateMissingPage?.(missingPath)}
            >
              <Plus className="h-4 w-4" />
              Create this page
            </button>
          </div>
        </div>
      ) : bodyCount === 0 && sections.length > 0 ? (
        <div className="flex-1 py-24 flex items-center justify-center text-center">
          <div>
            <p className="text-xl font-bold tracking-tight text-neutral-300 uppercase mb-1">Empty Page</p>
            <p className="text-sm text-neutral-400 mb-4">Create your beautiful page by adding sections</p>
            <button className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-foreground border border-border rounded-lg hover:bg-muted transition-colors" onClick={onAddSection}>
              <Plus className="h-4 w-4" />
              Add a section
            </button>
          </div>
        </div>
      ) : null}
    </ThemePage>
    </StorelibLiveProvider>
  )
})

