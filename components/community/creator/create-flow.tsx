"use client"

/**
 * ===========================================================================
 *  A NEW COMMUNITY, IN UNDER A MINUTE, IN THE PRODUCT EDITOR
 * ===========================================================================
 * Round 13: "/app/community/new inherits /app/products/new". The same page
 * as New product (app/app/products/new/product-editor.tsx), field for field:
 *
 *   PHONE AND TABLET   a full screen layer over the app's header
 *                      (app/app/community/new/layout.tsx, PageLayer, as New
 *                      product), its own bar stuck to the top with Cancel on
 *                      the left and Create on the right, then one column of
 *                      the editor's cards.
 *   FROM 1024px        a page in the shell: a header with the way back, the
 *                      title, two columns of cards (the community on the
 *                      left, how it is found on the right), and the editor's
 *                      white foot bar along the bottom of the pane with the
 *                      state, Cancel and Create.
 *
 * The cards, in the order the page reads: About (name, description),
 * Photos (logo, cover), Who can join (free, paid with its price, private);
 * at the side, Address (what it will be, from the name) and Status (a
 * draft until it is published). Create makes it (POST /api/app/community)
 * and opens its Overview. Checked here with the server's own rules
 * (./logic checkCreate), so a mistake is said beside its field.
 *
 * THE FREE PLAN'S TWO (lib/communities/plan-limit.ts): with both made the
 * page opens the upgrade sheet, and Create opens it again instead of
 * sending something the server would refuse (402 plan_limit).
 */
import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { centsFromInput } from "@/lib/memberships/plan"
import { money, pricePer } from "@/lib/memberships/state"
import { slugify } from "@/lib/communities/slug"
import { ActivitySpinner } from "@/components/ui/activity-spinner"
import { barButton, primaryDepth } from "@/app/app/products/new/editor-buttons"
import { iconButton } from "@/app/app/orders/order-parts"
import { checkCreate, DESCRIPTION_CHARS, type CommunityType, type PriceInterval } from "./logic"
import { ChoiceCards, EditorCard, Notice, PicturePick, PriceInput, Segmented, errorText, field, label, send } from "./parts"
import { UpgradeSheet } from "./upgrade-sheet"

const TYPES: { value: CommunityType; title: string; detail: string }[] = [
  { value: "free", title: "Free", detail: "Anyone can join." },
  { value: "paid", title: "Paid membership", detail: "Members pay to join, every month, every year or once." },
  { value: "private", title: "Private", detail: "Invite only. Hidden from Explore." },
]

const INTERVALS: { value: PriceInterval; label: string }[] = [
  { value: "month", label: "Monthly" },
  { value: "year", label: "Yearly" },
  { value: "once", label: "One time" },
]

/** Create, in the editor's Save depth: the same height as Cancel, a spinner over the word while it works. */
function CreateButton({ busy, onCreate }: { busy: boolean; onCreate: () => void }) {
  return (
    <button
      type="button"
      onClick={onCreate}
      aria-busy={busy || undefined}
      data-create-submit=""
      className={cn(primaryDepth, "relative h-10 rounded-[10px] px-4 text-[15px] sm:h-8 sm:rounded-lg sm:px-3 sm:text-[13px]", busy && "cursor-default")}
    >
      <span className={cn(busy && "opacity-0")}>Create community</span>
      {busy ? (
        <span aria-hidden className="absolute inset-0 grid place-items-center">
          <ActivitySpinner size={16} label="Creating" className="text-white" />
        </span>
      ) : null}
    </button>
  )
}

