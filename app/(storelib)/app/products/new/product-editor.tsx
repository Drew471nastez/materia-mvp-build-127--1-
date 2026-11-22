"use client"

import { announceChange } from "@/lib/seo/announce-client"
import { teamSignedUpload } from "@/lib/team/upload-fallback"
import { forgetProduct } from "@/lib/products/forget-client"
import { deleteProduct, deleteQuestion, leaveNotice, previewProductDelete, rememberCreated, rememberDeleted, rememberStatus } from "@/lib/products/delete-client"
import React, { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect, memo, startTransition } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { getCanonicalSiteUrl, getProductShareUrl } from "@/lib/url-helpers"
import { isNativeApp } from "@/lib/platform-utils"
import { hapticTap, openExternal } from "@/lib/native-bridge"
import { Button } from "@/components/ui/button"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
// Native <select> used instead of Radix Select for reliable dropdown behavior
import {
  Check,
  Plus,
  X,
  FileText,
  Play,
  Trash2,
  ChevronUp,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  CheckCircle,
  AlertCircle,
  MoreHorizontal,
  ArrowLeft,
  Pencil,
} from "lucide-react"
import Link from "next/link"
import { RichTextEditor } from "@/components/app/rich-text-editor"
import { descriptionForSave } from "./description-save"
import { descriptionTooLong } from "@/lib/rich-text/policy"
import { uploadDescriptionImage } from "@/lib/rich-text/upload-image"
import { CSS } from "@dnd-kit/utilities"
import { avoidReservedProductSlug } from "@/lib/commerce/reserved-slugs"
import { SWITCH_GROUP, SwapPanels, SwitchRow } from "./editor-controls"
import { ResponsiveActionMenu } from "@/components/ui/responsive-action-menu"
import { cn } from "@/lib/utils"
import {
  cardsSaved,
  changedCards,
  changedFields,
  dirtyFieldsOf,
  reportCardDraft,
  type CardDrafts,
  initialForm,
  parseYouTubeUrl,
  snapshotOf,
  type DirtyFields,
  type EditorCreator,
  type FAQItem,
  type LoadedProduct,
  type MediaItem,
  type ProductVariant,
  coverOriginalOf,
  type UploadedFile,
  seoDescriptionFrom,
  swapDefaults,
} from "./editor-form"
import { LeaveButton, PRESS_CONTENT_OUT, PRESS_SPINNER_IN, SAVED_CHECK_MS, SaveButton, barIconButton, secondaryDepth, type SavePhase } from "./editor-buttons"
import { StatusBadge, iconButton } from "../../orders/order-parts"
import { PRODUCTS_HREF, removeFromListCopy, returnToProducts, updateListCopy, useListOrigin, warmProducts } from "../list-return"
import { formatMoney } from "../../orders/order-parts"
import { productPriceCurrency } from "@/lib/money/product-currency"
import { useStoreCurrency } from "@/lib/store/currency-context"
import { startNavigationLoading } from "@/components/app/navigation-loading-bar"
import { askBeforeLeaving } from "@/lib/ui/leave-guard"
import { num } from "@/lib/forms/dirty"
import { ActivitySpinner } from "@/components/ui/activity-spinner"
import { afterLayerMove, forgetPageCopy, holdLayerLanding } from "@/components/app/page-layer"
import { useConfirm } from "./confirm-sheet"
import { FaqList } from "./faq-list"
import { CustomFieldsCard } from "./custom-fields-card"
import { PersonalizationCard } from "./personalization-card"
import { personalizationProblem, storedPersonalization, type PersonalizationField } from "@/lib/products/personalization"
import { MarketplacePriceCard } from "./marketplace-price-card"
import { SalesChannelsCard, type SalesChannelsHandle } from "./sales-channels-card"
import { CollectionsCard, type CollectionsHandle } from "./collections-card"
import { fieldKey, fieldProblem, storedCustomFields, type CustomField } from "@/lib/products/custom-fields"
import { MAX_SALES_LIMIT, missingSalesLimit, readSalesLimit, soldOfText, typedSalesLimit } from "@/lib/products/sales-limit"
import { MediaGrid, type PendingMedia } from "./media-grid"
import { FilesLibraryChooser, prefetchLibrary, type PickMany } from "@/components/files/files-library"
import { VIDEO_ACCEPT, isVideoUrl, videoPosterUrl } from "@/lib/media/video"
import { isVideoFile, uploadVideo, videoRefusal } from "@/lib/files/upload-video"
import { precheckUpload, sanitizeDisplayName } from "@/lib/security/uploads"
import { DigitalFiles, useFileUploads } from "./file-uploads"
import { CourseEditor } from "./course-editor"
import { CategoryPicker } from "./category-picker"
import { isCategoryFor } from "@/lib/products/category-groups"
import { useCategorySuggestion } from "./category-suggestion"
import { saveVariants } from "./variant-save"
import { PhysicalProductCards, type OrderLimitDraft, type PhysicalEditorHandle } from "@/components/physical/product-cards"
import { Reveal } from "@/components/physical/ui"
import { currencyMark, formatStoreMoney, markInset } from "@/lib/store/currency"
import { STORE_CURRENCY_EVENT, StoreCurrencyProvider } from "@/lib/store/currency-context"
import { currencyChangedSince } from "@/lib/store/currency-guard"
import { storeCurrencyOf } from "@/lib/store/currency"
import { ReadinessNote } from "@/components/physical/readiness-banner"
import { msg, tt } from "@/lib/i18n/text"
import { appLocale } from "@/lib/i18n/format"
import { nudgeNotifications } from "@/lib/notifications/nudge"
import { hasTransparency, mayBeTransparent } from "@/lib/images/transparency"

/*
  The cards a failed check scrolls to (handleSaveChanges). There is no row of
  section tabs any more, on any width: "there should not be the About / Media /
  Content / Settings / SEO". The cards are the page, each under its own heading.
*/
type SectionId = "about" | "media" | "content" | "files" | "variants" | "category"

/*
  ONE CARD, THE /app CARD (CLAUDE.md), with the editor's own padding. The
  columns space the cards (gap), so a card carries no margin of its own.
*/
/* Sideways padding from --app-card-x (app/globals.css), as every /app card takes it. */
const CARD = "scroll-mt-4 space-y-4 rounded-2xl border border-[#e5e7eb]/60 bg-white app-card-x py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:space-y-5 sm:py-6"
const CARD_TITLE = "text-[16px] font-semibold leading-6 text-[#1a1a2e] sm:text-[17px]"

/** How a download can be sold, in the order the menu lists them. */
const PRICE_MODES = [
  { value: "fixed", get label() { return tt("Fixed price") } },
  { value: "pwyw", get label() { return tt("Pay what you want") } },
  { value: "free", label: "Free" },
] as const
const PRICE_MODE_HINT = {
  get fixed() { return tt("One price for every buyer.") },
  get pwyw() { return tt("Buyers choose what to pay, from your minimum.") },
  get free() { return tt("No payment needed.") },
} as const

/**
 * A PRICE AS IT IS TYPED. The price fields are text with a decimal keyboard,
 * not `type="number"`: a number field grows spinner arrows, changes its value
 * when the page is scrolled over it or dragged, and accepts "1e5". This keeps
 * digits and one point with two places after it; a comma is a point.
 */
function moneyTyped(raw: string): string {
  const clean = raw.replace(/,/g, ".").replace(/[^\d.]/g, "")
  const [whole, ...rest] = clean.split(".")
  return rest.length ? `${whole.slice(0, 7)}.${rest.join("").slice(0, 2)}` : whole.slice(0, 7)
}

/*
  ONE QUIET FOCUS FOR EVERY FIELD in the editor, new or saved: a grey border
  and a 3px ring you can only just see, in place of the blue ring the inputs
  bring with them and the violet one the selects had. It is on :focus, so a
  keyboard always shows where it is. Borderless fields inside a row (the
  what's included lines) keep their row as their outline. Set on the page
  and on the search listing dialog, which is drawn outside it.
*/
const FIELD_FOCUS =
  "[&_:is(input:not([type=checkbox]):not([type=radio]):not(.border-0),textarea:not(.border-0),select):focus]:border-[#9ca3af] [&_:is(input:not([type=checkbox]):not([type=radio]):not(.border-0),textarea:not(.border-0),select):focus]:outline-none [&_:is(input:not([type=checkbox]):not([type=radio]):not(.border-0),textarea:not(.border-0),select):focus]:ring-[3px] [&_:is(input:not([type=checkbox]):not([type=radio]):not(.border-0),textarea:not(.border-0),select):focus]:ring-[rgba(17,24,39,0.06)]"

/** The quiet chip that opens an optional field, the way Shopify offers Compare-at under a price. */
const OPTION_CHIP =
  "inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#f1f2f4] px-3 text-[13px] font-medium text-[#4b5563] transition-colors duration-100 hover:bg-[#e8e9ec] hover:text-[#1a1a2e] active:bg-[#e2e3e7] [-webkit-tap-highlight-color:transparent]"

/** A variant's own tools in its header row: grey, 36px (32 from 640px), and dimmed where they cannot move it further. */
const VARIANT_TOOL =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#6b7280] outline-none transition-colors duration-100 hover:bg-[#eceef1] hover:text-[#1a1a2e] focus-visible:shadow-[inset_0_0_0_2px_#9ca3af] disabled:pointer-events-none disabled:opacity-35 sm:h-8 sm:w-8 [-webkit-tap-highlight-color:transparent]"

/** The price a closed variant shows beside its name, in the store's currency: its minimum and a plus for pay what you want, else its price. */
function variantPriceLabel(v: ProductVariant, currency?: string): string {
  const cents = Math.round(Number.parseFloat((v.payWhatYouWant ? v.pwywMinPrice : v.price) || "0") * 100)
  if (!Number.isFinite(cents)) return ""
  if (v.payWhatYouWant) return `${formatStoreMoney(cents, currency)}+`
  return v.price ? formatStoreMoney(cents, currency) : ""
}

// Limits
const MAX_PHOTOS = 12
/* Video files in the gallery (uploaded or from Files), beside the YouTube links. */
const MAX_VIDEO_FILES = 5
const MAX_YOUTUBE_VIDEOS = 5
const MAX_DIGITAL_FILES = 15



