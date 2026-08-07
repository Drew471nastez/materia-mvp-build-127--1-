"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { ShoppingBag, Tag } from "lucide-react"
import { useLocale } from "@/components/locale-provider"
import { SmartLink } from "@/components/smart-link"

type Side = "purchases" | "sales"

type Row = {
  id: string
  createdAt: string
  amountCents: number
  status: string
  /** Null on a deployment where the shipping migration has not been run. */
  shippingStatus?: string | null
  /** Sellers only: the buyer has not chosen a locker yet, so there is nothing to do. */
  awaitingBuyerAddress?: boolean
  /** Buyers only: no delivery point chosen, so the parcel cannot be sent. */
  needsAddress?: boolean
  product: { title: string; slug: string; thumbnail_url: string | null; price_cents: number } | null
  seller?: { display_name: string | null; username: string | null } | null
  buyer?: { name: string | null; email: string | null } | null
}

/**
 * One component, both sides of the marketplace. A purchase row and a sale row
 * are the same row — item, counterpart, amount, date, status — and only the
 * counterpart and the empty states differ, so the pages share everything else
 * instead of drifting apart line by line.
 */
const SIDES: Record<
  Side,
  {
    title: string
    endpoint: string
    icon: typeof ShoppingBag
    signedOut: { title: string; body: string; cta: { href: string; label: string } }
    empty: { title: string; body: string; cta: { href: string; label: string } }
  }
> = {
  purchases: {
    title: "Achizițiile mele",
    endpoint: "/api/orders/purchases",
    icon: ShoppingBag,
    signedOut: {
      title: "Conectează-te pentru achiziții",
      body: "Comenzile tale apar aici după ce te conectezi.",
      cta: { href: "/login?next=/purchases", label: "Conectează-te" },
    },
    empty: {
      title: "Nicio achiziție încă",
      body: "Articolele pe care le cumperi apar aici, cu statusul fiecărei comenzi.",
      cta: { href: "/", label: "Descoperă anunțuri" },
    },
  },
  sales: {
    title: "Vânzările mele",
    endpoint: "/api/orders/sales",
    icon: Tag,
    signedOut: {
      title: "Conectează-te pentru vânzări",
      body: "Comenzile primite pentru anunțurile tale apar aici după ce te conectezi.",
      cta: { href: "/login?next=/sales", label: "Conectează-te" },
    },
    empty: {
      title: "Nicio vânzare încă",
      body: "Publică un anunț — când cineva cumpără, comanda apare aici.",
      cta: { href: "/products/new", label: "Adaugă un anunț" },
    },
  },
}

// Orders keep the checkout vocabulary ("completed", "refunded"…); the chip
// translates it. An unknown status shows as-is in neutral grey rather than
// hiding — a new state should be visible before it has a translation.
const STATUS_CHIP: Record<string, { label: string; className: string }> = {
  completed: { label: "Finalizată", className: "bg-emerald-50 text-emerald-700" },
  refunded: { label: "Rambursată", className: "bg-red-50 text-red-600" },
  pending: { label: "În procesare", className: "bg-amber-50 text-amber-700" },
  failed: { label: "Eșuată", className: "bg-red-50 text-red-600" },
}

// Once a parcel exists, where it is says more than whether the payment cleared.
// So the shipping state REPLACES the payment chip when there is one — two chips
// side by side would make every row read like a status page, and the payment
// state is still the fallback whenever shipping has nothing to add (including
// on a deployment where the shipping migration has not been run).
const SHIPPING_CHIP: Record<string, { label: string; className: string }> = {
  awaiting_shipment: { label: "De expediat", className: "bg-amber-50 text-amber-700" },
  awb_created: { label: "Etichetă gata", className: "bg-violet-50 text-violet-700" },
  shipped: { label: "Expediat", className: "bg-sky-50 text-sky-700" },
  in_transit: { label: "În tranzit", className: "bg-sky-50 text-sky-700" },
  delivered: { label: "Livrat", className: "bg-emerald-50 text-emerald-700" },
  returned: { label: "Returnat", className: "bg-red-50 text-red-600" },
  cancelled: { label: "Anulat", className: "bg-neutral-100 text-neutral-600" },
  shipping_creation_failed: { label: "Eroare AWB", className: "bg-red-50 text-red-600" },
}

