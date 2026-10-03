import { NextResponse } from "next/server"

import { rateLimit } from "@/lib/api/rate-limit"
import { askAiForCategory, canAskAi } from "@/lib/products/category-suggest-ai"
import { SUGGEST_LIMITS, parseSuggestRequest, resolveSuggestion } from "@/lib/products/category-suggest"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

const NO_STORE = { "Cache-Control": "private, no-store" }

/**
 * THE PRODUCT EDITOR'S CATEGORY SUGGESTION
 *
 *   POST { title, text, images }   signed in, with a store.
 *     → { category, group, source: "ai" | "keywords" | "none" }
 *
 * `text` is the description as plain text; `images` at most three public
 * URLs of the creator's own pictures in this project's storage (anything
 * else is dropped, see isOwnStorageImage). ChatGPT chooses from the fixed
 * list in lib/products/category-groups.ts and the answer is checked against
 * it; with no key, an error, or an answer off the list, the answer is the
 * editor's keyword guess. The editor calls this once the fields settle and
 * caches by content, so this is not on the typing path.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401, headers: NO_STORE })

  const limited = await rateLimit({
    bucket: "category-suggestion",
    subjects: [`user:${user.id}`],
    /* A creator settles on a title a few times a minute at most; a script does not. */
    windows: [{ limit: 20, seconds: 60 }, { limit: 300, seconds: 86_400 }],
    message: "Too many suggestions at once. Wait a moment.",
  })
  if (limited) return limited

  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator?.id) return NextResponse.json({ error: "No store yet." }, { status: 403, headers: NO_STORE })

  /* Refused before it is read, when it says it is too big. */
  if (Number(request.headers.get("content-length") || 0) > SUGGEST_LIMITS.body * 4) {
    return NextResponse.json({ error: "Too much to read." }, { status: 413, headers: NO_STORE })
  }
  const raw = await request.text().catch(() => "")
  const parsed = parseSuggestRequest(raw, {
    storageOrigin: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    creatorId: String(creator.id),
  })
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status, headers: NO_STORE })

  const suggestion = await resolveSuggestion(parsed.input, canAskAi() ? askAiForCategory : null)
  return NextResponse.json(suggestion, { headers: NO_STORE })
}
