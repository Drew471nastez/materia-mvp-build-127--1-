"use client"

/**
 * AN INTEGRATION'S MARK, THE SAME EVERYWHERE IT IS SHOWN: the directory's
 * cards and pages (./integrations-directory), the provider card inside an
 * integration's page (components/physical/integrations-marketplace), the
 * sidebar and the catalog in /admin.
 *
 *   Storelib's own      one tile family: a tinted square with a white line
 *                       glyph (STORELIB_TILES below)
 *   a service           its own logo file (public/integrations)
 *   no logo, or a logo  its initial on a quiet tile, so a card never shows
 *   that fails to load  an empty box or a broken image (an address typed in
 *                       /admin can be wrong, or the host can be down)
 */
import * as React from "react"
import {
  ChartColumn,
  CreditCard,
  FileSpreadsheet,
  GitBranch,
  Globe,
  Languages,
  Mail,
  MapPin,
  Megaphone,
  Package,
  PackagePlus,
  Receipt,
  PackageSearch,
  Send,
  ShoppingCart,
  Star,
  TicketPercent,
  Truck,
  UserRound,
  Webhook,
  type LucideIcon,
} from "lucide-react"

/*
  STORELIB'S OWN, AS ONE SET (round I4). "Ours look very cheap and AI-like."
  The line drawings with the logo badge in the corner are gone. Every
  Storelib app is now the same object: a rounded square the size and corner
  of a third party logo tile, filled with one of five tints by what it is
  for, a very soft top to bottom shade, a one pixel inner highlight, and a
  single white line glyph from the icon set the app already uses, at one
  weight. No illustration, no second colour, no badge.

    money     green    payments, taxes, discounts, bundles, accounts
    ship      blue     shipping, pickup, tracking, fulfilment
    reach     rose     emails, reviews, reminders (no purple: CLAUDE.md)
    insight   amber    analytics
    site      ink      domain, languages, code, webhooks, exports
*/
type Tint = "money" | "ship" | "reach" | "insight" | "site"
const TINT: Record<Tint, { top: string; bottom: string }> = {
  money: { top: "#1fa971", bottom: "#138a5b" },
  ship: { top: "#3d84f5", bottom: "#2563e0" },
  reach: { top: "#f2607a", bottom: "#dc4262" },
  insight: { top: "#f5a524", bottom: "#e3830c" },
  site: { top: "#3a3a52", bottom: "#1d1d31" },
}

const STORELIB_TILES: Record<string, { icon: LucideIcon; tint: Tint }> = {
  /* Apps with a page in the catalog (lib/integrations/catalog.ts). */
  "storelib-reviews": { icon: Star, tint: "reach" },
  "courier-tracking": { icon: PackageSearch, tint: "ship" },
  manual: { icon: Package, tint: "ship" },
  "supplier-email": { icon: Send, tint: "ship" },
  "custom-webhook": { icon: Webhook, tint: "site" },
  csv: { icon: FileSpreadsheet, tint: "site" },
  /* Storelib's apps that open their own settings (lib/integrations/storelib-apps.ts). */
  "storelib-payments": { icon: CreditCard, tint: "money" },
  "storelib-taxes": { icon: Receipt, tint: "money" },
  "storelib-discounts": { icon: TicketPercent, tint: "money" },
  "storelib-bundles": { icon: PackagePlus, tint: "money" },
  "storelib-accounts": { icon: UserRound, tint: "money" },
  "storelib-shipping": { icon: Truck, tint: "ship" },
  "storelib-pickup": { icon: MapPin, tint: "ship" },
  "storelib-customer-emails": { icon: Mail, tint: "reach" },
  "storelib-email-marketing": { icon: Megaphone, tint: "reach" },
  "storelib-checkout-reminders": { icon: ShoppingCart, tint: "reach" },
  "storelib-analytics": { icon: ChartColumn, tint: "insight" },
  "storelib-markets": { icon: Languages, tint: "site" },
  "storelib-domain": { icon: Globe, tint: "site" },
  "storelib-code": { icon: GitBranch, tint: "site" },
}

