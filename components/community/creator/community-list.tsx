"use client"

/**
 * ===========================================================================
 *  /app/community: A CARD PER COMMUNITY
 * ===========================================================================
 * "Product card style rounded cards with a '...' menu, like /app/products"
 * (round 13). Each community is a card in a grid: its cover across the top,
 * the logo sitting on the cover's lower edge, the name and the line under
 * it, and a foot with the members and, for a paid one, the monthly revenue
 * (only for somebody who may see its analytics). The state is the Products
 * list's dot and word (green live, amber draft, grey archived). The whole
 * card opens the community's editor; the more button at its foot is the
 * Products row's (quietDepth, ResponsiveActionMenu: a menu on a computer,
 * a sheet on a phone) with Open, Edit, Share, Analytics, Duplicate settings
 * and Archive, each only when this person may.
 *
 * One column on a phone, two from 640px, three from 1024px. The bar keeps
 * the title and New community, as Products keeps New product.
 *
 * THE FREE PLAN'S TWO (lib/communities/plan-limit.ts). With both made, New
 * community and Duplicate settings open the upgrade sheet (./upgrade-sheet)
 * instead of a form the server would refuse.
 */
import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Archive, ArchiveRestore, BarChart3, Copy, ExternalLink, Pencil, Plus, Share } from "lucide-react"
import { cn } from "@/lib/utils"
import { GUTTER, LIST_BAR, LIST_WIDTH, PaneBar, RowMenuButton } from "@/app/app/orders/order-parts"
import { quietDepth } from "@/app/app/products/new/editor-buttons"
import { accentDepth } from "@/components/ui/depth-button"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { optimizedImageUrl, optimizedSrcSet } from "@/lib/images/optimized-url"
import { compactCount } from "@/lib/communities/format"
import { money } from "@/lib/memberships/state"
import type { CommunityLimitView, CommunityListRow } from "./view-types"
import { ROLE_LABEL } from "./logic"
import { Confirm, ToastHost, card, errorText, send, useToast } from "./parts"
import { UpgradeSheet } from "./upgrade-sheet"

/** New community: the Products page's violet New product, at the bar's 32px (35 from 1024px) with a 44px press on a phone. */
const NEW_LOOK = cn(accentDepth, "relative h-8 gap-1.5 rounded-lg px-3 text-[13px] max-md:after:absolute max-md:after:-inset-1.5 max-md:after:content-[''] lg:h-[35px] lg:px-[13px] lg:text-[14.5px]")

/** The card's more button: the Products row's quiet square, 32px with a 44px press on a phone. */
const MENU_LOOK = cn(quietDepth, "relative z-[1] h-8 w-8 rounded-lg text-[#4b5563] max-md:after:absolute max-md:after:-inset-1.5 max-md:after:content-['']")

type State = "live" | "draft" | "archived" | "suspended"

function stateOf(r: CommunityListRow): State {
  if (r.status === "suspended") return "suspended"
  if (r.archived) return "archived"
  return r.status === "published" ? "live" : "draft"
}

const STATE_WORD: Record<State, string> = { live: "Published", draft: "Draft", archived: "Archived", suspended: "Suspended" }
const STATE_DOT: Record<State, string> = { live: "bg-[#22a06b]", draft: "bg-[#e0a100]", archived: "bg-[#b6bac1]", suspended: "bg-[#d92d20]" }

/**
 * The address a card shares and opens: storelib.com, always. Only a
 * storelib.com address opens the Storelib app (lib/platform/app-links.ts),
 * so a share from a creator's own domain or a preview host would hand out a
 * link that can never do that.
 */
function publicUrl(slug: string): string {
  return `https://storelib.com/community/${slug}`
}

