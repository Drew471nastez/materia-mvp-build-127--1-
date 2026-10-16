"use client"

/**
 * ===========================================================================
 *  A NEW COMMUNITY, IN FIVE SHORT STEPS (round 33)
 * ===========================================================================
 * The owner: "a clean multi step wizard: name and address, icon and cover
 * with a branded gradient by default, access and price, the first space and
 * welcome, review and create; back and next with saved progress, validation
 * inline, phone friendly". The rules are in lib/communities/create-wizard.ts.
 *
 *   PHONE AND TABLET   a page of its own over the app (PageLayer, as New
 *                      product), its bar stuck to the top: Cancel or Back on
 *                      the left, Next or Create on the right, the steps as a
 *                      thin line under it. The bar is at the top because the
 *                      navigation pill keeps the bottom of a phone.
 *   FROM 1024px        a page in the shell: the way back and the title, the
 *                      five steps across, the step's card with the preview
 *                      of the community beside it, and the editor's white
 *                      foot bar with Back and Next.
 *
 * A step is checked before Next, and what is wrong is said under its field.
 * Every change is kept in this browser (DRAFT_KEY), so a refresh or a closed
 * tab comes back on the same step with the same words.
 *
 * WITHOUT A PICTURE the cover and the icon are drawn here from the gradient
 * picked (and the name's first letter for the icon) and uploaded through the
 * same pipeline as a picked one, only when Create is pressed, so a draft
 * left behind leaves nothing in storage.
 *
 * THE FREE PLAN'S TWO (lib/communities/plan-limit.ts): with both made the
 * page opens the upgrade sheet, and Create opens it again instead of sending
 * something the server would refuse (res.status === 402).
 */
import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { centsFromInput } from "@/lib/memberships/plan"
import { money, pricePer } from "@/lib/memberships/state"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import { DirectUploader } from "@/lib/storage/chunked-upload"
import { slugify } from "@/lib/communities/slug"
import { COVER_PALETTES, DRAFT_KEY, WIZARD_STEPS, addressOf, checkWizardStep, draftTouched, emptyDraft, firstProblem, initialOf, paletteCss, paletteOf, readDraft, welcomeFor, type PaletteId, type WizardDraft, type WizardStep } from "@/lib/communities/create-wizard"
import { ActivitySpinner } from "@/components/ui/activity-spinner"
import { barButton, primaryDepth } from "@/app/app/products/new/editor-buttons"
import { iconButton } from "@/app/app/orders/order-parts"
import { DESCRIPTION_CHARS, type CommunityType, type PriceInterval } from "./logic"
import { ChoiceCards, EditorCard, Notice, PicturePick, PriceInput, Segmented, errorText, field, label, send } from "./parts"
import { UpgradeSheet } from "./upgrade-sheet"
import { tt } from "@/lib/i18n/text"

const TYPES: { value: CommunityType; title: string; detail: string }[] = [
  { value: "free", get title() { return tt("Free") }, get detail() { return tt("Anyone can join.") } },
  { value: "paid", get title() { return tt("Paid membership") }, get detail() { return tt("Members pay to join, every month, every year or once.") } },
  { value: "private", get title() { return tt("Private") }, get detail() { return tt("Invite only. Hidden from Explore.") } },
]

const INTERVALS: { value: PriceInterval; label: string }[] = [
  { value: "month", get label() { return tt("Monthly") } },
  { value: "year", get label() { return tt("Yearly") } },
  { value: "once", get label() { return tt("One time") } },
]

const STEP_TITLE: Record<WizardStep, () => string> = {
  name: () => tt("Name and address"),
  look: () => tt("Logo and cover"),
  access: () => tt("Who can join"),
  welcome: () => tt("First space and welcome"),
  review: () => tt("Review"),
}

const STEP_SHORT: Record<WizardStep, () => string> = {
  name: () => tt("Name"),
  look: () => tt("Look"),
  access: () => tt("Access"),
  welcome: () => tt("Welcome"),
  review: () => tt("Review"),
}

const PALETTE_NAME: Record<PaletteId, () => string> = { ink: () => tt("Ink"), forest: () => tt("Forest"), clay: () => tt("Clay"), sea: () => tt("Sea"), sand: () => tt("Sand"), slate: () => tt("Slate") }

/** Which step a field the server named lives on. */
const STEP_OF_FIELD: Record<string, number> = { name: 0, slug: 0, description: 0, type: 2, price: 2, interval: 2, spaceName: 3, welcomeTitle: 3, welcomeBody: 3 }

