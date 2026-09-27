import "server-only"

/**
 * ===========================================================================
 *  THE COPIES OF THE NAME AND THE PHOTO FOLLOW THE PROFILE
 * ===========================================================================
 * `profiles.display_name` and `profiles.avatar_url` are the name and the
 * face (lib/account/identity). Five other places hold a COPY of one or both,
 * and none of them was rewritten when the profile changed:
 *
 *   onepages.title, onepages.avatar_url           the OnePage's draft
 *   onepages.published_profile.{title,avatar_url} what a visitor is shown,
 *                                                 and what builds the tab
 *                                                 title and the favicon
 *   onepages.settings.seo_title                   the SEO card's Meta title,
 *                                                 which it filled in with the
 *                                                 page name and then saved
 *   creators.display_name, creators.avatar_url    read by the product page
 *                                                 and the website's name
 *   globalSettings.storeName                      the creator page's name,
 *                                                 which syncs the other way
 *                                                 on every save
 *
 * So renaming yourself left the old name in the tab, and replacing your
 * photo left the old one as the icon, for as long as the page was not
 * republished. This runs after the profile is written.
 *
 * THE NAME AND THE PHOTO ARE NOT TREATED THE SAME, and that is deliberate:
 *
 *   the name    only a copy that STILL HOLDS THE OLD VALUE moves. A copy
 *               holding something else is a page title or a store name
 *               somebody chose, and is left exactly as it is
 *               (`followsProfile`).
 *   the photo   EVERY copy moves, whatever it holds
 *               (`mirrorsProfilePhoto`). One creator had three faces at
 *               once, one per editor, because each editor's write counted
 *               as a choice and the copy never followed again. There is one
 *               photo; every editor that offers a photo picker saves it to
 *               the profile (lib/account/avatar-save), and this puts the
 *               copies back on it.
 *
 * Belt and braces with the database trigger in
 * supabase/sql/run-now/44_profile_identity_follows.sql and the photo pass in
 * 53_one_profile_photo.sql, which do the same for every writer, this one
 * included. Running both is harmless: the second pass finds the copies
 * already moved and writes nothing.
 */
import { followProfilePhoto } from "./avatar"
import { followsProfile, mirrorsProfilePhoto } from "./identity"

type Row = Record<string, unknown>
type Res<T> = PromiseLike<{ data: T | null; error: { code?: string; message?: string } | null }>

/** The part of a Supabase client this needs. */
export interface FollowClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): Res<Row[]> & { maybeSingle(): Res<Row> }
    }
    update(values: Row): { eq(column: string, value: string): Res<unknown> }
  }
}

export interface ProfileChange {
  /** The profile's display name before and after. Omit to leave names alone. */
  name?: { before: unknown; after: unknown }
  /**
   * The profile's photo. Omit to leave photos alone. `before` is kept for
   * the caller's own logging and for the name half's symmetry; the photo
   * copies take `after` whatever they hold.
   */
  photo?: { before?: unknown; after: unknown }
}

export interface Followed {
  onepages: number
  creators: number
  configs: number
  creatorId: string | null
}

/** Merges one field into a JSON column, and only when there is a JSON column. */
function withField(json: unknown, key: string, value: string | null): Row | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null
  return { ...(json as Row), [key]: value }
}

/**
 * Moves every stale copy for one person. `userId` is the profile's id.
 * Errors are logged, never thrown: the profile is saved by the time this
 * runs, and a copy that did not move is one the next save moves.
 */