/** The system share sheet where there is one on a touch screen, otherwise the address copied. */
async function shareCommunity(r: CommunityListRow): Promise<"shared" | "copied" | "failed"> {
  const url = publicUrl(r.slug)
  const touch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches
  if (touch && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: r.name, text: r.tagline ?? undefined, url })
      return "shared"
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") return "shared"
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    return "copied"
  } catch {
    /* An older webview, or a page without clipboard permission: a hidden field and the old command. */
    const ta = document.createElement("textarea")
    ta.value = url
    ta.setAttribute("readonly", "")
    ta.style.position = "fixed"
    ta.style.opacity = "0"
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand("copy")
    ta.remove()
    return ok ? "copied" : "failed"
  }
}

export function CommunityList(props: { rows: CommunityListRow[]; available: boolean; limit: CommunityLimitView }) {
  return (
    <ToastHost>
      <List {...props} />
    </ToastHost>
  )
}

function List({ rows, available, limit }: { rows: CommunityListRow[]; available: boolean; limit: CommunityLimitView }) {
  const router = useRouter()
  const toast = useToast()
  const [upgrade, setUpgrade] = React.useState(false)
  const [archiving, setArchiving] = React.useState<CommunityListRow | null>(null)
  const [busy, setBusy] = React.useState(false)
  const room = limit.max === null || limit.owned < limit.max
  /* At the limit, New community asks first: the link still points at the form, for a middle click or a screen reader. */
  const askNew = (e: React.MouseEvent) => {
    if (room) return
    e.preventDefault()
    setUpgrade(true)
  }

  const duplicate = React.useCallback(
    async (r: CommunityListRow) => {
      if (!room) return setUpgrade(true)
      setBusy(true)
      const res = await send<{ id?: string }>(`/api/app/community/${r.id}/duplicate`, "POST")
      setBusy(false)
      if (res.status === 402) return setUpgrade(true)
      if (!res.ok || !res.data.id) return toast(errorText(res.data.error, "The copy could not be made. Try again."))
      toast("Copied as a new draft")
      router.push(`/app/community/${res.data.id}/settings`)
    },
    [room, router, toast],
  )

  const archive = React.useCallback(
    async (r: CommunityListRow) => {
      setBusy(true)
      const res = await send(`/api/app/community/${r.id}/archive`, "POST", { archived: !r.archived })
      setBusy(false)
      setArchiving(null)
      if (!res.ok) return toast(errorText(res.data.error))
      toast(r.archived ? "Brought back as a draft" : "Archived")
      router.refresh()
    },
    [router, toast],
  )

  const share = React.useCallback(
    async (r: CommunityListRow) => {
      const done = await shareCommunity(r)
      if (done === "copied") toast("Link copied")
      else if (done === "failed") toast("The link could not be copied.")
    },
    [toast],
  )

  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter" data-community-list="">
      <PaneBar width={LIST_WIDTH} className={LIST_BAR}>
        <h1 className="min-w-0 truncate text-[22px] font-bold leading-7 text-[#1a1a2e] sm:text-[25px] sm:leading-8 lg:text-[28px] lg:leading-[35px]">Community</h1>
        {available && rows.length > 0 ? (
          <Link href="/app/community/new" onClick={askNew} className={NEW_LOOK} data-new-community="" data-at-limit={room ? undefined : ""}>
            <Plus aria-hidden className="h-4 w-4" />
            New community
          </Link>
        ) : null}
      </PaneBar>

      <div className={cn("mx-auto pb-24 md:pb-8", LIST_WIDTH, GUTTER)}>
        {!available ? (
          <div className={cn(card, "mt-3 px-6 py-10 text-center text-[14px] text-[#6b7280]")}>Communities are not set up on Storelib yet. They appear here once they are.</div>
        ) : rows.length === 0 ? (
          <div className={cn(card, "mt-3 px-6 py-12 text-center")} data-empty="">
            <p className="text-[16px] font-semibold text-[#1a1a2e]">Start a community</p>
            <p className="mx-auto mt-1.5 max-w-md text-[14px] leading-relaxed text-[#6b7280]">
              A place for your members: posts, chat, Learn and live events. Free, paid every month or year, or by invite only.
            </p>
            <Link href="/app/community/new" onClick={askNew} className={cn(NEW_LOOK, "mt-5 inline-flex h-10 px-4 text-[14px]")}>
              <Plus aria-hidden className="h-4 w-4" />
              New community
            </Link>
          </div>
        ) : (
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3" data-community-grid="">
            {rows.map((r) => (
              <CommunityCard key={r.id} row={r} busy={busy} onShare={share} onDuplicate={duplicate} onArchive={(x) => (x.archived ? void archive(x) : setArchiving(x))} />
            ))}
          </ul>
        )}
        {available && limit.max !== null && rows.length > 0 ? (
          <p className="mt-4 px-1 text-[12.5px] text-[#9ca3af]" data-limit-note="">
            {Math.min(limit.owned, limit.max)} of {limit.max} communities on the Free plan.{" "}
            {!room ? (
              <button type="button" onClick={() => setUpgrade(true)} className="inline-flex min-h-10 items-center font-medium text-[#1a1a2e] underline-offset-2 hover:underline md:min-h-0">
                Upgrade for more
              </button>
            ) : null}
          </p>
        ) : null}
      </div>

      <UpgradeSheet open={upgrade} onClose={() => setUpgrade(false)} />
      <Confirm
        open={archiving !== null}
        onClose={() => setArchiving(null)}
        title={`Archive ${archiving?.name ?? "this community"}?`}
        detail="Members can still read it. Nobody can post or join until you bring it back. Nothing is deleted."
        action="Archive"
        busy={busy}
        onConfirm={() => archiving && void archive(archiving)}
      />
    </div>
  )
}

