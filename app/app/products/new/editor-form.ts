/**
 * ===========================================================================
 *  THE PRODUCT FORM'S FIRST FRAME
 * ===========================================================================
 * The editor used to open empty and fill itself in: it waited 300ms on
 * purpose, then asked Supabase who was signed in, then for the creator, the
 * profile, the product, its files and its variants, one after another, and
 * set each field as its answer came back. The page's frame appeared first
 * and the product arrived into it, pictures last.
 *
 * Now the server page reads all of that in one parallel round
 * (app/app/products/load-editor.ts) and hands the rows to the editor, and
 * this turns them into the form's starting values before anything is drawn.
 * Pure, so the same rows always make the same form, and a test can say so.
 */

export interface UploadedFile {
  id?: string
  file_name: string
  file_path: string
  file_size: number
  mime_type?: string
  /**
   * The file check's verdict when the editor opened (lib/security/uploads).
   * Only "blocked" (or the older "infected" and "quarantined") changes the
   * row: it says the file was not accepted. Nothing else is ever shown.
   */
  scan_status?: string | null
}

export interface MediaItem {
  id: string
  type: "image" | "youtube"
  url: string
  thumbnailUrl?: string
}

export interface ProductVariant {
  id: string
  name: string
  description: string
  price: string // FINAL price for this variant (not additional)
  compareAtPrice: string // Compare-at price for showing sale/discount
  maxPurchases: string
  isExpanded: boolean
  assignedFiles: string[] // IDs of assigned digital files
  payWhatYouWant: boolean
  pwywMinPrice: string
  pwywSuggestedPrice: string
}

export interface FAQItem {
  id: string
  question: string
  answer: string
  isDefault?: boolean
}

/** What a new product starts with: 3 defaults, up to 8 in all. */
export const DEFAULT_WHATS_INCLUDED = ["Instant download access", "All included files", "Lifetime access"]

/* A product that ships starts with what a buyer of one asks: when it arrives and what if it doesn't fit. */
export const PHYSICAL_WHATS_INCLUDED: string[] = []

export const PHYSICAL_FAQS: FAQItem[] = [
  { id: "physical-1", question: "When will my order arrive?", answer: "You'll see delivery options and times at checkout, and you'll get an email with tracking when it ships.", isDefault: true },
  { id: "physical-2", question: "Can I return it?", answer: "Returns are set by the shop. You can ask for one from your order page.", isDefault: true },
]

export const DEFAULT_FAQS: FAQItem[] = [
  { id: "default-1", question: "How do I access my purchase?", answer: "After checkout, download immediately on the download page. You'll also receive an email with the download link.", isDefault: true },
  { id: "default-2", question: "Is there a refund policy?", answer: "Refund policies are set by individual creators. Check product info or contact the seller for details.", isDefault: true },
  { id: "default-3", question: "How long do I have access?", answer: "You have lifetime access to all purchased content. Once you buy, it's yours forever.", isDefault: true },
]

/*
  A COURSE IS NOT A DOWNLOAD. A new course used to open with the digital
  product's lines ("Instant download access", "download immediately on the
  download page"), which are not true of lessons that play in the library.
  So a course starts with its own, and a switch between the two kinds swaps
  them while they are still the untouched defaults (swapDefaults).
*/
export const COURSE_WHATS_INCLUDED = ["Every lesson, to watch at your own pace", "Your place kept in each lesson", "Lifetime access"]

export const COURSE_FAQS: FAQItem[] = [
  { id: "default-1", question: "How do I watch the course?", answer: "After checkout the course is in your library. Lessons play in your browser and in the Storelib app, and each one picks up where you left off.", isDefault: true },
  DEFAULT_FAQS[1],
  { id: "default-3", question: "How long do I have access?", answer: "For good. Every lesson stays in your library, including the ones added later.", isDefault: true },
]

function sameList<T>(a: T[], b: T[], key: (x: T) => string): boolean {
  return a.length === b.length && a.every((x, i) => key(x) === key(b[i]))
}

/** The new product's lists for a kind; for a switch of kind, the other kind's defaults become this one's, and anything the creator wrote stays. */
export function swapDefaults(kind: "digital" | "course", whatsIncluded: string[], faqs: FAQItem[]): { whatsIncluded: string[]; faqs: FAQItem[] } {
  const [from, fromFaqs, to, toFaqs] = kind === "course" ? [DEFAULT_WHATS_INCLUDED, DEFAULT_FAQS, COURSE_WHATS_INCLUDED, COURSE_FAQS] : [COURSE_WHATS_INCLUDED, COURSE_FAQS, DEFAULT_WHATS_INCLUDED, DEFAULT_FAQS]
  const faqKey = (f: FAQItem) => `${f.question}\n${f.answer}`
  return {
    whatsIncluded: sameList(whatsIncluded, from, (x) => x) ? to : whatsIncluded,
    faqs: sameList(faqs, fromFaqs, faqKey) ? toFaqs : faqs,
  }
}

