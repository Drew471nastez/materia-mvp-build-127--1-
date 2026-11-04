"use client"

/**
 * ===========================================================================
 *  WHO IS LOOKING AT A CREATOR PAGE, ASKED AFTER IT HAS LOADED (round 49)
 * ===========================================================================
 * storelib.com/<handle> is drawn the same for every visitor, so a CDN can
 * hold one copy for everybody (next.config.mjs, tests/cdnpages-r49). The
 * parts that were somebody's own come in after hydration, from
 * /api/creator-page/viewer, which reads the real session:
 *
 *   owner   the creator, or a team member with Creator page in this store:
 *           Edit profile, the owner menu, Edit about, Arrange, each card's
 *           owner menu, the subscribe bar's pencil, the first product line;
 *   bought  somebody who bought from this creator: the Contact link (the
 *           address itself is still only answered by /api/creator-contact,
 *           which asks the same question again);
 *   contactEmail  the owner's own typed address, for their About form only.
 *
 * A browser with no session cookie is a stranger and asks nothing
 * (lib/auth/session-hint). Outside a creator page (no provider) every hook
 * here answers exactly what its caller passed, so the website builder and
 * the editor's canvas behave as they always did.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { mayBeSignedIn } from "@/lib/auth/session-hint"

export interface CreatorPageViewer {
  owner: boolean
  bought: boolean
  contactEmail: string | null
  /** The page's sales figure, to the owner only, for Edit profile's live preview (r51). */
  totalSales: number | null
}

const STRANGER: CreatorPageViewer = { owner: false, bought: false, contactEmail: null, totalSales: null }
const ViewerContext = createContext<CreatorPageViewer | null>(null)

/** One question per page view, shared by every part that asks. */
const asked = new Map<string, Promise<CreatorPageViewer>>()
function askViewer(creatorId: string): Promise<CreatorPageViewer> {
  const hit = asked.get(creatorId)
  if (hit) return hit
  const p = fetch(`/api/creator-page/viewer?creator=${encodeURIComponent(creatorId)}`, { credentials: "same-origin", cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d: Partial<CreatorPageViewer> | null) => ({
      owner: d?.owner === true,
      bought: d?.bought === true,
      contactEmail: typeof d?.contactEmail === "string" ? d.contactEmail : null,
      totalSales: typeof d?.totalSales === "number" && Number.isFinite(d.totalSales) ? d.totalSales : null,
    }))
    .catch(() => STRANGER)
  asked.set(creatorId, p)
  /* Forgotten once answered, so a sign in or a purchase is seen on the next page view. */
  void p.finally(() => setTimeout(() => asked.delete(creatorId), 0))
  return p
}

export function CreatorPageViewerProvider({ creatorId, children }: { creatorId: string; children: ReactNode }) {
  const [viewer, setViewer] = useState<CreatorPageViewer>(STRANGER)
  useEffect(() => {
    if (!mayBeSignedIn()) return
    let live = true
    void askViewer(creatorId).then((v) => {
      if (live) setViewer(v)
    })
    return () => {
      live = false
    }
  }, [creatorId])
  return <ViewerContext.Provider value={viewer}>{children}</ViewerContext.Provider>
}

/** The owner's controls: what the caller was told (the editor's canvas, a builder preview), or this page's own answer. */
export function useCreatorPageOwner(given?: boolean): boolean {
  const ctx = useContext(ViewerContext)
  return !!given || !!ctx?.owner
}

/** Whether the Contact link is drawn: always where the caller already decided (no provider), else for a buyer. */
export function useContactShown(): boolean {
  const ctx = useContext(ViewerContext)
  return ctx === null ? true : ctx.bought
}

export function useCreatorPageViewer(): CreatorPageViewer {
  return useContext(ViewerContext) ?? STRANGER
}

/**
 * The owner's version of a part, or everybody's. The server draws `fallback`
 * for everybody; the owner's arrives after the check (no skeleton: for
 * everybody else nothing changes at all). The parts that appear where
 * nothing was fade in themselves (OWNER_FADE_IN).
 */
export function OwnerOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const owner = useCreatorPageOwner()
  return <>{owner ? children : fallback}</>
}

/** The owner's controls come in over 180ms rather than popping in (the `fade-in` keyframes in app/globals.css). */
export const OWNER_FADE_IN = { animation: "fade-in 180ms ease-out both" } as const