export function CreateCommunity({ limitReached = false }: { limitReached?: boolean }) {
  const router = useRouter()
  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [logo, setLogo] = React.useState<string | null>(null)
  const [cover, setCover] = React.useState<string | null>(null)
  const [type, setType] = React.useState<CommunityType>("free")
  const [price, setPrice] = React.useState("")
  const [interval, setInterval] = React.useState<PriceInterval>("month")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<{ text: string; field?: string } | null>(null)
  const [upgrade, setUpgrade] = React.useState(limitReached)
  const [atLimit, setAtLimit] = React.useState(limitReached)
  const nameRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (!limitReached) nameRef.current?.focus({ preventScroll: true })
  }, [limitReached])

  const cents = centsFromInput(price)
  const priceText = cents && Number.isFinite(cents) ? (interval === "once" ? `${money(cents)} once, for lifetime access` : pricePer(cents, interval)) : null
  const address = slugify(name) || "your-community"
  const touched = Boolean(name.trim() || description.trim() || logo || cover || price)

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (busy) return
    if (atLimit) return setUpgrade(true)
    const body = { name, description, logoUrl: logo, coverUrl: cover, type, price, interval }
    const checked = checkCreate(body)
    if (!checked.ok) {
      setError({ text: checked.error, field: checked.field })
      if (checked.field === "name") nameRef.current?.focus()
      return
    }
    setBusy(true)
    setError(null)
    const res = await send<{ id?: string }>("/api/app/community", "POST", body)
    if (res.status === 402) {
      setBusy(false)
      setAtLimit(true)
      return setUpgrade(true)
    }
    if (!res.ok || !res.data.id) {
      setBusy(false)
      setError({ text: errorText(res.data.error, "The community could not be made. Try again."), field: res.data.field })
      return
    }
    router.push(`/app/community/${res.data.id}?created=1`)
  }

  const bad = (f: string) => error?.field === f

  return (
    <div className="orders-pane flex h-full flex-col overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter" data-create-community="">
      {/* THE BAR, BELOW 1024px: Cancel and Create at the top, as New product has them. */}
      <div data-create-bar="" className="sticky top-0 z-30 shrink-0 bg-[#f8f9fa] max-md:[[data-page-layer]_&]:pt-[env(safe-area-inset-top)] lg:hidden">
        <h1 className="sr-only">New community</h1>
        <div className="mx-auto flex h-14 max-w-[760px] items-center justify-between gap-2 app-gutter sm:h-16 sm:px-6">
          <Link href="/app/community" className={barButton} data-create-cancel="">
            Cancel
          </Link>
          <CreateButton busy={busy} onCreate={() => void submit()} />
        </div>
      </div>

      <form onSubmit={(e) => void submit(e)} noValidate data-create-form="" className="mx-auto w-full max-w-[760px] shrink-0 app-gutter pb-28 pt-3 sm:pt-4 lg:max-w-[1200px] lg:px-8 lg:pb-8 lg:pt-6">
        {/* THE HEADER, FROM 1024px: back to Community and the title. */}
        <header data-create-head="" className="mb-5 hidden min-h-9 items-center gap-2 lg:flex">
          <Link href="/app/community" aria-label="Back to Community" title="Community" className={cn(iconButton, "-ml-1.5 h-9 w-9 shrink-0 hover:bg-[#eceef1] active:bg-[#e4e6ea]")}>
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="min-w-0 truncate text-[24px] font-bold leading-9 text-[#1a1a2e] sm:text-[28px]">New community</h1>
        </header>

        {error && !["name", "price"].includes(error.field ?? "") ? (
          <div className="mb-3 lg:mb-4">
            <Notice>{error.text}</Notice>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-5">
          <div className="min-w-0 space-y-3 sm:space-y-4">
            <EditorCard title="About" id="about">
              <div>
                <label htmlFor="c-name" className={label}>
                  Name
                </label>
                <input
                  ref={nameRef}
                  id="c-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value.slice(0, 80))
                    if (bad("name")) setError(null)
                  }}
                  placeholder="The Morning Writers"
                  autoComplete="off"
                  enterKeyHint="next"
                  aria-invalid={bad("name") || undefined}
                  className={cn(field, "h-11 text-[16px] font-medium sm:text-[15px]", bad("name") && "border-[#dc2626]")}
                />
                {bad("name") ? (
                  <p role="alert" className="mt-1 text-[12.5px] text-[#b91c1c]">
                    {error?.text}
                  </p>
                ) : null}
              </div>
              <div>
                <label htmlFor="c-description" className={label}>
                  Description
                </label>
                <textarea
                  id="c-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_CHARS))}
                  rows={4}
                  placeholder="Who it is for and what members do here"
                  aria-invalid={bad("description") || undefined}
                  className={cn(field, "min-h-[104px] resize-y py-2.5 leading-relaxed", bad("description") && "border-[#dc2626]")}
                />
              </div>
            </EditorCard>

            <EditorCard title="Photos" hint="Both optional. Change them, and add a gallery, any time." id="photos">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[auto_1fr] sm:gap-6">
                <div>
                  <p className={label}>Logo</p>
                  <PicturePick value={logo} onChange={setLogo} shape="square" name="logo" onError={(m) => setError({ text: m })} />
                </div>
                <div className="min-w-0">
                  <p className={label}>Cover</p>
                  <PicturePick value={cover} onChange={setCover} shape="wide" name="cover" onError={(m) => setError({ text: m })} />
                </div>
              </div>
            </EditorCard>

            <EditorCard title="Who can join" id="access">
              <ChoiceCards
                value={type}
                onChange={(v) => {
                  setType(v)
                  setError(null)
                }}
                options={TYPES}
                label="Who can join"
                rows
              />
              {type === "paid" ? (
                <div className="grid grid-cols-1 gap-3 border-t border-[#f1f2f4] pt-4 sm:grid-cols-[180px_1fr] sm:items-end" data-paid-fields="">
                  <div>
                    <label htmlFor="c-price" className={label}>
                      Price
                    </label>
                    <PriceInput
                      id="c-price"
                      value={price}
                      onChange={(v) => {
                        setPrice(v)
                        if (bad("price")) setError(null)
                      }}
                      placeholder={interval === "year" ? "190" : interval === "once" ? "99" : "19"}
                      invalid={bad("price")}
                    />
                  </div>
                  <div className="min-w-0">
                    <Segmented value={interval} onChange={setInterval} options={INTERVALS} label="How often" className="w-full sm:w-auto" />
                  </div>
                  <p className={cn("text-[12.5px] sm:col-span-2", bad("price") ? "text-[#b91c1c]" : "text-[#6b7280]")} role={bad("price") ? "alert" : undefined}>
                    {bad("price") ? error?.text : priceText ? `Members pay ${priceText}.` : "Members pay through Stripe. You can add a yearly price or more tiers later."}
                  </p>
                </div>
              ) : null}
            </EditorCard>
          </div>

          <div className="min-w-0 space-y-3 sm:space-y-4 lg:sticky lg:top-6">
            <EditorCard title="Address" hint="Made from the name. Change it in Settings any time." id="address">
              <p className="truncate rounded-lg bg-[#f6f7f8] px-3 py-2.5 text-[13.5px] text-[#4b5563]" data-create-address="">
                storelib.com/community/<span className="font-medium text-[#1a1a2e]">{address}</span>
              </p>
            </EditorCard>
            <EditorCard title="Status" id="status">
              <p className="flex items-center gap-2 text-[14px] text-[#1a1a2e]">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#e0a100]" />
                Draft
              </p>
              <p className="text-[13px] leading-snug text-[#6b7280]">Only you and your team see it until you publish. The Overview lists what to do first.</p>
            </EditorCard>
          </div>
        </div>
      </form>

      {/* THE FOOT BAR, FROM 1024px: the product editor's, along the bottom of the pane. */}
      <div data-create-foot="" className="sticky bottom-0 z-30 mt-auto hidden shrink-0 border-t border-[#e5e7eb] bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_-8px_rgba(17,24,39,0.10)] lg:block">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-8">
          <p className="flex min-w-0 items-center gap-2 text-[14px] leading-5" data-create-state="">
            <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", touched ? "bg-[#8b5cf6]" : "bg-[#b6bac1]")} />
            <span className={cn("truncate", touched ? "font-medium text-[#1a1a2e]" : "text-[#6b7280]")}>{touched ? "Not created yet" : "New community"}</span>
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Link href="/app/community" className={barButton}>
              Cancel
            </Link>
            <CreateButton busy={busy} onCreate={() => void submit()} />
          </div>
        </div>
      </div>

      <UpgradeSheet open={upgrade} onClose={() => setUpgrade(false)} />
    </div>
  )
}