const CommunityCard = React.memo(function CommunityCard({
  row: r,
  busy,
  onShare,
  onDuplicate,
  onArchive,
}: {
  row: CommunityListRow
  busy: boolean
  onShare: (r: CommunityListRow) => void
  onDuplicate: (r: CommunityListRow) => void
  onArchive: (r: CommunityListRow) => void
}) {
  const state = stateOf(r)
  const base = `/app/community/${r.id}`
  const items = React.useMemo<ActionMenuItem[]>(() => {
    const out: ActionMenuItem[] = [{ label: "Open", icon: <ExternalLink className="h-4 w-4" />, href: `/community/${r.slug}`, target: "_blank" }]
    if (r.can.edit) out.push({ label: "Edit", icon: <Pencil className="h-4 w-4" />, href: `${base}/settings` })
    out.push({ label: "Share", icon: <Share className="h-4 w-4" />, onClick: () => onShare(r) })
    if (r.can.analytics) out.push({ label: "Analytics", icon: <BarChart3 className="h-4 w-4" />, href: `${base}/analytics` })
    if (r.can.duplicate) out.push({ label: "Duplicate settings", icon: <Copy className="h-4 w-4" />, onClick: () => onDuplicate(r), separatorBefore: true })
    if (r.can.archive && state !== "suspended")
      out.push(
        r.archived
          ? { label: "Bring back", icon: <ArchiveRestore className="h-4 w-4" />, onClick: () => onArchive(r), separatorBefore: !r.can.duplicate }
          : { label: "Archive", icon: <Archive className="h-4 w-4" />, onClick: () => onArchive(r), variant: "warning", separatorBefore: !r.can.duplicate },
      )
    return out
  }, [r, base, state, onShare, onDuplicate, onArchive])
  const line = r.tagline?.trim() || (r.role !== "owner" ? `You are ${r.role === "admin" ? "an admin" : "a moderator"} here` : r.priceLine) || ""

  return (
    <li
      data-community-card={r.id}
      data-state={state}
      aria-busy={busy || undefined}
      className={cn(card, "group/card relative flex min-w-0 flex-col overflow-hidden transition-[box-shadow,border-color] duration-150 pointer-fine:hover:border-[#e5e7eb] pointer-fine:hover:shadow-[0_1px_2px_rgba(16,24,40,0.05),0_6px_16px_-8px_rgba(16,24,40,0.12)]")}
    >
      {/* The whole card opens the editor; the menu sits above this link. */}
      <Link href={base} aria-label={`${r.name}, ${STATE_WORD[state]}`} className="absolute inset-0 z-0 rounded-[inherit] outline-none focus-visible:shadow-[inset_0_0_0_2px_#1a1a2e]" data-card-link="" />
      <Cover row={r} />
      <div className="pointer-events-none relative flex min-w-0 flex-1 flex-col px-4 pb-3">
        <div className="-mt-6 flex items-end justify-between gap-3">
          <Logo row={r} />
          <span data-card-state={state} className="mb-0.5 inline-flex shrink-0 items-center gap-1.5 text-[12.5px] font-medium text-[#4b5563]">
            <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", STATE_DOT[state])} />
            {STATE_WORD[state]}
          </span>
        </div>
        <p className="mt-2.5 truncate text-[15px] font-semibold leading-5 text-[#1a1a2e]" data-card-name="">
          {r.name}
        </p>
        <p className="mt-0.5 h-[18px] truncate text-[13px] leading-[18px] text-[#6b7280]">{line}</p>
        <div className="mt-3 flex min-h-8 items-center gap-3 border-t border-[#f1f2f4] pt-2.5">
          <p className="flex min-w-0 flex-1 items-baseline gap-3 text-[13px] text-[#6b7280]">
            <span className="shrink-0" data-card-members="">
              <span className="font-semibold tabular-nums text-[#1a1a2e]">{compactCount(r.memberCount)}</span> {r.memberCount === 1 ? "member" : "members"}
            </span>
            {r.mrrCents !== null ? (
              <span className="min-w-0 truncate" data-card-mrr="">
                <span className="font-semibold tabular-nums text-[#1a1a2e]">{money(r.mrrCents, r.currency)}</span> MRR
              </span>
            ) : r.role !== "owner" ? (
              <span className="min-w-0 truncate">{ROLE_LABEL[r.role]}</span>
            ) : r.access !== "paid" ? (
              <span className="min-w-0 truncate">{r.priceLine}</span>
            ) : null}
          </p>
          <span className="pointer-events-auto relative z-[1]">
            <ResponsiveActionMenu title={r.name} align="end" trigger={<RowMenuButton label={`Actions for ${r.name}`} className={MENU_LOOK} data-card-menu="" />} items={items} />
          </span>
        </div>
      </div>
    </li>
  )
})

