"use client"

/**
 * ===========================================================================
 *  ASKING FOR NOTIFICATIONS WHERE THEY MATTER
 * ===========================================================================
 * The phone's prompt is asked at the first launch after an install
 * (components/platform/notifications-ask.tsx). These are the moments after
 * that where a notification is the obvious next thing: someone just joined a
 * community, posted, commented, or put a product on sale. Each one calls
 * nudgeNotifications, and NotificationsAsk decides:
 *
 *   granted       nothing
 *   not asked     the phone's own prompt, right there
 *   refused       the "Notifications are off" sheet in this moment's words,
 *                 with Open Settings, on the same budget as the launch
 *                 reminder (lib/notifications/push-ask-rule), so a person is
 *                 told at most every few days however much they post
 *
 * Nothing happens in a browser or on a published website.
 */

export type NudgeMoment = "joined" | "posted" | "commented" | "product"

export const NUDGE_EVENT = "storelib:push-nudge"

/** What the sheet says for each moment, once notifications were refused. */
export const NUDGE_WORDS: Record<NudgeMoment, { title: string; body: (device: string) => string }> = {
  joined: {
    title: "Hear what happens in here",
    body: (device) => `New posts and replies in this community can't reach this ${device} while notifications are off.`,
  },
  posted: {
    title: "Know when someone replies",
    body: (device) => `Replies to your post can't reach this ${device} while notifications are off.`,
  },
  commented: {
    title: "Know when someone answers",
    body: (device) => `Answers to your comment can't reach this ${device} while notifications are off.`,
  },
  product: {
    title: "Hear about every sale",
    body: (device) => `Sales and payouts can't reach this ${device} while notifications are off.`,
  },
}

export function nudgeNotifications(moment: NudgeMoment): void {
  if (typeof window === "undefined") return
  try {
    window.dispatchEvent(new CustomEvent<NudgeMoment>(NUDGE_EVENT, { detail: moment }))
  } catch {
    /* Nothing is asked; the launch reminder still is. */
  }
}
