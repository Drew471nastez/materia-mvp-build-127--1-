"use client"

/**
 * ===========================================================================
 *  A TEAM MEMBER EDITING THE STORE'S ONEPAGE (round 40)
 * ===========================================================================
 * The editor was written for the person who owns the page, and asks a few
 * things about "the signed in account" from the browser: its products, its
 * plan, its domain, its profile photo. For a team member with the OnePage
 * permission the page is the store owner's (app/app/onepage/page.tsx reads
 * it with lib/team/onepage), so those answers come from the server with the
 * page, in this context. null for the owner: every component then does
 * exactly what it did before.
 *
 * The profile photo is the owner's account photo (lib/account/identity),
 * saved through the account's own route, so a member cannot change it from
 * here: the photo rows say so instead (PHOTO_IS_OWNERS).
 */
import * as React from "react"
import { tt } from "@/lib/i18n/text"
import { setTeamPageOwner } from "./team-owner"

export interface OnePageTeam {
  /** The store's name, for the sentences that say whose it is. */
  store: string
  /** The store (creators.id): whose products the product blocks list. */
  creatorId: string
  /** The owner's account (onepages.owner_id). */
  ownerUserId: string
  /** The owner's plan, for what is part of Pro. */
  plan: "free" | "growth" | "pro"
  /** The creator page's connected domain, or null. */
  domain: string | null
  /** Round 41: the owner's name and photo for the preview, read on the server, so the member's browser never reads the owner's profile (and never shows the member's own photo in its place). */
  ownerName?: string | null
  ownerAvatar?: string | null
}

const Ctx = React.createContext<OnePageTeam | null>(null)

export function OnePageTeamProvider({ team, children }: { team: OnePageTeam | null; children: React.ReactNode }) {
  return <Ctx.Provider value={team}>{children}</Ctx.Provider>
}

/** The store a team member is editing, or null for the page's owner. */
export function useOnePageTeam(): OnePageTeam | null {
  return React.useContext(Ctx)
}

/** Said where the photo would be changed. */
export function photoIsOwners(store: string): string {
  return tt("The photo is {store}'s account photo. The owner changes it.", { store })
}

/*
  For what is read outside React (the product list is shared by every block
  editor, lib below). Set by the provider's owner, the editor, on mount.
*/
let currentStore: string | null = null
/** The store whose products the editor lists, when a team member is editing; null reads the signed in account's own. */
export function teamStoreForProducts(): string | null {
  return currentStore
}
/** Round 41: the page owner's folder for a member's uploads (./team-owner). */
export { teamPageOwner } from "./team-owner"
export function useTeamProductsStore(team: OnePageTeam | null): void {
  /* Set during render, before any child effect reads it, and cleared when the editor goes. */
  currentStore = team?.creatorId ?? null
  setTeamPageOwner(team?.ownerUserId ?? null)
  React.useEffect(() => {
    currentStore = team?.creatorId ?? null
    setTeamPageOwner(team?.ownerUserId ?? null)
    return () => {
      currentStore = null
      setTeamPageOwner(null)
    }
  }, [team?.creatorId, team?.ownerUserId])
}
