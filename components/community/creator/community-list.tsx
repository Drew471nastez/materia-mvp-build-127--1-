"use client"

/**
 * ===========================================================================
 *  /app/community: A CARD PER COMMUNITY
 * ===========================================================================
 * "Product card style rounded cards with a '...' menu, like /app/products"
 * (round 13). Each community is a card in a grid: its cover across the top,
 * the logo sitting on the cover's lower edge, the name and the line under
 * it, and a foot with the members and, for a paid one, the monthly revenue
 * (only for somebody who may see its analytics). The state is the /app
 * status badge (round 33: green Published, Draft, Archived; round 26:
 * Pending deletion), at the end of the name's line, so it never sits on
 * the cover's edge and the card is no taller. The whole
 * card opens the community's editor; the more button at its foot is the
 * Products row's (quietDepth, ResponsiveActionMenu: a menu on a computer,
 * a sheet on a phone) with Open, Edit page, Share, Analytics, Duplicate
 * settings and Archive, each only when this person may. Share only for a
 * published community (a draft's link is a 404 to everyone else); one being
 * deleted offers Keep the community, which opens the card that keeps it.
 *
 * One column on a phone, two from 640px, three from 1024px. The bar keeps
 * the title and New community, as Products keeps New product.
 *
 * THE FREE PLAN'S TWO (lib/communities/plan-limit.ts). With both made, New
 * community and Duplicate settings open the upgrade sheet (./upgrade-sheet)
 * instead of a form the server would refuse. Round 26: a community being
 * deleted takes no place, so its replacement can be made the same day.
 */
import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Archive, ArchiveRestore, BarChart3, Copy, ExternalLink, Pencil, Plus, RotateCcw, Share } from "lucide-react"
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
import { COMMUNITY_STATE_WORD, CommunityStatusBadge, Confirm, ToastHost, card, communityState, errorText, send, useToast, type CommunityState } from "./parts"
import { CoverFill } from "@/components/community/cover-fill"
import { nameCoverGradient } from "@/lib/communities/cover-gradient"
import { UpgradeSheet } from "./upgrade-sheet"
import { tt } from "@/lib/i18n/text"
import { Rich } from "@/lib/i18n/rich"
import { appLocale } from "@/lib/i18n/format"

/** New community: the Products page's violet New product, at the bar's 32px (35 from 1024px) with a 44px press on a phone. */
const NEW_LOOK = cn(accentDepth, "relative h-8 gap-1.5 rounded-lg px-3 text-[13px] max-md:after:absolute max-md:after:-inset-1.5 max-md:after:content-[''] lg:h-[35px] lg:px-[13px] lg:text-[14.5px]")

/** The card's more button: the Products row's quiet square, 32px with a 44px press on a phone. */
const MENU_LOOK = cn(quietDepth, "relative z-[1] h-8 w-8 rounded-lg text-[#4b5563] max-md:after:absolute max-md:after:-inset-1.5 max-md:after:content-['']")

/* Round 33: the state is the /app badge (./parts CommunityStatusBadge), not a dot and a word. */
const stateOf = (r: CommunityListRow): CommunityState => communityState(r)

