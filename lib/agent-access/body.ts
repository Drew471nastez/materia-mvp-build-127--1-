/**
 * A request body, read up to a limit and no further.
 *
 * `request.text()` reads the whole body into memory before anything can
 * look at its size, so a check after it protects nothing: the memory is
 * already spent. This refuses on the declared length first, then counts the
 * bytes as they arrive and stops reading at the limit, whatever the header
 * claimed.
 */
/** One section file (at most 1 MB, lib/website-builder/save-theme-file.ts) and its JSON around it. */
export const MAX_AGENT_BODY = 1_200_000

export type BodyResult = { ok: true; text: string } | { ok: false; status: 400 | 413; error: string }

export async function readBodyCapped(request: Request, maxBytes: number): Promise<BodyResult> {
  const declared = Number(request.headers.get("content-length"))
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, status: 413, error: "Request too large" }
  if (!request.body) return { ok: true, text: "" }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => {})
        return { ok: false, status: 413, error: "Request too large" }
      }
      chunks.push(value)
    }
  } catch {
    return { ok: false, status: 400, error: "Could not read the request" }
  }
  const all = new Uint8Array(total)
  let at = 0
  for (const c of chunks) {
    all.set(c, at)
    at += c.byteLength
  }
  return { ok: true, text: new TextDecoder().decode(all) }
}

/** The same, parsed as JSON. */
export async function readJsonCapped<T = unknown>(
  request: Request,
  maxBytes: number,
): Promise<{ ok: true; value: T } | { ok: false; status: 400 | 413; error: string }> {
  const body = await readBodyCapped(request, maxBytes)
  if (body.ok === false) return body
  try {
    return { ok: true, value: JSON.parse(body.text) as T }
  } catch {
    return { ok: false, status: 400, error: "Send JSON" }
  }
}
