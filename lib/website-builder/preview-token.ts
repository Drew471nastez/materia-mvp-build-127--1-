/**
 * ===========================================================================
 *  WHAT A PREVIEW TOKEN LOOKS LIKE
 * ===========================================================================
 * Split out from `preview-link.ts` for one reason: that file mints tokens,
 * which needs `node:crypto`, and the PROXY has to recognise a token without
 * pulling a node built-in into the edge bundle. Recognising and minting are
 * different jobs, so they are different files, and the shape is written down
 * once where both can read it.
 */

/** 32 bytes of base64url, give or take the padding a longer token would add. */
const SHAPE = /^[A-Za-z0-9_-]{32,64}$/

/** Whether this could be a token at all. Not whether it is the right one. */
export function isPreviewTokenShaped(raw: string | null | undefined): boolean {
  return typeof raw === "string" && SHAPE.test(raw)
}

/**
 * The token on this request, if the shape is right. A token that could not
 * be one is not worth a database round trip, and refusing early keeps the
 * lookup off anything a stranger types into the query string.
 */
export function previewTokenFrom(params: { get(name: string): string | null }): string | null {
  const raw = params.get("preview")
  return isPreviewTokenShaped(raw) ? raw : null
}