export async function followProfileIdentity(client: FollowClient, userId: string, change: ProfileChange): Promise<Followed> {
  const done: Followed = { onepages: 0, creators: 0, configs: 0, creatorId: null }
  const name = change.name
  const photo = change.photo
  if (!name && !photo) return done

  const nameFollows = (stored: unknown) => (name ? followsProfile(stored, name.before, name.after) : undefined)
  const photoFollows = (stored: unknown) => (photo ? mirrorsProfilePhoto(stored, photo.after) : undefined)

  /* ── The OnePage: its draft, its published copy, and its SEO title ───── */
  try {
    const { data: page } = await client
      .from("onepages")
      .select("id, title, avatar_url, published_profile, settings")
      .eq("owner_id", userId)
      .maybeSingle()
    if (page && typeof page.id === "string") {
      const update: Row = {}
      const title = nameFollows(page.title)
      if (title !== undefined) update.title = title
      const avatar = photoFollows(page.avatar_url)
      if (avatar !== undefined) update.avatar_url = avatar

      const published = page.published_profile as Row | null
      let nextPublished: Row | null = null
      const publishedTitle = nameFollows(published?.title)
      if (publishedTitle !== undefined) nextPublished = withField(published, "title", publishedTitle)
      const publishedAvatar = photoFollows(published?.avatar_url)
      if (publishedAvatar !== undefined) nextPublished = withField(nextPublished ?? published, "avatar_url", publishedAvatar)
      if (nextPublished) update.published_profile = nextPublished

      const seoTitle = nameFollows((page.settings as Row | null)?.seo_title)
      if (seoTitle !== undefined) {
        const settings = withField(page.settings, "seo_title", seoTitle)
        if (settings) update.settings = settings
      }

      if (Object.keys(update).length > 0) {
        const { error } = await client.from("onepages").update(update).eq("id", page.id)
        if (error) console.error(`[profile-follow] OnePage not moved (${error.code ?? "unknown"})`)
        else done.onepages = 1
      }
    }
  } catch (e) {
    console.error("[profile-follow] OnePage not read:", (e as Error).message)
  }

  /* ── The creator row's own copies, which nothing in the app edits ────── */
  try {
    const { data: creator } = await client.from("creators").select("id, display_name, avatar_url").eq("user_id", userId).maybeSingle()
    if (creator && typeof creator.id === "string") {
      done.creatorId = creator.id
      const update: Row = {}
      const displayName = nameFollows(creator.display_name)
      if (displayName !== undefined) update.display_name = displayName
      const avatar = photoFollows(creator.avatar_url)
      if (avatar !== undefined) update.avatar_url = avatar
      if (Object.keys(update).length > 0) {
        const { error } = await client.from("creators").update(update).eq("id", creator.id)
        if (error) console.error(`[profile-follow] creator row not moved (${error.code ?? "unknown"})`)
        else done.creators = 1
      }
    }
  } catch (e) {
    console.error("[profile-follow] creator row not read:", (e as Error).message)
  }

  /* ── The creator page's store name, and its header photo ─────────────── */
  if (done.creatorId) {
    try {
      const { data: configs } = await client
        .from("store_builder_configs")
        .select("id, draft_config, published_config")
        .eq("creator_id", done.creatorId)
      for (const row of configs ?? []) {
        if (typeof row.id !== "string") continue
        const update: Row = {}
        for (const key of ["draft_config", "published_config"] as const) {
          /* The header keeps "" to mean "show my initials", so the photo goes
             through lib/account/avatar's own rule rather than this one. */
          let next = photo ? followProfilePhoto(row[key] as Row | null, (photo.after as string | null) ?? null) : null
          const config = (next ?? row[key]) as Row | null
          const global = config && typeof config === "object" ? (config.globalSettings as Row | null) : null
          const storeName = nameFollows(global?.storeName)
          if (storeName !== undefined && global) {
            next = { ...(config as Row), globalSettings: { ...global, storeName: storeName ?? "" } }
          }
          if (next) update[key] = next
        }
        if (Object.keys(update).length > 0) {
          const { error } = await client.from("store_builder_configs").update(update).eq("id", row.id)
          if (error) console.error(`[profile-follow] creator page not moved (${error.code ?? "unknown"})`)
          else done.configs++
        }
      }
    } catch (e) {
      console.error("[profile-follow] creator page not read:", (e as Error).message)
    }
  }

  return done
}
