"use client"

/**
 * THE SPACES ROW, HELD WHILE A SPACE'S PAGE IS ON ITS WAY (round 9: "the
 * frame (header, columns, chips) never re-renders or flashes"). A chat
 * space is a page of its own, so pressing its chip loads a page; this draws
 * the row exactly as it was (space-chips.tsx remembers the last one drawn in
 * this tab), with the pressed chip chosen, over the spinner, so only the
 * part under the chips changes. Nothing remembered (the first page of a
 * visit) draws nothing, the same on the server and in the browser.
 */
import { usePathname } from "next/navigation"
import { sectionFromPath } from "./nav"
import { rememberedSpaces, SpaceChips } from "./space-chips"

export function SpaceChipsHeld() {
  const pathname = usePathname() || ""
  const m = /^\/community\/([^/]+)/.exec(pathname)
  const slug = m ? decodeURIComponent(m[1]) : null
  const spaces = slug ? rememberedSpaces(slug) : null
  if (!slug || !spaces) return null
  const section = sectionFromPath(pathname, slug)
  const active = section.startsWith("space:") ? section.slice(6).toLowerCase() : null
  return <SpaceChips slug={slug} spaces={spaces} active={active} />
}
