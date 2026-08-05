"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Camera, Check, ChevronRight, Info, Loader2, Plus, Search, X } from "lucide-react"
import {
  CATEGORY_INDEX,
  COLOURS,
  CONDITIONS,
  DESCRIPTION_PLACEHOLDER,
  ERAS,
  LISTING_CATEGORIES,
  MAX_PHOTOS,
  MIN_PHOTOS,
  SIZES,
  SOURCES,
  STYLES,
  categoryLabelFor,
  type Option,
} from "@/lib/marketplace/listing-taxonomy"
import { triggerHaptic } from "@/lib/native-bridge"
import { DragSheet } from "@/components/ui/drag-sheet"
import { cn } from "@/lib/utils"

type Photo = { id: string; url: string | null; uploading: boolean; localUrl: string }

/** A tappable row that shows what's chosen and opens its picker. */
function Field({
  label,
  value,
  onClick,
  required,
}: {
  label: string
  value: string | null
  onClick: () => void
  required?: boolean
}) {
  return (
    <button
      type="button"
      onClick={() => {
        void triggerHaptic("light")
        onClick()
      }}
      className="flex w-full items-center justify-between gap-3 border-b border-neutral-100 py-3.5 text-left last:border-b-0"
    >
      <span className="shrink-0 text-[15px] text-neutral-900">
        {label}
        {required && <span className="ml-0.5 text-[#7c3aed]">*</span>}
      </span>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className={cn("truncate text-[15px]", value ? "text-neutral-900" : "text-neutral-400")}>
          {value || "Alege"}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300" />
      </span>
    </button>
  )
}

function Chip({ option, selected, onClick }: { option: Option; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        void triggerHaptic("light")
        onClick()
      }}
      className={cn(
        "rounded-full px-3.5 py-2 text-[13.5px] font-medium transition-colors duration-200",
        selected ? "bg-[#7c3aed] text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200",
      )}
    >
      {option.label}
    </button>
  )
}