/** "Nov 5, 2026": when a community being deleted goes, in the dashboard's language. */
function shortDate(iso: string): string {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? new Intl.DateTimeFormat(appLocale(), { month: "short", day: "numeric", year: "numeric" }).format(t) : ""
}

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
      const res = await send<{ id?: string; slug?: string }>(`/api/app/community/${r.id}/duplicate`, "POST")
      setBusy(false)
      if (res.status === 402) return setUpgrade(true)
      if (!res.ok || !res.data.id) return toast(errorText(res.data.error, tt("The copy could not be made. Try again.")))
      toast(tt("Copied as a new draft"))
      /* Round 33: a copy is renamed first, on its page. */
      router.push(`/app/community/${res.data.slug || res.data.id}/page`)
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
      toast(r.archived ? tt("Brought back as a draft") : tt("Archived"))
      router.refresh()
    },
    [router, toast],
  )

  const share = React.useCallback(
    async (r: CommunityListRow) => {
      const done = await shareCommunity(r)
      if (done === "copied") toast(tt("Link copied"))
      else if (done === "failed") toast(tt("The link could not be copied."))
    },
    [toast],
  )

  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter" data-community-list="">
      <PaneBar width={LIST_WIDTH} className={LIST_BAR}>
        <h1 className="min-w-0 truncate text-[22px] font-bold leading-7 text-[#1a1a2e] sm:text-[25px] sm:leading-8 lg:text-[28px] lg:leading-[35px]">{tt("Community")}</h1>
        {available && rows.length > 0 ? (
          <Link href="/app/community/new" onClick={askNew} className={NEW_LOOK} data-new-community="" data-at-limit={room ? undefined : ""}>
            <Plus aria-hidden className="h-4 w-4" />
            {tt("New community")}
          </Link>
        ) : null}
      </PaneBar>

      <div className={cn("mx-auto pb-24 md:pb-8", LIST_WIDTH, GUTTER)}>
        {!available ? (
          <div className={cn(card, "mt-3 px-6 py-10 text-center text-[14px] text-[#6b7280]")}>{tt("Communities are not set up on Storelib yet. They appear here once they are.")}</div>
        ) : rows.length === 0 ? (
          <div className={cn(card, "mt-3 px-6 py-12 text-center")} data-empty="">
            <p className="text-[16px] font-semibold text-[#1a1a2e]">{tt("Start a community")}</p>
            <p className="mx-auto mt-1.5 max-w-md text-[14px] leading-relaxed text-[#6b7280]">
              {tt("A place for your members: posts, chat, Learn and live events. Free, paid every month or year, or by invite only.")}
            </p>
            <Link href="/app/community/new" onClick={askNew} className={cn(NEW_LOOK, "mt-5 inline-flex h-10 px-4 text-[14px]")}>
              <Plus aria-hidden className="h-4 w-4" />
              {tt("New community")}
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
            {Math.min(limit.owned, limit.max)} {tt("of {max} communities on the Free plan.", { max: limit.max })}{" "}
            {rows.some((r) => r.deleting && r.role === "owner") ? <>{tt("Communities being deleted do not count.")} </> : null}
            {!room ? (
              <button type="button" onClick={() => setUpgrade(true)} className="inline-flex min-h-10 items-center font-medium text-[#1a1a2e] underline-offset-2 hover:underline md:min-h-0">
                {tt("Upgrade for more")}
              </button>
            ) : null}
          </p>
        ) : null}
      </div>

      <UpgradeSheet open={upgrade} onClose={() => setUpgrade(false)} />
      <Confirm
        open={archiving !== null}
        onClose={() => setArchiving(null)}
        title={tt("Archive {value}?", { value: archiving?.name ?? tt("this community") })}
        detail={tt("Members can still read it. Nobody can post or join until you bring it back. Nothing is deleted.")}
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
  const base = `/app/community/${r.slug}`
  const items = React.useMemo<ActionMenuItem[]>(() => {
    const out: ActionMenuItem[] = [{ label: tt("Open"), icon: <ExternalLink className="h-4 w-4" />, href: `/community/${r.slug}`, target: "_blank" }]
    /* Round 33: Edit opens the community's page in its own section; Settings is a tab beside it. */
    if (r.can.edit) out.push({ label: tt("Edit page"), icon: <Pencil className="h-4 w-4" />, href: `${base}/page` })
    /* Round 26: a draft's link is a 404 to everyone else, and an archived one or one being deleted takes nobody new. */
    if (state === "published") out.push({ label: tt("Share"), icon: <Share className="h-4 w-4" />, onClick: () => onShare(r) })
    if (r.can.analytics) out.push({ label: tt("Analytics"), icon: <BarChart3 className="h-4 w-4" />, href: `${base}/analytics` })
    if (r.can.duplicate) out.push({ label: tt("Duplicate settings"), icon: <Copy className="h-4 w-4" />, onClick: () => onDuplicate(r), separatorBefore: true })
    /* Round 26: one being deleted comes back only through Keep, on the card that says when it goes (Settings, Publish and archive). */
    if (r.deleting?.canKeep) out.push({ label: tt("Keep the community"), icon: <RotateCcw className="h-4 w-4" />, href: `${base}/settings?tab=advanced`, separatorBefore: !r.can.duplicate })
    else if (r.can.archive && state !== "suspended" && state !== "deleting")
      out.push(
        r.archived
          ? { label: tt("Bring back"), icon: <ArchiveRestore className="h-4 w-4" />, onClick: () => onArchive(r), separatorBefore: !r.can.duplicate }
          : { label: tt("Archive"), icon: <Archive className="h-4 w-4" />, onClick: () => onArchive(r), variant: "warning", separatorBefore: !r.can.duplicate },
      )
    return out
  }, [r, base, state, onShare, onDuplicate, onArchive])
  const line = r.deleting
    ? tt("Deleting on {date}", { date: shortDate(r.deleting.deleteAt) })
    : r.tagline?.trim() || (r.role !== "owner" ? tt("You are {value} here", { value: r.role === "admin" ? tt("an admin") : tt("a moderator") }) : r.priceLine) || ""

  return (
    <li
      data-community-card={r.id}
      data-state={state}
      aria-busy={busy || undefined}
      className={cn(card, "group/card relative flex min-w-0 flex-col overflow-hidden transition-[box-shadow,border-color] duration-150 pointer-fine:hover:border-[#e5e7eb] pointer-fine:hover:shadow-[0_1px_2px_rgba(16,24,40,0.05),0_6px_16px_-8px_rgba(16,24,40,0.12)]")}
    >
      {/* The whole card opens the editor; the menu sits above this link. */}
      <Link href={base} aria-label={`${r.name}, ${COMMUNITY_STATE_WORD[state]}`} className="absolute inset-0 z-0 rounded-[inherit] outline-none focus-visible:shadow-[inset_0_0_0_2px_#1a1a2e]" data-card-link="" />
      <Cover row={r} />
      <div className="pointer-events-none relative flex min-w-0 flex-1 flex-col px-4 pb-3">
        <div className="-mt-6 flex">
          <Logo row={r} />
        </div>
        {/*
          Round 26 ("the badges almost touch the cover"): the state ends the name's line, 34px under the cover's edge on
          every card, instead of sitting on the logo's foot 4px under it. The line is the badge's 22px, the 2px it adds
          taken from the gap above, so the card is as tall as before.
        */}
        <div className="mt-2 flex h-[22px] min-w-0 items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-5 text-[#1a1a2e]" data-card-name="">
            {r.name}
          </p>
          <span data-card-state={state} className="inline-flex shrink-0">
            <CommunityStatusBadge state={state} />
          </span>
        </div>
        <p className="mt-0.5 h-[18px] truncate text-[13px] leading-[18px] text-[#6b7280]" data-card-line="">
          {line}
        </p>
        <div className="mt-3 flex min-h-8 items-center gap-3 border-t border-[#f1f2f4] pt-2.5">
          <p className="flex min-w-0 flex-1 items-baseline gap-3 text-[13px] text-[#6b7280]">
            <span className="shrink-0" data-card-members="">
              <Rich text={tt("{n, plural, one {{count} member} other {{count} members}}", { n: r.memberCount })} parts={{ count: <span className="font-semibold tabular-nums text-[#1a1a2e]">{compactCount(r.memberCount)}</span> }} />
            </span>
            {r.mrrCents !== null ? (
              <span className="min-w-0 truncate" data-card-mrr="">
                <span className="font-semibold tabular-nums text-[#1a1a2e]">{money(r.mrrCents, r.currency)}</span> {tt("MRR")}
              </span>
            ) : r.role !== "owner" ? (
              <span className="min-w-0 truncate">{ROLE_LABEL[r.role]}</span>
            ) : r.access !== "paid" ? (
              <span className="min-w-0 truncate">{r.priceLine}</span>
            ) : null}
          </p>
          <span className="pointer-events-auto relative z-[1]">
            <ResponsiveActionMenu title={r.name} align="end" trigger={<RowMenuButton label={tt("Actions for {name}", { name: r.name })} className={MENU_LOOK} data-card-menu="" />} items={items} />
          </span>
        </div>
      </div>
    </li>
  )
})

