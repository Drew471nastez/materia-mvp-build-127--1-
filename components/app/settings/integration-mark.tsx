"use client"

/**
 * AN INTEGRATION'S MARK, THE SAME EVERYWHERE IT IS SHOWN: the directory's
 * cards and pages (./integrations-directory), the provider card inside an
 * integration's page (components/physical/integrations-marketplace) and the
 * catalog in /admin.
 *
 *   Storelib's own      a line drawing on light grey with Storelib's mark
 *   a service           its own logo file (public/integrations)
 *   no logo, or a logo  its initial on a quiet tile, so a card never shows
 *   that fails to load  an empty box or a broken image (an address typed in
 *                       /admin can be wrong, or the host can be down)
 */
import * as React from "react"
import { StorelibLogo } from "@/components/brand/storelib-logo"

/*
  STORELIB'S OWN, DRAWN FOR IT. Four small line drawings in the same hand as
  the How it works art: a taped parcel, a letter with an order slip, two
  systems joined by a signed request, a sheet of rows. Ink on light grey.
*/
const BUILT_IN_ART: Record<string, React.ReactNode> = {
  manual: (
    <>
      <path d="M4 8.5 12 4.5l8 4v8L12 20.5l-8-4z" />
      <path d="M4 8.5 12 12.5l8-4M12 12.5v8" />
      <path d="M8 6.5l8 4v3" />
    </>
  ),
  "supplier-email": (
    <>
      <rect x="3.5" y="6" width="17" height="12.5" rx="2" />
      <path d="m4 7 8 6 8-6" />
      <path d="M14.5 3.5h5v4" />
    </>
  ),
  "custom-webhook": (
    <>
      <rect x="3" y="4" width="7" height="7" rx="2" />
      <rect x="14" y="13" width="7" height="7" rx="2" />
      <path d="M10 7.5h3.5a3 3 0 0 1 3 3V13" />
      <path d="m14.5 11 2 2 2-2" />
    </>
  ),
  csv: (
    <>
      <rect x="4" y="3.5" width="16" height="17" rx="2" />
      <path d="M4 9h16M4 14.5h16M10 9v11.5" />
    </>
  ),
}

/** Has a drawing of Storelib's own. */
export const hasBuiltInArt = (id: string | null | undefined) => !!id && id in BUILT_IN_ART

/** The initial a tile falls back to: the service's name, without the words Storelib puts in front of its own. */
export const markInitial = (name: string) => (name.replace(/^(Your own |Ship it )/, "").trim().charAt(0) || name.trim().charAt(0) || "S").toUpperCase()

export function Mark({ item, size = 44 }: { item: { logo: string | null; name: string; id?: string }; size?: number }) {
  const art = item.id ? BUILT_IN_ART[item.id] : undefined
  /* The logo that failed, so a later change of address (an /admin edit) is tried again. */
  const [failed, setFailed] = React.useState<string | null>(null)
  if (art) {
    /* Storelib's own: a drawing on light grey, with Storelib's real mark in the corner, so a built in reads as Storelib's at a glance. */
    const badge = Math.round(size * 0.4)
    return (
      <span aria-hidden style={{ width: size, height: size }} className="relative flex shrink-0 items-center justify-center rounded-xl border border-[#eceef1] bg-[#f6f7f9] text-[#1a1a2e]" data-integration-mark="storelib">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ width: size * 0.5, height: size * 0.5 }}>
          {art}
        </svg>
        <span className="absolute -bottom-1 -right-1 rounded-[7px] bg-white p-[2px]">
          <StorelibLogo size={badge} alt="" />
        </span>
      </span>
    )
  }
  if (item.logo && failed !== item.logo) {
    const logo = item.logo
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logo}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(logo)}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-xl border border-[#eceef1] bg-white object-contain p-2"
        data-integration-mark="logo"
      />
    )
  }
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.39) }}
      className="flex shrink-0 items-center justify-center rounded-xl border border-[#eceef1] bg-[#f6f7f9] font-semibold text-[#1a1a2e]"
      data-integration-mark="initial"
    >
      {markInitial(item.name)}
    </span>
  )
}