/* ── The rows the server reads ─────────────────────────────────────────── */

export interface EditorProductRow {
  id: string
  creator_id?: string
  title?: string | null
  description?: string | null
  price_cents?: number | null
  compare_at_cents?: number | null
  slug?: string | null
  type?: string | null
  status?: string | null
  show_sales_badge?: boolean | null
  refund_policy_enabled?: boolean | null
  refund_policy_type?: string | null
  seo_title?: string | null
  seo_description?: string | null
  call_to_action?: string | null
  category?: string | null
  pay_what_you_want?: boolean | null
  pwyw_min_price_cents?: number | null
  pwyw_suggested_price_cents?: number | null
  video_url?: string | null
  thumbnail_url?: string | null
  gallery_urls?: string[] | null
  whats_included?: unknown
  faqs?: unknown
}

export interface EditorAssetRow {
  id: string
  file_name: string
  file_path: string
  file_size: number
  mime_type?: string | null
  scan_status?: string | null
}

export interface EditorVariantRow {
  id: string
  name: string
  description?: string | null
  price_cents?: number | null
  compare_at_price_cents?: number | null
  max_purchases?: number | null
  position?: number | null
  pay_what_you_want?: boolean | null
  pwyw_min_price_cents?: number | null
  pwyw_suggested_price_cents?: number | null
  product_variant_files?: { digital_asset_id: string }[] | null
}

export interface LoadedProduct {
  product: EditorProductRow
  assets: EditorAssetRow[]
  variants: EditorVariantRow[]
  /** The variants could not be read: none are shown, and a save keeps the saved ones rather than deleting them. */
  variantsUnread?: boolean
}

export interface EditorCreator {
  id: string
  slug: string | null
  username: string | null
  stripe_account_id?: string | null
  stripe_onboarding_status?: string | null
  /** Checkout can take money for this creator, on Stripe or on Airwallex (lib/home/progress paymentsReadyFrom, lib/payments/readiness). */
  payments_ready?: boolean
}

/* ── Rows to fields ───────────────────────────────────────────────────── */

const dollars = (cents: number | null | undefined, empty = ""): string => (cents ? (cents / 100).toString() : empty)