/** Is one of Storelib's own, drawn as a tile. */
export const hasBuiltInArt = (id: string | null | undefined) => !!id && id in STORELIB_TILES

/** The initial a tile falls back to: the service's name, without the words Storelib puts in front of its own. */
export const markInitial = (name: string) => (name.replace(/^(Your own |Ship it )/, "").trim().charAt(0) || name.trim().charAt(0) || "S").toUpperCase()

/** The corner every mark shares at a size: 12px at 44, 5px at 18. */
const radiusAt = (size: number) => Math.max(4, Math.round(size * 0.27))

/**
 * One Storelib tile at any size. The glyph is half the tile; under 28px the
 * line is drawn a touch heavier so it still reads at 18 and 24.
 */
export function StorelibTile({ id, size = 44, mini = false }: { id: string; size?: number; mini?: boolean }) {
  const tile = STORELIB_TILES[id]
  if (!tile) return null
  const { icon: Icon, tint } = tile
  const t = TINT[tint]
  const glyph = Math.round(size * (size < 28 ? 0.58 : 0.5))
  return (
    <span
      aria-hidden
      data-integration-mark={mini ? undefined : "storelib"}
      data-integration-mini={mini ? "storelib" : undefined}
      data-storelib-tile={tint}
      style={{
        width: size,
        height: size,
        borderRadius: radiusAt(size),
        backgroundImage: `linear-gradient(180deg, ${t.top}, ${t.bottom})`,
        /* The ink tile gets a faint light edge too, so it keeps its shape on a dark surface. */
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.22), inset 0 0 0 1px ${tint === "site" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}, 0 1px 2px rgba(16,24,40,0.08)`,
      }}
      className="flex shrink-0 items-center justify-center text-white"
    >
      <Icon width={glyph} height={glyph} strokeWidth={size < 28 ? 2.1 : 1.75} aria-hidden />
    </span>
  )
}

export function Mark({ item, size = 44 }: { item: { logo: string | null; name: string; id?: string }; size?: number }) {
  /* The logo that failed, so a later change of address (an /admin edit) is tried again. */
  const [failed, setFailed] = React.useState<string | null>(null)
  if (hasBuiltInArt(item.id)) return <StorelibTile id={item.id!} size={size} />
  if (item.logo && failed !== item.logo) {
    const logo = item.logo
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logo}
        alt=""
        width={size}
        height={size}
        onError={() => setFailed(logo)}
        style={{ width: size, height: size, borderRadius: radiusAt(size), padding: Math.round(size * 0.18) }}
        className="shrink-0 border border-[#eceef1] bg-white object-contain"
        data-integration-mark="logo"
      />
    )
  }
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.39), borderRadius: radiusAt(size) }}
      className="flex shrink-0 items-center justify-center border border-[#eceef1] bg-[#f6f7f9] font-semibold text-[#1a1a2e]"
      data-integration-mark="initial"
    >
      {markInitial(item.name)}
    </span>
  )
}

/**
 * The same mark, small: beside an installed integration's name in the
 * app's sidebar. The logo is the integration's own small file
 * (public/integrations), loaded once and kept by the browser; Storelib's
 * own is its tile; anything else its initial. Never a broken image.
 */
export function MiniMark({ item, size = 18 }: { item: { logo: string | null; name: string; id?: string }; size?: number }) {
  const [failed, setFailed] = React.useState<string | null>(null)
  const box = { width: size, height: size }
  if (hasBuiltInArt(item.id)) return <StorelibTile id={item.id!} size={size} mini />
  if (item.logo && failed !== item.logo) {
    const logo = item.logo
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logo} alt="" width={size} height={size} decoding="async" onError={() => setFailed(logo)} style={box} className="shrink-0 rounded-[5px] border border-[#eceef1] bg-white object-contain p-[2px]" data-integration-mini="logo" />
    )
  }
  return (
    <span aria-hidden style={{ ...box, fontSize: Math.round(size * 0.5) }} className="flex shrink-0 items-center justify-center rounded-[5px] border border-[#eceef1] bg-[#f6f7f9] font-semibold text-[#1a1a2e]" data-integration-mini="initial">
      {markInitial(item.name)}
    </span>
  )
}
