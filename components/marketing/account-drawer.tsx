"use client"

import Link from "next/link"
import { LogOut } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { DrawerRow, DrawerSectionTitle, SideDrawer } from "./side-drawer"

/**
 * The account menu behind the avatar in the mobile web header.
 *
 * Every row in the marketplace's account model is listed, including the ones
 * that have nowhere to go yet. Those render muted with an "În curând" tag rather
 * than being hidden: a menu that grows a new row every release reads as unfinished,
 * whereas a complete menu that admits which parts are not open yet reads as a
 * product with a roadmap. It also stops us quietly shipping a row that 404s.
 */

type AccountRow = {
  label: string
  href?: string
  /** No destination built yet — shown, but inert and tagged. */
  soon?: boolean
}

// The buyer's own things: what they liked, kept, bought and sold.
const LIBRARY_ROWS: AccountRow[] = [
  { label: "FAVORITE", href: "/wishlist" },
  { label: "SALVATE", href: "/wishlist" },
  { label: "ACHIZIȚII", href: "/purchases" },
  { label: "COMENZI", href: "/sales" },
  { label: "FEEDUL MEU", href: "/" },
]

const SELLING_ROWS: AccountRow[] = [
  { label: "VINDE", href: "/products/new" },
  // A seller's live listings are the public half of their profile, so that is
  // where "on sale" lives rather than in a separate seller-only screen.
  { label: "LA VÂNZARE", href: "/profile" },
  // Offers arrive as messages — the negotiation and the conversation are the
  // same thread, so they resolve to the same inbox.
  { label: "OFERTE", href: "/messages" },
  { label: "VÂNDUTE", href: "/sales" },
  { label: "CIORNE", href: "/products/drafts" },
]

const SETTINGS_ROWS: AccountRow[] = [
  { label: "PROFIL", href: "/settings" },
  { label: "FEEDBACK", soon: true },
  { label: "STAREA CONTULUI", soon: true },
  { label: "MOD VACANȚĂ", soon: true },
  { label: "ETICHETE DE LIVRARE", soon: true },
  { label: "MĂRIMILE MELE", soon: true },
  { label: "ADRESE", soon: true },
  { label: "PLĂȚI", href: "/settings" },
  { label: "NOTIFICĂRI", href: "/messages" },
]

export function AccountDrawer({
  open,
  onClose,
  avatarUrl,
  displayName,
  username,
  onSignOut,
}: {
  open: boolean
  onClose: () => void
  avatarUrl: string | null
  displayName: string | null
  username: string | null
  onSignOut: () => void
}) {
  const name = username || displayName || "Contul meu"
  const initial = (displayName || username || "?").trim().charAt(0).toUpperCase()

  return (
    <SideDrawer open={open} onClose={onClose} side="right" label="Contul meu">
      <Link
        href="/profile"
        onClick={onClose}
        data-drawer-autofocus
        className="mx-2 mb-1 flex items-center gap-3 rounded-2xl px-3 py-3 transition-[background-color,transform] duration-150 active:scale-[0.99] active:bg-neutral-100"
      >
        <Avatar className="h-12 w-12 border border-neutral-200">
          <AvatarImage src={avatarUrl || undefined} alt={name} />
          <AvatarFallback className="bg-neutral-100 font-semibold text-neutral-500">{initial}</AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-semibold text-neutral-900">{name}</span>
          <span className="block text-[13px] font-medium text-[#7c3aed]">Vezi profilul</span>
        </span>
      </Link>

      <div className="h-px bg-neutral-100" />

      <div className="pt-1">
        {LIBRARY_ROWS.map((row) => (
          <DrawerRow key={row.label} label={row.label} href={row.href} soon={row.soon} onNavigate={onClose} />
        ))}
      </div>

      <DrawerSectionTitle>Vânzare</DrawerSectionTitle>
      {SELLING_ROWS.map((row) => (
        <DrawerRow key={row.label} label={row.label} href={row.href} soon={row.soon} onNavigate={onClose} />
      ))}

      <DrawerSectionTitle>Setări</DrawerSectionTitle>
      {SETTINGS_ROWS.map((row) => (
        <DrawerRow key={row.label} label={row.label} href={row.href} soon={row.soon} onNavigate={onClose} />
      ))}

      <div className="mt-3 border-t border-neutral-100 pb-6 pt-2">
        <button
          type="button"
          onClick={onSignOut}
          className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-[15px] font-semibold text-red-600 transition-[background-color,transform] duration-150 active:scale-[0.99] active:bg-red-50"
        >
          <LogOut className="h-[18px] w-[18px]" />
          <span>DECONECTARE</span>
        </button>
      </div>
    </SideDrawer>
  )
}