/** A YouTube address's video id, or null. */
export const parseYouTubeUrl = (url: string): string | null => {
  const patterns = [/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/, /^([a-zA-Z0-9_-]{11})$/]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

const isYouTubeThumbnail = (url: string | null | undefined) => !!url && (url.includes("img.youtube.com") || url.includes("i.ytimg.com"))

/** The video first, then the pictures, as the product page shows them. */
export function mediaOf(product: EditorProductRow): MediaItem[] {
  const media: MediaItem[] = []
  if (product.video_url) {
    const videoId = parseYouTubeUrl(product.video_url)
    if (videoId) media.push({ id: `youtube-${videoId}`, type: "youtube", url: product.video_url })
  }
  if (product.thumbnail_url && !isYouTubeThumbnail(product.thumbnail_url)) {
    media.push({ id: "image-0", type: "image", url: product.thumbnail_url })
  }
  if (Array.isArray(product.gallery_urls)) {
    product.gallery_urls.forEach((url, idx) => {
      if (url !== product.thumbnail_url && !isYouTubeThumbnail(url)) media.push({ id: `image-${idx + 1}`, type: "image", url })
    })
  }
  return media
}

/** Each variant once, in position order, even if the table holds a duplicate. */
export function variantsOf(rows: EditorVariantRow[]): ProductVariant[] {
  const seen = new Set<string>()
  return [...rows]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .filter((v) => (seen.has(v.id) ? false : (seen.add(v.id), true)))
    .map((v) => ({
      id: v.id,
      name: v.name,
      description: v.description || "",
      price: dollars(v.price_cents, "0"),
      compareAtPrice: dollars(v.compare_at_price_cents),
      maxPurchases: v.max_purchases ? v.max_purchases.toString() : "",
      isExpanded: false,
      assignedFiles: v.product_variant_files?.map((f) => f.digital_asset_id) || [],
      payWhatYouWant: v.pay_what_you_want || false,
      pwywMinPrice: dollars(v.pwyw_min_price_cents),
      pwywSuggestedPrice: dollars(v.pwyw_suggested_price_cents),
    }))
}

export interface EditorForm {
  productId: string | null
  title: string
  description: string
  price: string
  compareAtPrice: string
  slug: string
  productType: "digital" | "course" | "physical"
  isPublished: boolean
  showSalesBadge: boolean
  refundPolicyEnabled: boolean
  refundPolicyType: string
  seoTitle: string
  seoDescription: string
  /** A saved SEO description is the creator's, and is not rewritten from the description. */
  seoEdited: boolean
  callToAction: string
  selectedCategory: string | null
  payWhatYouWant: boolean
  pwywMinPrice: string
  pwywSuggestedPrice: string
  mediaItems: MediaItem[]
  digitalFiles: UploadedFile[]
  variants: ProductVariant[]
  whatsIncluded: string[]
  faqs: FAQItem[]
}

export function initialForm(loaded: LoadedProduct | null, startAs: "digital" | "course" | "physical" = "digital"): EditorForm {
  if (!loaded) {
    const course = startAs === "course"
    return {
      productId: null,
      title: "",
      description: "",
      price: "",
      compareAtPrice: "",
      slug: "",
      productType: startAs,
      isPublished: false,
      showSalesBadge: true,
      refundPolicyEnabled: false,
      refundPolicyType: "7_day",
      seoTitle: "",
      seoDescription: "",
      seoEdited: false,
      callToAction: "",
      selectedCategory: null,
      payWhatYouWant: false,
      pwywMinPrice: "",
      pwywSuggestedPrice: "",
      mediaItems: [],
      digitalFiles: [],
      variants: [],
      whatsIncluded: course ? COURSE_WHATS_INCLUDED : startAs === "physical" ? PHYSICAL_WHATS_INCLUDED : DEFAULT_WHATS_INCLUDED,
      faqs: course ? COURSE_FAQS : startAs === "physical" ? PHYSICAL_FAQS : DEFAULT_FAQS,
    }
  }
  const { product, assets, variants } = loaded
  const faqs = Array.isArray(product.faqs)
    ? (product.faqs as { question?: string; answer?: string }[]).map((faq, idx) => ({
        id: `loaded-${idx}`,
        question: faq?.question || "",
        answer: faq?.answer || "",
        isDefault: false,
      }))
    : DEFAULT_FAQS
  return {
    productId: product.id,
    title: product.title || "",
    description: product.description || "",
    price: dollars(product.price_cents),
    compareAtPrice: dollars(product.compare_at_cents),
    slug: product.slug || "",
    /* A physical product stays physical: saving it as "digital" would put a shipped item on the download checkout. */
    productType: product.type === "course" ? "course" : product.type === "physical" ? "physical" : "digital",
    isPublished: product.status === "published",
    showSalesBadge: product.show_sales_badge !== false,
    refundPolicyEnabled: product.refund_policy_enabled || false,
    refundPolicyType: product.refund_policy_type || "7_day",
    seoTitle: product.seo_title || "",
    seoDescription: product.seo_description || "",
    seoEdited: !!product.seo_description?.trim(),
    callToAction: product.call_to_action || "",
    selectedCategory: product.category || null,
    payWhatYouWant: product.pay_what_you_want || false,
    pwywMinPrice: dollars(product.pwyw_min_price_cents),
    pwywSuggestedPrice: dollars(product.pwyw_suggested_price_cents),
    mediaItems: mediaOf(product),
    digitalFiles: assets.map((a) => ({
      id: a.id,
      file_name: a.file_name,
      file_path: a.file_path,
      file_size: a.file_size,
      mime_type: a.mime_type ?? undefined,
      ...(a.scan_status ? { scan_status: a.scan_status } : {}),
    })),
    variants: variantsOf(variants),
    whatsIncluded: Array.isArray(product.whats_included) ? (product.whats_included as string[]) : DEFAULT_WHATS_INCLUDED,
    faqs,
  }
}

/**
 * What "unsaved" is measured against: the fields a creator edits, in one
 * fixed order, so the same values always make the same string. Compare at
 * price is in it now; changing only that used to leave Save greyed out.
 */
export interface SnapshotFields {
  title: string
  description: string
  price: string
  compareAtPrice: string
  mediaItems: MediaItem[]
  digitalFiles: UploadedFile[]
  variants: ProductVariant[]
  whatsIncluded: string[]
  faqs: FAQItem[]
  selectedCategory: string | null
  limitSalesEnabled: boolean
  salesLimit: string
  callToAction: string
  showSalesBadge: boolean
  refundPolicyEnabled: boolean
  refundPolicyType: string
  payWhatYouWant: boolean
  pwywMinPrice: string
  pwywSuggestedPrice: string
}

/**
 * A variant as far as "unsaved" goes: what it says, not whether its card is
 * open or which id it has. Opening a variant used to count as a change, and
 * so did a new variant taking its saved id, so a product with a new variant
 * read "Unsaved changes" the moment it was saved.
 */
function variantContent({ id: _id, isExpanded: _open, ...rest }: ProductVariant) {
  return rest
}

export function snapshotOf(v: SnapshotFields): string {
  return JSON.stringify([
    v.title, v.description, v.price, v.compareAtPrice, v.mediaItems, v.digitalFiles, v.variants.map(variantContent),
    v.whatsIncluded, v.faqs, v.selectedCategory, v.limitSalesEnabled, v.salesLimit, v.callToAction,
    v.showSalesBadge, v.refundPolicyEnabled, v.refundPolicyType, v.payWhatYouWant, v.pwywMinPrice, v.pwywSuggestedPrice,
  ])
}

/** The snapshot of a form as it opens: the saved product, so it opens clean. */
export function snapshotOfForm(form: EditorForm): string {
  return snapshotOf({ ...form, limitSalesEnabled: false, salesLimit: "" })
}
