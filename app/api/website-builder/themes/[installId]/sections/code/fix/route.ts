/**
 * ===========================================================================
 *  POST /api/website-builder/themes/[installId]/sections/code/fix
 * ===========================================================================
 * "Solve with AI", from the error list in the code editor. The body is the
 * file as it stands in the editor and the errors the compiler gave for it;
 * the answer is the same file with those errors gone, compiled here before
 * it is handed back.
 *
 * IT WRITES NOTHING. The fixed text goes into the editor's buffer for the
 * person to read and save, the same as if they had typed it. A file that did
 * not compile was never stored in the first place, so there is nothing here
 * to overwrite and no reason to take the review away from them.
 */
import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { resolveForCreator } from "@/lib/sites/agent/provider"
import { fixSection } from "@/lib/website-builder/agent/fix-section"
import { schemasFromSources } from "@/lib/website-builder/storelib-schemas"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { sourceMap } from "@/lib/website-builder/theme-file-drafts"
import { LIMITS } from "@/lib/storelib-theme/types"
import { LIMITS as RATE_LIMITS, rateLimit } from "@/lib/api/rate-limit"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"
import { fileCols, resolveRefs } from "@/lib/website-builder/theme-file-refs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BodySchema = z.object({
  path: z.string().min(1).max(200),
  source: z.string().min(1).max(LIMITS.sourceBytes),
  errors: z
    .array(
      z.object({
        line: z.number().optional(),
        message: z.string().max(600),
        stage: z.enum(["parse", "schema", "template", "css", "script", "package"]).optional(),
      }),
    )
    .min(1)
    .max(50),
})

export async function POST(request: NextRequest, context: { params: Promise<{ installId: string }> }) {
  const { installId } = await context.params

  const supabase = await createClient()
  const who = await routeUser()
  if (who.kind === "unavailable") return authUnavailableResponse()
  const user = who.kind === "user" ? who.user : null
  if (!user) return NextResponse.json({ error: "Sign in to use this." }, { status: 401 })

  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator) return NextResponse.json({ error: "Only creators can edit themes." }, { status: 403 })

  /** RLS decides: a theme somebody else owns reads as absent. */
  const { data: install } = await supabase
    .from("store_theme_installs")
    .select("id")
    .eq("id", installId)
    .eq("creator_id", (creator as { id: string }).id)
    .maybeSingle()
  if (!install) return NextResponse.json({ error: "Theme not found" }, { status: 404 })

  /* Each repair is one to three model calls, so the same budget as writing a section: RATE_LIMITS.siteAi. */
  const limited = await rateLimit({
    bucket: "site-section-fix",
    subjects: [`user:${user.id}`],
    windows: RATE_LIMITS.siteAi,
    message: "That is a lot of fixes asked for in a short time. Wait a moment and try again.",
  })
  if (limited) return limited

  const parsed = BodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 })
  const { path, source, errors } = parsed.data

  if (!path.endsWith(".storelib")) {
    return NextResponse.json({ error: "Only a .storelib file is compiled, so only one can be repaired." }, { status: 400 })
  }

  /**
   * The types already in use, so a repair that decides to rename the section
   * is told what it may not rename it to. The file's own type is excluded:
   * it is allowed to keep it, and usually should.
   */
  const { data: rows } = await supabase
    .from("store_theme_custom_files")
    .select(await fileCols("path, content"))
    .eq("install_id", installId)
    .like("path", "%.storelib")
  const sources = sourceMap(await resolveRefs((rows ?? []) as unknown as { path: string; content: string }[]))
  delete sources[path]
  const takenTypes = [...new Set([...Object.keys(SECTION_SCHEMAS), ...Object.keys(schemasFromSources(sources))])]

  const resolved = await resolveForCreator((creator as { id: string }).id, { tier: "strong" })
  const fixed = await fixSection({
    provider: resolved.provider,
    model: resolved.model,
    path,
    source,
    // The stage is only ever read back to the model as context; a client
    // that sends none is telling us it does not know, not that it is wrong.
    errors: errors.map((e) => ({ ...e, stage: e.stage ?? "parse" })),
    takenTypes,
    signal: request.signal,
  })

  if (fixed.ok === false) {
    return NextResponse.json({ error: fixed.error, errors: fixed.errors }, { status: 422 })
  }

  return NextResponse.json({ path, source: fixed.value.source })
}