/**
 * The cover across the top, 5:2 on a phone (a column of cards is not a
 * column of posters) and 2:1 from 640px; a quiet grey field when there is
 * none, the logo below it already says whose it is. An archived community's
 * cover goes grey and a little faint.
 */
function Cover({ row: r }: { row: CommunityListRow }) {
  const src = r.coverUrl
  return (
    <div aria-hidden className={cn("pointer-events-none relative aspect-[5/2] w-full overflow-hidden bg-[#eef0f2] after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-[rgba(17,24,39,0.06)] after:content-[''] sm:aspect-[2/1]", r.archived && "opacity-70 grayscale")} data-card-cover="">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- the srcset is chosen here, as the Products list does
        <img src={optimizedImageUrl(src, 480)} srcSet={optimizedSrcSet(src, [384, 640, 1080])} sizes="(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw" alt="" loading="lazy" decoding="async" draggable={false} className="h-full w-full object-cover" />
      ) : null}
    </div>
  )
}

/** The logo on the cover's lower edge, with a white ring so it reads on any cover. */
function Logo({ row: r }: { row: CommunityListRow }) {
  const letter = (Array.from(r.name.trim())[0] || "C").toUpperCase()
  return (
    <span className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-[13px] bg-[#1a1a2e] shadow-[0_0_0_3px_#fff,0_1px_3px_rgba(16,24,40,0.12)]" data-card-logo="">
      {r.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={optimizedImageUrl(r.logoUrl, 48)} srcSet={optimizedSrcSet(r.logoUrl, [48, 96, 128])} sizes="48px" alt="" width={48} height={48} loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden className="text-[18px] font-semibold text-white">
          {letter}
        </span>
      )}
    </span>
  )
}