export function NewListingForm() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [photos, setPhotos] = useState<Photo[]>([])
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [group, setGroup] = useState<string | null>(null)
  const [item, setItem] = useState<string | null>(null)
  const [brand, setBrand] = useState<string | null>(null)
  const [condition, setCondition] = useState<string | null>(null)
  const [colour, setColour] = useState<string | null>(null)
  const [size, setSize] = useState<string | null>(null)
  const [era, setEra] = useState<string | null>(null)
  const [sources, setSources] = useState<string[]>([])
  const [styles, setStyles] = useState<string[]>([])
  const [price, setPrice] = useState("")
  const [compareAt, setCompareAt] = useState("")
  const [postAnother, setPostAnother] = useState(false)

  const [sheet, setSheet] = useState<null | "category" | "brand" | "condition" | "colour" | "size" | "era" | "source" | "style">(null)
  const [catQuery, setCatQuery] = useState("")
  const [brandQuery, setBrandQuery] = useState("")
  const [brands, setBrands] = useState<{ name: string; slug: string }[]>([])
  const [saving, setSaving] = useState<null | "draft" | "post">(null)
  const [error, setError] = useState<string | null>(null)
  const [posted, setPosted] = useState(false)

  // ---- photos ----
  const addFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return
    const room = MAX_PHOTOS - photos.length
    const chosen = Array.from(files).slice(0, Math.max(0, room))
    const staged: Photo[] = chosen.map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      url: null,
      uploading: true,
      // Shown immediately from the local file, so the tile is never an empty
      // box waiting on a network round trip.
      localUrl: URL.createObjectURL(f),
    }))
    setPhotos((p) => [...p, ...staged])

    await Promise.all(
      chosen.map(async (file, i) => {
        const fd = new FormData()
        fd.append("file", file)
        try {
          const res = await fetch("/api/listings/photo", { method: "POST", body: fd, credentials: "include" })
          const data = await res.json()
          setPhotos((p) =>
            p.map((ph) => (ph.id === staged[i].id ? { ...ph, url: data?.url ?? null, uploading: false } : ph)),
          )
        } catch {
          setPhotos((p) => p.filter((ph) => ph.id !== staged[i].id))
        }
      }),
    )
  }, [photos.length])

  const removePhoto = useCallback((id: string) => {
    setPhotos((p) => p.filter((ph) => ph.id !== id))
  }, [])

  // Drag to reorder. HTML5 drag on desktop, long-press-free reordering on touch
  // via the same index swap — the first photo is the cover, so ordering matters.
  const dragIndex = useRef<number | null>(null)
  const onDragStart = (i: number) => () => {
    dragIndex.current = i
  }
  const onDragOver = (i: number) => (e: React.DragEvent) => {
    e.preventDefault()
    const from = dragIndex.current
    if (from === null || from === i) return
    setPhotos((p) => {
      const next = [...p]
      const [moved] = next.splice(from, 1)
      next.splice(i, 0, moved)
      return next
    })
    dragIndex.current = i
  }

  /**
   * The slide up, and the way back out.
   *
   * `entering` is set in a LAYOUT effect rather than at first render so the
   * server and the client agree on the markup — and layout effects run before
   * paint, so the class is on the element for its first frame and the sheet
   * starts from off-screen instead of one frame in.
   *
   * It is taken off again on a timer. The animation ends at `transform: none`
   * so nothing is left behind either way, but `will-change: transform` would
   * otherwise keep a full-screen compositor layer alive for as long as the form
   * is open, which is exactly the screen where you least want one: every keypress
   * in a textarea would repaint against it.
   */
  const [entering, setEntering] = useState(false)
  useLayoutEffect(() => {
    setEntering(true)
    const t = window.setTimeout(() => setEntering(false), 460)
    return () => window.clearTimeout(t)
  }, [])

  /**
   * Closing. Back if there is anywhere to go back to, the feed otherwise.
   *
   * A sheet opened from the + in the tab bar always has history behind it, so
   * `router.back()` returns you to whatever you were looking at rather than
   * dropping you on the feed — which is the difference between a sheet closing
   * and a navigation happening. A cold arrival (a shared link to /products/new,
   * an app launched straight into it) has nothing to pop, and `router.back()`
   * on an empty stack does nothing at all, which would leave the only way out
   * of a full-screen form dead.
   */
  const close = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back()
    else router.push("/")
  }, [router])

  // ---- brand search ----
  useEffect(() => {
    if (sheet !== "brand") return
    let cancelled = false
    const id = setTimeout(() => {
      fetch(`/api/brands?q=${encodeURIComponent(brandQuery)}`)
        .then((r) => (r.ok ? r.json() : { brands: [] }))
        .then((d) => {
          if (!cancelled) setBrands(Array.isArray(d?.brands) ? d.brands : [])
        })
        .catch(() => {})
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [sheet, brandQuery])

  const catResults = useMemo(() => {
    const q = catQuery.trim().toLowerCase()
    if (!q) return null
    return CATEGORY_INDEX.filter(
      (c) => c.item.label.toLowerCase().includes(q) || c.groupLabel.toLowerCase().includes(q),
    ).slice(0, 40)
  }, [catQuery])

  const toggleIn = (list: string[], id: string, max: number) =>
    list.includes(id) ? list.filter((x) => x !== id) : list.length >= max ? list : [...list, id]

  const label = (opts: Option[], id: string | null) => opts.find((o) => o.id === id)?.label ?? null

  const uploaded = photos.filter((p) => p.url)
  const priceCents = Math.round(parseFloat(price.replace(",", ".")) * 100)
  const compareCents = compareAt ? Math.round(parseFloat(compareAt.replace(",", ".")) * 100) : null

  const missing = useMemo(() => {
    const m: string[] = []
    if (uploaded.length < MIN_PHOTOS) m.push(`cel puțin ${MIN_PHOTOS} fotografii`)
    if (!title.trim()) m.push("titlu")
    if (description.trim().length < 10) m.push("descriere")
    if (!group || !item) m.push("categorie")
    if (!brand) m.push("brand")
    if (!condition) m.push("stare")
    if (!colour) m.push("culoare")
    if (!size) m.push("mărime")
    if (!Number.isFinite(priceCents) || priceCents < 0) m.push("preț")
    if (compareCents !== null && Number.isFinite(priceCents) && compareCents <= priceCents)
      m.push("prețul comparativ trebuie să fie mai mare decât prețul")
    return m
  }, [uploaded.length, title, description, group, item, brand, condition, colour, size, priceCents, compareCents])

  const submit = useCallback(
    async (draft: boolean) => {
      setError(null)
      if (!draft && missing.length) {
        setError(`Mai lipsește: ${missing.join(", ")}.`)
        return
      }
      setSaving(draft ? "draft" : "post")
      try {
        const res = await fetch("/api/listings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            draft,
            photos: uploaded.map((p) => p.url),
            title: title.trim(),
            description: description.trim(),
            price_cents: Number.isFinite(priceCents) ? priceCents : 0,
            compare_at_cents: compareCents,
            category: group,
            subcategory: item,
            brand,
            condition,
            colour,
            size,
            era,
            source_tags: sources,
            style_tags: styles,
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          if (res.status === 401) {
            router.push("/login?redirect=/products/new")
            return
          }
          // Show what the server actually said. "Try again" told you nothing
          // and repeating the same request would have failed the same way.
          setError(
            data?.fields?.length
              ? `Mai lipsește: ${data.fields.join(", ")}.`
              : data?.message
                ? `Nu am putut publica anunțul: ${data.message}`
                : "Nu am putut publica anunțul. Încearcă din nou.",
          )
          setSaving(null)
          return
        }
        setPosted(true)
        // Straight to the listing you just made — the only proof it's actually
        // live, and the page you'd navigate to yourself anyway. Home told you
        // nothing and left you hunting for it in the feed.
        setTimeout(() => {
          if (draft) router.push("/products/drafts")
          else if (postAnother) window.location.assign("/products/new")
          else if (data?.slug) router.push(`/products/${data.slug}`)
          else router.push("/")
        }, 1250)
      } catch {
        setError("Ceva n-a mers. Verifică conexiunea și încearcă din nou.")
        setSaving(null)
      }
    },
    [missing, uploaded, title, description, priceCents, compareCents, group, item, brand, condition, colour, size, era, sources, styles, postAnother, router],
  )

  // One definition rendered in two places — the phone's pinned bottom bar and
  // the desktop sticky card — so the two sets of controls can never drift
  // apart in copy, state, or behaviour.
  const actionControls = (
    <>
      <label className="flex items-center gap-2.5 text-[13.5px] text-neutral-600">
        <input
          type="checkbox"
          checked={postAnother}
          onChange={(e) => setPostAnother(e.target.checked)}
          className="h-4 w-4 accent-[#7c3aed]"
        />
        Publică și adaugă încă un articol
      </label>

      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={() => {
            void triggerHaptic("light")
            void submit(true)
          }}
          disabled={saving !== null}
          className="h-12 flex-1 rounded-full bg-neutral-100 text-[15px] font-semibold text-neutral-700 transition-transform duration-200 active:scale-[0.98] disabled:opacity-60"
        >
          Salvează
        </button>
        <button
          type="button"
          onClick={() => {
            void triggerHaptic("light")
            void submit(false)
          }}
          disabled={saving !== null}
          className="flex h-12 flex-[2] items-center justify-center gap-2 rounded-full bg-[#7c3aed] text-[15.5px] font-semibold text-white shadow-[0_4px_16px_-4px_rgba(124,58,237,0.6)] transition-transform duration-200 active:scale-[0.98] disabled:opacity-60"
        >
          {saving === "post" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Publică anunțul
        </button>
      </div>
    </>
  )

  return (
    /**
     * A SHEET ON A PHONE, A PAGE ON A MONITOR.
     *
     * `fixed inset-0` and a flex column: header, one scroller, footer. Three
     * things follow from that and all three were problems before.
     *
     * It is genuinely full screen. It used to be a page inside the app shell,
     * under the search-and-categories strip and above the tab bar, so the form
     * you were filling in had about two thirds of the screen and two rows of
     * chrome belonging to other parts of the app.
     *
     * Nothing inside it is `position: fixed` any more. The Publish bar was
     * `fixed bottom-[62px] z-90`, a number chosen to clear a tab bar that is no
     * longer there — and a fixed child cannot survive the slide, because a
     * transformed ancestor becomes its containing block. As a flex row at the
     * bottom of the column it is simply always at the bottom, with no magic
     * numbers and nothing to re-anchor.
     *
     * And the scroll belongs to the middle. `min-h-0` is what makes that work:
     * a flex child will not shrink below its content without it, so the
     * scroller grows instead of scrolling and the footer is pushed off the
     * bottom of the screen.
     *
     * From `md` up every one of those reverts and it is the ordinary two-column
     * page it was.
     */
    <div
      className={cn(
        "fixed inset-0 z-[95] flex flex-col bg-[#f6f6f7] md:static md:z-auto md:block md:pb-20",
        entering && "sell-sheet-enter",
      )}
    >
      {/* The header. An X and a title, like every sheet on a phone — and it
          pays the status-bar inset itself, because the strip that used to do
          that for this route is gone. */}
      <header
        className="shrink-0 border-b border-neutral-200/80 bg-white/95 backdrop-blur-md md:hidden"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="relative flex h-14 items-center justify-center px-2">
          <button
            type="button"
            onClick={() => {
              void triggerHaptic("light")
              close()
            }}
            aria-label="Închide"
            className="absolute left-1 flex h-11 w-11 items-center justify-center rounded-full text-neutral-900 transition-transform active:scale-[0.97]"
          >
            <X className="h-[23px] w-[23px]" strokeWidth={2.2} />
          </button>
          <h1 className="text-[17px] font-semibold tracking-[-0.01em] text-neutral-900">
            Vinde un articol
          </h1>
        </div>
      </header>

      {/* The one scroller. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain md:overflow-visible">
      <div className="mx-auto w-full max-w-2xl px-4 pt-4 sm:pt-9 md:max-w-5xl">
      <header className="mb-5 hidden md:block">
        <h1 className="text-[26px] font-bold tracking-[-0.02em] text-neutral-900 sm:text-[32px]">
          Listează un articol
        </h1>
        <p className="mt-1 text-[14.5px] text-neutral-500">
          Completează detaliile și anunțul tău apare instant în feed.
        </p>
      </header>

      {/* Desktop splits the form in two: media and prose on the left, the
          attribute pickers and price on the right. On phones the grid
          collapses back to the exact single-column order it always had, and
          the columns must NOT be items-start: the right column has to stretch
          to the full row height so the sticky action card inside it has room
          to travel while the long left column scrolls. */}
      <div className="md:grid md:grid-cols-2 md:gap-6">
      <div className="min-w-0">
      {/* ---- Photos ---- */}
      <section className="mb-3.5 rounded-2xl border border-neutral-200/70 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-neutral-900">
            Fotografii<span className="ml-0.5 text-[#7c3aed]">*</span>
          </h2>
          <span className="text-[13px] text-neutral-400">
            {photos.length}/{MAX_PHOTOS}
          </span>
        </div>
        <p className="mt-1 text-[13px] text-neutral-500">
          Prima fotografie este coperta. Trage de ele ca să le rearanjezi.
        </p>

        {/* NOTHING YET: one target the size of the job.
            A 4-column grid of empty squares asks you to aim at a thumbnail
            before a single photo exists, and the first one is the whole reason
            anybody opens this screen. Once there IS a photo the grid below is
            right — it is showing you what you have — so this stands in only
            while there is nothing to show. */}
        {photos.length === 0 && (
          <button
            type="button"
            onClick={() => {
              void triggerHaptic("light")
              fileRef.current?.click()
            }}
            className="mt-3 flex w-full flex-col items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed border-neutral-200 bg-neutral-50/60 px-4 py-9 transition-colors active:border-[#7c3aed] active:bg-violet-50/50"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#7c3aed] shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              <Camera className="h-[21px] w-[21px]" />
            </span>
            <span className="text-[15px] font-semibold text-neutral-900">Încarcă fotografii</span>
            <span className="text-[12.5px] text-neutral-500">
              Minimum {MIN_PHOTOS}. Lumină bună, fundal simplu.
            </span>
          </button>
        )}

        <div className={cn("grid grid-cols-4 gap-2 sm:grid-cols-5", photos.length > 0 && "mt-3")}>
          {photos.map((p, i) => (
            <div
              key={p.id}
              draggable
              onDragStart={onDragStart(i)}
              onDragOver={onDragOver(i)}
              className="group relative aspect-[3/4] cursor-grab overflow-hidden rounded-xl bg-neutral-100 active:cursor-grabbing"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url || p.localUrl} alt="" className="h-full w-full object-cover" />
              {p.uploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                </div>
              )}
              {i === 0 && !p.uploading && (
                <span className="absolute left-1 top-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  Copertă
                </span>
              )}
              <button
                type="button"
                onClick={() => removePhoto(p.id)}
                aria-label="Șterge fotografia"
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          {photos.length < MAX_PHOTOS && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-neutral-200 text-neutral-400 transition-colors hover:border-[#7c3aed] hover:text-[#7c3aed]"
            >
              <Camera className="h-5 w-5" />
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {/* `capture` is deliberately absent: without it iOS offers the full
            sheet — camera, photo library, files — which is what people expect. */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void addFiles(e.target.files)
            e.target.value = ""
          }}
        />
      </section>

      {/* ---- Title + description ---- */}
      <section className="mb-3.5 rounded-2xl border border-neutral-200/70 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5">
        <label className="block text-[15px] font-semibold text-neutral-900">
          Titlu<span className="ml-0.5 text-[#7c3aed]">*</span>
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          placeholder="Ex: Hanorac Nike vintage verde"
          className="mt-2 w-full rounded-xl border border-neutral-200 bg-neutral-50/70 px-3.5 py-3 text-[15px] outline-none transition-all focus:border-[#7c3aed] focus:bg-white focus:ring-4 focus:ring-violet-100"
        />

        <label className="mt-6 block text-[15px] font-semibold text-neutral-900">
          Descriere<span className="ml-0.5 text-[#7c3aed]">*</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          maxLength={1500}
          placeholder={DESCRIPTION_PLACEHOLDER}
          className="mt-2 w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50/70 px-3.5 py-3 text-[15px] leading-relaxed outline-none transition-all focus:border-[#7c3aed] focus:bg-white focus:ring-4 focus:ring-violet-100"
        />
        <p className="mt-1.5 text-[12.5px] text-neutral-400">
          Spune starea, materialul și cum vine pe corp. Anunțurile detaliate se vând mai repede.
        </p>
      </section>
      </div>

      <div className="min-w-0">
      {/* ---- Details ---- */}
      <section className="mb-3.5 rounded-2xl border border-neutral-200/70 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5">
        <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-neutral-900">Detalii</h2>
        <div className="mt-1">
          <Field label="Categorie" required value={categoryLabelFor(group, item)} onClick={() => setSheet("category")} />
          <Field label="Brand" required value={brand} onClick={() => setSheet("brand")} />
          <Field label="Stare" required value={label(CONDITIONS, condition)} onClick={() => setSheet("condition")} />
          <Field label="Mărime" required value={label(SIZES, size)} onClick={() => setSheet("size")} />
          <Field label="Culoare" required value={label(COLOURS, colour)} onClick={() => setSheet("colour")} />
          <Field label="Tip" value={sources.length ? sources.map((s) => label(SOURCES, s)).join(", ") : null} onClick={() => setSheet("source")} />
          <Field label="Epocă" value={label(ERAS, era)} onClick={() => setSheet("era")} />
          <Field label="Stil" value={styles.length ? styles.map((s) => label(STYLES, s)).join(", ") : null} onClick={() => setSheet("style")} />
        </div>
      </section>

      {/* ---- Price ---- */}
      <section className="mb-3.5 rounded-2xl border border-neutral-200/70 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5">
        <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-neutral-900">Preț</h2>
        <div className="mt-3 flex gap-3">
          <div className="flex-1">
            <label className="block text-[13px] text-neutral-500">
              Preț<span className="ml-0.5 text-[#7c3aed]">*</span>
            </label>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^0-9.,]/g, ""))}
              inputMode="decimal"
              placeholder="0"
              className="mt-1.5 w-full rounded-xl border border-neutral-200 bg-neutral-50/70 px-3.5 py-3 text-[15px] outline-none transition-all focus:border-[#7c3aed] focus:bg-white focus:ring-4 focus:ring-violet-100"
            />
          </div>
          <div className="flex-1">
            <label className="flex items-center gap-1 text-[13px] text-neutral-500">
              Preț comparativ
              <span className="group relative inline-flex">
                <Info className="h-3.5 w-3.5 text-neutral-400" />
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 w-56 -translate-x-1/2 rounded-lg bg-neutral-800 px-2.5 py-2 text-[11.5px] leading-snug text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  Prețul de dinainte de reducere. Trebuie să fie mai mare decât prețul cerut — apare tăiat, cu o etichetă de reducere pe anunț.
                </span>
              </span>
            </label>
            <input
              value={compareAt}
              onChange={(e) => setCompareAt(e.target.value.replace(/[^0-9.,]/g, ""))}
              inputMode="decimal"
              placeholder="Opțional"
              className="mt-1.5 w-full rounded-xl border border-neutral-200 bg-neutral-50/70 px-3.5 py-3 text-[15px] outline-none transition-all focus:border-[#7c3aed] focus:bg-white focus:ring-4 focus:ring-violet-100"
            />
          </div>
        </div>
      </section>

      {error && (
        <p className="rounded-xl bg-rose-50 px-3.5 py-3 text-[13.5px] text-rose-700 md:hidden">{error}</p>
      )}

      {/* ---- Actions (desktop) ---- */}
      {/* Sticky inside the stretched right column, so Publish stays reachable
          however far down the photo grid and description have pushed the page.
          The error lives in here too — on desktop this card is where your eye
          is when a submit fails. */}
      <div className="hidden md:sticky md:top-24 md:block">
        <div className="space-y-3 rounded-2xl border border-neutral-200/70 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5">
          {error && (
            <p className="rounded-xl bg-rose-50 px-3.5 py-3 text-[13.5px] text-rose-700">{error}</p>
          )}
          {actionControls}
        </div>
      </div>
      </div>
      </div>
      </div>{/* /the one scroller */}

      {/* ---- Actions (phone) ---- */}
      {/* A flex row at the bottom of the sheet, not a fixed bar.
          It used to be `fixed bottom-[calc(inset + 62px)] z-90`, where 62 was
          the height of a tab bar that this screen no longer shows — a magic
          number tracking another component's geometry. As the last child of the
          column it is simply always at the bottom, it cannot be drawn over, and
          it survives the sheet's slide, which a fixed child could not. */}
      <div className="shrink-0 border-t border-neutral-200/80 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-3 backdrop-blur-md md:hidden">
       <div className="mx-auto w-full max-w-2xl space-y-2.5">{actionControls}</div>
      </div>

      {/* ---- Pickers ---- */}
      <DragSheet open={sheet === "category"} title="Categorie" onClose={() => setSheet(null)}>
        <div className="sticky top-0 z-10 border-b border-neutral-100 bg-white p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              value={catQuery}
              onChange={(e) => setCatQuery(e.target.value)}
              placeholder="Caută categoria"
              className="w-full rounded-full bg-neutral-100 py-2.5 pl-9 pr-3 text-[14.5px] outline-none"
            />
          </div>
        </div>
        {catResults ? (
          <div className="p-2">
            {catResults.map((c) => (
              <button
                key={`${c.groupId}-${c.item.id}`}
                type="button"
                onClick={() => {
                  setGroup(c.groupId)
                  setItem(c.item.id)
                  setSheet(null)
                  setCatQuery("")
                }}
                className="flex w-full flex-col items-start rounded-lg px-3 py-2.5 text-left hover:bg-neutral-50"
              >
                <span className="text-[14.5px] text-neutral-900">{c.item.label}</span>
                <span className="text-[12px] text-neutral-400">{c.groupLabel}</span>
              </button>
            ))}
            {catResults.length === 0 && (
              <p className="px-3 py-6 text-center text-[14px] text-neutral-400">Nicio categorie găsită</p>
            )}
          </div>
        ) : (
          <div className="p-2">
            {LISTING_CATEGORIES.map((g) => (
              <div key={g.id} className="mb-3">
                <p className="px-3 py-1.5 text-[12px] font-semibold uppercase tracking-wide text-neutral-400">
                  {g.label}
                </p>
                {g.items.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => {
                      setGroup(g.id)
                      setItem(it.id)
                      setSheet(null)
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-[14.5px] text-neutral-900 hover:bg-neutral-50"
                  >
                    {it.label}
                    {group === g.id && item === it.id && <Check className="h-4 w-4 text-[#7c3aed]" />}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </DragSheet>

      <DragSheet open={sheet === "brand"} title="Brand" onClose={() => setSheet(null)}>
        <div className="sticky top-0 z-10 border-b border-neutral-100 bg-white p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              value={brandQuery}
              onChange={(e) => setBrandQuery(e.target.value)}
              placeholder="Caută brandul"
              className="w-full rounded-full bg-neutral-100 py-2.5 pl-9 pr-3 text-[14.5px] outline-none"
            />
          </div>
        </div>
        <div className="p-2">
          {brands.map((b) => (
            <button
              key={b.slug}
              type="button"
              onClick={() => {
                setBrand(b.name)
                setSheet(null)
              }}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-[14.5px] text-neutral-900 hover:bg-neutral-50"
            >
              {b.name}
              {brand === b.name && <Check className="h-4 w-4 text-[#7c3aed]" />}
            </button>
          ))}
          {/* Always available, never a row in the table — a brand directory can
              never be complete, and a missing brand shouldn't block a listing. */}
          <button
            type="button"
            onClick={() => {
              setBrand("Altele")
              setSheet(null)
            }}
            className="mt-1 flex w-full items-center justify-between rounded-lg border-t border-neutral-100 px-3 py-3 text-left text-[14.5px] font-medium text-neutral-600 hover:bg-neutral-50"
          >
            Nu găsesc brandul — Altele
            {brand === "Altele" && <Check className="h-4 w-4 text-[#7c3aed]" />}
          </button>
        </div>
      </DragSheet>

      <DragSheet open={sheet === "condition"} title="Stare" onClose={() => setSheet(null)}>
        <div className="p-2">
          {CONDITIONS.map((c) => (
            <button key={c.id} type="button" onClick={() => { setCondition(c.id); setSheet(null) }}
              className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-[14.5px] text-neutral-900 hover:bg-neutral-50">
              {c.label}
              {condition === c.id && <Check className="h-4 w-4 text-[#7c3aed]" />}
            </button>
          ))}
        </div>
      </DragSheet>

      <DragSheet open={sheet === "size"} title="Mărime" onClose={() => setSheet(null)}>
        <div className="p-2">
          {SIZES.map((c) => (
            <button key={c.id} type="button" onClick={() => { setSize(c.id); setSheet(null) }}
              className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-[14.5px] text-neutral-900 hover:bg-neutral-50">
              {c.label}
              {size === c.id && <Check className="h-4 w-4 text-[#7c3aed]" />}
            </button>
          ))}
        </div>
      </DragSheet>

      <DragSheet open={sheet === "colour"} title="Culoare" onClose={() => setSheet(null)}>
        <div className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-4">
          {COLOURS.map((c) => (
            <button key={c.id} type="button" onClick={() => { setColour(c.id); setSheet(null) }}
              className={cn("flex flex-col items-center gap-1.5 rounded-xl border p-2.5 transition-colors",
                colour === c.id ? "border-[#7c3aed] bg-violet-50" : "border-neutral-200 hover:bg-neutral-50")}>
              <span className="h-7 w-7 rounded-full border border-black/10" style={{ background: c.hex }} />
              <span className="text-[12.5px] text-neutral-700">{c.label}</span>
            </button>
          ))}
        </div>
      </DragSheet>

      <DragSheet open={sheet === "source"} title="Tip (maximum 2)" onClose={() => setSheet(null)}>
        <div className="flex flex-wrap gap-2 p-3">
          {SOURCES.map((s) => (
            <Chip key={s.id} option={s} selected={sources.includes(s.id)} onClick={() => setSources((l) => toggleIn(l, s.id, 2))} />
          ))}
        </div>
      </DragSheet>

      <DragSheet open={sheet === "era"} title="Epocă" onClose={() => setSheet(null)}>
        <div className="p-2">
          {ERAS.map((c) => (
            <button key={c.id} type="button" onClick={() => { setEra(c.id); setSheet(null) }}
              className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-[14.5px] text-neutral-900 hover:bg-neutral-50">
              {c.label}
              {era === c.id && <Check className="h-4 w-4 text-[#7c3aed]" />}
            </button>
          ))}
        </div>
      </DragSheet>

      <DragSheet open={sheet === "style"} title="Stil (maximum 3)" onClose={() => setSheet(null)}>
        <div className="flex flex-wrap gap-2 p-3">
          {STYLES.map((s) => (
            <Chip key={s.id} option={s} selected={styles.includes(s.id)} onClick={() => setStyles((l) => toggleIn(l, s.id, 3))} />
          ))}
        </div>
      </DragSheet>

      {/* Posted confirmation — the only signal the listing is live, so it gets a
          moment of its own before the redirect. */}
      </div>

      {posted && (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-white/85 backdrop-blur-sm"
          style={{ animation: "posted-veil 300ms ease-out both" }}
        >
          <div
            className="flex flex-col items-center gap-3"
            style={{ animation: "posted-in 560ms cubic-bezier(0.22, 1, 0.36, 1) both" }}
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#7c3aed] text-white shadow-[0_8px_28px_-6px_rgba(124,58,237,0.7)]">
              <Check className="h-8 w-8" strokeWidth={3} />
            </span>
            <p className="text-[16px] font-semibold text-neutral-900">Anunț publicat</p>
            <p className="text-[13.5px] text-neutral-500">Te ducem la anunțul tău…</p>
          </div>
        </div>
      )}
    </div>
  )
}
