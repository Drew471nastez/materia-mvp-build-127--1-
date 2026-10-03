"use client"

/**
 * ===========================================================================
 *  A NEW COMMUNITY, IN UNDER A MINUTE
 * ===========================================================================
 * One screen, top to bottom: the name, a line or two about it, a logo and a
 * cover (both optional), who can join (free, a paid membership, or private
 * by invite), and for a paid one the price and how often. Create makes it
 * (POST /api/app/community: the community, its spaces and levels, and for a
 * paid one the tier with the membership or one time product that sells
 * it) and opens its Overview, where the next steps are.
 *
 * Checked here with the same rules the server applies
 * (components/community/creator/logic.ts checkCreate), so a mistake is
 * said beside the field before anything is sent.
 */
import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { PaneBar } from "@/app/app/orders/order-parts"
import { centsFromInput } from "@/lib/memberships/plan"
import { money, pricePer } from "@/lib/memberships/state"
import { checkCreate, DESCRIPTION_CHARS, type CommunityType, type PriceInterval } from "./logic"
import { ChoiceCards, Notice, PicturePick, PriceInput, Segmented, buttonPrimary, buttonSecondary, card, errorText, field, label, send } from "./parts"

const TYPES: { value: CommunityType; title: string; detail: string }[] = [
  { value: "free", title: "Free", detail: "Anyone can join." },
  { value: "paid", title: "Paid membership", detail: "Members pay to join." },
  { value: "private", title: "Private", detail: "Invite only. Hidden from Explore." },
]

const INTERVALS: { value: PriceInterval; label: string }[] = [
  { value: "month", label: "Monthly" },
  { value: "year", label: "Yearly" },
  { value: "once", label: "One time" },
]

export function CreateCommunity() {
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
  const nameRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    nameRef.current?.focus({ preventScroll: true })
  }, [])

  const cents = centsFromInput(price)
  const priceText = cents && Number.isFinite(cents) ? (interval === "once" ? `${money(cents)} once, for lifetime access` : pricePer(cents, interval)) : null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
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
    if (!res.ok || !res.data.id) {
      setBusy(false)
      setError({ text: errorText(res.data.error, "The community could not be made. Try again."), field: res.data.field })
      return
    }
    router.push(`/app/community/${res.data.id}?created=1`)
  }

  const bad = (f: string) => error?.field === f

  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter" data-create-community="">
      <PaneBar width="max-w-[680px]" className="flex min-h-[60px] items-center gap-2 pb-2 pt-3">
        <Link href="/app/community" aria-label="Community" className="-ml-1.5 grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[#1a1a2e] hover:bg-[#eceef1] sm:h-9 sm:w-9">
          <ArrowLeft aria-hidden className="h-[18px] w-[18px]" />
        </Link>
        <h1 className="min-w-0 truncate text-[20px] font-bold text-[#1a1a2e] sm:text-[24px]">New community</h1>
      </PaneBar>

      <form onSubmit={(e) => void submit(e)} noValidate className="mx-auto max-w-[680px] app-gutter pb-32 pt-2 md:pb-12">
        <div className={cn(card, "divide-y divide-[#f1f2f4]")}>
          <div className="space-y-4 px-4 py-5 sm:px-6">
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
                aria-invalid={bad("name") || undefined}
                className={cn(field, "h-11 text-[16px] font-medium sm:text-[15px]", bad("name") && "border-[#dc2626]")}
              />
            </div>
            <div>
              <label htmlFor="c-description" className={label}>
                Description
              </label>
              <textarea
                id="c-description"
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_CHARS))}
                rows={3}
                placeholder="Who it is for and what members do here"
                aria-invalid={bad("description") || undefined}
                className={cn(field, "min-h-[88px] resize-y py-2.5 leading-relaxed", bad("description") && "border-[#dc2626]")}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:gap-8">
              <div>
                <p className={label}>Logo</p>
                <PicturePick value={logo} onChange={setLogo} shape="square" name="logo" onError={(m) => setError({ text: m })} />
              </div>
              <div className="min-w-0">
                <p className={label}>Cover</p>
                <PicturePick value={cover} onChange={setCover} shape="wide" name="cover" onError={(m) => setError({ text: m })} />
              </div>
            </div>
          </div>

          <div className="space-y-3 px-4 py-5 sm:px-6">
            <p className="text-[14px] font-semibold text-[#1a1a2e]">Who can join</p>
            <ChoiceCards value={type} onChange={(v) => { setType(v); setError(null) }} options={TYPES} label="Who can join" />
            {type === "paid" ? (
              <div className="grid gap-3 pt-1 sm:grid-cols-[180px_1fr] sm:items-end" data-paid-fields="">
                <div>
                  <label htmlFor="c-price" className={label}>
                    Price
                  </label>
                  <PriceInput id="c-price" value={price} onChange={(v) => { setPrice(v); if (bad("price")) setError(null) }} placeholder={interval === "year" ? "190" : interval === "once" ? "99" : "19"} invalid={bad("price")} />
                </div>
                <div className="min-w-0">
                  <Segmented value={interval} onChange={setInterval} options={INTERVALS} label="How often" className="w-full sm:w-auto" />
                </div>
                <p className="text-[12.5px] text-[#6b7280] sm:col-span-2">
                  {priceText ? `Members pay ${priceText}.` : "Members pay through Stripe; you can add a yearly price or more tiers later."}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {error && !["name", "price"].includes(error.field ?? "") ? (
          <div className="mt-3">
            <Notice>{error.text}</Notice>
          </div>
        ) : error ? (
          <p role="alert" className="mt-3 px-1 text-[13px] text-[#b91c1c]">
            {error.text}
          </p>
        ) : null}

        <div className="sticky bottom-[calc(var(--app-nav-room,0px)+0.75rem)] z-10 mt-4 md:static" data-create-actions="">
          <div className="flex items-center justify-end gap-2 max-md:rounded-2xl max-md:border max-md:border-[#e5e7eb]/80 max-md:bg-white max-md:p-2 max-md:shadow-[0_8px_24px_-8px_rgba(17,24,39,0.18)]">
            <Link href="/app/community" className={cn(buttonSecondary, "h-11 px-4 text-[14px] md:h-9 md:text-[13px]")}>
              Cancel
            </Link>
            <button type="submit" disabled={busy} data-create-submit="" className={cn(buttonPrimary, "h-11 flex-1 px-5 text-[15px] md:h-9 md:flex-none md:text-[13px]")}>
              {busy ? "Creating" : "Create community"}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