/* ── Drawing a cover and an icon from a gradient ──────────────────────── */

async function drawn(kind: "cover" | "icon", palette: PaletteId, name: string): Promise<File | null> {
  try {
    const p = paletteOf(palette)
    const [w, h] = kind === "cover" ? [1500, 500] : [512, 512]
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    const g = ctx.createLinearGradient(0, 0, w, h)
    g.addColorStop(0, p.from)
    g.addColorStop(1, p.to)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    /* A soft light from the top right, so the flat gradient has some depth. */
    const light = ctx.createRadialGradient(w * 0.85, h * 0.1, 0, w * 0.85, h * 0.1, Math.max(w, h) * 0.7)
    light.addColorStop(0, "rgba(255,255,255,0.18)")
    light.addColorStop(1, "rgba(255,255,255,0)")
    ctx.fillStyle = light
    ctx.fillRect(0, 0, w, h)
    if (kind === "icon") {
      await document.fonts?.ready?.catch?.(() => undefined)
      ctx.fillStyle = "#ffffff"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.font = `600 ${Math.round(w * 0.46)}px Inter, system-ui, sans-serif`
      ctx.fillText(initialOf(name), w / 2, h / 2 + w * 0.02)
    }
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
    return blob ? new File([blob], `${kind}-${palette}.png`, { type: "image/png" }) : null
  } catch {
    return null
  }
}

async function uploadDrawn(kind: "cover" | "icon", palette: PaletteId, name: string): Promise<string | null> {
  const file = await drawn(kind, palette, name)
  if (!file) return null
  const uploader = new DirectUploader({ file, folder: "product-images" })
  try {
    return (await uploader.start()).publicUrl || null
  } catch {
    return null
  } finally {
    uploader.destroy()
  }
}

/* ── Pieces ───────────────────────────────────────────────────────────── */

function NextButton({ busy, last, onPress }: { busy: boolean; last: boolean; onPress: () => void }) {
  return (
    <button type="button" onClick={onPress} aria-busy={busy || undefined} data-create-submit={last ? "" : undefined} data-wizard-next="" className={cn(primaryDepth, "relative h-10 rounded-[10px] px-4 text-[15px] sm:h-8 sm:rounded-lg sm:px-3 sm:text-[13px]", busy && "cursor-default")}>
      <span className={cn(busy && "opacity-0")}>{last ? <>{tt("Create")}<span className="max-sm:hidden"> {tt("community")}</span></> : tt("Next")}</span>
      {busy ? (
        <span aria-hidden className="absolute inset-0 grid place-items-center">
          <ActivitySpinner size={16} label={tt("Creating")} className="text-white" />
        </span>
      ) : null}
    </button>
  )
}

function FieldError({ id, text }: { id: string; text: string | null | undefined }) {
  if (!text) return null
  return (
    <p id={id} role="alert" className="mt-1.5 text-[12.5px] text-[#b91c1c]">
      {text}
    </p>
  )
}

/** The community as it will look: the cover, the icon over its edge, the name, the address, who can join. */
function Preview({ d, compact }: { d: WizardDraft; compact?: boolean }) {
  const name = d.name.trim() || tt("Your community")
  const cents = centsFromInput(d.price)
  const price = d.type === "paid" && cents && Number.isFinite(cents) ? (d.interval === "once" ? tt("{amount} once", { amount: money(cents) }) : pricePer(cents, d.interval)) : null
  return (
    <div className="overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]" data-wizard-preview="">
      <div className="relative aspect-[3/1] w-full" style={{ background: d.coverUrl ? "#f1f2f4" : paletteCss(d.palette) }} data-wizard-preview-cover="">
        {d.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={optimizedImageUrl(d.coverUrl, 640)} alt="" className="absolute inset-0 h-full w-full object-cover" decoding="async" />
        ) : null}
      </div>
      <div className={cn("px-4 pb-4", compact ? "pt-0" : "pt-0 sm:px-5 sm:pb-5")}>
        <span className="relative z-[1] -mt-7 mb-2.5 grid h-14 w-14 place-items-center overflow-hidden rounded-[14px] text-[24px] font-semibold text-white shadow-[0_0_0_3px_#fff,0_1px_3px_rgba(16,24,40,0.18)]" style={{ background: d.logoUrl ? "#f1f2f4" : paletteCss(d.palette) }} data-wizard-preview-icon="">
          {d.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={optimizedImageUrl(d.logoUrl, 160)} alt="" className="h-full w-full object-cover" decoding="async" />
          ) : (
            initialOf(name)
          )}
        </span>
        <p className="truncate text-[16px] font-semibold leading-6 text-[#1a1a2e]">{name}</p>
        <p className="truncate text-[12.5px] text-[#8a8f98]">storelib.com/community/{addressOf(d) || "your-community"}</p>
        {d.description.trim() && !compact ? <p className="mt-2 line-clamp-3 text-[13px] leading-5 text-[#4b5563]">{d.description.trim()}</p> : null}
        <p className="mt-3 flex items-center gap-2 text-[12.5px] text-[#6b7280]">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#e0a100]" />
          {tt("Draft")} · {d.type === "free" ? tt("Free") : d.type === "private" ? tt("Private") : (price ?? tt("Paid membership"))}
        </p>
      </div>
    </div>
  )
}

