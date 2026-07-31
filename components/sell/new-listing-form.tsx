"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
import { cn } from "@/lib/utils"

type Photo = { id: string; url: string | null; uploading: boolean; localUrl: string }

/** Bottom sheet — the picker pattern for everything that needs a long list. */
function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  return (
    <div className={cn("fixed inset-0 z-[120]", !open && "pointer-events-none")} aria-hidden={!open}>
      <div
        className="absolute inset-0 bg-black/40 transition-opacity duration-300"
        style={{ opacity: open ? 1 : 0 }}
        onClick={onClose}
      />
      {/* Sheet on phones, centred panel from `sm` up — the same component either
          way, so a picker never behaves differently depending on the screen. */}
      <div
        className="absolute inset-x-0 bottom-0 flex max-h-[86vh] flex-col rounded-t-2xl bg-white shadow-2xl transition-transform duration-[380ms] sm:inset-0 sm:m-auto sm:h-[70vh] sm:max-w-lg sm:rounded-2xl"
        style={{
          transform: open ? "translateY(0)" : "translateY(12px)",
          opacity: open ? 1 : 0,
          transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
          transitionProperty: "transform, opacity",
        }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-100 px-4 py-3.5">
          <h2 className="text-[16px] font-semibold text-neutral-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Închide" className="rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  )
}

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
      onClick={onClick}
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
      onClick={onClick}
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

  return (
    <div className="bg-[#f6f6f7] pb-[calc(env(safe-area-inset-bottom,0px)+150px)] md:pb-32">
      <div className="mx-auto w-full max-w-2xl px-4 pt-5 sm:pt-9">
      <header className="mb-5">
        <h1 className="text-[26px] font-bold tracking-[-0.02em] text-neutral-900 sm:text-[32px]">
          Listează un articol
        </h1>
        <p className="mt-1 text-[14.5px] text-neutral-500">
          Completează detaliile și anunțul tău apare instant în feed.
        </p>
      </header>

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

        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-5">
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
        <p className="mt-5 rounded-xl bg-rose-50 px-3.5 py-3 text-[13.5px] text-rose-700">{error}</p>
      )}

      {/* ---- Actions ---- */}
      {/* Sits ABOVE the tab bar, not under it. The global bottom navigation is
          fixed at z-80, and this bar was z-40 pinned to bottom-0 — so on a phone
          the tab bar was drawn straight over the Publish button. The checkbox
          above it stayed visible, which is why the form looked like it simply
          had no way to submit. Offset by the tab bar's height, and stacked over
          it. On desktop there is no tab bar, so it just sits at the bottom. */}
      <div
        className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+62px)] z-[90] border-t border-neutral-200/80 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-3 backdrop-blur-md md:bottom-0"
      >
       <div className="mx-auto w-full max-w-2xl space-y-2.5">
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
            onClick={() => submit(true)}
            disabled={saving !== null}
            className="h-12 flex-1 rounded-full bg-neutral-100 text-[15px] font-semibold text-neutral-700 transition-transform duration-200 active:scale-[0.98] disabled:opacity-60"
          >
            Salvează
          </button>
          <button
            type="button"
            onClick={() => submit(false)}
            disabled={saving !== null}
            className="flex h-12 flex-[2] items-center justify-center gap-2 rounded-full bg-[#7c3aed] text-[15.5px] font-semibold text-white shadow-[0_4px_16px_-4px_rgba(124,58,237,0.6)] transition-transform duration-200 active:scale-[0.98] disabled:opacity-60"
          >
            {saving === "post" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Publică anunțul
          </button>
        </div>
       </div>
      </div>

      {/* ---- Pickers ---- */}
      <Sheet open={sheet === "category"} title="Categorie" onClose={() => setSheet(null)}>
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
      </Sheet>

      <Sheet open={sheet === "brand"} title="Brand" onClose={() => setSheet(null)}>
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
      </Sheet>

      <Sheet open={sheet === "condition"} title="Stare" onClose={() => setSheet(null)}>
        <div className="p-2">
          {CONDITIONS.map((c) => (
            <button key={c.id} type="button" onClick={() => { setCondition(c.id); setSheet(null) }}
              className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-[14.5px] text-neutral-900 hover:bg-neutral-50">
              {c.label}
              {condition === c.id && <Check className="h-4 w-4 text-[#7c3aed]" />}
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={sheet === "size"} title="Mărime" onClose={() => setSheet(null)}>
        <div className="p-2">
          {SIZES.map((c) => (
            <button key={c.id} type="button" onClick={() => { setSize(c.id); setSheet(null) }}
              className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-[14.5px] text-neutral-900 hover:bg-neutral-50">
              {c.label}
              {size === c.id && <Check className="h-4 w-4 text-[#7c3aed]" />}
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={sheet === "colour"} title="Culoare" onClose={() => setSheet(null)}>
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
      </Sheet>

      <Sheet open={sheet === "source"} title="Tip (maximum 2)" onClose={() => setSheet(null)}>
        <div className="flex flex-wrap gap-2 p-3">
          {SOURCES.map((s) => (
            <Chip key={s.id} option={s} selected={sources.includes(s.id)} onClick={() => setSources((l) => toggleIn(l, s.id, 2))} />
          ))}
        </div>
      </Sheet>

      <Sheet open={sheet === "era"} title="Epocă" onClose={() => setSheet(null)}>
        <div className="p-2">
          {ERAS.map((c) => (
            <button key={c.id} type="button" onClick={() => { setEra(c.id); setSheet(null) }}
              className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-[14.5px] text-neutral-900 hover:bg-neutral-50">
              {c.label}
              {era === c.id && <Check className="h-4 w-4 text-[#7c3aed]" />}
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={sheet === "style"} title="Stil (maximum 3)" onClose={() => setSheet(null)}>
        <div className="flex flex-wrap gap-2 p-3">
          {STYLES.map((s) => (
            <Chip key={s.id} option={s} selected={styles.includes(s.id)} onClick={() => setStyles((l) => toggleIn(l, s.id, 3))} />
          ))}
        </div>
      </Sheet>

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
