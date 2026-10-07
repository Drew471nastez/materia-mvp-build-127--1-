"use client"

/**
 * A COMMUNITY CHANGED IN ITS ADMIN, SAID TO EVERY OTHER TAB OF THIS BROWSER.
 * The community's frame (its card, cover, picture and name) is drawn once and
 * kept while a member moves around it, so a new cover saved in /app showed
 * only after a reload. Saving says so here; any open community frame for it
 * reads itself again (components/community/member/shell-frame.tsx).
 */
const CHANNEL = "storelib:community-updated"

export function announceCommunityUpdated(communityId: string): void {
  if (typeof window === "undefined") return
  try {
    const ch = new BroadcastChannel(CHANNEL)
    ch.postMessage({ communityId })
    ch.close()
  } catch {
    /* A browser without it: the frame still reads itself again when it is come back to. */
  }
}

export function onCommunityUpdated(communityId: string, run: () => void): () => void {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return () => {}
  const ch = new BroadcastChannel(CHANNEL)
  ch.onmessage = (e: MessageEvent<{ communityId?: string }>) => {
    if (e.data?.communityId === communityId) run()
  }
  return () => ch.close()
}