/** The five steps across, from 1024px; each step reached so far opens with a press. */
function Steps({ at, reach, onGo }: { at: number; reach: number; onGo: (i: number) => void }) {
  return (
    <ol className="grid grid-cols-5 gap-2" aria-label={tt("Steps")} data-wizard-steps="">
      {WIZARD_STEPS.map((s, i) => {
        const done = i < at
        const here = i === at
        const open = i <= reach
        return (
          <li key={s} className="min-w-0">
            <button type="button" disabled={!open} onClick={() => onGo(i)} aria-current={here ? "step" : undefined} data-wizard-step={s} className={cn("group block w-full min-w-0 text-left", open ? "cursor-pointer" : "cursor-default")}>
              <span className={cn("block h-1 rounded-full transition-colors duration-300", here || done ? "bg-[#1a1a2e]" : "bg-[#e5e7eb]")} />
              <span className={cn("mt-2 flex items-center gap-1.5 truncate text-[13px]", here ? "font-semibold text-[#1a1a2e]" : done ? "text-[#4b5563] group-hover:text-[#1a1a2e]" : "text-[#9ca3af]")}>
                {done ? <Check aria-hidden className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} /> : <span className="tabular-nums">{i + 1}</span>}
                <span className="truncate">{STEP_SHORT[s]()}</span>
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

/* ── The wizard ───────────────────────────────────────────────────────── */

type Errors = Partial<Record<string, string>>
type AddressState = { slug: string; state: "checking" | "free" | "taken" | "invalid" } | null

export function CreateCommunity({ limitReached = false }: { limitReached?: boolean }) {
  const router = useRouter()
  const [draft, setDraft] = React.useState<WizardDraft>(emptyDraft)
  const [reach, setReach] = React.useState(0)
  const [restored, setRestored] = React.useState(false)
  const [errors, setErrors] = React.useState<Errors>({})
  const [notice, setNotice] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [upgrade, setUpgrade] = React.useState(limitReached)
  const [atLimit, setAtLimit] = React.useState(limitReached)
  const [address, setAddress] = React.useState<AddressState>(null)
  const loaded = React.useRef(false)
  const pane = React.useRef<HTMLDivElement>(null)
  const stepBox = React.useRef<HTMLDivElement>(null)
  const heading = React.useRef<HTMLHeadingElement>(null)
  const nameRef = React.useRef<HTMLInputElement>(null)

  const step = WIZARD_STEPS[draft.step]
  const last = draft.step === WIZARD_STEPS.length - 1

  /* THE DRAFT, BACK FROM THIS BROWSER. Read after the first paint, so the server's page and the first frame agree. */
  React.useEffect(() => {
    let saved: WizardDraft | null = null
    try {
      saved = readDraft(window.localStorage.getItem(DRAFT_KEY))
    } catch {
      saved = null
    }
    if (saved && draftTouched(saved)) {
      setDraft(saved)
      setReach(saved.step)
      setRestored(true)
    } else if (!limitReached) nameRef.current?.focus({ preventScroll: true })
    loaded.current = true
  }, [limitReached])

  React.useEffect(() => {
    if (!loaded.current) return
    const t = window.setTimeout(() => {
      try {
        if (draftTouched(draft)) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
        else window.localStorage.removeItem(DRAFT_KEY)
      } catch {
        /* A private window keeps no draft; the wizard works the same. */
      }
    }, 250)
    return () => window.clearTimeout(t)
  }, [draft])

  /* The welcome post follows the name until it is changed by hand. */
  React.useEffect(() => {
    if (draft.welcomeEdited) return
    const w = welcomeFor(draft.name)
    if (w.title !== draft.welcomeTitle || w.body !== draft.welcomeBody) setDraft((d) => (d.welcomeEdited ? d : { ...d, welcomeTitle: w.title, welcomeBody: w.body }))
  }, [draft.name, draft.welcomeEdited, draft.welcomeTitle, draft.welcomeBody])

  /* THE ADDRESS, CHECKED as it is typed (GET /api/app/community?address=), a moment after the last key. */
  const slug = addressOf(draft)
  React.useEffect(() => {
    if (!slug || slug.length < 3) return setAddress(null)
    setAddress({ slug, state: "checking" })
    const t = window.setTimeout(async () => {
      const res = await send<{ slug: string; available: boolean; reason: "invalid" | "taken" | null }>(`/api/app/community?address=${encodeURIComponent(slug)}`, "GET")
      if (!res.ok) return setAddress(null)
      setAddress((a) => (a && a.slug === slug ? { slug, state: res.data.available ? "free" : res.data.reason === "invalid" ? "invalid" : "taken" } : a))
    }, 450)
    return () => window.clearTimeout(t)
  }, [slug])

  /* A STEP ARRIVING: the pane back to the top, the heading focused for a screen reader, a short fade in where motion is welcome. */
  const arrived = React.useRef(false)
  React.useEffect(() => {
    if (!arrived.current) {
      arrived.current = true
      return
    }
    pane.current?.scrollTo({ top: 0 })
    heading.current?.focus({ preventScroll: true })
    const el = stepBox.current
    if (el && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) el.animate?.([{ opacity: 0, translate: "0 6px" }, { opacity: 1, translate: "0 0" }], { duration: 200, easing: "cubic-bezier(0.32,0.72,0,1)" })
  }, [draft.step])

  const set = <K extends keyof WizardDraft>(k: K, v: WizardDraft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }))
    if (errors[k as string]) setErrors((e) => ({ ...e, [k as string]: undefined }))
  }

  const go = (i: number) => {
    setErrors({})
    setNotice(null)
    setDraft((d) => ({ ...d, step: Math.max(0, Math.min(WIZARD_STEPS.length - 1, i)) }))
  }

  const startOver = () => {
    try {
      window.localStorage.removeItem(DRAFT_KEY)
    } catch {
      /* nothing kept */
    }
    setDraft(emptyDraft())
    setReach(0)
    setRestored(false)
    setErrors({})
    window.setTimeout(() => nameRef.current?.focus(), 0)
  }

  const next = () => {
    const c = checkWizardStep(step, draft)
    if (!c.ok) {
      setErrors({ [c.field]: c.error })
      document.getElementById(`c-${c.field}`)?.focus()
      return
    }
    if (step === "name" && address?.slug === slug && address.state === "taken" && draft.slug.trim()) {
      setErrors({ slug: tt("That address is taken. Try another.") })
      document.getElementById("c-slug")?.focus()
      return
    }
    const to = draft.step + 1
    setReach((r) => Math.max(r, to))
    go(to)
  }

  const create = async () => {
    if (busy) return
    if (atLimit) return setUpgrade(true)
    const problem = firstProblem(draft)
    if (problem) {
      go(problem.step)
      setErrors({ [problem.check.field]: problem.check.error })
      return
    }
    setBusy(true)
    setNotice(null)
    const [logoUrl, coverUrl] = await Promise.all([draft.logoUrl ?? uploadDrawn("icon", draft.palette, draft.name), draft.coverUrl ?? uploadDrawn("cover", draft.palette, draft.name)])
    const body = {
      name: draft.name,
      slug: draft.slug.trim() ? addressOf(draft) : null,
      description: draft.description,
      logoUrl,
      coverUrl,
      type: draft.type,
      price: draft.price,
      interval: draft.interval,
      spaceName: draft.spaceName,
      welcomeTitle: draft.welcomeTitle,
      welcomeBody: draft.welcomeBody,
    }
    const res = await send<{ id?: string; slug?: string }>("/api/app/community", "POST", body)
    if (res.status === 402) {
      setBusy(false)
      setAtLimit(true)
      return setUpgrade(true)
    }
    if (!res.ok || !res.data.id) {
      setBusy(false)
      const text = errorText(res.data.error, tt("The community could not be made. Try again."))
      const f = res.data.field
      if (f && STEP_OF_FIELD[f] !== undefined) {
        go(STEP_OF_FIELD[f])
        setErrors({ [f]: text })
      } else setNotice(text)
      return
    }
    try {
      window.localStorage.removeItem(DRAFT_KEY)
    } catch {
      /* nothing kept */
    }
    router.push(`/app/community/${res.data.slug || res.data.id}?created=1`)
  }

  const forward = () => (last ? void create() : next())
  const back = () => go(draft.step - 1)
  const err = (f: string) => errors[f] ?? null
  const cents = centsFromInput(draft.price)
  const priceText = cents && Number.isFinite(cents) ? (draft.interval === "once" ? tt("{amount} once, for lifetime access", { amount: money(cents) }) : pricePer(cents, draft.interval)) : null

  return (
    <div ref={pane} className="orders-pane flex h-full flex-col overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter" data-create-community="" data-wizard-at={step}>
      {/* THE BAR, BELOW 1024px: Cancel or Back, the step, Next or Create. */}
      <div data-create-bar="" className="sticky top-0 z-30 shrink-0 bg-[#f8f9fa] max-md:[[data-page-layer]_&]:pt-[env(safe-area-inset-top)] lg:hidden">
        <h1 className="sr-only">{tt("New community")}</h1>
        <div className="mx-auto grid h-14 max-w-[760px] grid-cols-[1fr_auto_1fr] items-center gap-2 app-gutter sm:h-16 sm:px-6">
          <div className="justify-self-start">
            {draft.step === 0 ? (
              <Link href="/app/community" className={barButton} data-create-cancel="">
                {tt("Cancel")}
              </Link>
            ) : (
              <button type="button" onClick={back} className={barButton} data-wizard-back="">
                {tt("Back")}
              </button>
            )}
          </div>
          <p className="text-center text-[13px] font-medium tabular-nums text-[#6b7280]" data-wizard-count="">
            {tt("{n} of {total}", { n: draft.step + 1, total: WIZARD_STEPS.length })}
          </p>
          <div className="justify-self-end">
            <NextButton busy={busy} last={last} onPress={forward} />
          </div>
        </div>
        <span aria-hidden className="mx-auto block h-[3px] max-w-[760px] app-gutter sm:px-6">
          <span className="block h-full overflow-hidden rounded-full bg-[#e5e7eb]">
            <span className="block h-full rounded-full bg-[#1a1a2e] transition-[width] duration-300 ease-out" style={{ width: `${((draft.step + 1) / WIZARD_STEPS.length) * 100}%` }} />
          </span>
        </span>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          forward()
        }}
        noValidate
        data-create-form=""
        className="mx-auto w-full max-w-[760px] shrink-0 app-gutter pb-28 pt-4 sm:pt-5 lg:max-w-[1200px] lg:px-8 lg:pb-8 lg:pt-6"
      >
        {/* THE HEADER, FROM 1024px: back to Community, the title, the five steps. */}
        <header data-create-head="" className="mb-6 hidden lg:block">
          <div className="mb-5 flex min-h-9 items-center gap-2">
            <Link href="/app/community" aria-label={tt("Back to Community")} title={tt("Community")} className={cn(iconButton, "-ml-1.5 h-9 w-9 shrink-0 hover:bg-[#eceef1] active:bg-[#e4e6ea]")}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="min-w-0 truncate text-[24px] font-bold leading-9 text-[#1a1a2e] sm:text-[28px]">{tt("New community")}</h1>
          </div>
          <div className="max-w-[760px]">
            <Steps at={draft.step} reach={reach} onGo={go} />
          </div>
        </header>

        {restored ? (
          <p className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[#6b7280] lg:mb-4" data-wizard-restored="">
            {tt("Picked up where you left off.")}
            <button type="button" onClick={startOver} className="font-medium text-[#1a1a2e] underline-offset-2 hover:underline">
              {tt("Start over")}
            </button>
          </p>
        ) : null}
        {notice ? (
          <div className="mb-3 lg:mb-4">
            <Notice>{notice}</Notice>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,760px)_340px] lg:items-start lg:gap-5">
          <div ref={stepBox} className="min-w-0" data-wizard-step-body={step}>
            <EditorCard id={`step-${step}`}>
              <div>
                <h2 ref={heading} tabIndex={-1} className="text-[18px] font-semibold leading-7 text-[#1a1a2e] outline-none sm:text-[20px]" data-wizard-title="">
                  {STEP_TITLE[step]()}
                </h2>
              </div>

              {step === "name" ? (
                <>
                  <div>
                    <label htmlFor="c-name" className={label}>
                      {tt("Name")}
                    </label>
                    <input ref={nameRef} id="c-name" value={draft.name} onChange={(e) => set("name", e.target.value.slice(0, 80))} placeholder={tt("The Morning Writers")} autoComplete="off" enterKeyHint="next" aria-invalid={!!err("name") || undefined} aria-describedby={err("name") ? "c-name-error" : undefined} className={cn(field, "h-11 text-[16px] font-medium sm:text-[15px]", err("name") && "border-[#dc2626]")} />
                    <FieldError id="c-name-error" text={err("name")} />
                  </div>
                  <div>
                    <label htmlFor="c-slug" className={label}>
                      {tt("Address")}
                    </label>
                    <div className={cn("flex h-11 min-w-0 items-center rounded-lg border border-[#e1e3e7] bg-white shadow-[0_1px_0_rgba(17,24,39,0.04)] transition-[border-color,box-shadow] focus-within:border-[#1a1a2e]/50 focus-within:shadow-[0_0_0_3px_rgba(26,26,46,0.07)] sm:h-10", err("slug") && "border-[#dc2626]")}>
                      <span className="shrink-0 pl-3 text-[14px] text-[#8a8f98] max-[380px]:hidden">storelib.com/community/</span>
                      <span className="shrink-0 pl-3 text-[14px] text-[#8a8f98] min-[381px]:hidden">…/</span>
                      <input id="c-slug" value={draft.slugEdited ? draft.slug : slugify(draft.name)} onChange={(e) => { const v = e.target.value.toLowerCase().replace(/\s+/g, "-").slice(0, 48); setDraft((d) => ({ ...d, slug: v, slugEdited: true })); if (errors.slug) setErrors((x) => ({ ...x, slug: undefined })) }} onBlur={() => { if (!draft.slug.trim()) setDraft((d) => ({ ...d, slug: "", slugEdited: false })) }} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="your-community" aria-invalid={!!err("slug") || undefined} aria-describedby="c-slug-state" className="h-full min-w-0 flex-1 bg-transparent pr-3 text-[16px] font-medium text-[#1a1a2e] outline-none placeholder:font-normal placeholder:text-[#a2a7b0] sm:text-[14px]" />
                    </div>
                    {err("slug") ? (
                      <FieldError id="c-slug-state" text={err("slug")} />
                    ) : (
                      <p id="c-slug-state" aria-live="polite" className="mt-1.5 min-h-[18px] text-[12.5px] text-[#6b7280]" data-address-state={address?.slug === slug ? address.state : ""}>
                        {address?.slug === slug
                          ? address.state === "checking"
                            ? tt("Checking the address")
                            : address.state === "free"
                              ? <span className="inline-flex items-center gap-1 text-[#15803d]"><Check aria-hidden className="h-3.5 w-3.5" strokeWidth={2.5} />{tt("Available")}</span>
                              : address.state === "taken"
                                ? draft.slug.trim()
                                  ? <span className="text-[#b45309]">{tt("Taken. Try another.")}</span>
                                  : tt("Taken, so it gets a number at the end. Type your own to choose.")
                                : <span className="text-[#b45309]">{tt("That address cannot be used. Try another.")}</span>
                          : tt("Made from the name. Change it now or in Settings later.")}
                      </p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="c-description" className={label}>
                      {tt("Description")} <span className="font-normal text-[#9ca3af]">{tt("optional")}</span>
                    </label>
                    <textarea id="c-description" value={draft.description} onChange={(e) => set("description", e.target.value.slice(0, DESCRIPTION_CHARS))} rows={3} placeholder={tt("Who it is for and what members do here")} aria-invalid={!!err("description") || undefined} className={cn(field, "min-h-[88px] resize-y py-2.5 leading-relaxed", err("description") && "border-[#dc2626]")} />
                    <FieldError id="c-description-error" text={err("description")} />
                  </div>
                </>
              ) : null}

              {step === "look" ? (
                <>
                  <div className="lg:hidden">
                    <Preview d={draft} compact />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-[auto_1fr] sm:gap-6">
                    <div>
                      <p className={label}>{tt("Logo")}</p>
                      <PicturePick value={draft.logoUrl} onChange={(v) => set("logoUrl", v)} shape="square" name="logo" onError={(m) => setNotice(m)} />
                    </div>
                    <div className="min-w-0">
                      <p className={label}>{tt("Cover")}</p>
                      <PicturePick value={draft.coverUrl} onChange={(v) => set("coverUrl", v)} shape="wide" name="cover" onError={(m) => setNotice(m)} />
                    </div>
                  </div>
                  <div className="border-t border-[#f1f2f4] pt-4">
                    <p className={label} id="c-palette-label">
                      {draft.logoUrl && draft.coverUrl ? tt("Colour, for later") : tt("Colour")}
                    </p>
                    <p className="-mt-1 mb-3 text-[12.5px] leading-snug text-[#6b7280]">{draft.logoUrl && draft.coverUrl ? tt("Both pictures are in, so the colour is not used.") : tt("Used for whatever has no picture. Change it any time.")}</p>
                    <div role="radiogroup" aria-labelledby="c-palette-label" className="flex flex-wrap gap-2.5" data-wizard-palettes="">
                      {COVER_PALETTES.map((p) => {
                        const on = draft.palette === p.id
                        return (
                          <button key={p.id} type="button" role="radio" aria-checked={on} aria-label={PALETTE_NAME[p.id]()} onClick={() => set("palette", p.id)} data-palette={p.id} className={cn("h-10 w-10 rounded-full transition-[box-shadow,scale] duration-150 sm:h-9 sm:w-9", on ? "shadow-[0_0_0_2px_#fff,0_0_0_4px_#1a1a2e]" : "shadow-[0_0_0_1px_rgba(16,24,40,0.08)] hover:scale-[1.04]")} style={{ background: paletteCss(p.id) }} />
                        )
                      })}
                    </div>
                  </div>
                </>
              ) : null}

              {step === "access" ? (
                <>
                  <ChoiceCards value={draft.type} onChange={(v) => { set("type", v); setErrors({}) }} options={TYPES} label={tt("Who can join")} rows />
                  {draft.type === "paid" ? (
                    <div className="grid grid-cols-1 gap-3 border-t border-[#f1f2f4] pt-4 sm:grid-cols-[180px_1fr] sm:items-end" data-paid-fields="">
                      <div>
                        <label htmlFor="c-price" className={label}>
                          {tt("Price")}
                        </label>
                        <PriceInput id="c-price" value={draft.price} onChange={(v) => set("price", v)} placeholder={draft.interval === "year" ? "190" : draft.interval === "once" ? "99" : "19"} invalid={!!err("price")} />
                      </div>
                      <div className="min-w-0">
                        <Segmented value={draft.interval} onChange={(v) => set("interval", v)} options={INTERVALS} label={tt("How often")} className="w-full sm:w-auto" />
                      </div>
                      <p className={cn("text-[12.5px] sm:col-span-2", err("price") ? "text-[#b91c1c]" : "text-[#6b7280]")} role={err("price") ? "alert" : undefined}>
                        {err("price") ?? (priceText ? tt("Members pay {priceText}.", { priceText }) : tt("Members pay through Stripe. You can add a yearly price or more tiers later."))}
                      </p>
                    </div>
                  ) : null}
                </>
              ) : null}

              {step === "welcome" ? (
                <>
                  <div>
                    <label htmlFor="c-spaceName" className={label}>
                      {tt("Space name")}
                    </label>
                    <input id="c-spaceName" value={draft.spaceName} onChange={(e) => set("spaceName", e.target.value.slice(0, 40))} autoComplete="off" aria-invalid={!!err("spaceName") || undefined} className={cn(field, "h-11 sm:h-10", err("spaceName") && "border-[#dc2626]")} />
                    <FieldError id="c-spaceName-error" text={err("spaceName")} />
                    <p className="mt-1.5 text-[12.5px] text-[#6b7280]">{tt("Where members post. Announcements and Introductions are added beside it.")}</p>
                  </div>
                  <div className="border-t border-[#f1f2f4] pt-4">
                    <label htmlFor="c-welcomeTitle" className={label}>
                      {tt("Welcome post")}
                    </label>
                    <input id="c-welcomeTitle" value={draft.welcomeTitle} onChange={(e) => setDraft((d) => ({ ...d, welcomeTitle: e.target.value.slice(0, 200), welcomeEdited: true }))} autoComplete="off" placeholder={tt("Title")} aria-invalid={!!err("welcomeTitle") || undefined} className={cn(field, "h-11 font-medium sm:h-10", err("welcomeTitle") && "border-[#dc2626]")} />
                    <FieldError id="c-welcomeTitle-error" text={err("welcomeTitle")} />
                    <textarea id="c-welcomeBody" value={draft.welcomeBody} onChange={(e) => setDraft((d) => ({ ...d, welcomeBody: e.target.value.slice(0, 5000), welcomeEdited: true }))} rows={5} aria-label={tt("Welcome post")} aria-invalid={!!err("welcomeBody") || undefined} className={cn(field, "mt-2 min-h-[132px] resize-y py-2.5 leading-relaxed", err("welcomeBody") && "border-[#dc2626]")} />
                    <FieldError id="c-welcomeBody-error" text={err("welcomeBody")} />
                    <p className="mt-1.5 text-[12.5px] text-[#6b7280]">{draft.welcomeTitle.trim() || draft.welcomeBody.trim() ? tt("Pinned at the top of {space}, from you.", { space: draft.spaceName.trim() || "General" }) : tt("Empty, so no welcome post is made.")}</p>
                  </div>
                </>
              ) : null}

              {step === "review" ? (
                <>
                  <div className="lg:hidden">
                    <Preview d={draft} />
                  </div>
                  <dl className="-my-1 divide-y divide-[#f1f2f4]" data-wizard-review="">
                    {[
                      { at: 0, k: tt("Name"), v: draft.name.trim() },
                      { at: 0, k: tt("Address"), v: `storelib.com/community/${slug}` },
                      { at: 0, k: tt("Description"), v: draft.description.trim() || tt("None yet") },
                      { at: 1, k: tt("Logo and cover"), v: draft.logoUrl && draft.coverUrl ? tt("Your pictures") : draft.logoUrl || draft.coverUrl ? tt("One picture, the rest from the colour") : tt("Drawn from the colour") },
                      { at: 2, k: tt("Who can join"), v: draft.type === "paid" ? (priceText ? tt("Paid, {priceText}", { priceText }) : tt("Paid membership")) : draft.type === "private" ? tt("Private, invite only") : tt("Free, anyone can join") },
                      { at: 3, k: tt("First space"), v: draft.spaceName.trim() },
                      { at: 3, k: tt("Welcome post"), v: draft.welcomeTitle.trim() || (draft.welcomeBody.trim() ? draft.welcomeBody.trim().slice(0, 80) : tt("None")) },
                    ].map((r) => (
                      <div key={r.k} className="flex min-h-12 items-center gap-3 py-2">
                        <dt className="w-[104px] shrink-0 text-[13px] text-[#6b7280] sm:w-[140px]">{r.k}</dt>
                        <dd className="min-w-0 flex-1 text-[14px] text-[#1a1a2e] [overflow-wrap:anywhere]">{r.v}</dd>
                        <button type="button" onClick={() => go(r.at)} className="-mr-1.5 inline-flex h-9 shrink-0 items-center rounded-lg px-2 text-[13px] font-medium text-[#4b5563] hover:bg-[#f1f2f4] hover:text-[#1a1a2e] sm:h-8">
                          {tt("Edit")}
                        </button>
                      </div>
                    ))}
                  </dl>
                  <p className="border-t border-[#f1f2f4] pt-4 text-[13px] leading-snug text-[#6b7280]">{tt("It starts as a draft. Only you and your team see it until you publish, and the Overview lists what to do first.")}</p>
                </>
              ) : null}
            </EditorCard>
          </div>

          <aside className="hidden min-w-0 lg:sticky lg:top-6 lg:block" aria-label={tt("Preview")}>
            <Preview d={draft} />
          </aside>
        </div>
      </form>

      {/* THE FOOT BAR, FROM 1024px: the product editor's, along the bottom of the pane. */}
      <div data-create-foot="" className="sticky bottom-0 z-30 mt-auto hidden shrink-0 border-t border-[#e5e7eb] bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_-8px_rgba(17,24,39,0.10)] lg:block">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-8">
          <p className="flex min-w-0 items-center gap-2 text-[14px] leading-5" data-create-state="">
            <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", draftTouched(draft) ? "bg-[#8b5cf6]" : "bg-[#b6bac1]")} />
            <span className="truncate font-medium text-[#1a1a2e]">{tt("Step {n} of {total}", { n: draft.step + 1, total: WIZARD_STEPS.length })}</span>
            <span className="truncate text-[#6b7280]">{STEP_TITLE[step]()}</span>
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {draft.step === 0 ? (
              <Link href="/app/community" className={barButton}>
                {tt("Cancel")}
              </Link>
            ) : (
              <button type="button" onClick={back} className={barButton}>
                {tt("Back")}
              </button>
            )}
            <NextButton busy={busy} last={last} onPress={forward} />
          </div>
        </div>
      </div>

      <UpgradeSheet open={upgrade} onClose={() => setUpgrade(false)} />
    </div>
  )
}
