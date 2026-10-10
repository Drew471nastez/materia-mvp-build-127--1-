/**
 * ===========================================================================
 *  A POST OPENED FROM YOUR ACCOUNT GOES BACK TO YOUR ACCOUNT
 * ===========================================================================
 * Round 17. The Posts pill of /account (components/account/account-posts.tsx)
 * opens a post, or Edit post, at the post's own address, where the post
 * opens over its community's feed (components/community/member/
 * shared-post.tsx). Closing it gave the address back as the community's
 * feed, so a person who came to edit their post from their account was left
 * in the community. So the account marks the post it opened, for this tab
 * only (sessionStorage, not the address: the post's link stays the one to
 * share), and the post, closing, goes back to the account instead when the
 * mark is its own. The account reads its first page again on the way back,
 * so an edit or a delete made there shows at once.
 *
 * Every read and write is guarded: private browsing and a full storage are
 * a post that closes into its feed, as before, nothing worse.
 */

const FROM = "storelib:post-from-account"
const STALE = "storelib:account-posts-stale"

function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage
  } catch {
    return null
  }
}

/** The account is opening this post (its row, or Edit post). */
export function markPostFromAccount(postId: string) {
  try {
    store()?.setItem(FROM, JSON.stringify({ id: postId, at: Date.now() }))
  } catch {
    /* no storage: the post closes into its feed */
  }
}

/** Whether this post was opened from the account in the last few minutes. Read once: the mark is cleared. */
export function takePostFromAccount(postId: string): boolean {
  const s = store()
  if (!s) return false
  try {
    const raw = s.getItem(FROM)
    s.removeItem(FROM)
    if (!raw) return false
    const mark = JSON.parse(raw) as { id?: unknown; at?: unknown }
    return mark.id === postId && typeof mark.at === "number" && Date.now() - mark.at < 10 * 60_000
  } catch {
    return false
  }
}

/** The account's list may be out of date (a post was edited or deleted away from it). */
export function markAccountPostsStale() {
  try {
    store()?.setItem(STALE, "1")
  } catch {
    /* the list is read again by a pull instead */
  }
}

/** Whether the account's list should be read again now. Read once. */
export function takeAccountPostsStale(): boolean {
  const s = store()
  if (!s) return false
  try {
    const was = s.getItem(STALE) === "1"
    s.removeItem(STALE)
    return was
  } catch {
    return false
  }
}