/**
 * The cover across the top, 5:2 on a phone (a column of cards is not a
 * column of posters) and 2:1 from 640px. With none (round 33: "never flat
 * grey"), a gradient in the community's own colours, read from its logo
 * (components/community/cover-fill.tsx), or from its name while there is no
 * logo. An archived community's cover goes grey and a little faint.
 */
function Cover({ row: r }: { row: CommunityListRow }) {
  const src = r.coverUrl
  return (
    <div aria-hidden className={cn("pointer-events-none relative aspect-[5/2] w-full overflow-hidden bg-[#eef0f2] after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-[rgba(17,24,39,0.06)] after:content-[''] sm:aspect-[2/1]", r.archived && "opacity-70 grayscale")} data-card-cover={src ? "picture" : "gradient"}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- the srcset is chosen here, as the Products list does
        <img src={optimizedImageUrl(src, 480)} srcSet={optimizedSrcSet(src, [384, 640, 1080])} sizes="(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw" alt="" loading="lazy" decoding="async" draggable={false} style={r.coverPosition ? { objectPosition: r.coverPosition } : undefined} className="h-full w-full object-cover" />
      ) : (
        <CoverFill name={r.name} iconUrl={r.logoUrl} />
      )}
    </div>
  )
}

/** The logo on the cover's lower edge, with a white ring so it reads on any cover. */
function Logo({ row: r }: { row: CommunityListRow }) {
  const letter = (Array.from(r.name.trim())[0] || "C").toUpperCase()
  return (
    <span
      className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-[13px] bg-white shadow-[0_0_0_3px_#fff,0_1px_3px_rgba(16,24,40,0.12)]"
      style={r.logoUrl ? undefined : { backgroundImage: nameCoverGradient(r.name) }}
      data-card-logo=""
    >
      {r.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={optimizedImageUrl(r.logoUrl, 48)} srcSet={optimizedSrcSet(r.logoUrl, [48, 96, 128])} sizes="48px" alt="" width={48} height={48} loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden className="text-[18px] font-semibold text-white [text-shadow:0_1px_1px_rgba(0,0,0,0.18)]">
          {letter}
        </span>
      )}
    </span>
  )
}