const stripHtmlToPlainText = (input: string): string => {
  if (!input) return ""
  return input
    .replace(/<br\s*\/?>(?=)/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

// Helper to get YouTube thumbnail URL from video ID (for product listings only)
// This is ONLY used when no images exist - YouTube thumbnail becomes the product cover
const getYouTubeThumbnailUrl = (videoUrl: string): string | null => {
  const videoId = parseYouTubeUrl(videoUrl)
  return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null
}

// Memoized checkbox component for variant file assignment - prevents re-render issues
interface VariantFileCheckboxProps {
  fileId: string
  variantId: string
  fileName: string
  fileSize: number
  isAssigned: boolean
  onToggle: (variantId: string, fileId: string) => void
}

const VariantFileCheckbox = React.memo(function VariantFileCheckbox({
  fileId,
  variantId,
  fileName,
  fileSize,
  isAssigned,
  onToggle
}: VariantFileCheckboxProps) {
  const handleClick = useCallback(() => {
    onToggle(variantId, fileId)
  }, [onToggle, variantId, fileId])

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  /* A real checkbox to the keyboard and to VoiceOver; neutral when ticked, the page's near black box and a grey file. */
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={isAssigned}
      onClick={handleClick}
      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left outline-none transition-colors select-none focus-visible:shadow-[0_0_0_3px_rgba(17,24,39,0.06)] focus-visible:border-[#9ca3af] ${
        isAssigned
          ? 'border-[#d1d5db] bg-white'
          : 'border-[#eceef1] bg-[#fafafb] hover:border-[#e0e2e6]'
      }`}
    >
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-[1.5px] transition-colors ${
        isAssigned
          ? 'border-[#1a1a2e] bg-[#1a1a2e]'
          : 'border-[#c4c7ce] bg-white'
      }`}>
        {isAssigned && <Check className="h-3 w-3 text-white" strokeWidth={3} aria-hidden />}
      </span>
      <FileText className="h-4 w-4 shrink-0 text-[#9ca3af]" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm font-medium ${isAssigned ? 'text-[#1a1a2e]' : 'text-[#4b5563]'}`}>
          {fileName}
        </span>
        <span className="block text-[11px] text-[#9ca3af]">{formatFileSize(fileSize)}</span>
      </span>
    </button>
  )
})

/**
 * The product form's phone sheets (the call to action, the refund policy)
 * are the shared sheet, components/ui/bottom-sheet: the same opening, drag
 * and close as every sheet in /app, above the navigation pill. This was a
 * sheet of its own, on a CSS transition started a paint late from an effect
 * and a React-rendered drag. It sits on the keyboard when a field in it is
 * typed into. The category has its own, on the same sheet (./category-picker).
 */
function MobileSheet({
  isOpen,
  onClose,
  children,
  maxHeight,
  kept = false,
}: {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  maxHeight?: string
  /**
   * Built while the editor is idle and kept after it closes (BottomSheet
   * keepMounted), so the tap that opens it only slides it up: nothing to
   * render, style or lay out on that frame. On a phone only, where it is seen.
   */
  kept?: boolean
}) {
  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} maxHeight={maxHeight ?? "85dvh"} aboveKeyboard keepMounted={kept}>
      {children}
    </BottomSheet>
  )
}

/**
 * A carried message: a product created here is opened at its own address,
 * which is a new page, and the "Product is live" it earned is shown there.
 */
let carriedNotice: string | null = null
/* And the save itself: when it landed, so the new page's Save finishes the
   check the old one started and then says Saved, and its Cancel is Back. */
let carriedSavedAt: number | null = null
let carriedScrollTop: number | null = null

/**
 * THE EDITOR ACROSS A CHANGE OF THE STORE'S CURRENCY. Converting the
 * currency rewrites every price in the database, and an editor left open
 * holds the old numbers. When the page is drawn again in another currency
 * (Settings calls router.refresh), an editor with nothing unsaved is
 * mounted again on the converted prices; one with unsaved changes stays,
 * says so, and refuses to save (saveProduct below asks the store's currency
 * first), so old prices are never written back.
 */
export function ProductEditorAcrossCurrency({ id, creator, loaded }: { id: string; creator: EditorCreator; loaded: LoadedProduct | null }) {
  const [shown, setShown] = useState({ creator, loaded })
  const dirty = useRef(false)
  const onDirty = useCallback((d: boolean) => {
    dirty.current = d
  }, [])
  if (storeCurrencyOf(creator.currency) !== storeCurrencyOf(shown.creator.currency) && !dirty.current) setShown({ creator, loaded })
  return <ProductEditor key={`${id}:${storeCurrencyOf(shown.creator.currency)}`} creator={shown.creator} loaded={shown.loaded} onDirty={onDirty} />
}

export function ProductEditor({ creator: loadedCreator, loaded, startAs = "digital", onDirty }: { creator: EditorCreator; loaded: LoadedProduct | null; startAs?: "digital" | "course" | "physical"; onDirty?: (dirty: boolean) => void }) {
  const router = useRouter()
  /* The form's first frame is the saved product (./editor-form.ts). Read once:
     a server render after a save hands new props that must not reset it. */
  const [initial] = useState(() => initialForm(loaded, startAs))
  /*
    WHAT THE PRODUCTS LIST DRAWS FOR THIS PRODUCT, and what the last save sent
    (products round 42). After a save, a publish or an unpublish the row in
    the list's kept copy is corrected from these (../list-return
    updateListCopy), so Back drops the editor over the list at once instead
    of waiting for it to be fetched and drawn again.
  */
  const listStore = useStoreCurrency()
  type ListedRow = { title: string; cents: number; thumb: string | null; type: string | null }
  const listedRef = useRef<(ListedRow & { live: boolean }) | null>(
    loaded ? { title: loaded.product.title ?? "", cents: loaded.product.price_cents ?? 0, thumb: loaded.product.thumbnail_url ?? null, type: loaded.product.type ?? null, live: loaded.product.status === "published" } : null,
  )
  const sentRowRef = useRef<ListedRow | null>(null)
  /** After a save (`live`: what the save made it). A product the list never had, or a new cover or kind, forgets the copy instead. */
  const syncListCopy = (idBefore: string | null | undefined, live: boolean) => {
    const was = listedRef.current
    const now = sentRowRef.current
    if (!idBefore || !was || !now || now.thumb !== was.thumb || now.type !== was.type) {
      listedRef.current = null
      forgetPageCopy()
      return
    }
    updateListCopy({
      id: idBefore,
      title: now.title !== was.title ? now.title || tt("Untitled draft") : undefined,
      priceText: now.cents !== was.cents ? (now.cents > 0 ? formatMoney(now.cents, productPriceCurrency({ type: now.type }, listStore)) : "Free") : undefined,
      live: live !== was.live ? live : undefined,
    })
    listedRef.current = { ...now, live }
  }
  const editProductId = loaded?.product.id ?? null
  /* The variants could not be read when the page was drawn (./load-editor.ts): the form shows none, and a save must not take that as all of them removed. */
  const variantsUnread = useRef(!!loaded?.variantsUnread)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const creatorId = loadedCreator.id
  const creator = loadedCreator
  /* The currency every price here was loaded in (ProductEditorAcrossCurrency above). */
  const loadedCurrency = storeCurrencyOf(loadedCreator.currency)
  React.useEffect(() => {
    const on = (e: Event) => {
      const next = (e as CustomEvent<string>).detail
      if (currencyChangedSince(loadedCurrency, typeof next === "string" ? next : null)) setError(tt("Your store currency changed. Reload to see the converted prices."))
    }
    window.addEventListener(STORE_CURRENCY_EVENT, on)
    return () => window.removeEventListener(STORE_CURRENCY_EVENT, on)
  }, [loadedCurrency])
  /* Every price field in the store's currency (lib/store/currency.ts): $ before the number, lei after it. */
  const priceMark = useMemo(() => {
    const mark = currencyMark(creator.currency)
    const inset = markInset(creator.currency)
    return {
      mark,
      node: (
        <span aria-hidden data-currency-mark={mark.code} className={cn("pointer-events-none absolute top-1/2 -translate-y-1/2 text-sm text-gray-400", mark.position === "prefix" ? "left-3" : "right-3")}>
          {mark.symbol}
        </span>
      ),
      pad: (mark.position === "prefix" ? { paddingLeft: inset } : { paddingRight: inset }) as React.CSSProperties,
    }
  }, [creator.currency])
  const [productId, setProductId] = useState<string | null>(initial.productId)
  const storedDescriptionRef = useRef<string | null>(initial.productId ? initial.description : null) // The description as the row holds it
  /* The saved name, for the more menu's sheet. The bar itself names no product: the title field does. */
  const [savedTitle, setSavedTitle] = useState(initial.title)

  // Product status tracking
  const [isPublished, setIsPublished] = useState(initial.isPublished)
  const [showNotification, setShowNotification] = useState(() => carriedNotice !== null)
  const [notificationMessage, setNotificationMessage] = useState(() => carriedNotice ?? "")
  /* A check on Save for a moment after a save (./editor-buttons, SAVED_CHECK_MS). */
  const [savedFlash, setSavedFlash] = useState(false)
  const savedFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flashSaved = () => {
    if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current)
    setSavedFlash(true)
    savedFlashTimer.current = setTimeout(() => setSavedFlash(false), SAVED_CHECK_MS)
  }
  /* The bar's Save, from the press to the answer. Its own flag, not isLoading,
     which Publish in the more menu sets too: that is not Save saving. The ref
     is the guard, because two presses in one frame both read the old state. */
  const [saveBusy, setSaveBusy] = useState(false)
  const saveInFlight = useRef(false)
  useEffect(() => () => {
    if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current)
  }, [])
  /* Saved in this visit, with nothing changed since, the grey Save says
     Saved. A new product's first save opens it at its own address, a new
     page, which picks up where this one was. */
  const [savedThisVisit, setSavedThisVisit] = useState(() => carriedSavedAt !== null)
  /* ...and the form opens where it was scrolled, before its first frame is painted. */
  useLayoutEffect(() => {
    const top = carriedScrollTop
    carriedScrollTop = null
    if (top && contentRef.current) contentRef.current.scrollTop = top
  }, [])
  useEffect(() => {
    const at = carriedSavedAt
    carriedSavedAt = null
    if (at === null) return
    const left = SAVED_CHECK_MS - (performance.now() - at)
    if (left <= 0) return
    setSavedFlash(true)
    savedFlashTimer.current = setTimeout(() => setSavedFlash(false), left)
  }, [])

  /*
    THE LIST, READY FOR THE WAY BACK. Fetched in full when the editor opens,
    and again whenever the page's props change, which is a save's refresh
    landing: the refresh drops every page the router kept, the list with
    them, and the list fetched after it has the save in it.
  */
  useEffect(() => {
    warmProducts(router)
  }, [router, loaded])
  /* Whether the list opened this editor, one history entry after it: Back then goes back in history (../list-return). */
  useListOrigin()
  /*
    WHAT IS SAVED, which "unsaved" is measured against (./editor-form.ts
    changedFields): the form as it opened, and after each save the form as it
    was sent. A new product's is its empty form.
  */
  const [savedForm, setSavedForm] = useState<DirtyFields>(() => dirtyFieldsOf(initial))
  const savedFormRef = useRef(savedForm)
  savedFormRef.current = savedForm
  /*
    THE CARDS THAT HOLD THEIR OWN DRAFT (sales channels, a physical product's
    stock, shipping and variants, its limit per order) say what they hold now
    and what they loaded or last saved, each under its own name. Unsaved is
    the two differing, so a channel ticked off and on again is no change.
  */
  const [cards, setCards] = useState<CardDrafts>({})
  const reportCard = useCallback((key: string, value: unknown, saved: boolean) => setCards((c) => reportCardDraft(c, key, value, saved)), [])
  const cardsRef = useRef(cards)
  cardsRef.current = cards
  /* The Sales channels card, saved after the product (./sales-channels-card). */
  const channelsRef = useRef<SalesChannelsHandle>(null)
  /* The Collections card, saved after the product too (./collections-card, round 24). */
  const collectionsRef = useRef<CollectionsHandle>(null)
  /* Every question the editor asks (leave, delete a file, a very large upload). */
  const [ask, confirmSheet, choose] = useConfirm()

  // YouTube inline input (bottom sheet on mobile)
  const [showYoutubeInput, setShowYoutubeInput] = useState(false)
  /* "Your files": photos the store already has (components/files/files-library), several at once. */
  const [choosingFiles, setChoosingFiles] = useState(false)
  const [youtubeInput, setYoutubeInput] = useState("")

  // CTA bottom sheet for mobile
  const [showCtaSheet, setShowCtaSheet] = useState(false)
  const [showRefundPolicySheet, setShowRefundPolicySheet] = useState(false)
  const [isMobileViewport, setIsMobileViewport] = useState(false)

  // Whether anything has scrolled under the bar (its hairline)
  const [isScrolled, setIsScrolled] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const syncViewport = () => setIsMobileViewport(window.innerWidth < 640)
    syncViewport()
    window.addEventListener("resize", syncViewport)
    return () => window.removeEventListener("resize", syncViewport)
  }, [])

  // The cards a failed check scrolls to
  const sectionRefs = useRef<{ [key in SectionId]?: HTMLDivElement | null }>({})
  const contentRef = useRef<HTMLDivElement>(null)

  // About section fields
  const [title, setTitle] = useState(initial.title)

  // Media section fields - unified draggable media
  const [mediaItems, setMediaItems] = useState<MediaItem[]>(initial.mediaItems)
  /* The cover as uploaded, as last saved (products.cover_original_url): written again only when it changes. */
  const savedCover = useRef<string | null>(coverOriginalOf(initial.mediaItems))
  /* Photos on their way up, each shown as its own preview in the grid. */
  const [pendingMedia, setPendingMedia] = useState<PendingMedia[]>([])

  // Content tab fields
  const [description, setDescription] = useState(initial.description)
  const [callToAction, setCallToAction] = useState(initial.callToAction)
  const [digitalFiles, setDigitalFiles] = useState<UploadedFile[]>(initial.digitalFiles)
  /* Each file uploading, in the row it keeps when it is done (./file-uploads). */
  const fileUploads = useFileUploads(setDigitalFiles)

  // Settings tab fields
  const [price, setPrice] = useState(initial.price)
  const [compareAtPrice, setCompareAtPrice] = useState(initial.compareAtPrice)
  /* The compare-at field shows when there is one, or once its chip is pressed. */
  const [compareOpen, setCompareOpen] = useState(() => !!initial.compareAtPrice)
  /* The search engine listing's fields, folded open under its card by the pencil. */
  const [seoOpen, setSeoOpen] = useState(false)
  const seoFieldsRef = useRef<HTMLDivElement>(null)
  /* Opened at the foot of the page: once the fields have their height, the card's foot is brought into view, smoothly, and only as far as it needs. */
  const showSeoCard = (smooth: boolean) =>
    seoFieldsRef.current?.closest<HTMLElement>("[data-seo-card]")?.scrollIntoView({ block: "nearest", behavior: smooth ? "smooth" : "auto" })
  const toggleSeo = () => {
    const opening = !seoOpen
    setSeoOpen(opening)
    /* No transition to wait for under reduced motion: the fields are there on the next frame. */
    if (opening && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) requestAnimationFrame(() => showSeoCard(false))
  }
  const onSeoOpened = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.propertyName !== "grid-template-rows" || !seoOpen) return
    showSeoCard(true)
  }
  const compareRef = useRef<HTMLInputElement>(null)
  const [slug, setSlug] = useState(initial.slug)
  const [productType, setProductType] = useState<"digital" | "course" | "physical">(initial.productType)
  /* A physical product's stock, shipping and variants card (components/physical/product-cards.tsx): checked and saved with the product. */
  const physicalRef = useRef<PhysicalEditorHandle | null>(null)
  /* A physical product's cards say what they hold (reportCard above). */
  const reportPhysical = useCallback((value: unknown, saved: boolean) => reportCard("physical", value, saved), [reportCard])
  const reportChannels = useCallback((value: unknown, saved: boolean) => reportCard("channels", value, saved), [reportCard])
  const reportCollections = useCallback((value: unknown, saved: boolean) => reportCard("collections", value, saved), [reportCard])
  /* A course's lessons, counted by its card (./course-editor.tsx), for the publish check. */
  const [lessonCount, setLessonCount] = useState(0)
  const [showSalesBadge, setShowSalesBadge] = useState(initial.showSalesBadge)
  const [refundPolicyEnabled, setRefundPolicyEnabled] = useState(initial.refundPolicyEnabled)
  const [refundPolicyType, setRefundPolicyType] = useState(initial.refundPolicyType)

  // SEO tab fields
  const [seoTitle, setSeoTitle] = useState(initial.seoTitle)
  const [seoDescription, setSeoDescription] = useState(initial.seoDescription)
  const seoManuallyEditedRef = useRef(initial.seoEdited) // A saved SEO description is not rewritten from the description

  // External file drag state for media picker
  const [isExternalDragOver, setIsExternalDragOver] = useState(false)
  const dragCounterRef = useRef(0)

  // Scroll-aware touch tracking to prevent accidental triggers while scrolling
  const isScrollingRef = useRef(false)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const touchStartYRef = useRef<number | null>(null)

  // Track scrolling state to prevent accidental element activation
  useEffect(() => {
    const scrollContainer = contentRef.current
    if (!scrollContainer) return

    const handleScroll = () => {
      /* The top bar's hairline, once something is under it. */
      setIsScrolled(scrollContainer.scrollTop > 0)
      isScrollingRef.current = true
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
      scrollTimeoutRef.current = setTimeout(() => {
        isScrollingRef.current = false
      }, 150)
    }

    scrollContainer.addEventListener("scroll", handleScroll, { passive: true })
    return () => {
      scrollContainer.removeEventListener("scroll", handleScroll)
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
    }
  }, [])

  // Guard click handler: only fire if not scrolling and touch didn't move
  const handleUploadZoneClick = useCallback(() => {
    if (isScrollingRef.current) return
    document.getElementById("media-input")?.click()
  }, [])

  // Ratio warning state for non-widescreen images

  // Variants state (max 7 variants)
  const [variants, setVariants] = useState<ProductVariant[]>(initial.variants)
  /** A new, open variant at the end of the list, scrolled into view once it is drawn. */
  const addVariant = () => {
    const variantId = `new-variant-${Date.now()}`
    setVariants((prev) => [
      ...prev,
      { id: variantId, name: "", description: "", price: price || "0", compareAtPrice: "", maxPurchases: "", isExpanded: true, assignedFiles: [], payWhatYouWant: false, pwywMinPrice: "", pwywSuggestedPrice: "" },
    ])
    requestAnimationFrame(() => {
      setTimeout(() => {
        const el = document.querySelector(`[data-variant-id="${variantId}"]`)
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" })
      }, 50)
    })
  }
  const MAX_VARIANTS = 7
  /** One place up or down. The order is the list's: it is saved as each variant's position. */
  const moveVariant = (id: string, by: -1 | 1) => {
    setVariants((prev) => {
      const from = prev.findIndex((v) => v.id === id)
      const to = from + by
      if (from < 0 || to < 0 || to >= prev.length) return prev
      const next = [...prev]
      ;[next[from], next[to]] = [next[to], next[from]]
      return next
    })
  }

  // Pay What You Want state (product-level, used when no variants)
  const [payWhatYouWant, setPayWhatYouWant] = useState(initial.payWhatYouWant)
  const [pwywMinPrice, setPwywMinPrice] = useState(initial.pwywMinPrice)
  const [pwywSuggestedPrice, setPwywSuggestedPrice] = useState(initial.pwywSuggestedPrice)
  /*
    How it is sold: a fixed price, pay what you want, or free. Nothing new is
    saved for it. Pay what you want is the flag it always was, and free is a
    price of nothing, which is how a saved product with no price opens.
  */
  type PriceMode = "fixed" | "pwyw" | "free"
  const [priceMode, setPriceMode] = useState<PriceMode>(() =>
    initial.payWhatYouWant ? "pwyw" : initial.productId && initial.variants.length === 0 && !Number.parseFloat(initial.price || "0") ? "free" : "fixed",
  )
  /* The prices free cleared, given back if fixed is chosen again. */
  const priceBeforeFree = useRef<{ price: string; compareAt: string } | null>(null)
  const choosePriceMode = (mode: PriceMode) => {
    if (mode === priceMode) return
    hapticTap("soft")
    if (mode === "free") {
      priceBeforeFree.current = { price, compareAt: compareAtPrice }
      setPrice("")
      setCompareAtPrice("")
    } else if (priceMode === "free" && priceBeforeFree.current && !price) {
      setPrice(priceBeforeFree.current.price)
      setCompareAtPrice(priceBeforeFree.current.compareAt)
    }
    setPayWhatYouWant(mode === "pwyw")
    setPriceMode(mode)
  }

  // What's Included state (3 defaults + 5 custom max = 8 total)
  const [whatsIncluded, setWhatsIncluded] = useState<string[]>(initial.whatsIncluded)
  const MAX_WHATS_INCLUDED = 8

  // FAQ state (3 defaults + unlimited custom)
  const [faqs, setFaqs] = useState<FAQItem[]>(initial.faqs)
  /* Named details a website section prints as `fields.<name>` (lib/products/custom-fields.ts). */
  const [customFields, setCustomFields] = useState<CustomField[]>(initial.customFields)
  /* What a buyer is asked when buying a product that ships (lib/products/personalization.ts). */
  const [personalization, setPersonalization] = useState<PersonalizationField[]>(initial.personalization)
  /* The FAQ card is folded to one line until it is opened or a question is added. */
  const [faqOpen, setFaqOpen] = useState(false)

  /* Digital files or lessons, from the card's quiet switch: the kind's own default lines come with it, while nobody has changed them (./editor-form swapDefaults). */
  const switchKind = (kind: "digital" | "course") => {
    const next = swapDefaults(kind, whatsIncluded, faqs)
    setProductType(kind)
    setWhatsIncluded(next.whatsIncluded)
    setFaqs(next.faqs)
  }

  // Category state
  const [selectedCategory, setSelectedCategory] = useState<string | null>(initial.selectedCategory)

  // Toast notification state for validation errors (with dismissing animation state)
  const [toast, setToast] = useState<{ message: string; visible: boolean; dismissing: boolean }>({ message: "", visible: false, dismissing: false })
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  /*
    LIMIT SALES FOR A DOWNLOAD: the most copies that can ever be sold
    (lib/products/sales-limit.ts, SQL part 150), saved on the product in a
    request of its own, held at every checkout (lib/checkout/sales-limit.ts).
    Copies sold come from the paid orders, read on the server as the page
    opened; a refund in full gives its copy back.
  */
  const [limitSalesEnabled, setLimitSalesEnabled] = useState(initial.limitSalesEnabled)
  const [salesLimit, setSalesLimit] = useState(initial.salesLimit)
  const copiesSoldCount = loaded?.sales?.sold ?? null
  /* The limit as saved, so a save only writes it when it changed, and a database without the column is never asked to write "none". */
  const savedSalesLimit = useRef<number | null>(loaded?.sales?.limit ?? null)
  /*
    LIMIT SALES FOR A THING THAT SHIPS: the most one order may take, saved
    with its physical details (lib/physical/order-limit.ts). Stock already
    stops sales at zero, so a total cap would say the same thing twice. Not
    in the form: the saved value arrives with the stock, after the form
    opened, so it is a card of its own (reportCard), saved when it loads.
  */
  const [orderLimit, setOrderLimitState] = useState<OrderLimitDraft>({ on: false, count: "" })
  const orderLimitValue = (l: OrderLimitDraft) => (l.on ? { on: true, count: num(l.count) } : { on: false })
  const setOrderLimit = useCallback((next: OrderLimitDraft) => {
    setOrderLimitState(next)
    reportCard("orderLimit", orderLimitValue(next), false)
  }, [reportCard])
  const orderLimitLoaded = useCallback((loaded: OrderLimitDraft) => {
    setOrderLimitState(loaded)
    reportCard("orderLimit", orderLimitValue(loaded), true)
  }, [reportCard])

  // Stable handler for toggling variant assigned files - defined at component level to avoid closure issues
  const handleToggleVariantFile = useCallback((variantId: string, fileId: string) => {
    if (!variantId || !fileId) return

    setVariants(currentVariants => {
      if (!currentVariants || !Array.isArray(currentVariants)) return currentVariants || []

      return currentVariants.map(v => {
        if (!v || v.id !== variantId) return v

        const currentFiles = Array.isArray(v.assignedFiles) ? v.assignedFiles : []
        const fileExists = currentFiles.includes(fileId)

        return {
          ...v,
          assignedFiles: fileExists
            ? currentFiles.filter(f => f !== fileId)
            : [...currentFiles, fileId]
        }
      })
    })
  }, [])

  // Show toast notification with animated dismiss
  const dismissToast = useCallback(() => {
    setToast(prev => ({ ...prev, dismissing: true }))
    setTimeout(() => {
      setToast({ message: "", visible: false, dismissing: false })
    }, 250)
  }, [])

  const showToast = useCallback((message: string) => {
    // Clear any existing timeout
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current)
    }

    setToast({ message, visible: true, dismissing: false })

    // Hide toast after 5 seconds with animated dismiss
    toastTimeoutRef.current = setTimeout(() => {
      dismissToast()
    }, 5000)
  }, [dismissToast])

  /*
    THE SUGGESTED CATEGORY (./category-suggestion.ts): the keywords once
    typing pauses, then Claude's choice from the list once the title, the
    description and the pictures settle. While the creator has not chosen or
    cleared a category, the suggestion is also the value, marked Suggested in
    the field; the first choice or clear of their own ends that for the visit.
  */
  /* Things that ship are filed under their own list (Apparel, Home & Garden...), downloads under theirs. */
  const categoryKind = productType === "physical" ? "physical" : "digital"
  const suggestedCategory = useCategorySuggestion(title, description, mediaItems, categoryKind)
  /* Switched between a download and a thing that ships: a category from the other list doesn't fit, so the suggestion takes over again.
     Only on a switch, never as the editor opens: a saved category the lists no longer have (an older name such as
     "Photography") was cleared on the first frame, and the product opened reading as edited, so leaving it untouched
     asked "Discard changes?" (round 41). */
  const kindShown = useRef(categoryKind)
  useEffect(() => {
    if (kindShown.current === categoryKind) return
    kindShown.current = categoryKind
    setSelectedCategory((c) => {
      if (!c || isCategoryFor(c, categoryKind)) return c
      categoryTouched.current = false
      return null
    })
  }, [categoryKind])
  const categoryTouched = useRef(!!initial.selectedCategory)
  useEffect(() => {
    if (suggestedCategory && !categoryTouched.current) setSelectedCategory(suggestedCategory)
  }, [suggestedCategory])
  const chooseCategory = useCallback((category: string) => {
    categoryTouched.current = true
    setSelectedCategory(category)
  }, [])
  const clearCategory = useCallback(() => {
    categoryTouched.current = true
    setSelectedCategory(null)
  }, [])


  /*
    UNSAVED CHANGES, ONE ANSWER (./editor-form.ts changedFields, lib/forms/dirty.ts):
    every field of the form against the saved form, and every card's draft
    against what it loaded or last saved. Change something back and it is no
    longer a change. The names of what differs are on the page
    (data-unsaved-fields) for scripts/check-product-save-r12.mjs.
  */
  /* A suggestion nobody has chosen is not a change of theirs (round 41): a saved product with no category opened with
     one filled in and asked "Discard changes?" on the way out. It is still the value a save sends. */
  const categoryAsChanged = categoryTouched.current ? selectedCategory : savedForm.selectedCategory
  const currentForm: DirtyFields = {
    title, description, price, compareAtPrice, slug, productType, showSalesBadge, refundPolicyEnabled, refundPolicyType,
    seoTitle, seoDescription, callToAction, selectedCategory: categoryAsChanged, payWhatYouWant, pwywMinPrice, pwywSuggestedPrice,
    mediaItems, digitalFiles, variants, whatsIncluded, faqs, customFields, personalization, limitSalesEnabled, salesLimit,
  }
  const { formChanges, formKey } = useMemo(
    () => ({ formChanges: changedFields(currentForm, savedForm), formKey: snapshotOf(currentForm) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [title, description, price, compareAtPrice, slug, productType, showSalesBadge, refundPolicyEnabled, refundPolicyType, seoTitle, seoDescription, callToAction, categoryAsChanged, payWhatYouWant, pwywMinPrice, pwywSuggestedPrice, mediaItems, digitalFiles, variants, whatsIncluded, faqs, customFields, personalization, limitSalesEnabled, salesLimit, savedForm],
  )
  const unsavedFields = [...formChanges, ...changedCards(cards)]
  const isDirty = unsavedFields.length > 0
  /*
    LET GO OF, NOT FORGOTTEN. "Discard" (Cancel, the nav pill, the way to
    Settings) and a delete say there is nothing to keep on the way out; the
    changes are still the changes, so the next edit asks again.
  */
  const changeKey = `${formKey}|${JSON.stringify(cards)}`
  const changeKeyRef = useRef(changeKey)
  changeKeyRef.current = changeKey
  const [releasedAt, setReleasedAt] = useState<string | null>(null)
  const releaseUnsaved = useCallback(() => setReleasedAt(changeKeyRef.current), [])
  const hasUnsavedChanges = isDirty && releasedAt !== changeKey
  /* Told to the page around it, which mounts the editor again on converted prices only when nothing would be lost (ProductEditorAcrossCurrency). */
  useEffect(() => onDirty?.(hasUnsavedChanges), [hasUnsavedChanges, onDirty])
  /* A file is uploaded, or deleted, when it is added or removed: the saved form has it, or no longer has it, at once (only a rename waits for Save). */
  useEffect(() => {
    setSavedForm((s) => {
      const had = new Map(s.digitalFiles.map((f) => [f.file_path, f]))
      const next = digitalFiles.map((f) => had.get(f.file_path) ?? f)
      if (next.length === s.digitalFiles.length && next.every((f, i) => f === s.digitalFiles[i])) return s
      return { ...s, digitalFiles: next }
    })
  }, [digitalFiles])
  /** After a save: what was sent is what is saved, the form and every card. Changes made while it saved stay changes. */
  const markSaved = useCallback((sent: DirtyFields, sentCards: CardDrafts, savedSlug?: string) => {
    setSavedForm({ ...sent, slug: savedSlug ?? sent.slug, digitalFiles: savedFormRef.current.digitalFiles.map((f) => sent.digitalFiles.find((x) => x.file_path === f.file_path) ?? f) })
    setCards((c) => cardsSaved(c, sentCards))
    setReleasedAt(null)
  }, [])

  // Handle browser back/refresh with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault()
        e.returnValue = ""
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [hasUnsavedChanges])

  // Update document title based on edit mode
  useEffect(() => {
    const pageTitle = editProductId ? tt("Edit Product | Storelib") : tt("Add Product | Storelib")
    document.title = pageTitle

    // Cleanup: restore default title on unmount
    return () => {
      document.title = "Storelib"
    }
  }, [editProductId])

  /*
    OPENS AT THE TOP, AND AT ONCE. This used to hold the form back for 300ms
    behind a skeleton of its own while it re-scrolled six times; the form is
    drawn from the first frame now, so one reset before paint is the whole of
    it, and the carried "Product is live" goes away on its own.
  */
  useLayoutEffect(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    if (contentRef.current) contentRef.current.scrollTop = 0
    if (!carriedNotice) return
    carriedNotice = null
    const t = setTimeout(() => setShowNotification(false), 3000)
    return () => clearTimeout(t)
  }, [])

  /* A card a failed check points at, brought to the top of the pane under any bar. */
  const scrollToSection = (sectionId: SectionId) => {
    const element = sectionRefs.current[sectionId]
    if (element && contentRef.current) {
      const containerRect = contentRef.current.getBoundingClientRect()
      const elementRect = element.getBoundingClientRect()
      const bar = barRef.current?.offsetHeight ?? 0
      const scrollTop = contentRef.current.scrollTop + (elementRect.top - containerRect.top) - bar - 16

      contentRef.current.scrollTo({
        top: Math.max(0, scrollTop),
        behavior: "smooth"
      })
    }
  }

  /*
    The address and the SEO title follow the title. Back at the saved title,
    they are the saved ones again: a title changed and changed back is no
    change, and a product opens with the address it has.
  */
  useEffect(() => {
    if (!title) return
    const saved = savedFormRef.current
    if (title === saved.title) {
      setSlug(saved.slug)
      setSeoTitle(saved.seoTitle)
      return
    }
    const generatedSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
    setSlug(generatedSlug)
    // Auto-generate SEO title
    setSeoTitle(title)
  }, [title])

  // Auto-generate SEO description from product description in REAL-TIME
  // Only updates if user hasn't manually edited the SEO description field directly
  useEffect(() => {
    // Skip if user has manually edited the SEO description field
    if (seoManuallyEditedRef.current) return
    /* The saved description has the saved SEO description, so a product opens as it was saved. */
    if (description === savedFormRef.current.description) {
      setSeoDescription(savedFormRef.current.seoDescription)
      return
    }

    if (!description) {
      setSeoDescription("")
      return
    }

    /* Its text, at most 155 characters (./editor-form seoDescriptionFrom), the same rule that tells a written one from this one when it opens again. */
    setSeoDescription(seoDescriptionFrom(description))
  }, [description])

  // Reset the manually edited flag when creating a new product (no edit param)
  useEffect(() => {
    if (!editProductId) {
      seoManuallyEditedRef.current = false
    }
  }, [editProductId])

  // Create or update product
  const saveProduct = useCallback(async (publish = false) => {
    if (!creatorId) return null
    setIsSaving(true)
    setError(null)
    /*
      PRICES TYPED IN ANOTHER CURRENCY ARE NEVER WRITTEN BACK. The store's
      currency is asked first: converted since this editor loaded (here or
      in another tab), the save is refused rather than putting the old
      numbers over the converted ones. A read that fails refuses nothing.
    */
    const now = await fetch("/api/store/currency?only=currency", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? (r.json() as Promise<{ currency?: string }>) : null))
      .catch(() => null)
    if (currencyChangedSince(loadedCurrency, now?.currency ?? null)) {
      setError(tt("Your store currency changed. Reload to see the converted prices."))
      setIsSaving(false)
      return null
    }

    const supabase = createClient()
    /* Said once the save is done, when the sales limit could not be kept. */
    let salesLimitNote: string | null = null

    try {
      /** One suffix scheme, used by both checks below. */
      const suffix = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`
      /* A draft saved before it has a title (on the way to Settings) still needs an address of its own; the title gives it a real one later. */
      let finalSlug = slug || `draft-${suffix()}`
      // Check for duplicate slug for THIS creator (unique constraint is per-creator)
      // Runs for both create AND update — excludes current product when updating
      {
        let query = supabase
          .from("products")
          .select("id")
          .eq("slug", finalSlug)
          .eq("creator_id", creatorId)

        // When updating, exclude the current product from the duplicate check
        if (productId) {
          query = query.neq("id", productId)
        }

        const { data: existing } = await query.maybeSingle()

        if (existing) {
          // Add timestamp + random suffix to ensure uniqueness
          finalSlug = `${finalSlug}-${suffix()}`
        }
      }

      /*
        AND NOT A NAME A ROUTE ALREADY ANSWERS TO. A product sits at
        /{handle}/{slug}, and the OnePage sits at /{handle}/links — a static
        segment, which Next matches ahead of the dynamic one. A product
        slugged `links` would open the creator's OnePage instead of itself,
        with nothing anywhere saying why. It gets the same suffix a duplicate
        gets, so it keeps an address that works.
      */
      finalSlug = avoidReservedProductSlug(finalSlug, suffix)

      // Get photo URLs from media items (images and YouTube)
      /* Photos and video files, in the order the creator put them: a video is told apart by its extension wherever the list is read (lib/media/video.ts). */
      const photoUrls = mediaItems.filter(m => m.type === "image" || m.type === "video").map(m => m.url)
      const youtubeItems = mediaItems.filter(m => m.type === "youtube")

      // Determine thumbnail based on FIRST media item position
      // If YouTube is positioned 1st, use YouTube thumbnail as cover
      // If image is positioned 1st, use that image as cover
      const firstMedia = mediaItems[0]
      let determinedThumbnailUrl: string | null = null
      if (firstMedia?.type === "youtube") {
        determinedThumbnailUrl = getYouTubeThumbnailUrl(firstMedia.url)
      } else if (firstMedia?.type === "image") {
        determinedThumbnailUrl = firstMedia.url
      } else if (firstMedia?.type === "video") {
        /* A video first: its stored first frame, or the first photo when it has none, so a card always has a picture. */
        determinedThumbnailUrl = videoPosterUrl(firstMedia.url) ?? mediaItems.find(m => m.type === "image")?.url ?? null
      }

      // Filter out empty items from whatsIncluded
      const filteredWhatsIncluded = productType === "physical" ? [] : whatsIncluded.filter(item => item.trim() !== "")

      // Format FAQs for database storage (only include non-empty ones)
      const formattedFaqs = faqs
        .filter(faq => faq.question.trim() !== "" && faq.answer.trim() !== "")
        .map(faq => ({ question: faq.question, answer: faq.answer }))

      // Log what we're saving for debugging
      console.log("Saving product data:", {
        productId,
        isUpdate: !!productId,
        title,
        descriptionLength: description?.length || 0,
        variantsCount: variants.length,
        faqsCount: faqs.filter(f => f.question.trim() && f.answer.trim()).length,
        whatsIncludedCount: whatsIncluded.filter(i => i.trim()).length,
        category: selectedCategory,
      })

      // The description's HTML through the allow list on the server (lib/rich-text/sanitize.ts)
      const savedDescription = await descriptionForSave(description, storedDescriptionRef.current)

      const productData = {
        creator_id: creatorId,
        type: productType,
        title,
        slug: finalSlug,
        description: savedDescription,
        status: publish ? "published" : "draft",
        /* Free is 0; pay what you want is listed at its minimum; a fixed price is the price. */
        price_cents: priceMode === "free" ? 0 : priceMode === "pwyw" ? Math.round(Number.parseFloat(pwywMinPrice || "0") * 100) : Math.round(Number.parseFloat(price || "0") * 100),
        /* A struck-through price only where it is a real discount on a fixed price: never on free or pay what you want, never at or under the price. */
        compare_at_cents: (() => {
          if (priceMode !== "fixed" || !compareAtPrice) return null
          const compare = Math.round(Number.parseFloat(compareAtPrice) * 100)
          const now = Math.round(Number.parseFloat(price || "0") * 100)
          return Number.isFinite(compare) && compare > now ? compare : null
        })(),
        // Thumbnail uses the FIRST media item - respects drag-and-drop ordering
        // If YouTube is 1st, uses YouTube thumbnail. If image is 1st, uses that image.
        thumbnail_url: determinedThumbnailUrl,
        gallery_urls: photoUrls.length > 0 ? photoUrls : null,
        video_url: youtubeItems[0]?.url || null,
        /* A thing that ships has none of these three in the editor (its Settings card): its button says Buy now, and its returns are the store's. */
        show_sales_badge: productType === "physical" ? false : showSalesBadge,
        refund_policy_enabled: productType === "physical" ? false : refundPolicyEnabled,
        refund_policy_type: productType !== "physical" && refundPolicyEnabled ? refundPolicyType : null,
        seo_title: seoTitle || null,
        seo_description: seoDescription || null,
        call_to_action: productType === "physical" ? null : callToAction || null,
        whats_included: filteredWhatsIncluded.length > 0 ? filteredWhatsIncluded : null,
        faqs: formattedFaqs.length > 0 ? formattedFaqs : null,
        category: selectedCategory || null,
        // Pay What You Want fields (product-level)
        pay_what_you_want: payWhatYouWant,
        pwyw_min_price_cents: payWhatYouWant && pwywMinPrice ? Math.round(Number.parseFloat(pwywMinPrice) * 100) : null,
        pwyw_suggested_price_cents: payWhatYouWant && pwywSuggestedPrice ? Math.round(Number.parseFloat(pwywSuggestedPrice) * 100) : null,
      }
      /* What the list will draw for it once this lands (syncListCopy). */
      sentRowRef.current = { title: productData.title, cents: productData.price_cents, thumb: productData.thumbnail_url ?? null, type: productData.type }

      let finalProductId = productId

      if (productId) {
        // Update existing product - use .select() to verify the update worked
        const { data: updatedProduct, error: updateError } = await supabase
          .from("products")
          .update(productData)
          .eq("id", productId)
          .select()
          .single()

        if (updateError) {
          console.error("Error updating product:", updateError)
          throw new Error(`Failed to update product: ${updateError.message}`)
        }

        if (!updatedProduct) {
          throw new Error(tt("Product update failed - no data returned. Check RLS policies."))
        }

        /* The address it was saved at, with any suffix a clash gave it. */
        if (finalSlug !== slug) setSlug(finalSlug)

        // Verify description was saved
        if (savedDescription && updatedProduct.description !== savedDescription) {
          console.warn("Description may not have saved correctly")
        }

        /* Publishing is the way out of the archive. Without this the old
           archived flag stayed set and the Products list kept showing a live
           product as Archived (lib/products/archive.ts). Its own request, only
           for a row that has the flag, so a save never depends on it. */
        if (publish && updatedProduct.archived === true) {
          const { error: unarchiveError } = await supabase.from("products").update({ archived: false }).eq("id", productId)
          if (unarchiveError) console.warn("Could not clear the archived flag:", unarchiveError.message)
        }
      } else {
        /*
          A NEW THING THAT SHIPS SAYS SO ITSELF. The shipping card writes it
          on its own save, but that save is skipped while physical commerce
          is off in /admin, and the column defaulted to false until part
          161: such a product sold with no address at checkout.
        */
        const { data: product, error: createError } = await supabase
          .from("products")
          .insert(productType === "physical" ? { ...productData, requires_shipping: true } : productData)
          .select()
          .single()

        if (createError) {
          console.error("Error creating product:", createError)
          throw new Error(`Failed to create product: ${createError.message}`)
        }

        if (!product) {
          throw new Error(tt("Product creation failed - no data returned"))
        }

        setProductId(product.id)
        finalProductId = product.id
        // Update slug state to match what was actually saved (in case of duplicate handling)
        if (product.slug && product.slug !== slug) {
          setSlug(product.slug)
        }
      }

      /* The variants, in a few round trips rather than four per variant (./variant-save.ts). */
      /* A physical product's variants are its options' combinations, saved by its own card on the server. */
      if (finalProductId && productType === "physical") {
        const problem = physicalRef.current ? await physicalRef.current.save(finalProductId) : null
        if (problem) throw new Error(problem)
      } else if (finalProductId) {
        const savedIds = await saveVariants(supabase, finalProductId, variants, { keepUnlisted: variantsUnread.current })
        /* Each takes its saved id by the id it had, not by its place, in case the list moved while this ran. */
        if (savedIds.size > 0) {
          setVariants(current => current.map(v => (savedIds.has(v.id) ? { ...v, id: savedIds.get(v.id)! } : v)))
        }
      }

      /*
        CUSTOM FIELDS, in a request of their own: a database that has not run
        part 107 has no column for them, and the product must still save.
      */
      if (finalProductId) {
        const { error: fieldsError } = await supabase.from("products").update({ custom_fields: storedCustomFields(customFields) }).eq("id", finalProductId)
        if (fieldsError) console.warn("Custom fields were not saved:", fieldsError.message)
      }

      /*
        THE COVER AS UPLOADED (round AK), in a request of its own: a database that has not run part 377 has no
        column, and the product must still save. Only when it changed: a new cover, or the first picture moved.
      */
      const cover = coverOriginalOf(mediaItems)
      if (finalProductId && cover !== savedCover.current) {
        const { error: coverError } = await supabase.from("products").update({ cover_original_url: cover }).eq("id", finalProductId)
        if (!coverError) savedCover.current = cover
        else console.warn("The cover as uploaded was not saved:", coverError.message)
      }

      /*
        PERSONALIZATION, in a request of its own as well: a database that has
        not run part 307 has no column, and the product must still save. Only
        a product that ships asks; one that stops shipping keeps none.
      */
      if (finalProductId && (productType === "physical" || personalization.length > 0)) {
        const { error: personalizationError } = await supabase.from("products").update({ personalization: productType === "physical" ? storedPersonalization(personalization) : [] }).eq("id", finalProductId)
        if (personalizationError) console.warn("Personalization fields were not saved:", personalizationError.message)
      }

      /*
        LIMIT SALES, in a request of its own: a database that has not run
        part 150 has no column, and the product must still save. Only for
        something that does not ship (a thing that ships has its stock and
        its most per order), and only when it changed.
      */
      if (finalProductId && productType !== "physical") {
        const limit = limitSalesEnabled ? readSalesLimit(salesLimit) : null
        if (limit !== savedSalesLimit.current) {
          const { error: limitError } = await supabase.from("products").update({ sales_limit: limit }).eq("id", finalProductId)
          if (!limitError) savedSalesLimit.current = limit
          else {
            console.warn("Sales limit was not saved:", limitError.message)
            salesLimitNote = missingSalesLimit(limitError)
              ? "Everything else is saved. Limit sales needs its database update: run SQL part 150 in Supabase."
              : "Everything else is saved. The sales limit could not be saved; try again."
          }
        }
      }

      /* SALES CHANNELS, after the product exists, so a new product's choice is kept too. Never fails the save. */
      if (finalProductId) {
        const channelsError = await channelsRef.current?.save(finalProductId)
        if (channelsError) throw new Error(channelsError)
        const collectionsError = await collectionsRef.current?.save(finalProductId)
        if (collectionsError) console.warn("Collections were not saved:", collectionsError)
      }

      /*
        FILE NAMES, renamed in the list: the row's name is what the buyer's
        download is called. A file is uploaded and deleted at once; a rename
        waits for Save like every other field.
      */
      if (finalProductId) {
        const savedNames = new Map(savedFormRef.current.digitalFiles.map((f) => [f.file_path, f.file_name.trim()]))
        const renamed = digitalFiles.filter((f) => f.id && savedNames.has(f.file_path) && savedNames.get(f.file_path) !== f.file_name.trim())
        const failed = (
          await Promise.all(
            renamed.map((f) =>
              fetch(`/api/storage/upload-file?assetId=${encodeURIComponent(f.id!)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ name: f.file_name.trim() }) }).then(
                (r) => r.ok,
                () => false,
              ),
            ),
          )
        ).filter((ok) => !ok).length
        if (failed) throw new Error(tt("A file name was not saved. Try again."))
      }

      if (salesLimitNote) showToast(salesLimitNote)

      // Auto-generate ZIP bundle when product has 6+ digital files
      if (digitalFiles.length >= 6) {
        fetch("/api/v2/upload/bundle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId: finalProductId }),
        }).catch(() => { /* Non-critical: bundle can be regenerated on next save */ })
      }

      /* Saved: search engines that take IndexNow hear about it now. */
      if (finalProductId) announceChange({ product: finalProductId })

      storedDescriptionRef.current = savedDescription
      return { productId: finalProductId, slug: finalSlug }
    } catch (err: any) {
      console.error("Error saving product:", err)
      // Check for common database errors and provide helpful messages
      const errorMessage = err.message || tt("Unknown error")

      // Column doesn't exist error (PostgreSQL error code 42703)
      if (errorMessage.includes("column") && (errorMessage.includes("does not exist") || errorMessage.includes("undefined"))) {
        setError(tt("Database schema is outdated. Please run the SQL migration (scripts/049_add_missing_product_columns.sql) in your Supabase SQL Editor."))
      }
      // Table doesn't exist
      else if (errorMessage.includes("relation") && errorMessage.includes("does not exist")) {
        setError(tt("Required database table is missing. Please run the SQL migration (scripts/049_add_missing_product_columns.sql) in your Supabase SQL Editor."))
      }
      // RLS policy error
      else if (errorMessage.includes("row-level security") || errorMessage.includes("RLS")) {
        setError(tt("Permission denied. Please check your database RLS policies."))
      }
      // Generic error
      else {
        setError(errorMessage)
      }
      return null
    } finally {
      setIsSaving(false)
    }
  }, [creatorId, productId, slug, productType, title, description, price, compareAtPrice, mediaItems, showSalesBadge, refundPolicyEnabled, refundPolicyType, seoTitle, seoDescription, callToAction, variants, whatsIncluded, faqs, selectedCategory, payWhatYouWant, pwywMinPrice, pwywSuggestedPrice, digitalFiles, limitSalesEnabled, salesLimit, showToast, loadedCurrency])

  // Process image to fit 1280x720 canvas (for non-widescreen images)
  const processImageToWidescreen = async (file: File): Promise<{ processedFile: File; wasProcessed: boolean; originalRatio: string }> => {
    return new Promise((resolve, reject) => {
      const img = new window.Image()
      const reader = new FileReader()

      reader.onload = (e) => {
        img.src = e.target?.result as string
      }

      img.onload = () => {
        const targetWidth = 1280
        const targetHeight = 720
        const targetRatio = targetWidth / targetHeight // ~1.78 (16:9)
        const imageRatio = img.width / img.height

        // Determine original ratio description
        let originalRatio = "landscape"
        if (imageRatio < 0.95) {
          originalRatio = "portrait"
        } else if (imageRatio >= 0.95 && imageRatio <= 1.05) {
          originalRatio = "square"
        }

        // Check if image is already close to widescreen ratio (within 10% tolerance)
        const isWidescreen = imageRatio >= 1.5 && imageRatio <= 2.0

        if (isWidescreen) {
          // Image is already widescreen, no processing needed
          resolve({ processedFile: file, wasProcessed: false, originalRatio })
          return
        }

        // Create canvas with target dimensions
        const canvas = document.createElement("canvas")
        canvas.width = targetWidth
        canvas.height = targetHeight
        const ctx = canvas.getContext("2d")

        if (!ctx) {
          reject(new Error(tt("Could not get canvas context")))
          return
        }

        /*
          A picture with see-through parts (a product cut out as a PNG or WebP, shown on a dark or animated
          background) keeps them: its copy is padded with nothing and saved as WebP, never flattened onto
          grey in a JPEG (lib/images/transparency.ts).
        */
        const clear = mayBeTransparent(file.type) && hasTransparency(img)
        if (!clear) {
          // Fill with light gray gradient background (smooth white to very light gray)
          const gradient = ctx.createLinearGradient(0, 0, targetWidth, targetHeight)
          gradient.addColorStop(0, "#f8f8f8")
          gradient.addColorStop(0.5, "#f0f0f0")
          gradient.addColorStop(1, "#e8e8e8")
          ctx.fillStyle = gradient
          ctx.fillRect(0, 0, targetWidth, targetHeight)
        }

        // Calculate dimensions to fit image within the canvas while maintaining aspect ratio
        let drawWidth: number
        let drawHeight: number

        if (imageRatio > targetRatio) {
          // Image is wider than target - fit by width
          drawWidth = targetWidth
          drawHeight = targetWidth / imageRatio
        } else {
          // Image is taller than target - fit by height
          drawHeight = targetHeight
          drawWidth = targetHeight * imageRatio
        }

        // Center the image
        const x = (targetWidth - drawWidth) / 2
        const y = (targetHeight - drawHeight) / 2

        // Draw the image centered on the canvas
        ctx.drawImage(img, x, y, drawWidth, drawHeight)

        // Convert canvas to blob
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error(tt("Failed to create blob")))
              return
            }

            /* What the browser made: a browser without a WebP encoder answers PNG, which keeps the see-through parts too. */
            const type = blob.type || (clear ? "image/png" : "image/jpeg")
            const processedFile = new File(
              [blob],
              /* Not "_processed": that name is a grey padded JPEG, which lib/images/cover-trim.ts holds unseen until it cuts the grey off. */
              file.name.replace(/\.[^/.]+$/, "") + (type === "image/jpeg" ? "_processed.jpg" : type === "image/webp" ? "_wide.webp" : "_wide.png"),
              { type }
            )

            resolve({ processedFile, wasProcessed: true, originalRatio })
          },
          clear ? "image/webp" : "image/jpeg",
          clear ? 0.9 : 0.92
        )
      }

      img.onerror = () => reject(new Error(tt("Failed to load image")))
      reader.onerror = () => reject(new Error(tt("Failed to read file")))
      reader.readAsDataURL(file)
    })
  }

  // Upload file with XMLHttpRequest for real progress tracking
  const uploadWithProgress = async (
    file: File,
    filePath: string,
    onProgress: (percent: number) => void
  ): Promise<{ error: Error | null }> => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      return { error: new Error(tt("Not authenticated")) }
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const uploadUrl = `${supabaseUrl}/storage/v1/object/product-images/${filePath}`

    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest()

      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100)
          onProgress(percent)
        }
      })

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ error: null })
        } else {
          /* A team member writing into the store's folder (round 41): storage answers only for the account's own, so the server signs this one path when their permissions allow it. */
          void teamSignedUpload("product-images", filePath, file, file.type, (p) => onProgress(Math.round(p * 100))).then((ok) =>
            resolve(ok ? { error: null } : { error: new Error(`Upload failed: ${xhr.statusText}`) }),
          )
        }
      })

      xhr.addEventListener("error", () => {
        resolve({ error: new Error(tt("Upload failed")) })
      })

      xhr.open("POST", uploadUrl)
      xhr.setRequestHeader("Authorization", `Bearer ${session.access_token}`)
      xhr.setRequestHeader("x-upsert", "false")
      xhr.setRequestHeader("cache-control", "3600")
      xhr.send(file)
    })
  }

  // Handle media upload (images only). Each photo shows in the grid at once as
  // its own preview, comes into focus as it uploads, and becomes a real tile
  // only once the uploaded copy is decoded, so nothing flashes when it lands.
  const handleMediaUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    setError(null)
    const supabase = createClient()

    const filesToUpload: File[] = []
    const videos: File[] = []
    for (const file of Array.from(files)) {
      if (isVideoFile(file)) {
        const refused = videoRefusal(file)
        if (refused) setError(refused)
        else if (mediaItems.filter(m => m.type === "video").length + videos.length >= MAX_VIDEO_FILES) setError(tt("Maximum {maxVideoFiles} videos allowed", { maxVideoFiles: MAX_VIDEO_FILES }))
        else videos.push(file)
        continue
      }
      if (!file.type.startsWith("image/")) {
        setError(tt("Only photos and MP4, WebM or MOV videos."))
        continue
      }
      const existingImages = mediaItems.filter(m => m.type === "image").length + pendingMedia.length
      if (existingImages + filesToUpload.length >= MAX_PHOTOS) {
        setError(tt("Maximum {maxPhotos} photos allowed", { maxPhotos: MAX_PHOTOS }))
        continue
      }
      filesToUpload.push(file)
    }
    if (videos.length) void uploadMediaVideos(videos)
    if (filesToUpload.length === 0) return

    const queued = filesToUpload.map((file) => ({
      file,
      pending: { id: `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`, preview: URL.createObjectURL(file), progress: 0 } as PendingMedia,
    }))
    setPendingMedia(prev => [...prev, ...queued.map(q => q.pending)])

    const setProgress = (id: string, progress: number) =>
      setPendingMedia(prev => prev.map(p => (p.id === id ? { ...p, progress } : p)))
    const drop = (id: string, preview: string) => {
      setPendingMedia(prev => prev.filter(p => p.id !== id))
      URL.revokeObjectURL(preview)
    }
    /* Wait for the uploaded copy to be ready to paint, but never longer than 4s. */
    const warm = (url: string) =>
      new Promise<void>((resolve) => {
        const img = new window.Image()
        const done = () => resolve()
        const timer = setTimeout(done, 4000)
        img.onload = () => { clearTimeout(timer); (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(done) }
        img.onerror = () => { clearTimeout(timer); done() }
        img.src = url
      })

    for (const { file, pending } of queued) {
      const timestamp = Date.now()
      let fileToUpload = file
      let padded = false
      try {
        /* A physical product's photos go up as they were taken (the shop shows them whole); a download's or course's cover is widescreen. */
        if (productType !== "physical") {
          const processed = await processImageToWidescreen(file)
          fileToUpload = processed.processedFile
          padded = processed.wasProcessed
        }
      } catch (err) {
        console.error("Image processing error:", err)
      }

      const safeName = fileToUpload.name.replace(/[^a-zA-Z0-9.-]/g, "_")
      const filePath = `${creatorId}/${productId || "temp"}/${timestamp}_${safeName}`

      const { error: uploadError } = await uploadWithProgress(fileToUpload, filePath, (percent) =>
        setProgress(pending.id, Math.min(percent, 96)),
      )
      if (uploadError) {
        console.error("Upload error:", uploadError)
        setError(tt("Failed to upload {name}: {message}", { name: file.name, message: uploadError.message }))
        drop(pending.id, pending.preview)
        continue
      }

      const { data: { publicUrl } } = supabase.storage.from("product-images").getPublicUrl(filePath)
      /*
        ROUND AK: THE PICTURE ITSELF, KEPT. The padded copy above is for the shop's 16:9 cards; the file as it was
        chosen goes up beside it, for the OnePage, the product page and the checkout (products.cover_original_url).
        A failed upload of it only costs that: those places then cut the padding off the copy instead.
      */
      let original: string | undefined
      if (padded) {
        const originalPath = `${creatorId}/${productId || "temp"}/${timestamp}_original_${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`
        const { error: originalError } = await uploadWithProgress(file, originalPath, () => {})
        if (!originalError) original = supabase.storage.from("product-images").getPublicUrl(originalPath).data.publicUrl
        else console.warn("The cover as uploaded was not kept:", originalError.message)
      }
      setProgress(pending.id, 100)
      await warm(publicUrl)
      setMediaItems(prev => [...prev, { id: `${timestamp}-${Math.random().toString(36).slice(2)}`, type: "image", url: publicUrl, ...(original ? { original } : {}) }])
      drop(pending.id, pending.preview)
    }
  }

  /*
    Video files, uploaded with their first frame and length (lib/files/upload-video.ts) into the
    owner's `products` folder, where Choose from your files lists them too. Each is a pending tile
    with its own progress until it is stored, then a video tile in the grid.
  */
  const uploadMediaVideos = async (videos: File[]) => {
    for (const file of videos) {
      const pending: PendingMedia = { id: `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`, preview: "", progress: 0 }
      setPendingMedia(prev => [...prev, pending])
      try {
        /* A team member's video goes into the store owner's folder (round 41), never their own account's. */
        const v = await uploadVideo(file, "products", (p) => setPendingMedia(prev => prev.map(x => (x.id === pending.id ? { ...x, progress: Math.min(96, Math.round(p * 100)) } : x))), loadedCreator.team_owner ?? null)
        setMediaItems(prev => [...prev, { id: `video-${Date.now()}-${Math.random().toString(36).slice(2)}`, type: "video", url: v.url }])
      } catch (err) {
        console.error("Video upload error:", err)
        setError(err instanceof Error && /MP4|MB|empty/.test(err.message) ? err.message : tt("Failed to upload {name}", { name: file.name }))
      } finally {
        setPendingMedia(prev => prev.filter(p => p.id !== pending.id))
      }
    }
  }

  // Handle YouTube video add
  const handleAddYouTube = () => {
    const videoId = parseYouTubeUrl(youtubeInput)
    if (!videoId) {
      setError(tt("Invalid YouTube URL"))
      return
    }

    const existingYouTube = mediaItems.filter(m => m.type === "youtube").length
    if (existingYouTube >= MAX_YOUTUBE_VIDEOS) {
      setError(tt("Maximum {maxYoutubeVideos} YouTube videos allowed", { maxYoutubeVideos: MAX_YOUTUBE_VIDEOS }))
      return
    }

    // YouTube embeds do NOT generate thumbnails - pure embed only
    const newItem: MediaItem = {
      id: `yt-${videoId}-${Date.now()}`,
      type: "youtube",
      url: `https://www.youtube.com/embed/${videoId}`,
    }

    setMediaItems(prev => [...prev, newItem])
    setYoutubeInput("")
    setShowYoutubeInput(false)
    setError(null)
  }

  /* Photos and videos ticked in Your files, in the order ticked, as far as there is room for each. */
  const addFromFiles = (picks: PickMany) => {
    setMediaItems(prev => {
      let photos = MAX_PHOTOS - prev.filter(m => m.type === "image").length - pendingMedia.length
      let clips = MAX_VIDEO_FILES - prev.filter(m => m.type === "video").length
      const fresh = picks.filter(p => !prev.some(m => m.url === p.url)).filter(p => (isVideoUrl(p.url) ? clips-- > 0 : photos-- > 0))
      return [...prev, ...fresh.map((p, i) => ({ id: `files-${Date.now()}-${i}`, type: isVideoUrl(p.url) ? "video" as const : "image" as const, url: p.url }))]
    })
    setError(null)
  }

  // Remove media item
  const removeMedia = (id: string) => {
    setMediaItems(prev => prev.filter(m => m.id !== id))
  }

  /*
    A LESSON NEEDS A PRODUCT TO BELONG TO. The course card asks for the
    product's id before its first change; a new product is saved as a draft
    for it, as the first file upload does just below.
  */
  const productIdRef = useRef(productId)
  productIdRef.current = productId
  const scrollToSectionRef = useRef(scrollToSection)
  scrollToSectionRef.current = scrollToSection
  const saveProductRef = useRef(saveProduct)
  saveProductRef.current = saveProduct
  const titleRef = useRef(title)
  titleRef.current = title
  const ensureProductForCourse = useCallback(async (): Promise<string | null> => {
    if (productIdRef.current) return productIdRef.current
    if (!titleRef.current.trim()) {
      showToast(tt("Add a title first"))
      scrollToSectionRef.current("about")
      return null
    }
    const saved = await saveProductRef.current(false)
    return saved?.productId ?? null
  }, [showToast])

  /* /app/products/new?type=course opens as a course from the server (./page.tsx startAs); the old /app/courses/new lands there. */

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    // Clear previous errors
    setError(null)

    const fileArray = Array.from(files)

    // Validate: max file count, counting the ones still uploading
    const inFlight = fileUploads.inFlight
    if (digitalFiles.length + inFlight.length + fileArray.length > MAX_DIGITAL_FILES) {
      setError(tt("Maximum {maxDigitalFiles} digital files per product. You currently have {value}.", { maxDigitalFiles: MAX_DIGITAL_FILES, value: digitalFiles.length + inFlight.length }))
      return
    }

    /* Each file through the same rule the server applies (lib/security/uploads
       precheckUpload): size, and not a program. One calm sentence when a file
       cannot be added; everything else starts at once, with no question asked. */
    for (const file of fileArray) {
      const verdict = precheckUpload({ fileName: file.name, size: file.size, declaredMime: file.type, context: "product_file" })
      if (!verdict.ok) {
        setError(fileArray.length > 1 ? `${sanitizeDisplayName(file.name)}: ${verdict.userMessage}` : verdict.userMessage)
        return
      }

      // Check for duplicate file names
      const isDuplicate = digitalFiles.some(f => f.file_name === file.name) || inFlight.some(u => u.file.name === file.name)
      if (isDuplicate) {
        setError(tt("A file named \"{name}\" is already here. Rename it or remove the one already added.", { name: file.name }))
        return
      }
    }

    let currentProductId = productId
    if (!currentProductId) {
      // First, we need to save the product to get an ID
      if (!title.trim()) {
        showToast(tt("Add a title first"))
        scrollToSection("about")
        return
      }

      setError(null)

      try {
        const saveResult = await saveProduct(false)
        if (!saveResult) {
          await new Promise(resolve => setTimeout(resolve, 50))
          setError(prev => prev || tt("Failed to create product. Please check your connection and try again."))
          return
        }
        currentProductId = saveResult.productId
      } catch (saveErr) {
        console.error("Error saving product before file upload:", saveErr)
        setError(saveErr instanceof Error ? saveErr.message : tt("Failed to create product. Please try again."))
        return
      }
    }

    /* All at once, each in its own row (./file-uploads). */
    fileUploads.start(fileArray, currentProductId || undefined)
  }

  const handleDeleteFile = async (file: UploadedFile) => {
    if (!file.id) return
    /* This one is not undone by Cancel: the file leaves storage now, not on Save. */
    const sure = await ask({
      title: tt("Delete this file?"),
      body: tt("{file_name} is deleted from storage right away, not when you save.", { file_name: file.file_name }),
      confirm: tt("Delete"),
      cancel: tt("Keep file"),
    })
    if (!sure) return

    try {
      // Use admin API route to bypass RLS
      const response = await fetch(`/api/storage/upload-file?assetId=${file.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error("Delete file error:", errorData)
        setError(tt("Failed to delete \"{file_name}\": {value}", { file_name: file.file_name, value: errorData.error || tt("Delete failed") }))
        return
      }

      setDigitalFiles(prev => prev.filter(f => f.id !== file.id))
    } catch (err) {
      console.error("Delete file request error:", err)
      setError(tt("Failed to delete \"{file_name}\": Network error", { file_name: file.file_name }))
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return tt("0 Bytes")
    const k = 1024
    const sizes = [tt("Bytes"), "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
  }

  /*
    CANCEL, OR BACK. The bar's first button says which (LeaveButton in
    ./editor-buttons): Cancel while something would be lost, Back once the
    product is saved and nothing has changed since. With unsaved changes it
    asks first, as a sheet on a phone: Discard goes, Keep editing stays.
    Saving is the bar's Save, so the question does not offer a third way
    out. Either way the editor drops away over the list, which is already
    drawn underneath, at the scroll it was left at: back in history when the
    list opened this editor, in place of it otherwise (../list-return).
  */
  const leaveMode = productId && !hasUnsavedChanges ? "back" : "cancel"
  /*
    THE PRESS IS ANSWERED ON ITS OWN FRAME. The list comes back from the
    server (the page reads the account and every product), which on a slow
    line took seconds with nothing on the screen saying the press had
    landed. Now the button dims at once and turns into a spinner if the list
    is not here a tenth of a second later (LeaveButton), the app's loading
    bar is told, and a second press does nothing. The editor stays live
    while the list is on its way, so the spinner turns, and the editor drops
    away the moment the list is ready (components/app/page-layer).
  */
  const [leaving, setLeaving] = useState(false)
  /* The lock, at once: `leaving` is drawn as a transition, a frame or more after the press. */
  const leavingRef = useRef(false)
  useEffect(() => {
    if (!leaving) return
    /* Still here after all: shown again from the browser's back cache, or a navigation that never happened. The editor comes back to life. */
    const reset = () => {
      leavingRef.current = false
      setLeaving(false)
    }
    const t = window.setTimeout(reset, 10_000)
    window.addEventListener("pageshow", reset)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener("pageshow", reset)
    }
  }, [leaving])
  /*
    ONE QUESTION, WHICHEVER DOOR IS USED. True when there is nothing to
    lose, or when the question has been answered Discard; false for Keep
    editing. Cancel asks it, and so does the nav pill, which is one tap from
    anywhere in this page and used to walk straight out with the edits
    (lib/ui/leave-guard). `useCallback` so the guard below is registered
    once per answer rather than on every keystroke.
  */
  const askToDiscard = useCallback(async (): Promise<boolean> => {
    if (!hasUnsavedChanges || answeredRef.current) return true
    const leave = await ask(
      productId
        ? { title: tt("Discard changes?"), body: tt("Your edits since the last save will be lost."), confirm: tt("Discard"), cancel: tt("Keep editing") }
        : { title: tt("Discard this product?"), body: tt("It has not been saved yet, so nothing you added will be kept."), confirm: tt("Discard"), cancel: tt("Keep editing") },
    )
    if (leave) releaseUnsaved()
    return leave
  }, [ask, hasUnsavedChanges, productId, releaseUnsaved])

  /*
    THE PILL IS A DOOR TOO. "Sometimes when I'm on the add new product page
    the mobile bottom navigation pill doesn't work" was one bug; a tab that
    DOES work and takes half an hour of typing with it would be the next
    one. So while this editor is on the screen it says it has something to
    lose, and the pill asks it the same question Cancel asks before it goes.
  */
  useEffect(() => askBeforeLeaving(askToDiscard), [askToDiscard])

  /*
    A LINK TO SETTINGS FROM INSIDE THE EDITOR ("set up a location", "your
    shipping rates"). It stays in the app, in the same view, never a new tab
    (which is what a plain link did in the iOS and Android app). Settings
    opens as its sheet over the editor (app/app/@sheet), so nothing reloads,
    and closing it comes back to this product as it was left.

    With edits not saved yet it asks first. "When I click Save and go it
    doesn't let me because it tells me to add a title and a photo": Save and
    go was the bar's Save, which publishes and so needs a title, a photo and
    the rest. Going to Settings is not publishing. A product that is not
    live yet is kept as a draft (saveDraftForLeave), whatever it is missing;
    a live product is saved as the bar saves it, since a draft would take it
    off the shop. Either way there is Leave without saving, and Stay.
  */
  const answeredRef = useRef(false)
  const saveDraftRef = useRef<() => Promise<boolean>>(async () => false)
  const openSettings = useCallback(
    async (href: string) => {
      if (hasUnsavedChanges && !answeredRef.current) {
        const live = !!productId && isPublished
        const a = await choose(
          live
            ? { title: tt("Save your changes first?"), body: tt("This product is live. Save your changes before you go, or leave without them."), confirm: tt("Save and go"), cancel: tt("Stay"), alt: tt("Leave without saving"), tone: "default" }
            : { title: tt("Save a draft first?"), body: tt("It's kept as a draft, so the title and photos can wait. You come back to it here."), confirm: tt("Save draft and go"), cancel: tt("Stay"), alt: tt("Leave without saving"), tone: "default" },
        )
        if (a === false) return
        if (a === true && !(await (live ? handleSaveChangesRef.current() : saveDraftRef.current()))) return
        /* Answered here: the leave guard doesn't ask a second time on the way out. */
        answeredRef.current = true
        releaseUnsaved()
      }
      router.push(href)
    },
    [choose, hasUnsavedChanges, isPublished, productId, router, releaseUnsaved],
  )
  /* Back from Settings to an editor with new changes: the next way out asks again. */
  useEffect(() => {
    if (hasUnsavedChanges) answeredRef.current = false
  }, [hasUnsavedChanges])

  const handleCancel = async () => {
    if (leaving || leavingRef.current) return
    /* Nothing to lose: no await at all, so the press is answered on its own
       frame and the drop is measured as it was (scripts/check-layer-motion.mjs). */
    if (hasUnsavedChanges && !(await askToDiscard())) return
    /* The editor draws its leaving state when it can; the button has already answered (LeaveButton). */
    leavingRef.current = true
    window.setTimeout(() => {
      leavingRef.current = false
    }, 10_000)
    /*
      The leaving state draws the whole editor again, which on a phone landed
      inside the first frames of the drop as one long task (146ms at a
      quarter of the CPU, scripts/check-layer-motion.mjs). The button has
      already answered (LeaveButton), so on a phone that moves it waits for
      the move (page-layer afterLayerMove), queued after the drop has begun.
    */
    const drawLeaving = () => afterLayerMove(() => startTransition(() => setLeaving(true)))
    startNavigationLoading(PRODUCTS_HREF)
    returnToProducts(router, productId)
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(() => window.setTimeout(drawLeaving, 0))
    else drawLeaving()
  }

  /** Saves and publishes. True when it saved. */
  const handleSaveChangesRef = useRef<() => Promise<boolean>>(async () => false)
  const handleSaveChanges = async (): Promise<boolean> => {
    if (isLoading || saveInFlight.current) return false
    // Validation 1: Title is required
    if (!title.trim()) {
      showToast(tt("Add a title"))
      scrollToSection("about")
      return false
    }

    // Validation 2: At least 1 media (photo or video) is required
    if (mediaItems.length === 0) {
      showToast(tt("Add a photo or video"))
      scrollToSection("media")
      return false
    }

    // Validation 3: At least 1 digital file is required, or for a course, one lesson
    if (productType === "course") {
      if (lessonCount === 0) {
        showToast(tt("Add a lesson"))
        scrollToSection("files")
        return false
      }
    } else if (productType === "physical") {
      /* Nothing to download: its options, prices and stock are checked instead. */
      const problem = physicalRef.current?.check() ?? null
      if (problem) {
        showToast(problem)
        document.getElementById("physical-variants")?.scrollIntoView({ behavior: "smooth", block: "start" })
        return false
      }
    } else if (digitalFiles.length === 0) {
      showToast(tt("Upload a file"))
      /* The files' own card: the Content tab used to cover it, and the tabs are gone. */
      scrollToSection("files")
      return false
    }

    // Validation 4: Category is required
    if (!selectedCategory) {
      showToast(tt("Pick a category"))
      scrollToSection("category")
      return false
    }

    /* Custom fields: each value fits its type, and no two share a name (lib/products/custom-fields.ts). */
    const fieldNames = customFields.map((f) => fieldKey(f.key)).filter(Boolean)
    const fieldIssue = customFields.map(fieldProblem).find(Boolean) ?? (new Set(fieldNames).size !== fieldNames.length ? tt("Two custom fields have the same name") : null)
    if (fieldIssue) {
      showToast(fieldIssue)
      document.getElementById("custom-fields")?.scrollIntoView({ behavior: "smooth", block: "center" })
      return false
    }

    /* Personalization: every field named, no two the same, a limit that fits (lib/products/personalization.ts). */
    const personalizationIssue = productType === "physical" ? personalizationProblem(personalization) : null
    if (personalizationIssue) {
      showToast(personalizationIssue)
      document.getElementById("personalization")?.scrollIntoView({ behavior: "smooth", block: "center" })
      return false
    }

    /* Limit sales on with no number: say so rather than saving "no limit" (lib/products/sales-limit.ts). */
    if (productType !== "physical" && limitSalesEnabled && readSalesLimit(salesLimit) === null) {
      showToast(tt("Enter how many copies can be sold"))
      document.getElementById("sales-limit")?.focus()
      return false
    }

    // Validation 5: If variants exist with multiple files, each variant should have a file assigned
    if (variants.length > 0 && digitalFiles.length > 1) {
      const variantWithoutFiles = variants.find(v => !v.assignedFiles || v.assignedFiles.length === 0)
      if (variantWithoutFiles) {
        const variantName = variantWithoutFiles.name?.trim() || tt("Variant {value}", { value: variants.indexOf(variantWithoutFiles) + 1 })
        showToast(tt("Assign a file to {variantName}", { variantName }))
        scrollToSection("variants")
        return false
      }
    }

    /* What this save sends, which is what is saved once it answers. */
    const sentForm = currentForm
    const sentCards = cardsRef.current
    setIsLoading(true)
    saveInFlight.current = true
    setSaveBusy(true)
    // Always publish when saving
    let result: Awaited<ReturnType<typeof saveProduct>> = null
    try {
      result = await saveProduct(true)
    } finally {
      setIsLoading(false)
      saveInFlight.current = false
      setSaveBusy(false)
    }

    if (result) {
      const { productId: savedProductId, slug: savedSlug } = result

      const created = !productId
      /* A new product on sale: its sales are worth a notification (lib/notifications/nudge). */
      if (created) nudgeNotifications("product")
      setIsPublished(true)
      markSaved(sentForm, sentCards, savedSlug)
      syncListCopy(productId, true)
      setSavedTitle(title)
      setSavedThisVisit(true)
      flashSaved()

      // Revalidate the live product page so changes appear immediately
      // Use the actual saved slug in case it was modified due to duplicates
      try {
        await fetch("/api/revalidate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          /* The handle too: the product has two addresses and each holds its
             own cache, so revalidating `/p/<slug>` alone left
             `/<handle>/<slug>` — the one every link uses — stale. */
          body: JSON.stringify({
            slug: savedSlug,
            type: "product",
            handle: creator?.username || creator?.slug || undefined,
            /* The id too: the variants, files and reviews are cached under
               it, and the slug alone does not reach them. */
            productId: savedProductId,
          }),
        })
      } catch (revalidateErr) {
        console.log("Revalidation skipped:", revalidateErr)
      }

      // Ensure the store builder shop page is published so the product
      // appears on the creator's live store, even if they've never opened
      // the store builder editor. Fire-and-forget — non-critical.
      fetch("/api/store-builder/ensure-published", { method: "POST" }).catch(() => {})

      /*
        THE LIST AND THIS PAGE, FRESH. /app pages are kept in the router for
        five minutes (next.config staleTimes), so without this the Products
        list, and this product opened again from it, came back as they were
        before the save. A refresh drops every kept page; the one on screen is
        re-read on the server and its new props are ignored, because the form
        only reads its props once.

        A NEW PRODUCT MOVES TO ITS OWN ADDRESS, where a reload finds it. The
        address changes first and the refresh then reads that page, which
        replaces this one with the same product read back from the database.
        A refresh keeps this page on screen until that is ready, where a
        navigation would have put up the loading outline in between; the
        "Product is live" it earned is carried across.
      */
      const message = typeof window !== "undefined" && window.innerWidth < 640 ? tt("Product is live") : tt("Product is live and saved")
      if (created) {
        carriedNotice = message
        const savedAt = performance.now()
        carriedSavedAt = savedAt
        /* The same product at its own address: where the form was scrolled, and no landing (holdLayerLanding). */
        carriedScrollTop = contentRef.current?.scrollTop ?? 0
        holdLayerLanding()
        /* Only for the page this refresh draws, never a later one. */
        setTimeout(() => {
          if (carriedNotice === message) carriedNotice = null
          if (carriedSavedAt === savedAt) {
            carriedSavedAt = null
            carriedScrollTop = null
          }
        }, 8000)
        window.history.replaceState({}, "", `/app/products/${savedProductId}`)
        router.refresh()
        return true
      }
      router.refresh()

      /* The page stays where it was: the bar that says Saved is always in view, and so is the notice. */
      setNotificationMessage(message)
      setShowNotification(true)
      setTimeout(() => {
        setShowNotification(false)
      }, 3000)
      return true
    }
    return false
  }
  handleSaveChangesRef.current = handleSaveChanges

  /*
    A DRAFT, FOR GOING TO SETTINGS (openSettings). Nothing a published
    product needs is asked for: no title, photo, file or category. What is
    typed is kept as it is, the product stays off the shop, and a new one
    moves to its own address, so Back from Settings, or a reload, finds it.
  */
  const saveDraftForLeave = async (): Promise<boolean> => {
    if (isLoading || saveInFlight.current) return false
    const sentForm = currentForm
    const sentCards = cardsRef.current
    saveInFlight.current = true
    setSaveBusy(true)
    let result: Awaited<ReturnType<typeof saveProduct>> = null
    try {
      result = await saveProduct(false)
    } finally {
      saveInFlight.current = false
      setSaveBusy(false)
    }
    if (!result) {
      showToast(tt("Couldn't save the draft. Try again."))
      return false
    }
    setIsPublished(false)
    markSaved(sentForm, sentCards, result.slug)
    syncListCopy(productId, false)
    setSavedTitle(title)
    setSavedThisVisit(true)
    flashSaved()
    if (!productId && result.productId) {
      /* The list's kept copy is from before it existed: it reads again when it is next shown. */
      rememberCreated(result.productId)
      window.history.replaceState({}, "", `/app/products/${result.productId}`)
    }
    return true
  }
  saveDraftRef.current = saveDraftForLeave

  // Handle publish/unpublish toggle
  const handleTogglePublish = async () => {
    if (!productId || !creatorId) return

    setIsLoading(true)
    const supabase = createClient()

    try {
      const newStatus = isPublished ? "draft" : "published"
      const { error: updateError } = await supabase
        .from("products")
        .update({ status: newStatus })
        .eq("id", productId)

      if (updateError) throw updateError

      announceChange({ product: productId })
      /* The list's row has a new status: its badge is corrected in the list's kept copy (../list-return updateListCopy). */
      updateListCopy({ id: productId, live: newStatus === "published" })
      if (listedRef.current) listedRef.current = { ...listedRef.current, live: newStatus === "published" }
      /* Off the page or back on it: what is cached of it is dropped either way (app/api/products/forget). */
      await forgetProduct(productId, slug)
      setIsPublished(!isPublished)
      setNotificationMessage(isPublished ? tt("Product unpublished") : tt("Product is live"))
      setShowNotification(true)

      setTimeout(() => {
        setShowNotification(false)
      }, 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  /*
    DELETE, FROM THE MORE MENU. Asked first, in the editor's own sheet, in
    words that say what the press will do: a product somebody bought,
    claimed or was given is archived, never deleted, so no buyer loses it.
    Then done on the server (app/api/products/delete, by the session's own
    creator), which answers with what the database did. Deleted, or
    archived: either way it has
    left the store, so the editor goes back to the list, which shows the
    line and no longer shows the product (lib/products/delete-client). Not
    done: the editor stays, with the product as it was, and says why.
  */
  const [deleting, setDeleting] = useState(false)
  const handleDeleteProduct = async () => {
    if (!productId || deleting || leaving || leavingRef.current) return
    /* Which it will be, so the question is true before the press: a product with sales is archived, never deleted. */
    setDeleting(true)
    const kind = await previewProductDelete(productId)
    setDeleting(false)
    const sure = await ask({ ...deleteQuestion(savedTitle, kind), cancel: tt("Cancel") })
    if (!sure) return
    setDeleting(true)
    let gone = false
    try {
      const result = await deleteProduct(productId)
      gone = result.outcome === "deleted"
      if (result.outcome === "deleted") {
        if (isPublished && slug) announceChange({ removedProduct: slug })
        rememberDeleted(productId)
        leaveNotice(tt("Product deleted"))
      } else {
        announceChange({ product: productId })
        rememberStatus(productId, result)
        leaveNotice(result.message)
      }
    } catch (err) {
      setDeleting(false)
      showToast(err instanceof Error && err.message ? err.message : tt("Could not delete the product"))
      return
    }
    /* Nothing left to save: the way out asks nothing. A deleted row leaves the list's kept copy; one archived instead forgets the copy. */
    releaseUnsaved()
    removeFromListCopy(productId, gone)
    leavingRef.current = true
    startTransition(() => setLeaving(true))
    startNavigationLoading(PRODUCTS_HREF)
    returnToProducts(router, null)
  }

  // Handle redirect to live product page
  /* A product that ships is seen where it is bought: the store's website (app/api/app/products/[id]/live). */
  const viewLabel = productType === "physical" ? tt("View on your store") : tt("View on your page")
  const handleRedirectToProduct = () => {
    if (slug && creator) {
      const sellerSubdomain = creator.username || creator.slug || 'store'
      /* Saved and published, so the server knows the address: the store's live
         website for a physical product, else the creator page. A new tab at
         once, so no popup blocker stands in the way. */
      const productUrl = productId
        ? `${isNativeApp() ? getCanonicalSiteUrl() : ""}/api/app/products/${encodeURIComponent(productId)}/live`
        : getProductShareUrl(sellerSubdomain, slug)
      if (isNativeApp()) {
        // In Capacitor, open in external browser (not inside the app)
        openExternal(productUrl)
      } else {
        window.open(productUrl, "_blank")
      }
    }
  }

  const existingImages = mediaItems.filter(m => m.type === "image").length
  const existingYouTube = mediaItems.filter(m => m.type === "youtube").length
  const plainSearchPreviewDescription = stripHtmlToPlainText(seoDescription || description)

  /* Save is there to press when there is something to save and a name to save it under. */
  const canSave = !isLoading && !!title.trim() && isDirty
  const savePhase: SavePhase = saveBusy ? "saving" : savedFlash ? "saved" : "idle"

  /* Cmd or Ctrl and S, from anywhere on the page, instead of the browser's own Save. */
  const saveShortcut = useRef<() => void>(() => {})
  useEffect(() => {
    saveShortcut.current = () => {
      if (canSave) void handleSaveChanges()
    }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key.toLowerCase() !== "s") return
      e.preventDefault()
      saveShortcut.current()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  /*
    WHAT THE PAGE HOLDS AGAINST WHAT IS SAVED, in the desktop foot bar's own
    words. Saving while Save spins; Unsaved changes from the first change to
    the save; Saved after a save in this visit; otherwise what the product is
    on the storefront, Live or Draft. A new product with nothing in it yet has
    nothing saved.
  */
  const saveState = saveBusy
    ? msg("Saving")
    : hasUnsavedChanges
      ? msg("Unsaved changes")
      : !productId
        ? msg("Not saved yet")
        : savedThisVisit
          ? msg("Saved")
          : isPublished
            ? msg("Live")
            : msg("Draft")

  /* Live and paid, with nowhere to take the money yet: the status says so, and where. */
  const sellsForMoney = payWhatYouWant || (Number.parseFloat(price) || 0) > 0
  const liveLine = creator.payments_ready === false && sellsForMoney ? tt("Live. Checkout opens once payments are set up") : productType === "physical" ? tt("Live on your store") : tt("Live on your page")

  /* The more menu: in the top bar below lg, at the end of the page header from lg. */
  const moreMenu = productId ? (
    <ResponsiveActionMenu
      title={savedTitle.trim() || tt("Product")}
      align="end"
      trigger={
        <button type="button" aria-label={deleting ? tt("Deleting") : tt("More actions")} aria-busy={deleting || undefined} disabled={deleting} className={barIconButton}>
          {deleting ? <ActivitySpinner size={18} label={tt("Deleting")} className="text-[#4b5563]" /> : <MoreHorizontal className="h-5 w-5 sm:h-4 sm:w-4" />}
        </button>
      }
      items={[
        ...[
          ...(isPublished && slug ? [{ label: viewLabel, onClick: handleRedirectToProduct }] : []),
          { label: isPublished ? tt("Unpublish") : tt("Publish"), onClick: handleTogglePublish },
        ].map((item, i) => (i === 0 ? { ...item, section: isPublished ? liveLine : "Draft, hidden from your page" } : item)),
        /* Last and apart, as on the Products list's own row menu. */
        { label: tt("Delete"), variant: "destructive" as const, separatorBefore: true, onClick: () => void handleDeleteProduct() },
      ]}
    />
  ) : null

  /* Live or Draft, the Products list's dot in a badge, for the page header and the Status card. */
  const statusBadge = productId ? (
    <StatusBadge tone={isPublished ? "success" : "neutral"}>
      <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", isPublished ? "bg-[#22a06b]" : "bg-[#e0a100]")} />
      {isPublished ? tt("Live") : tt("Draft")}
    </StatusBadge>
  ) : null

  /*
    THE FILES, OR FOR A COURSE ITS LESSONS (./course-editor.tsx). A course is
    its lessons, so its card comes first, right under the title it needs
    (a lesson saves the product as a draft, and a draft needs a name); a
    digital product's files keep their place under the photos.
  */
  const filesCard = (
    <div
      ref={(el) => { sectionRefs.current.files = el }}
      hidden={productType === "physical"}
      className={CARD}
    >
      {productType === "course" ? (
        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className={CARD_TITLE}>{tt("Lessons")}</h2>
                <span className="text-red-500 text-sm">*</span>
              </div>
            </div>
            {lessonCount === 0 ? (
              <button type="button" data-make-digital onClick={() => switchKind("digital")} className="shrink-0 text-[13px] font-medium text-[#6b7280] hover:text-[#1a1a2e]">
                {tt("Sell files instead")}
              </button>
            ) : null}
          </div>
          <div className="mt-4">
            <CourseEditor
              productId={productId}
              ensureProductId={ensureProductForCourse}
              onLessonCount={setLessonCount}
              notify={showToast}
            />
          </div>
        </div>
      ) : (
      <div>
        <div className="flex items-center gap-1.5">
          <h2 className={CARD_TITLE}>{tt("Digital Files")}</h2>
          <span className="text-red-500 text-sm">*</span>
        </div>

        <DigitalFiles
          files={digitalFiles}
          uploads={fileUploads}
          max={MAX_DIGITAL_FILES}
          onPick={(files) => void handleFileUpload(files)}
          onRename={(file, name) => setDigitalFiles(prev => prev.map(f => (f.file_path === file.file_path ? { ...f, file_name: name } : f)))}
          onDelete={(file) => void handleDeleteFile(file)}
          onNotice={showToast}
        />
        {digitalFiles.length === 0 && fileUploads.inFlight.length === 0 ? (
          /* A quiet way across, for a product started as the wrong kind: the question before the editor is where a course is chosen now (./kind-chooser.tsx). */
          <p className="mt-3 text-[13px] text-[#9ca3af]">
            {tt("Video lessons instead of files?")}{" "}
            <button type="button" data-make-course onClick={() => switchKind("course")} className="font-medium text-[#6b7280] underline decoration-[#d1d5db] underline-offset-2 hover:text-[#1a1a2e]">
              {tt("Make it a course")}
            </button>
          </p>
        ) : null}
      </div>
      )}
    </div>
  )

  return (
    /*
      THE PANE THAT SCROLLS. From lg it is a column, so the foot bar can sit at
      the bottom of the pane even when the form is shorter than the window.
    */
    <div ref={contentRef} data-product-editor="" data-unsaved-fields={unsavedFields.join(" ")} className={cn(FIELD_FOCUS, "page-scroll h-full overflow-y-auto overflow-x-hidden bg-[#f8f9fa] max-md:[[data-page-layer]_&]:pb-[calc(32px+env(safe-area-inset-bottom))] lg:flex lg:flex-col")}>
      {/* Success Notification - Modern black toast */}
      {showNotification && (
        <div
          className="fixed top-[calc(68px+env(safe-area-inset-top)+12px)] md:top-[calc(58px+env(safe-area-inset-top)+14px)] left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-3 fade-in duration-300"
        >
          <div className="flex items-center gap-2.5 px-4 py-3 bg-gray-900 rounded-xl shadow-2xl shadow-gray-900/20 backdrop-blur-sm border border-gray-800 whitespace-nowrap max-w-[calc(100vw-2rem)]">
            <CheckCircle className="h-4 w-4 text-white flex-shrink-0" />
            <span className="text-sm font-medium text-white tracking-tight overflow-hidden text-ellipsis">{notificationMessage}</span>
          </div>
        </div>
      )}

      {/* Validation Toast Notification - Black modern style */}
      {toast.visible && (
        <div
          className={`fixed top-[calc(68px+env(safe-area-inset-top)+12px)] md:top-[calc(58px+env(safe-area-inset-top)+14px)] left-1/2 z-[100] ${
            toast.dismissing ? "animate-toast-out" : "animate-toast-in"
          }`}
        >
          <div className="flex items-center gap-2.5 px-4 py-3 bg-black rounded-xl shadow-2xl shadow-black/20 backdrop-blur-sm border border-gray-800 max-w-[calc(100vw-2rem)] whitespace-nowrap">
            <AlertCircle className="h-4 w-4 text-white/80 flex-shrink-0" />
            {/* One short line at every width: the messages are written short (showToast above). */}
            <span className="min-w-0 truncate text-sm font-medium text-white tracking-tight">{toast.message}</span>
            <button
              onClick={dismissToast}
              className="ml-1 p-0.5 hover:bg-white/10 rounded transition-colors flex-shrink-0"
            >
              <X className="h-3.5 w-3.5 text-white/70" />
            </button>
          </div>
        </div>
      )}

      {/* Saving and Saved for a screen reader, at every width: the two bars come and go with the breakpoint. */}
      <p data-editor-announce="" className="sr-only" aria-live="polite" aria-atomic="true">
        {savePhase === "saving" ? tt("Saving") : savePhase === "saved" ? tt("Saved") : ""}
      </p>

      {/*
        THE TOP BAR, BELOW lg: CANCEL, AND SAVE.
        It used to be two bars, a title row that folded away on scroll over a
        row of section pills, and a Cancel and Save strip across the foot of
        the screen, which on a phone sat under the navigation pill. Now it is
        one bar at the top that never changes size: Cancel at the start, the
        more menu and Save at the end. It names no product: the name is in
        the title field right under it.

        It says nothing in the middle. It used to carry the state in small
        text (Unsaved changes, Saved, Live, Draft, New product), and the owner
        asked for it to go. What it said is still said where it belongs: Save
        is grey until there is something to save, spins while it saves and
        shows a check when it has (./editor-buttons); a screen reader hears
        Saving and Saved from the line above; whether the product is live or a
        draft heads the more menu, above the Publish or Unpublish that changes
        it; and Cancel still asks before unsaved changes are thrown away.

        AFTER A SAVE THE PAGE STAYS, as Shopify's product page does: Save
        shows its check and settles to a grey Saved, and Cancel becomes Back,
        because there is nothing left to discard. The next change turns them
        back into Cancel and a violet Save. So the bar is always one of three:
        unsaved (Cancel, which asks; Save), saving (Save busy, Cancel held),
        saved (Back; Saved, greyed).

        The three buttons have Polaris depth: white with a hairline and a soft
        foot for Cancel and more, solid violet for Save, all flat when pressed,
        one height on each screen. No row of section tabs under it, on any
        width: the owner asked for them to go, and each card carries its own
        heading. It sits on the pane that scrolls, like the Orders bar, with a
        hairline once something is under it, and Cmd or Ctrl and S saves from
        anywhere on the page.

        On a phone the editor is the first thing on the screen, a full screen
        layer over the app's header (`data-page-layer`, as the plans page
        does), and the bar starts below the status bar:
        env(safe-area-inset-top), which is 0 in a browser. From md the editor
        is a page in the shell, under the app's header, which has already
        taken the inset, so the bar adds nothing there (`max-md:`).

        FROM 768 TO 1023 IT STAYS AT THE TOP. That width is a tablet held
        upright far more often than a computer, and there the keyboard rises
        from the bottom edge: a bar along the foot would be covered by it, or
        pushed up over the field being typed in. At the top it is where the
        phone has it. From lg (1024) the page is laid out as a computer's
        (below) and the buttons move to a bar along the foot of the pane.
      */}
      <div
        ref={barRef}
        data-editor-bar=""
        className={cn(
          "sticky top-0 z-30 bg-[#f8f9fa] transition-shadow duration-150 max-md:[[data-page-layer]_&]:pt-[env(safe-area-inset-top)] lg:hidden",
          isScrolled ? "shadow-[0_1px_0_#e3e5e8,0_4px_12px_-8px_rgba(17,24,39,0.12)]" : "",
        )}
      >
        <h1 className="sr-only">{productId ? tt("Edit product") : productType === "course" ? tt("New course") : tt("New product")}</h1>
        <div className="mx-auto flex h-14 max-w-[760px] items-center justify-between gap-2 app-gutter sm:h-16 sm:px-6">
          <LeaveButton mode={leaveMode} disabled={saveBusy} leaving={leaving} asks={hasUnsavedChanges} onLeave={() => void handleCancel()} />
          <div className="flex items-center gap-2">
            {moreMenu}
            <SaveButton phase={savePhase} disabled={!canSave} saved={savedThisVisit} onSave={() => void handleSaveChanges()} />
          </div>
        </div>
      </div>

      {/*
        THE FORM. Below lg one column of cards, 760px at most, in the order the
        page reads. From lg the page is laid out the way an admin product page
        is on a computer (Shopify's, and Storelib's own order page): the 1200px
        page container every /app page uses, a header with the way back to
        Products, the product's name and its status, and two columns of cards.
        The main one, two thirds, is the product itself: its title, pictures,
        category and description, what is included, files, variants, price
        and questions. The side one is how it is shown and found: its status,
        settings and search listing. The cards are the same cards at every
        width, in the same order in the source, so a screen reader and the
        Tab key meet them in the order they are seen.
      */}
      <div data-editor-page="" className="mx-auto w-full max-w-[760px] app-gutter pb-6 pt-3 sm:pb-16 sm:pt-4 lg:max-w-[1200px] lg:pb-8 lg:pt-6">
        {/* The page header, from lg: back to Products, the name, the status, the more menu. */}
        <header data-editor-head="" className="mb-5 hidden min-h-9 items-center gap-2 lg:flex">
          <button
            type="button"
            aria-label={tt("Back to products")}
            aria-busy={leaving || undefined}
            title={tt("Products")}
            disabled={saveBusy}
            onClick={() => void handleCancel()}
            className={cn(iconButton, "-ml-1.5 h-9 w-9 shrink-0 hover:bg-[#eceef1] active:bg-[#e4e6ea]", leaving && "bg-[#eceef1]")}
          >
            <span className="grid place-items-center">
              <ArrowLeft className={cn("col-start-1 row-start-1 h-5 w-5", leaving && PRESS_CONTENT_OUT)} />
              {leaving ? <ActivitySpinner size={18} label={tt("Going back to products")} className={cn("col-start-1 row-start-1 text-[#4b5563]", PRESS_SPINNER_IN)} /> : null}
            </span>
          </button>
          <h1 className="min-w-0 truncate text-[24px] font-bold leading-9 text-[#1a1a2e] sm:text-[28px]">
            {productId ? savedTitle.trim() || tt("Untitled") : productType === "course" ? tt("New course") : tt("New product")}
          </h1>
          {statusBadge ? <span className="ml-1 shrink-0">{statusBadge}</span> : null}
          <div className="ml-auto flex shrink-0 items-center pl-2">{moreMenu}</div>
        </header>

        {/* Error message */}
        {error && (
          <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-[14px] text-red-700 lg:mb-4">
            {error}
          </div>
        )}

        {/*
          A paid product, and checkout cannot take money for this seller yet
          (lib/payments/stripe/readiness). Small, and never a reason not to
          publish: the product goes live, buyers just cannot pay until setup is
          done, and nothing is unpublished.
        */}
        {creator.payments_ready === false && sellsForMoney ? (
          <div data-payout-setup-notice="" className="mb-3 flex items-center gap-3 rounded-xl border border-[#fedf89] bg-[#fffcf5] px-3.5 py-2.5 lg:mb-4">
            <p className="min-w-0 flex-1 text-[13.5px] leading-5 text-[#93370d]">{tt("Finish your payout setup to start accepting payments.")}</p>
            <Link href="/app/payouts" className="shrink-0 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-[#93370d] underline-offset-2 hover:underline">
              {tt("Finish setup")}
            </Link>
          </div>
        ) : null}

        {/* A physical product, and something stops buyers checking out with it (components/physical/readiness-banner). A warning, never a block. */}
        {productType === "physical" ? <ReadinessNote productId={productId ?? null} published={isPublished} version={`${productId ?? ""}:${isPublished}:${saveBusy}`} /> : null}

        <div className="flex flex-col gap-3 sm:gap-4 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(272px,1fr)] lg:items-start">
          <div data-editor-main="" className="flex min-w-0 flex-col gap-3 sm:gap-4">
              {/* About Section */}
              <div
                ref={(el) => { sectionRefs.current.about = el }}
                className={CARD}
              >
                <div>
                  <h2 className={CARD_TITLE}>{tt("About")}</h2>
                </div>

                {/* Title Field */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="title" className="text-sm font-medium text-gray-700">
                      {tt("Title")}
                    </Label>
                  </div>
                  <Input
                    id="title"
                    placeholder={productType === "course" ? tt("Course title") : tt("Product title")}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="h-11 border-gray-200 bg-white text-sm sm:text-base"
                  />
                </div>
              </div>

              {productType === "course" ? filesCard : null}

              {/* Media Section */}
              <div
                ref={(el) => { sectionRefs.current.media = el }}
                className={CARD}
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <h2 className={CARD_TITLE}>{tt("Photos and video")}</h2>
                    <span className="text-red-500">*</span>
                  </div>
                  <p className="text-[13px] leading-5 text-[#6b7280] sm:text-[14px]">{tt("The first is the cover.")}</p>
                </div>

                {/* The grid, held to reorder (./media-grid.tsx): two widescreen a row, or a physical product's photos square with the cover large. */}
                {(mediaItems.length > 0 || pendingMedia.length > 0) && (
                  <MediaGrid items={mediaItems} pending={pendingMedia} onChange={setMediaItems} onRemove={removeMedia} shape={productType === "physical" ? "square" : "wide"} />
                )}

                {/* The upload zone, and its state while a file uploads */}
                <div
                  className={`
                    border-2 border-dashed rounded-xl
                    flex flex-col items-center justify-center py-6 sm:py-8
                    transition-all duration-400 cursor-pointer
                    touch-action-pan-y
                    ${isExternalDragOver
                      ? "border-[#1a1a2e] bg-[#f6f7f9]"
                      : "border-gray-300 hover:border-gray-400 hover:bg-gray-50/50"
                    }
                  `}
                  onClick={handleUploadZoneClick}
                  onDragEnter={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    dragCounterRef.current++
                    if (e.dataTransfer.types.includes('Files')) {
                      setIsExternalDragOver(true)
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    e.dataTransfer.dropEffect = 'copy'
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    dragCounterRef.current--
                    if (dragCounterRef.current === 0) {
                      setIsExternalDragOver(false)
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    dragCounterRef.current = 0
                    setIsExternalDragOver(false)
                    handleMediaUpload(e.dataTransfer.files)
                  }}
                >
                  <input
                    id="media-input"
                    type="file"
                    multiple
                    accept={`image/*,${VIDEO_ACCEPT}`}
                    className="hidden"
                    onChange={(e) => { handleMediaUpload(e.target.files); e.target.value = "" }}
                  />

                  {isExternalDragOver ? (
                    <div className="flex flex-col items-center gap-2 animate-in fade-in duration-200">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-[0_1px_2px_rgba(16,24,40,0.08),0_0_0_1px_rgba(16,24,40,0.06)]">
                        <Plus className="h-5 w-5 text-[#1a1a2e]" />
                      </div>
                      <p className="text-sm font-medium text-[#1a1a2e]">{tt("Drop to add photos and videos")}</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-gray-500 text-xs sm:text-sm mb-2 sm:mb-3">
                        {tt("Drag and drop files or")}
                      </p>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-gray-300 text-gray-700 hover:bg-gray-50 h-8 sm:h-9 px-3 sm:px-4 text-xs sm:text-sm pointer-events-auto"
                        onClick={(e) => {
                          e.stopPropagation()
                          document.getElementById("media-input")?.click()
                        }}
                      >
                        <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-1.5" />
                        {tt("Upload")}
                      </Button>
                      <button
                        type="button"
                        className="mt-2 text-xs sm:text-sm font-medium text-gray-600 hover:text-[#1a1a2e] pointer-events-auto"
                        onPointerEnter={() => void prefetchLibrary("media", { warmFirst: true })}
                        onClick={(e) => {
                          e.stopPropagation()
                          setChoosingFiles(true)
                        }}
                        data-product-media-files=""
                      >
                        {tt("Choose from your files")}
                      </button>

                      {/* YouTube add — inline toggle */}
                      {!showYoutubeInput ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            e.preventDefault()
                            setShowYoutubeInput(true)
                            // Focus input first (opens keyboard), then scroll after keyboard settles
                            setTimeout(() => {
                              const input = document.getElementById("youtube-url-field") as HTMLInputElement
                              if (input) {
                                input.focus()
                                // Wait for keyboard to open, then scroll into view
                                const scrollAfterKeyboard = () => {
                                  const el = document.getElementById("youtube-inline-input")
                                  if (el) {
                                    el.scrollIntoView({ behavior: "smooth", block: "nearest" })
                                  }
                                }
                                // Use visualViewport resize (keyboard open) or fallback timeout
                                const vv = window.visualViewport
                                if (vv) {
                                  const onResize = () => {
                                    vv.removeEventListener("resize", onResize)
                                    setTimeout(scrollAfterKeyboard, 100)
                                  }
                                  vv.addEventListener("resize", onResize)
                                  // Fallback if keyboard doesn't trigger resize (desktop)
                                  setTimeout(() => {
                                    vv.removeEventListener("resize", onResize)
                                    scrollAfterKeyboard()
                                  }, 600)
                                } else {
                                  setTimeout(scrollAfterKeyboard, 500)
                                }
                              }
                            }, 100)
                          }}
                          className="mt-3 text-xs sm:text-sm text-gray-500 hover:text-red-600 flex items-center gap-1.5 transition-colors pointer-events-auto"
                        >
                          <svg viewBox="0 -7 48 48" className="h-4 w-4 sm:h-5 sm:w-5" fill="none">
                            <path d="M19.044 25.27L19.0425 11.688L32.0115 18.502L19.044 25.27ZM47.52 9.334C47.52 9.334 47.0505 6.003 45.612 4.536C43.7865 2.61 41.7405 2.601 40.803 2.489C34.086 2 24.0105 2 24.0105 2H23.9895C23.9895 2 13.914 2 7.197 2.489C6.258 2.601 4.2135 2.61 2.3865 4.536C0.948 6.003 0.48 9.334 0.48 9.334C0.48 9.334 0 13.247 0 17.158V20.826C0 24.738 0.48 28.649 0.48 28.649C0.48 28.649 0.948 31.98 2.3865 33.447C4.2135 35.373 6.612 35.313 7.68 35.514C11.52 35.885 24 36 24 36C24 36 34.086 35.985 40.803 35.495C41.7405 35.382 43.7865 35.373 45.612 33.447C47.0505 31.98 47.52 28.649 47.52 28.649C47.52 28.649 48 24.738 48 20.826V17.158C48 13.247 47.52 9.334 47.52 9.334Z" fill="#CE1312"/>
                          </svg>
                          {tt("Add YouTube video")}
                        </button>
                      ) : (
                        <div id="youtube-inline-input" className="mt-3 space-y-3 pointer-events-auto" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl p-2">
                            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-50 flex-shrink-0">
                              <svg viewBox="0 -7 48 48" className="h-4 w-4" fill="none">
                                <path d="M19.044 25.27L19.0425 11.688L32.0115 18.502L19.044 25.27ZM47.52 9.334C47.52 9.334 47.0505 6.003 45.612 4.536C43.7865 2.61 41.7405 2.601 40.803 2.489C34.086 2 24.0105 2 24.0105 2H23.9895C23.9895 2 13.914 2 7.197 2.489C6.258 2.601 4.2135 2.61 2.3865 4.536C0.948 6.003 0.48 9.334 0.48 9.334C0.48 9.334 0 13.247 0 17.158V20.826C0 24.738 0.48 28.649 0.48 28.649C0.48 28.649 0.948 31.98 2.3865 33.447C4.2135 35.373 6.612 35.313 7.68 35.514C11.52 35.885 24 36 24 36C24 36 34.086 35.985 40.803 35.495C41.7405 35.382 43.7865 35.373 45.612 33.447C47.0505 31.98 47.52 28.649 47.52 28.649C47.52 28.649 48 24.738 48 20.826V17.158C48 13.247 47.52 9.334 47.52 9.334Z" fill="#CE1312"/>
                              </svg>
                            </div>
                            <Input
                              id="youtube-url-field"
                              placeholder={tt("Paste YouTube URL...")}
                              value={youtubeInput}
                              onChange={(e) => setYoutubeInput(e.target.value)}
                              className="flex-1 h-9 text-sm border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-1 placeholder:text-gray-400"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') { e.preventDefault(); handleAddYouTube() }
                                if (e.key === 'Escape') { setShowYoutubeInput(false); setYoutubeInput("") }
                              }}
                            />
                            <button type="button" onClick={() => { setShowYoutubeInput(false); setYoutubeInput("") }} className="p-1 text-gray-400 hover:text-gray-600 rounded-full shrink-0">
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          {youtubeInput && parseYouTubeUrl(youtubeInput) && (
                            <div className="relative aspect-video max-w-[200px] mx-auto rounded-lg overflow-hidden border border-gray-200 shadow-sm">
                              <img src={`https://img.youtube.com/vi/${parseYouTubeUrl(youtubeInput)}/hqdefault.jpg`} alt={tt("Video preview")} className="w-full h-full object-cover" />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center shadow-lg"><Play className="h-5 w-5 text-white ml-0.5" /></div>
                              </div>
                            </div>
                          )}
                          <Button
                            type="button"
                            onClick={handleAddYouTube}
                            disabled={!youtubeInput || !parseYouTubeUrl(youtubeInput)}
                            className="w-full h-9 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg disabled:bg-gray-200 disabled:text-gray-400"
                          >
                            {tt("Add Video")}
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <p className="text-xs text-gray-400">
                  {existingImages}/{MAX_PHOTOS} {tt("images · {length}/", { length: mediaItems.filter(m => m.type === "video").length })}{MAX_VIDEO_FILES} {tt("videos · {existingYouTube}/", { existingYouTube })}{MAX_YOUTUBE_VIDEOS} {tt("YouTube videos")}
                </p>
                <FilesLibraryChooser
                  open={choosingFiles}
                  onClose={() => setChoosingFiles(false)}
                  multiple
                  kind="media"
                  max={Math.max(0, MAX_PHOTOS - existingImages - pendingMedia.length) + Math.max(0, MAX_VIDEO_FILES - mediaItems.filter(m => m.type === "video").length)}
                  onPickMany={addFromFiles}
                />

              </div>

              {/* Content Section */}
              <div
                ref={(el) => { sectionRefs.current.content = el }}
                className={CARD}
              >
                <div>
                  <h2 className={CARD_TITLE}>{tt("Content")}</h2>
                </div>

                {/*
                  THE CATEGORY, a field of the product itself, above its
                  description at every width, as Shopify has it
                  (./category-picker.tsx).
                */}
                <div ref={(el) => { sectionRefs.current.category = el }} data-editor-category="" className="scroll-mt-4 space-y-1.5">
                  <Label className="text-sm font-medium text-gray-700">
                    {tt("Category")}
                  </Label>
                  <CategoryPicker
                    kind={categoryKind}
                    value={selectedCategory}
                    onChange={chooseCategory}
                    onClear={clearCategory}
                    suggested={suggestedCategory}
                    isPhone={isMobileViewport}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-sm font-medium text-gray-700">
                      {tt("Description")}
                    </Label>
                  </div>
                  <RichTextEditor
                    value={description}
                    onChange={setDescription}
                    label={tt("Description")}
                    placeholder={tt("What it is, who it is for, and what they get")}
                    uploadImage={(file) => uploadDescriptionImage(file, { creatorId, productId })}
                    checkSize={descriptionTooLong}
                    resizable
                  />
                </div>
              </div>

              {/* What's Included Section: a download's list of what's in it. A thing that ships has its photos, variants and description for that. */}
              <div
                className={CARD}
                hidden={productType === "physical"}
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <h2 className={CARD_TITLE}>{tt("What's Included")}</h2>
                  </div>
                </div>

                <div className="space-y-2">
                  {/* Every line is the creator's to reword or remove, the starting three included. */}
                  {whatsIncluded.map((item, index) => (
                    <div
                      key={index}
                      data-included-row=""
                      className="group flex items-center gap-2.5 rounded-xl border border-[#eceef1] bg-[#fafafb] py-1.5 pl-3 pr-1.5 transition-colors focus-within:border-[#d9dce1] focus-within:bg-white"
                    >
                      {/* One plain mark for every line: a thin grey check, as the product page draws it. */}
                      <Check aria-hidden strokeWidth={2} className="h-4 w-4 shrink-0 text-[#6b7280]" />
                      <Input
                        value={item}
                        aria-label={tt("Included item {value}", { value: index + 1 })}
                        onChange={(e) => {
                          setWhatsIncluded(prev => prev.map((it, i) =>
                            i === index ? e.target.value : it
                          ))
                        }}
                        className="h-8 flex-1 border-0 bg-transparent px-1 text-[15px] shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 sm:text-sm"
                        placeholder={tt("Enter item...")}
                      />
                      <button
                        type="button"
                        onClick={() => setWhatsIncluded(prev => prev.filter((_, i) => i !== index))}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[#9ca3af] transition-colors hover:bg-[#f1f2f4] hover:text-[#1a1a2e] [-webkit-tap-highlight-color:transparent]"
                        aria-label={tt("Remove item")}
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  ))}
                </div>

                {whatsIncluded.length < MAX_WHATS_INCLUDED && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setWhatsIncluded(prev => [...prev, ""])}
                    className="text-gray-600 border-gray-300 h-9 rounded-xl"
                  >
                    <Plus className="h-4 w-4 mr-1.5" />
                    {tt("Add Item")}
                  </Button>
                )}
              </div>

              {productType === "course" ? null : filesCard}

              {/* Variants Section: a download's. A physical product's are in its own cards above. */}
              <div
                ref={(el) => { sectionRefs.current.variants = el }}
                hidden={productType === "physical"}
                className={CARD}
              >
                {/*
                  WITH NO VARIANTS THIS IS ONE LINE. "Variants" and "Optional",
                  then "Add variants for this product": the full editor, with its
                  names, prices and files, only once there is a variant to edit.
                */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className={CARD_TITLE}>{tt("Variants")}</h2>
                      {variants.length === 0 ? <span className="text-[13px] font-normal text-[#9ca3af]">{tt("Optional")}</span> : null}
                    </div>
                    {variants.length > 0 ? (
                      null
                    ) : null}
                  </div>
                  {variants.length > 0 && variants.length < MAX_VARIANTS && (
                    <button type="button" onClick={addVariant} className={cn(secondaryDepth, "h-8 shrink-0 rounded-lg px-3 text-[13px]")}>
                      <Plus className="h-3.5 w-3.5 text-[#6b7280]" aria-hidden />
                      {tt("Add variant")}
                    </button>
                  )}
                </div>

                {/* Variants List */}
                {variants.length > 0 && (
                  <div className="space-y-3">
                    {variants.map((variant, index) => (
                      <div
                        key={variant.id}
                        data-variant-id={variant.id}
                        className="border border-gray-200 rounded-xl overflow-hidden bg-white hover:border-gray-300 transition-colors"
                      >
                        {/* Variant Header: the name and price, then move up, move down, delete and open, all grey. */}
                        <div
                          className="flex cursor-pointer items-center justify-between gap-2 bg-[#fafafb] py-2 pl-3 pr-1.5 transition-colors hover:bg-[#f4f5f7] sm:pl-4"
                          onClick={() => {
                            setVariants(prev => prev.map(v =>
                              v.id === variant.id ? { ...v, isExpanded: !v.isExpanded } : v
                            ))
                          }}
                        >
                          <div className="min-w-0 flex-1 truncate">
                            <span className="text-sm font-medium text-[#1a1a2e]">{variant.name || (variants.length === 1 ? tt("Standard") : tt("Name this option"))}</span>
                            {variantPriceLabel(variant, creator.currency) ? (
                              <span className="ml-2 text-xs tabular-nums text-[#6b7280]">{variantPriceLabel(variant, creator.currency)}</span>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 items-center">
                            {variants.length > 1 ? (
                              <>
                                <button
                                  type="button"
                                  aria-label={tt("Move {value} up", { value: variant.name || "variant" })}
                                  disabled={index === 0}
                                  onClick={(e) => { e.stopPropagation(); moveVariant(variant.id, -1) }}
                                  className={VARIANT_TOOL}
                                >
                                  <ArrowUp className="h-4 w-4" aria-hidden />
                                </button>
                                <button
                                  type="button"
                                  aria-label={tt("Move {value} down", { value: variant.name || "variant" })}
                                  disabled={index === variants.length - 1}
                                  onClick={(e) => { e.stopPropagation(); moveVariant(variant.id, 1) }}
                                  className={VARIANT_TOOL}
                                >
                                  <ArrowDown className="h-4 w-4" aria-hidden />
                                </button>
                              </>
                            ) : null}
                            <button
                              type="button"
                              aria-label={tt("Delete {value}", { value: variant.name || "variant" })}
                              onClick={(e) => {
                                e.stopPropagation()
                                setVariants(prev => prev.filter(v => v.id !== variant.id))
                              }}
                              className={cn(VARIANT_TOOL, "hover:text-[#dc2626]")}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </button>
                            <button
                              type="button"
                              aria-label={variant.isExpanded ? tt("Close") : tt("Edit")}
                              aria-expanded={variant.isExpanded}
                              onClick={(e) => {
                                e.stopPropagation()
                                setVariants(prev => prev.map(v =>
                                  v.id === variant.id ? { ...v, isExpanded: !v.isExpanded } : v
                                ))
                              }}
                              className={VARIANT_TOOL}
                            >
                              <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", variant.isExpanded && "rotate-180")} aria-hidden />
                            </button>
                          </div>
                        </div>

                        {/* Variant Content - Collapsible */}
                        {variant.isExpanded && (
                          <div className="p-4 sm:p-5 space-y-5 border-t border-gray-100 bg-white">
                            {/* Name */}
                            <div className="space-y-1.5">
                              <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{tt("Name")}</Label>
                              <Input
                                placeholder={tt("e.g. Basic, Pro, Enterprise")}
                                value={variant.name}
                                onChange={(e) => {
                                  setVariants(prev => prev.map(v =>
                                    v.id === variant.id ? { ...v, name: e.target.value } : v
                                  ))
                                }}
                                className="h-11 border-gray-200 text-sm rounded-lg bg-gray-50 focus:bg-white transition-colors"
                              />
                            </div>

                            {/* Description */}
                            <div className="space-y-1.5">
                              <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{tt("Description")}</Label>
                              <Textarea
                                placeholder={tt("What's included in this variant...")}
                                value={variant.description}
                                onChange={(e) => {
                                  setVariants(prev => prev.map(v =>
                                    v.id === variant.id ? { ...v, description: e.target.value } : v
                                  ))
                                }}
                                className="border-gray-200 min-h-[80px] text-sm resize-none rounded-lg bg-gray-50 focus:bg-white transition-colors"
                              />
                            </div>

                            {/* Pricing Row - Price, Compare-at/Suggested, Max Purchases */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                              <div className="space-y-1.5">
                                <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                                  {variant.payWhatYouWant ? tt("Min amount") : tt("Price")}
                                </Label>
                                <div className="relative">
                                  {priceMark.node}
                                  <Input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="0.00"
                                    value={variant.payWhatYouWant ? (variant.pwywMinPrice || "") : variant.price}
                                    onChange={(e) => {
                                      const value = e.target.value.replace(/[^0-9.]/g, '')
                                      setVariants(prev => prev.map(v =>
                                        v.id === variant.id
                                          ? variant.payWhatYouWant
                                            ? { ...v, pwywMinPrice: value }
                                            : { ...v, price: value }
                                          : v
                                      ))
                                    }}
                                    className="h-11 border-gray-200 text-sm rounded-lg bg-gray-50 focus:bg-white transition-colors font-medium"
                                    style={priceMark.pad}
                                  />
                                </div>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                                  {variant.payWhatYouWant ? tt("Suggested") : tt("Compare-at")}
                                </Label>
                                <div className="relative">
                                  {priceMark.node}
                                  <Input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder={tt("Optional")}
                                    value={variant.payWhatYouWant ? (variant.pwywSuggestedPrice || "") : (variant.compareAtPrice || "")}
                                    onChange={(e) => {
                                      const value = e.target.value.replace(/[^0-9.]/g, '')
                                      setVariants(prev => prev.map(v =>
                                        v.id === variant.id
                                          ? variant.payWhatYouWant
                                            ? { ...v, pwywSuggestedPrice: value }
                                            : { ...v, compareAtPrice: value }
                                          : v
                                      ))
                                    }}
                                    className="h-11 border-gray-200 text-sm rounded-lg bg-gray-50 focus:bg-white transition-colors"
                                    style={priceMark.pad}
                                  />
                                </div>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{tt("Max purchases")}</Label>
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  placeholder={tt("Unlimited")}
                                  value={variant.maxPurchases}
                                  onChange={(e) => {
                                    const value = e.target.value.replace(/[^0-9]/g, '')
                                    setVariants(prev => prev.map(v =>
                                      v.id === variant.id ? { ...v, maxPurchases: value } : v
                                    ))
                                  }}
                                  className="h-11 border-gray-200 text-sm rounded-lg bg-gray-50 focus:bg-white transition-colors"
                                />
                              </div>
                            </div>

                            {/* Pay what you want for this option: the form's own switch row, its hint where the old info circle was. */}
                            <div className={SWITCH_GROUP}>
                              <SwitchRow
                                title={tt("Buyers choose the price")}
                                hint={tt("Any amount from your minimum.")}
                                checked={variant.payWhatYouWant || false}
                                onChange={(checked) => {
                                  const targetId = variant.id
                                  setVariants(prev => prev.map(v =>
                                    v.id === targetId ? { ...v, payWhatYouWant: checked } : v
                                  ))
                                }}
                              />
                            </div>

                            {/* Assigned Digital Files */}
                            <div className="space-y-3 pt-4 border-t border-gray-100">
                              <div>
                                <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                                  {tt("Assigned Files")}
                                </Label>
                                <p className="text-[10px] text-gray-400 mt-0.5">
                                  {tt("Select which files buyers of this variant will receive")}
                                </p>
                              </div>

                              {/* File selection - uses stable callback handler */}
                              {digitalFiles.length > 0 ? (
                                <div className="space-y-2">
                                  {digitalFiles.map((file) => {
                                    // Skip invalid files
                                    if (!file || !file.id || !variant || !variant.id) return null

                                    const fileId = String(file.id)
                                    const variantId = String(variant.id)
                                    const assignedFiles = Array.isArray(variant.assignedFiles) ? variant.assignedFiles : []
                                    const isAssigned = assignedFiles.includes(fileId)

                                    return (
                                      <VariantFileCheckbox
                                        key={`${variantId}-${fileId}`}
                                        fileId={fileId}
                                        variantId={variantId}
                                        fileName={file.file_name || tt("Unnamed file")}
                                        fileSize={file.file_size || 0}
                                        isAssigned={isAssigned}
                                        onToggle={handleToggleVariantFile}
                                      />
                                    )
                                  })}
                                </div>
                              ) : (
                                <div className="p-4 rounded-xl bg-gray-50 border border-dashed border-gray-200 text-center">
                                  <FileText className="h-5 w-5 text-gray-300 mx-auto mb-1" />
                                  <p className="text-xs text-gray-400">
                                    {tt("No files uploaded yet")}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {variants.length >= MAX_VARIANTS && (
                  <p className="text-xs text-gray-400 text-center">{tt("Maximum")} {MAX_VARIANTS} {tt("variants allowed")}</p>
                )}

                {variants.length === 0 && (
                  <button
                    type="button"
                    data-add-variants=""
                    onClick={addVariant}
                    className="-mx-1.5 -my-1 flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left text-[14px] font-medium text-[#1a1a2e] transition-colors hover:bg-[#f6f7f8] active:bg-[#f1f2f4] [-webkit-tap-highlight-color:transparent]"
                  >
                    <span className="grid h-5 w-5 place-items-center rounded-full border-[1.5px] border-[#4b5563] text-[#4b5563]">
                      <Plus className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                    </span>
                    {tt("Add variants for this product")}
                  </button>
                )}
              </div>

              {/* Pricing Section */}
              <div
                className={CARD}
              >
                {/*
                  How it is sold is one quiet choice at the end of the title
                  row: the price is what the card is for, so it is not given a
                  track of three tabs above it. A menu on a computer, the shared
                  sheet on a phone. A physical product has a fixed price.
                */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className={CARD_TITLE}>{tt("Pricing")}</h2>
                    <p className="text-[13px] leading-5 text-[#6b7280] sm:text-[14px]">
                      {productType === "physical" ? null : PRICE_MODE_HINT[priceMode]}
                    </p>
                  </div>
                  {productType === "physical" ? null : (
                    <ResponsiveActionMenu
                      title={tt("How it is sold")}
                      menuWidth="w-[13.5rem]"
                      items={PRICE_MODES.map((m) => ({
                        label: m.label,
                        icon: m.value === priceMode
                          ? <Check strokeWidth={2.25} aria-hidden />
                          : <span aria-hidden className="block h-4 w-4" />,
                        onClick: () => choosePriceMode(m.value),
                      }))}
                      trigger={
                        <button
                          type="button"
                          data-price-mode=""
                          aria-label={tt("How it is sold: {label}", { label: PRICE_MODES.find((m) => m.value === priceMode)?.label })}
                          className="-mr-1 inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[14px] font-medium text-[#1a1a2e] transition-colors hover:bg-[#f1f2f4] active:bg-[#e9eaed] data-[state=open]:bg-[#f1f2f4] sm:h-8 sm:text-[13px] [-webkit-tap-highlight-color:transparent]"
                        >
                          {PRICE_MODES.find((m) => m.value === priceMode)?.label}
                          <ChevronDown className="h-4 w-4 text-[#6b7280]" aria-hidden />
                        </button>
                      }
                    />
                  )}
                </div>

                <SwapPanels
                  active={priceMode}
                  panels={[
                    {
                      key: "fixed",
                      node: (
                        <div className="space-y-3">
                          <div className={cn("grid gap-3 sm:gap-4", compareOpen ? "grid-cols-2" : "grid-cols-1 sm:max-w-[calc(50%-8px)]")}>
                            <div className="space-y-1.5">
                              <Label htmlFor="price" className="text-xs sm:text-sm font-medium text-gray-700">{tt("Price")}</Label>
                              <div className="relative">
                                {priceMark.node}
                                <Input
                                  id="price"
                                  type="text"
                                  inputMode="decimal"
                                  autoComplete="off"
                                  placeholder="0.00"
                                  value={price}
                                  onChange={(e) => setPrice(moneyTyped(e.target.value))}
                                  className="h-11 border-gray-200 text-sm sm:text-base tabular-nums"
                                  style={priceMark.pad}
                                />
                              </div>
                            </div>
                            {compareOpen && (
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <Label htmlFor="comparePrice" className="text-xs sm:text-sm font-medium text-gray-700">{tt("Compare-at price")}</Label>
                                  <button
                                    type="button"
                                    aria-label={tt("Remove the compare-at price")}
                                    onClick={() => {
                                      setCompareAtPrice("")
                                      setCompareOpen(false)
                                    }}
                                    className="-my-1 grid h-7 w-7 place-items-center rounded-md text-[#9ca3af] transition-colors hover:bg-[#f1f2f4] hover:text-[#1a1a2e]"
                                  >
                                    <X className="h-3.5 w-3.5" aria-hidden />
                                  </button>
                                </div>
                                <div className="relative">
                                  {priceMark.node}
                                  <Input
                                    id="comparePrice"
                                    ref={compareRef}
                                    type="text"
                                    inputMode="decimal"
                                    autoComplete="off"
                                    placeholder="0.00"
                                    value={compareAtPrice}
                                    onChange={(e) => setCompareAtPrice(moneyTyped(e.target.value))}
                                    className="h-11 border-gray-200 text-sm sm:text-base tabular-nums"
                                  style={priceMark.pad}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                          {compareOpen && compareAtPrice && Number.parseFloat(compareAtPrice) <= Number.parseFloat(price || "0") ? (
                            <p className="text-[13px] leading-[18px] text-[#b45309]">{tt("Buyers only see it struck through when it is higher than the price.")}</p>
                          ) : null}
                          {!compareOpen && (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                data-compare-chip=""
                                onClick={() => {
                                  setCompareOpen(true)
                                  requestAnimationFrame(() => compareRef.current?.focus())
                                }}
                                className={OPTION_CHIP}
                              >
                                <Plus className="h-3.5 w-3.5" aria-hidden />
                                {tt("Compare-at price")}
                              </button>
                            </div>
                          )}
                          {/* Its price on Storelib's marketplace, when that is in US dollars (lib/money/marketplace). */}
                          {productType !== "physical" ? <MarketplacePriceCard productId={productId} priceText={price} /> : null}
                        </div>
                      ),
                    },
                    {
                      key: "pwyw",
                      node: (
                        <div className="space-y-2.5">
                          <div className="grid grid-cols-2 gap-3 sm:gap-4">
                            <div className="space-y-1.5">
                              <Label htmlFor="pwywMin" className="text-xs sm:text-sm font-medium text-gray-700">{tt("Minimum amount")}</Label>
                              <div className="relative">
                                {priceMark.node}
                                <Input
                                  id="pwywMin"
                                  type="text"
                                  inputMode="decimal"
                                  autoComplete="off"
                                  placeholder="0.00"
                                  value={pwywMinPrice}
                                  onChange={(e) => setPwywMinPrice(moneyTyped(e.target.value))}
                                  className="h-11 border-gray-200 text-sm sm:text-base tabular-nums"
                                  style={priceMark.pad}
                                />
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="pwywSuggested" className="text-xs sm:text-sm font-medium text-gray-700">{tt("Suggested amount")}</Label>
                              <div className="relative">
                                {priceMark.node}
                                <Input
                                  id="pwywSuggested"
                                  type="text"
                                  inputMode="decimal"
                                  autoComplete="off"
                                  placeholder="0.00"
                                  value={pwywSuggestedPrice}
                                  onChange={(e) => setPwywSuggestedPrice(moneyTyped(e.target.value))}
                                  className="h-11 border-gray-200 text-sm sm:text-base tabular-nums"
                                  style={priceMark.pad}
                                />
                              </div>
                            </div>
                          </div>
                          <p className="text-[13px] leading-[18px] text-[#6b7280]">{tt("Buyers see “Name a fair price”, starting at your suggested amount.")}</p>
                        </div>
                      ),
                    },
                    {
                      key: "free",
                      node: (
                        <p className="rounded-xl bg-[#f6f7f8] px-4 py-3 text-[14px] leading-5 text-[#4b5563]">
                          {tt("No payment. Buyers enter their name and email and get the files right away.")}
                        </p>
                      ),
                    },
                  ]}
                />
              </div>

              {/* A physical product: stock, variants, shipping and the rest under its price, in place of the files (components/physical/product-cards.tsx). */}
              {productType === "physical" ? <StoreCurrencyProvider currency={creator.currency}><PhysicalProductCards
                  productId={productId}
                  basePrice={price}
                  handle={physicalRef}
                  onValue={reportPhysical}
                  openSettings={openSettings}
                  orderLimit={orderLimit}
                  onOrderLimitLoaded={orderLimitLoaded}
                  images={mediaItems.filter((m) => m.type === "image").map((m) => m.url)}
                  uploadImage={async (file) => (await uploadDescriptionImage(file, { creatorId, productId })).url}
                /></StoreCurrencyProvider> : null}
              {/* FAQ Section */}
              <div
                className={CARD}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h2 className={CARD_TITLE}>{tt("FAQ")}</h2>
                    </div>
                    <p className="text-[13px] leading-5 text-[#6b7280] sm:text-[14px]">
                      {faqOpen || faqs.length === 0 ? null : tt("{length, plural, one {# question} other {# questions}} on the product page.", { length: faqs.length })}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const faqId = `custom-${Date.now()}`
                      setFaqOpen(true)
                      setFaqs(prev => [...prev, {
                        id: faqId,
                        question: "",
                        answer: "",
                        isDefault: false,
                      }])
                      requestAnimationFrame(() => {
                        setTimeout(() => {
                          const el = document.querySelector(`[data-faq-id="${faqId}"]`)
                          if (el) el.scrollIntoView({ behavior: "smooth", block: "center" })
                        }, 50)
                      })
                    }}
                    className={cn(secondaryDepth, "h-10 rounded-[10px] px-3 text-[14px] sm:h-8 sm:rounded-lg sm:text-[13px]")}
                  >
                    <Plus className="h-4 w-4 text-[#6b7280]" />
                    {tt("Add FAQ")}
                  </button>
                </div>

                {/* Folded until asked for: the questions are there on the page either way. */}
                {faqOpen ? (
                  <>
                    <FaqList faqs={faqs} onChange={setFaqs} />
                    <button type="button" onClick={() => setFaqOpen(false)} className="flex items-center gap-1 text-[13px] font-medium text-[#6b7280] hover:text-[#1a1a2e]">
                      <ChevronUp className="h-4 w-4" aria-hidden />
                      {tt("Hide questions")}
                    </button>
                  </>
                ) : faqs.length > 0 ? (
                  <button
                    type="button"
                    data-faq-show=""
                    onClick={() => setFaqOpen(true)}
                    className="flex w-full items-center justify-between rounded-xl bg-[#f6f7f8] px-4 py-3 text-left text-[14px] text-[#4b5563] transition-colors hover:bg-[#f1f2f4] [-webkit-tap-highlight-color:transparent]"
                  >
                    <span className="min-w-0 truncate">{faqs.map((f) => f.question).filter(Boolean).slice(0, 2).join(" · ") || tt("Your questions")}</span>
                    <span className="flex shrink-0 items-center gap-1 pl-3 font-medium text-[#1a1a2e]">
                      {tt("Show")}
                      <ChevronDown className="h-4 w-4" aria-hidden />
                    </span>
                  </button>
                ) : null}
                {/* Where they go (lib/products/product-faqs.ts): the product page, wherever it is drawn. */}
                <p className="text-[12.5px] leading-5 text-[#9ca3af]" data-faq-where="">
                  {tt("Shows on your product page under the description.")}
                  {productId && isPublished && slug ? (
                    <>
                      {" "}
                      <button type="button" onClick={handleRedirectToProduct} className="font-medium text-[#4b5563] underline-offset-2 hover:text-[#1a1a2e] hover:underline">
                        {tt("See it")}
                      </button>
                    </>
                  ) : null}
                </p>
              </div>
              {/* Not on a course: its lessons are what it is ("what do custom fields have to do with a course?"). Fields it already has are kept. */}
              {productType === "course" ? null : <CustomFieldsCard fields={customFields} onChange={setCustomFields} cardClass={CARD} titleClass={CARD_TITLE} />}
              {/* Only for a product that ships: its answers travel with the parcel's order. */}
              {productType === "physical" ? <PersonalizationCard fields={personalization} onChange={setPersonalization} cardClass={CARD} titleClass={CARD_TITLE} /> : null}
          </div>

          <div data-editor-side="" className="flex min-w-0 flex-col gap-3 sm:gap-4">
              {/*
                STATUS, from lg: what the product is on the storefront and the
                one thing that changes it, which the more menu also holds.
                Publish and Unpublish take effect at once, as they do there;
                Save always publishes, which is said here for a draft.
              */}
              <div data-editor-status="" className={cn(CARD, "hidden lg:block")}>
                {/* The badge is in the page header, right above: here it is said once, in words. */}
                <div>
                  <h2 className={CARD_TITLE}>{tt("Status")}</h2>
                  <p className="text-[13px] leading-5 text-[#6b7280] sm:text-[14px]">
                    {!productId
                      ? tt("Goes on your page when you save it.")
                      : isPublished
                        ? productType === "physical" ? tt("Live on your store.") : tt("Live on your page.")
                        : tt("Draft, hidden from your page. Saving publishes it.")}
                  </p>
                </div>
                {productId ? (
                  <div className="flex flex-wrap gap-2">
                    {isPublished && slug ? (
                      <button type="button" onClick={handleRedirectToProduct} className={cn(secondaryDepth, "h-8 rounded-lg px-3 text-[13px]")}>
                        {viewLabel}
                      </button>
                    ) : null}
                    <button type="button" disabled={isLoading} onClick={() => void handleTogglePublish()} className={cn(secondaryDepth, "h-8 rounded-lg px-3 text-[13px]")}>
                      {isPublished ? tt("Unpublish") : tt("Publish")}
                    </button>
                  </div>
                ) : null}
              </div>

              <CollectionsCard ref={collectionsRef} productId={productId ?? null} cardClass={CARD} titleClass={CARD_TITLE} onValue={reportCollections} />
              <SalesChannelsCard ref={channelsRef} productId={productId ?? null} physical={productType === "physical"} cardClass={CARD} titleClass={CARD_TITLE} onValue={reportChannels} />

              {/* Settings Section */}
              <div
                className={CARD}
              >
                <div>
                  <h2 className={CARD_TITLE}>{tt("Settings")}</h2>
                </div>

                {/*
                  A THING THAT SHIPS has no call to action to pick (its button
                  is Add to cart), no sales count and no download's refund
                  promise: its returns are the store's, in Settings › Returns
                  and refunds. What it keeps is Limit sales, as the most one
                  order may take. A download's settings are below as they were.
                */}
                {productType === "physical" ? (
                  <>
                    <div className={SWITCH_GROUP} data-physical-settings="">
                      <div>
                        <SwitchRow
                          title={tt("Limit sales")}
                          hint={tt("The most one buyer can take in one order")}
                          checked={orderLimit.on}
                          onChange={(on) => setOrderLimit({ on, count: on && !orderLimit.count ? "2" : orderLimit.count })}
                        />
                        <Reveal open={orderLimit.on}>
                          <div className="flex items-center gap-2 px-4 pb-3" data-order-limit="">
                            <span className="text-[14px] text-[#4b5563]">{tt("Up to")}</span>
                            <Input
                              type="text"
                              inputMode="numeric"
                              autoComplete="off"
                              placeholder="2"
                              aria-label={tt("Most per order")}
                              value={orderLimit.count}
                              onChange={(e) => setOrderLimit({ on: true, count: e.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 3) })}
                              className="h-10 w-[72px] rounded-[10px] border-[#e5e7eb] text-center text-[15px] tabular-nums sm:h-9 sm:rounded-lg sm:text-sm"
                            />
                            <span className="text-[14px] text-[#4b5563]">{tt("per order")}</span>
                          </div>
                        </Reveal>
                      </div>
                    </div>
                    <p className="text-[13px] leading-5 text-[#6b7280]" data-returns-line="">
                      {tt("Returns and refunds for things that ship are set for your whole store in")}{" "}
                      <a
                        href="/app/settings?tab=returns"
                        data-settings-link=""
                        onClick={(e) => {
                          if (e.metaKey || e.ctrlKey || e.shiftKey) return
                          e.preventDefault()
                          void openSettings("/app/settings?tab=returns")
                        }}
                        className="font-medium text-[#1a1a2e] underline underline-offset-2"
                      >
                        {tt("Settings › Returns and refunds")}
                      </a>
                      .
                    </p>
                  </>
                ) : (
                  <>
                {/* Call to Action */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="cta" className="text-sm font-medium text-gray-700">
                      {tt("Call to action")}
                    </Label>
                  </div>
                  {/* Mobile: button opens bottom sheet */}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowCtaSheet(true)}
                    className="sm:hidden w-full h-10 justify-between text-sm border-gray-200 font-normal"
                  >
                    <span className="text-gray-900">{callToAction || tt("I want this!")}</span>
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  </Button>
                  {/* Desktop: native select — guaranteed to work */}
                  <div className="hidden sm:block relative">
                    <select
                      id="cta"
                      value={callToAction || "I want this!"}
                      onChange={(e) => setCallToAction(e.target.value)}
                      className="w-full h-11 px-3 pr-10 text-base border border-gray-200 rounded-lg bg-white appearance-none cursor-pointer outline-none transition-[border-color,box-shadow]"
                    >
                      <option value="I want this!">{tt("I want this!")}</option>
                      <option value="Buy Now">{tt("Buy Now")}</option>
                      <option value="Get Access">{tt("Get Access")}</option>
                      <option value="Download Now">{tt("Download Now")}</option>
                      <option value="Purchase">{tt("Purchase")}</option>
                      <option value="Add to Cart">{tt("Add to Cart")}</option>
                      <option value="Join Now">{tt("Join Now")}</option>
                      <option value="Get it Now">{tt("Get it Now")}</option>
                      <option value="Start Now">{tt("Start Now")}</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                <div className={SWITCH_GROUP}>
                  <SwitchRow
                    title={tt("Show sales count")}
                    hint={tt("The number sold, on the product page")}
                    checked={showSalesBadge}
                    onChange={setShowSalesBadge}
                  />
                  <div>
                    <SwitchRow
                      title={tt("Limit sales")}
                      hint={tt("Stop selling after a number of copies")}
                      checked={limitSalesEnabled}
                      onChange={setLimitSalesEnabled}
                    />
                    {limitSalesEnabled && (
                      <div className="px-4 pb-3" data-sales-limit="">
                        <div className="flex items-center gap-2">
                          <Input
                            id="sales-limit"
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            placeholder="100"
                            aria-label={tt("Copies")}
                            aria-describedby={copiesSoldCount !== null ? "sales-limit-sold" : undefined}
                            value={salesLimit}
                            onChange={(e) => setSalesLimit(typedSalesLimit(e.target.value))}
                            className="h-11 w-32 rounded-[10px] border-[#e5e7eb] text-[15px] tabular-nums sm:h-9 sm:rounded-lg sm:text-sm"
                          />
                          <span className="text-[14px] text-[#6b7280]">{tt("copies")}</span>
                        </div>
                        {/* Sold so far, from the paid orders, against the number typed: the seller sees where a new limit lands before saving it. */}
                        {copiesSoldCount !== null && (() => {
                          const typed = readSalesLimit(salesLimit)
                          const over = typed !== null && copiesSoldCount >= typed
                          return (
                            <p id="sales-limit-sold" data-sales-sold="" className="mt-1.5 text-[13px] leading-5 text-[#6b7280] tabular-nums">
                              {typed !== null ? soldOfText(copiesSoldCount, typed) : tt("{value} sold so far", { value: copiesSoldCount.toLocaleString(appLocale()) })}
                              {over && <span className="font-medium text-[#b42318]"> · {tt("Sold out")}</span>}
                            </p>
                          )
                        })()}
                        {salesLimit.length >= 7 && readSalesLimit(salesLimit) === MAX_SALES_LIMIT && (
                          <p className="mt-1 text-[13px] leading-5 text-[#6b7280]">{tt("At most {value}.", { value: MAX_SALES_LIMIT.toLocaleString(appLocale()) })}</p>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <SwitchRow
                      title={tt("Refund policy")}
                      hint={tt("Shown on the product page")}
                      checked={refundPolicyEnabled}
                      onChange={setRefundPolicyEnabled}
                    />
                    {refundPolicyEnabled && (
                      <div className="px-4 pb-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowRefundPolicySheet(true)}
                        className="sm:hidden w-full h-11 justify-between rounded-[10px] text-[16px] border-[#e5e7eb] font-normal"
                      >
                        <span className="text-gray-900">{refundPolicyType === "no_refunds" ? tt("No refunds allowed") : refundPolicyType === "7_day" ? "7-day money back guarantee" : refundPolicyType === "14_day" ? "14-day money back guarantee" : "30-day money back guarantee"}</span>
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      </Button>
                      <div className="hidden sm:block relative">
                        <select
                          value={refundPolicyType}
                          onChange={(e) => setRefundPolicyType(e.target.value)}
                          className="w-full h-11 px-3 pr-10 text-base border border-gray-200 rounded-lg bg-white appearance-none cursor-pointer outline-none transition-[border-color,box-shadow]"
                        >
                          <option value="no_refunds">{tt("No refunds allowed")}</option>
                          <option value="7_day">{tt("7-day money back guarantee")}</option>
                          <option value="14_day">{tt("14-day money back guarantee")}</option>
                          <option value="30_day">{tt("30-day money back guarantee")}</option>
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                      </div>
                      </div>
                    )}
                  </div>
                </div>
                  </>
                )}
              </div>

              {/*
                SEARCH ENGINE LISTING, FOLDED. It fills itself in from the
                title and the description, so most people never need to open
                it: the card shows how the product reads in a search result,
                and the pencil folds the fields open right under it, in the
                card, at every width. "It should just slide down and reveal
                the other settings", not a sheet or a dialog over the page.

                The height goes through grid rows, 0fr to 1fr, which reaches
                the fields' own height without measuring it, and the fields
                fade and settle 4px as they come; closing is the same played
                backwards. Nothing above the card moves: it only grows
                downwards. Closed, the fields are inert, so the Tab key and a
                screen reader skip them. Once open, the card is brought into
                view if its foot is below the screen. No motion under
                reduced motion.
              */}
              <div className={CARD} data-seo-card="">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className={CARD_TITLE}>{tt("Search engine listing")}</h2>
                  </div>
                  <button
                    type="button"
                    aria-label={seoOpen ? tt("Close the search engine listing") : tt("Edit the search engine listing")}
                    aria-expanded={seoOpen}
                    aria-controls="seo-fields"
                    data-seo-edit=""
                    onClick={toggleSeo}
                    className={cn(secondaryDepth, "grid h-8 w-8 shrink-0 place-items-center rounded-lg p-0", seoOpen && "bg-[#f1f2f4]")}
                  >
                    <Pencil aria-hidden className={cn("col-start-1 row-start-1 h-3.5 w-3.5 text-[#4b5563] transition-opacity duration-150 motion-reduce:transition-none", seoOpen ? "opacity-0" : "opacity-100")} />
                    <ChevronUp aria-hidden className={cn("col-start-1 row-start-1 h-4 w-4 text-[#4b5563] transition-opacity duration-150 motion-reduce:transition-none", seoOpen ? "opacity-100" : "opacity-0")} />
                  </button>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[13px] text-[#4b5563]">
                    {tt("storelib.com/")}{(creator?.username || creator?.slug || "yourstore").toLowerCase()}/{slug || "product-url"}
                  </p>
                  <p className="mt-0.5 truncate text-[16px] leading-6 text-[#1a0dab]">{seoTitle || title || tt("Product title")}</p>
                  <p className="mt-0.5 line-clamp-2 text-[13px] leading-5 text-[#4d5156]">
                    {plainSearchPreviewDescription || tt("Add a description and it shows here.")}
                  </p>
                </div>
                <div
                  ref={seoFieldsRef}
                  id="seo-fields"
                  data-seo-fields=""
                  data-open={seoOpen ? "" : undefined}
                  inert={!seoOpen}
                  aria-hidden={!seoOpen || undefined}
                  onTransitionEnd={onSeoOpened}
                  className={cn(
                    "!mt-0 grid transition-[grid-template-rows,opacity] duration-[280ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
                    seoOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                  )}
                >
                  <div className="min-h-0 overflow-hidden">
                    <div
                      className={cn(
                        FIELD_FOCUS,
                        "-mx-[3px] space-y-4 px-[3px] pb-[3px] pt-3 transition-[translate] duration-[280ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none sm:pt-4",
                        seoOpen ? "translate-y-0" : "-translate-y-1",
                      )}
                    >
                      <div className="space-y-1.5 border-t border-[#eceef1] pt-4 sm:pt-5">
                        <Label htmlFor="seoTitle" className="text-xs sm:text-sm font-medium text-gray-700">
                          {tt("SEO title")}
                        </Label>
                        <Input
                          id="seoTitle"
                          placeholder={tt("Product title for search engines")}
                          value={seoTitle}
                          onChange={(e) => setSeoTitle(e.target.value)}
                          className="h-11 border-gray-200 text-sm sm:text-base"
                        />
                        <p className="text-[10px] sm:text-xs text-gray-400">
                          {tt("{length}/60 characters", { length: seoTitle.length })}
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="seoDescription" className="text-xs sm:text-sm font-medium text-gray-700">
                          {tt("SEO description")}
                        </Label>
                        <Textarea
                          id="seoDescription"
                          placeholder={tt("Auto-generated from your product description")}
                          value={seoDescription}
                          onChange={(e) => {
                            seoManuallyEditedRef.current = true // Track that user manually edited
                            setSeoDescription(e.target.value)
                          }}
                          className="border-gray-200 min-h-[80px] sm:min-h-[100px] text-sm sm:text-base"
                        />
                        <p className="text-[10px] sm:text-xs text-gray-400">
                          {tt("{length}/160 characters", { length: seoDescription.length })} {seoDescription.length > 160 && <span className="text-amber-500">{tt("Recommended: under 160")}</span>}
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="productUrl" className="text-xs sm:text-sm font-medium text-gray-700">
                          {tt("Product URL")}
                        </Label>
                        {/* The address in front of the slug, the way every link to it reads. */}
                        <div className="flex items-center gap-0">
                          <div className="h-11 px-3 bg-gray-100 border border-r-0 border-gray-200 rounded-l-lg flex items-center">
                            <span className="text-xs sm:text-sm text-gray-500 whitespace-nowrap">
                              {/* The address every link uses: storelib.com/<handle>/<slug> (lib/url-helpers getProductShareUrl). */}
                              {tt("storelib.com/")}{(creator?.username || creator?.slug || "yourstore").toLowerCase()}/
                            </span>
                          </div>
                          <Input
                            id="productUrl"
                            placeholder="product-url"
                            value={slug}
                            onChange={(e) => {
                              // Only allow lowercase letters, numbers, and hyphens
                              const newSlug = e.target.value
                                .toLowerCase()
                                .replace(/[^a-z0-9-]/g, '-')
                                .replace(/--+/g, '-')
                                .replace(/^-|-$/g, '')
                              setSlug(newSlug)
                            }}
                            className="h-11 border-gray-200 rounded-l-none text-sm sm:text-base flex-1"
                          />
                        </div>
                        <p className="text-[10px] sm:text-xs text-gray-400">
                          {tt("Lowercase letters, numbers and hyphens only.")}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* No translations card in the editor: a product's words reach other languages on their own when the website is published (lib/translations auto-translate), and can be edited per language in the website editor. */}
          </div>
        </div>
      </div>

      {/*
        THE FOOT BAR, FROM lg: WHERE THE FORM IS SAVED ON A COMPUTER.
        "On desktop it should be better to be at the bottom." A white bar across
        the pane, and only the pane: the rail and the header are outside it.
        What the page holds against what is saved on the left, in words; Cancel
        (or Back, with nothing to discard) and Save on the right, the same two
        buttons as the top bar below lg, with the same states and the same
        question before anything is thrown away.

        It is `position: sticky; bottom: 0` inside the pane that scrolls, the
        last box in it, not a fixed box measured against the shell: whatever
        box scrolls the page, the bar stays at the foot of it. Being in the
        flow, it keeps its own room below the last card, so scrolled to the
        end it sits under the card, never over it. The pane is a column from
        lg and the bar takes the auto margin above it, so on a short form it
        is still at the bottom. It pads itself by the home indicator's inset
        (an iPad), which is 0 in a browser.
      */}
      <div
        data-editor-foot=""
        className="sticky bottom-0 z-30 mt-auto hidden shrink-0 border-t border-[#e5e7eb] bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_-8px_rgba(17,24,39,0.10)] lg:block"
        data-app-foot="up"
      >
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-8">
          {/* The dot is always there, so the words never move when they change: the Products list's green and amber, the violet of Save for a change to save, grey otherwise. */}
          <p data-editor-state={saveState} className="flex min-w-0 items-center gap-2 text-[14px] leading-5">
            <span
              aria-hidden
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                saveState === "Live" ? "bg-[#22a06b]" : saveState === "Draft" ? "bg-[#e0a100]" : saveState === "Unsaved changes" ? "bg-[#8b5cf6]" : "bg-[#b6bac1]",
              )}
            />
            <span className={cn("truncate", saveState === "Unsaved changes" ? "font-medium text-[#1a1a2e]" : "text-[#6b7280]")}>{tt(saveState)}</span>
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <LeaveButton mode={leaveMode} disabled={saveBusy} leaving={leaving} asks={hasUnsavedChanges} onLeave={() => void handleCancel()} />
            <SaveButton phase={savePhase} disabled={!canSave} saved={savedThisVisit} onSave={() => void handleSaveChanges()} />
          </div>
        </div>
      </div>

      {/* CTA Bottom Sheet */}
      <MobileSheet isOpen={showCtaSheet} onClose={() => setShowCtaSheet(false)} kept={isMobileViewport}>
        <div className="px-5 pb-6 space-y-1">
          <h3 className="text-base font-semibold text-gray-900 mb-3">{tt("Call to Action")}</h3>
          {[tt("I want this!"), tt("Buy Now"), tt("Get Access"), tt("Download Now"), tt("Purchase"), tt("Add to Cart"), tt("Join Now"), tt("Get it Now"), tt("Start Now")].map((cta) => (
            <button
              key={cta}
              type="button"
              onClick={() => { setCallToAction(cta); setShowCtaSheet(false) }}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm transition-all ${
                (callToAction || "I want this!") === cta
                  ? "bg-[#f1f2f4] text-[#1a1a2e] font-medium"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span>{cta}</span>
              {(callToAction || "I want this!") === cta && <Check className="h-4 w-4 text-[#1a1a2e]" strokeWidth={2.5} />}
            </button>
          ))}
        </div>
      </MobileSheet>

      {/* Refund Policy Bottom Sheet */}
      <MobileSheet isOpen={showRefundPolicySheet} onClose={() => setShowRefundPolicySheet(false)} maxHeight="85vh" kept={isMobileViewport}>
        <div className="px-5 pb-6 space-y-1">
          <h3 className="text-base font-semibold text-gray-900 mb-3">{tt("Refund Policy")}</h3>
          {[
            { value: "no_refunds", label: tt("No refunds allowed") },
            { value: "7_day", label: "7-day money back guarantee" },
            { value: "14_day", label: "14-day money back guarantee" },
            { value: "30_day", label: "30-day money back guarantee" },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => { setRefundPolicyType(option.value); setShowRefundPolicySheet(false) }}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm transition-all ${
                refundPolicyType === option.value
                  ? "bg-[#f1f2f4] text-[#1a1a2e] font-medium"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span>{option.label}</span>
              {refundPolicyType === option.value && <Check className="h-4 w-4 text-[#1a1a2e]" strokeWidth={2.5} />}
            </button>
          ))}
        </div>
      </MobileSheet>

      {/* Leave without saving, delete a file, a very large upload: one question, a sheet on a phone (./confirm-sheet). */}
      {confirmSheet}
    </div>
  )
}
