"use client"

/**
 * What the inbox already knows about a conversation, handed to the loading
 * screen so opening one is instant.
 *
 * ---------------------------------------------------------------------------
 * The problem this solves
 * ---------------------------------------------------------------------------
 * /messages/[id] is `force-dynamic` — it must be, a conversation served from a
 * shared cache would be somebody else's conversation — so tapping a row always
 * costs a server round trip before the real screen can render. Next covers that
 * wait with loading.tsx, and loading.tsx knew NOTHING: a grey circle where the
 * avatar goes, two grey bars where the name goes, and a spinner in the middle
 * of an otherwise empty white screen.
 *
 * That is the "empty space, then the loader, then the chat". It is not a
 * rendering bug — every stage is behaving correctly — it is that the first
 * stage has no content, so the tap resolves into a blank screen and only then
 * into the thing you asked for.
 *
 * The fix is not to make the wait shorter. It is to notice that the inbox row
 * you just pressed ALREADY CONTAINS most of what the header will say: who this
 * is, their picture, the listing, and the last thing that was said. That data
 * is on screen, under the finger, at the moment of the tap. Carrying it across
 * costs nothing and turns a blank wait into the real conversation with its most
 * recent message, filling in.
 *
 * ---------------------------------------------------------------------------
 * Why sessionStorage rather than a prop or a context
 * ---------------------------------------------------------------------------
 * loading.tsx is rendered by the ROUTER, not by the inbox. Nothing can pass it
 * a prop — it is not a child of the screen that has the data, it is what
 * replaces that screen. A context does not survive the route change either.
 *
 * sessionStorage is per-tab, synchronous to read and write, and survives
 * exactly as long as it needs to: the length of one navigation. Writing it is
 * one string on pointerdown, reading it is one string in a layout effect, and
 * nothing anywhere depends on it being there — a missing preview renders the
 * old skeleton, which is what happens on a cold link from outside the app.
 *
 * Nothing sensitive goes in: a display name, an avatar URL and a listing title,
 * all of which the tab is already displaying in the row above it. Not the
 * message body — see below.
 */

const KEY = "storelib_thread_preview_v1"

export interface ThreadPreview {
  id: string
  name: string
  avatarUrl: string | null
  /** For the deterministic fallback avatar, so it matches the inbox exactly. */
  seed: string | null
  official: boolean
  listingTitle: string | null
  listingThumb: string | null
  /** Which side of the thread the last message was on, so the skeleton bubble
   *  lands where the real one will. Not the TEXT — see the note below. */
  lastFromMe: boolean | null
}

/**
 * Stash what the row knows, on the way into a conversation.
 *
 * Overwrites rather than accumulates: exactly one navigation is ever in flight,
 * and a map keyed by id would grow for the life of the tab to answer a question
 * that only ever concerns the last thing tapped.
 */
export function stashThreadPreview(preview: ThreadPreview): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(preview))
  } catch {
    /* private mode, storage full — the loading screen falls back to skeletons */
  }
}

/**
 * Read it back, but only if it is about the conversation being opened.
 *
 * The id check is what makes a stale entry harmless. Come back to a thread from
 * a notification, a deep link or the browser's back button and the stash is
 * either absent or about a different conversation — both answer null, and the
 * skeleton renders. It can never show one person's name over another's thread,
 * which is the only way this could be worse than no preview at all.
 */
export function readThreadPreview(id: string | undefined): ThreadPreview | null {
  if (!id) return null
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ThreadPreview
    return parsed?.id === id ? parsed : null
  } catch {
    return null
  }
}

/**
 * NOT STORED: the message text.
 *
 * It was in the first version of this and it is deliberately out. A preview
 * exists to make an arrival feel instant, and the cost of being wrong is
 * showing somebody a message that is not the one they are about to read —
 * the row's preview is truncated, may be an offer rendered as a summary, and is
 * a frame behind if something arrived while the list sat open. A bubble of the
 * right SHAPE in the right PLACE gets the whole benefit; putting words in it
 * that then change is the flicker this is meant to remove.
 */
