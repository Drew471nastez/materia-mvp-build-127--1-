/**
 * ===========================================================================
 *  A PUBLISH THE DATABASE CANCELLED IS ASKED ONCE MORE
 * ===========================================================================
 * publish_theme_install (SQL part 130) is one transaction. When the database
 * is slow it can run past the role's statement timeout and be cancelled
 * (57014), or PostgREST can answer while it reloads its schema cache
 * (PGRST002, nothing ran). Either way nothing changed, and the creator saw
 * "Could not publish" on every press while the database was slow.
 *
 * Asked once more, and only for those two answers: each one says the call
 * did not take, and the function holds a lock per creator, so a second call
 * is the same publish of the same drafts. Anything else (an answer that was
 * lost on the network, a refusal) is not repeated: it may have taken.
 */
export const PUBLISH_RETRY_CODES: ReadonlySet<string> = new Set(["57014", "PGRST002"])

export async function publishWithOneRetry<R extends { error: { code?: string; message?: string } | null }>(
  call: () => PromiseLike<R>,
  onRetry?: (error: { code?: string; message?: string }) => void,
): Promise<R> {
  const first = await call()
  if (!first.error || !PUBLISH_RETRY_CODES.has(String(first.error.code ?? ""))) return first
  onRetry?.(first.error)
  return call()
}