function StatusChip({ row }: { row: Row }) {
  const shipping = row.shippingStatus ? SHIPPING_CHIP[row.shippingStatus] : undefined
  const chip =
    shipping ?? STATUS_CHIP[row.status] ?? { label: row.status, className: "bg-neutral-100 text-neutral-600" }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${chip.className}`}>
      {chip.label}
    </span>
  )
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ro-RO", { day: "numeric", month: "short", year: "numeric" })
  } catch {
    return ""
  }
}

export function OrderHistory({ side }: { side: Side }) {
  const { formatPrice } = useLocale()
  const cfg = SIDES[side]
  const [rows, setRows] = useState<Row[] | null>(null)
  const [signedOut, setSignedOut] = useState(false)

  useEffect(() => {
    let alive = true
    fetch(cfg.endpoint, { credentials: "include" })
      .then((r) => {
        if (r.status === 401) {
          if (alive) setSignedOut(true)
          return null
        }
        return r.ok ? r.json() : null
      })
      .then((data) => {
        if (alive && data) setRows(data.orders ?? [])
      })
      .catch(() => {
        if (alive) setRows([])
      })
    return () => {
      alive = false
    }
  }, [cfg.endpoint])

  if (signedOut) return <Empty icon={cfg.icon} {...cfg.signedOut} />
  if (rows === null) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-4">
        <div className="mb-2 h-6 w-44 animate-pulse rounded bg-neutral-100" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 py-3.5">
            <div className="h-14 w-14 animate-pulse rounded-lg bg-neutral-100" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-36 animate-pulse rounded bg-neutral-100" />
              <div className="h-3 w-52 animate-pulse rounded bg-neutral-100" />
            </div>
            <div className="h-8 w-16 animate-pulse rounded bg-neutral-100" />
          </div>
        ))}
      </div>
    )
  }
  if (rows.length === 0) return <Empty icon={cfg.icon} {...cfg.empty} />

  return (
    <div className="mx-auto max-w-2xl px-2 pb-24 md:pb-10">
      <h1 className="px-2 pb-1 pt-4 text-[21px] font-bold text-neutral-900">{cfg.title}</h1>
      <ul className="divide-y divide-neutral-100">
        {rows.map((row) => (
          <li key={row.id}>
            <OrderRow row={row} side={side} formatPrice={formatPrice} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function OrderRow({ row, side, formatPrice }: { row: Row; side: Side; formatPrice: (cents: number) => string }) {
  const counterpart =
    side === "purchases"
      ? row.seller?.display_name || row.seller?.username || "Vânzător"
      : row.buyer?.name || row.buyer?.email || "Cumpărător"

  const body = (
    <>
      {row.product?.thumbnail_url ? (
        <Image
          src={row.product.thumbnail_url}
          alt=""
          width={56}
          height={56}
          className="h-14 w-14 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-300">
          <ShoppingBag className="h-5 w-5" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-neutral-900">
          {row.product?.title || "Articol indisponibil"}
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-neutral-500">
          {counterpart} · {formatDate(row.createdAt)}
        </span>
        {/* One line, and only when there is something to do about it. A buyer
            who has not chosen a locker is blocking their own delivery; a seller
            waiting on that buyer is explicitly told NOT to act, which is the
            more useful message of the two. */}
        {side === "purchases" && row.needsAddress && (
          <span className="mt-1 block truncate text-[12.5px] font-semibold text-[#7c3aed]">
            Alege punctul de livrare →
          </span>
        )}
        {side === "sales" && row.awaitingBuyerAddress && (
          <span className="mt-1 block truncate text-[12.5px] text-neutral-400">
            Așteptăm adresa cumpărătorului
          </span>
        )}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-[15px] font-semibold text-neutral-900">{formatPrice(row.amountCents)}</span>
        <StatusChip row={row} />
      </span>
    </>
  )

  // The row opens the ORDER, not the listing. Once something has been bought
  // the interesting page is where the parcel is — the listing is one tap
  // further in, from there. A deleted listing therefore no longer costs the row
  // its link: the order still exists and still has a delivery to show.
  return (
    <SmartLink
      href={`/orders/${row.id}`}
      blend
      warmImage={row.product?.thumbnail_url ?? undefined}
      className="flex items-center gap-3 rounded-xl px-2 py-3.5 transition-colors active:bg-neutral-50"
    >
      {body}
    </SmartLink>
  )
}

function Empty({
  icon: Icon,
  title,
  body,
  cta,
}: {
  icon: typeof ShoppingBag
  title: string
  body: string
  cta: { href: string; label: string }
}) {
  return (
    <div className="mx-auto flex min-h-[60svh] max-w-xl flex-col items-center justify-center px-6 py-16 text-center">
      <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
        <Icon className="h-7 w-7" />
      </span>
      <h1 className="text-xl font-semibold text-neutral-900">{title}</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-neutral-500">{body}</p>
      <Link
        href={cta.href}
        className="mt-7 inline-flex h-11 items-center justify-center rounded-full bg-[#7c3aed] px-6 text-[15px] font-semibold text-white transition-transform active:scale-[0.97]"
      >
        {cta.label}
      </Link>
    </div>
  )
}
