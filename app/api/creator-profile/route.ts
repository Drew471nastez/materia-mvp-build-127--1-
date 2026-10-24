/**
 * The creator's own edits to their public page, made FROM that page.
 *
 * A creator looking at their storefront while signed in gets an "Edit profile"
 * control on the cover; this is what it saves to. Everything here is also
 * editable in the store builder — this is a shortcut for the three things
 * people change most, not a second source of truth, so it writes to exactly
 * the same rows the builder does and nothing else.
 *
 * WHERE EACH FIELD ACTUALLY LIVES, because it is not one table:
 *
 *   display name  -> profiles.display_name
 *   bio           -> headerSettings.bio (what the storefront renders first)
 *                    and creators.bio (the fallback, kept in step so the two
 *                    cannot drift and show different text in different places)
 *   social links  -> headerSettings.socialLinks
 *
 * The header settings live inside a JSON column, so they need a
 * read-modify-write. Both the draft and the published config are updated:
 * writing only the published one would mean the builder opens showing the old
 * values and silently republishes them over these.
 *
 * Authorisation is the user's own session through RLS — the update is scoped
 * by `user_id`/`creator_id` and runs on the request-scoped client, so a
 * signed-in user can only ever reach their own row. No admin client here.
 */
import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse, after } from "next/server"
import { followProfileIdentity, type FollowClient } from "@/lib/account/profile-follow"
import { identityChanged } from "@/lib/account/identity-caches"
import { announce, profileAddresses } from "@/lib/seo/announce"
import type { AboutMediaItem, ShopHeaderSettings, SocialLinksConfig } from "@/lib/store-builder/types"
import { SOCIAL_PLATFORM_KEYS, resolveSocialInput, type SocialPlatformKey } from "@/lib/social/platforms"
import { toPublicHttpUrl } from "@/lib/url/public-url"
import { canonicalVideoUrl } from "@/lib/social/video"
import { themePresets } from "@/lib/store-builder/defaults"
import { sanitizeRichText } from "@/lib/website-builder/sanitize"
import { clampPercent, clampZoom } from "@/lib/images/cover-crop"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// The list lives in lib/social/platforms. It used to be a third copy — the
// dialog had one, the icons had one, and this had one, so a platform added in
// two of the three was a field a creator could fill in that never appeared.
const PLATFORMS = SOCIAL_PLATFORM_KEYS
type Platform = SocialPlatformKey

/* A catalogue far larger than anyone has, so the cap never surprises a real shop. */
const MAX_PRODUCTS_ORDER = 500
const MAX_NAME = 60
const MAX_BIO = 500
const MAX_URL = 300
const MAX_ABOUT_HEADLINE = 120
const MAX_ABOUT_STORY = 2000
const MAX_ABOUT_MEDIA = 8
const MAX_CTA_TEXT = 120
const MAX_CTA_BUTTON = 30
const MAX_EMAIL = 254

function cleanUrl(raw: unknown): string | null {
  return toPublicHttpUrl(raw, MAX_URL)
}

function buildSocialLinks(input: unknown, existing?: SocialLinksConfig): SocialLinksConfig {
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
  const out = {} as SocialLinksConfig
  for (const key of PLATFORMS) {
    const url = resolveSocialInput(key, source[key])
    // `enabled` is kept only because the stored shape has the field; nothing
    // reads it any more. A URL is what shows an icon, and clearing the field
    // is what removes it — see the note in social-media-icons.tsx.
    out[key as Platform] = url ? { enabled: true, url } : { enabled: false, url: "" }
  }
  // Anything the caller did not mention at all keeps whatever was stored.
  if (existing) {
    for (const key of PLATFORMS) {
      // `existing[key]` is optional for the platforms added after the shape
      // was first written, so a stored config from before them has nothing
      // there — which is what `?? out[key]` is for.
      if (!(key in source)) out[key] = existing[key] ?? out[key]!
    }
  }
  return out
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const displayName = typeof body.displayName === "string" ? body.displayName.trim().slice(0, MAX_NAME) : undefined
  const bio = typeof body.bio === "string" ? body.bio.trim().slice(0, MAX_BIO) : undefined

  /**
   * Images go through the same cleaner as the social links, for the same
   * reason: they end up in a `src` on a public page, and `javascript:` in an
   * attribute does not care that we called it an avatar. `null` clears; a
   * value that will not parse is ignored, and the stored picture stays. It
   * used to come out of the cleaner as `null` and was then written as a
   * clear, so a bad value deleted the creator's cover.
   */
  const imageField = (key: "avatarUrl" | "coverUrl"): string | null | undefined => {
    if (!(key in body)) return undefined
    if (body[key] === null) return null
    return cleanUrl(body[key]) ?? undefined
  }
  const avatarUrl = imageField("avatarUrl")
  const coverUrl = imageField("coverUrl")

  /**
   * The About story. Bounded like every other free-text field, and media is an
   * allowlist of two shapes — an uploaded image URL or a YouTube link — each
   * put through the same URL cleaner as everything else that reaches a src or
   * an href on a public page.
   */
  const about = (() => {
    const raw = body.about
    if (!raw || typeof raw !== "object") return undefined
    const value = raw as Record<string, unknown>
    const out: { headline?: string; aboutContent?: string; mediaItems?: AboutMediaItem[] } = {}
    if (typeof value.headline === "string") out.headline = value.headline.trim().slice(0, MAX_ABOUT_HEADLINE)
    /**
     * THE STORY IS RICH TEXT NOW, so it is HTML, so it is sanitised here.
     *
     * lib/website-builder/sanitize is the allow list the rest of the product
     * uses, and its own note is the argument: a creator page is served from
     * storelib.com, so script in a creator's own story runs on this origin in
     * the session of whoever opens their page. Sanitised on the way in, which
     * is where the authority is, and the renderer sanitises again on the way
     * out for rows that predate this.
     *
     * A story with no markup in it stays a plain string: sanitising cannot
     * damage it, and not putting tags around a line somebody typed keeps the
     * old rows readable.
     */
    if (typeof value.aboutContent === "string") {
      const raw = value.aboutContent.slice(0, MAX_ABOUT_STORY)
      out.aboutContent = /<[a-z][\s\S]*>/i.test(raw) ? sanitizeRichText(raw).trim() : raw.trim()
    }
    if (Array.isArray(value.mediaItems)) {
      out.mediaItems = value.mediaItems
        .slice(0, MAX_ABOUT_MEDIA)
        .map((item) => {
          const m = item as Record<string, unknown>
          const type = m.type === "image" ? "image" : "video"
          const url = type === "video" ? canonicalVideoUrl(m.url) : cleanUrl(m.url)
          if (!url) return null
          return {
            id: typeof m.id === "string" && m.id ? m.id.slice(0, 64) : `m-${Math.random().toString(36).slice(2, 10)}`,
            type,
            url,
            caption: typeof m.caption === "string" ? m.caption.trim().slice(0, 160) : undefined,
          } as AboutMediaItem
        })
        .filter((m): m is AboutMediaItem => m !== null)
    }
    return Object.keys(out).length > 0 ? out : undefined
  })()

  /**
   * ===========================================================================
   *  THE BAR ACROSS THE TOP OF THE PAGE
   * ===========================================================================
   * "Join AndrewRullz's newsletter!" and the button beside it. Two strings,
   * the most-read two on the page, and until now the only way to change them
   * was the section editor: a page load, a canvas, a sidebar and a publish.
   *
   * `buttonTextPreset: "custom"` is set alongside the text, because the bar
   * picks its label from a preset unless it is told otherwise, and writing
   * `buttonText` without it would save a string nothing ever reads.
   */
  const subscribeBar = (() => {
    const raw = body.subscribeBar
    if (!raw || typeof raw !== "object") return undefined
    const value = raw as Record<string, unknown>
    const out: Record<string, unknown> = {}
    if (typeof value.text === "string") {
      const text = value.text.trim().slice(0, MAX_CTA_TEXT)
      out.text = text
      /** The bar falls back to a generated sentence when both are empty. */
      out.customCtaText = text
    }
    /**
     * The bar's own colours. Each is optional and each is validated as a hex,
     * because these reach a `style` attribute on a public page and "anything
     * the creator typed" is not a colour.
     */
    const colorChoices: string[] = []
    for (const key of ["backgroundColor", "textColor", "buttonColor", "buttonTextColor"] as const) {
      const v = value[key]
      if (typeof v === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim())) {
        out[key] = v.trim().toLowerCase()
        /**
         * AND THE FACT THAT SOMEBODY CHOSE IT.
         *
         * The colour alone is not enough for the reader. `resolveStorefrontChrome`
         * has to decide whether a stored white background is a decision or the
         * builder writing its defaults out again, and it was deciding by looking
         * at the colour: white is not a background, black is not a text colour,
         * #2563eb is not a button. So picking any of those did nothing at all.
         *
         * The editor only sends a field it watched somebody change, which is
         * what makes this exact rather than a guess. See the note on `touched`
         * in components/storefront/edit-cta-button.
         */
        colorChoices.push(key)
      }
    }
    if (colorChoices.length > 0) out.colorChoices = colorChoices
    /**
     * THE BAR KEEPS ITS TWO COLOURS IN TWO PLACES, and this wrote only one.
     *
     * The builder stores the bar's background and text under `colors`,
     * because every section's settings extend a base that has a `colors`
     * block; the button's two live at the top level because they are not part
     * of that base. This wrote all four at the top level, and the live page
     * reads the first two out of `colors` — so Background and Text in the
     * editor saved, round-tripped back into the editor, and never reached the
     * page. Both are written now, so whichever a reader asks for is right.
     */

    /** The bar's own presets: which generated sentence, which button label. */
    /** Six generated sentences now; see getStyleText for what each one says. */
    if (typeof value.style === "string" && ["style1", "style2", "style3", "style4", "style5", "style6"].includes(value.style)) {
      out.style = value.style
    }
    if (typeof value.buttonStyle === "string" && ["style1", "style2", "style3", "style4"].includes(value.buttonStyle)) {
      out.buttonStyle = value.buttonStyle
    }
    if (typeof value.buttonText === "string") {
      const label = value.buttonText.trim().slice(0, MAX_CTA_BUTTON)
      if (label) {
        out.buttonText = label
        out.buttonTextPreset = "custom"
      } else {
        /** Cleared: the preset label shows again, and a stale custom one cannot. */
        out.buttonText = ""
        out.buttonTextPreset = "subscribe"
      }
    }
    return Object.keys(out).length > 0 ? out : undefined
  })()

  /**
   * THE COLOUR SCHEME, WHICH IS ONE STORED WORD.
   *
   * The storefront resolves `globalSettings.themePreset` through
   * lib/store-builder/defaults at render and paints every section from it, so
   * changing the look of the whole page is storing a different name. That is
   * why this can be a control in the workspace rather than a trip into the
   * section editor.
   *
   * Validated against the preset list itself, so an unknown name cannot be
   * written and leave a page resolving a theme that does not exist.
   */
  const themePreset = (() => {
    const raw = body.themePreset
    if (typeof raw !== "string") return undefined
    return raw in themePresets ? (raw as keyof typeof themePresets) : undefined
  })()

  /**
   * A PUBLIC CONTACT ADDRESS, WHICH IS NOT THE LOGIN ADDRESS.
   *
   * "A contact link so the creator can be contacted" is worth having and the
   * obvious implementation is wrong: publishing the email somebody signs in
   * with, without being asked, on a page anybody can read. This is a separate
   * field a creator types themselves, empty by default, and clearing it takes
   * the link off the page.
   */
  const contactEmail = (() => {
    if (!("contactEmail" in body)) return undefined
    const raw = body.contactEmail
    if (raw === null || raw === "") return ""
    if (typeof raw !== "string") return undefined
    const value = raw.trim().slice(0, MAX_EMAIL)
    /** One @, something either side, a dot in the domain. Anything else is not an address. */
    return /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(value) ? value : undefined
  })()

  /**
   * What the meta row shows. Booleans only — a missing key means "leave it as
   * it was", so the dialog can send one switch without resetting the others.
   */
  const display = (() => {
    const raw = body.display
    if (!raw || typeof raw !== "object") return undefined
    const value = raw as Record<string, unknown>
    const out: Record<string, boolean> = {}
    for (const key of ["showReviews", "showFollowers", "showTotalSalesBadge", "showSocialMedia"]) {
      if (typeof value[key] === "boolean") out[key] = value[key] as boolean
    }
    return Object.keys(out).length > 0 ? out : undefined
  })()

  /**
   * THE ORDER THE CREATOR DRAGGED THEIR CATALOGUE INTO.
   *
   * A list of product ids and nothing else. It is NOT trusted as a list of
   * products the caller may see: it only ever reorders what the page has
   * already decided to show, and an id for something deleted, unpublished or
   * belonging to somebody else simply finds no product and is dropped when
   * the page applies it. So the check here is about SHAPE and SIZE, which is
   * what stops a caller storing a megabyte of text in a settings blob.
   *
   * A missing key leaves the stored order alone; an empty array is a real
   * value meaning "no arrangement, newest first again".
   */
  const productsOrder = (() => {
    if (!("productsOrder" in body)) return undefined
    const raw = body.productsOrder
    if (!Array.isArray(raw)) return undefined
    const seen = new Set<string>()
    for (const entry of raw) {
      if (typeof entry !== "string") continue
      const id = entry.trim()
      /* Product ids are uuids. Anything else is not one, whatever it is. */
      if (!/^[0-9a-fA-F-]{36}$/.test(id)) continue
      seen.add(id)
      if (seen.size >= MAX_PRODUCTS_ORDER) break
    }
    return [...seen]
  })()

  /**
   * WHERE THE COVER SITS IN ITS BAND. Two numbers, each a percentage, and
   * they go straight into `object-position` on a public page — so they are
   * clamped to 0..100 here rather than trusted. `null` is a real value
   * meaning "back to the middle".
   *
   * Two decimals, not whole numbers: with the cover zoomed four times on a
   * laptop band, one percent is forty pixels, and a creator who placed it
   * with a finger would see it land somewhere else after a save.
   */
  const coverFocalPoint = (() => {
    if (!("coverFocalPoint" in body)) return undefined
    const raw = body.coverFocalPoint
    if (raw === null) return null
    if (!raw || typeof raw !== "object") return undefined
    const value = raw as Record<string, unknown>
    const clamp = (n: unknown) =>
      typeof n === "number" && Number.isFinite(n) ? Math.round(clampPercent(n) * 100) / 100 : null
    const x = clamp(value.x)
    const y = clamp(value.y)
    if (x === null || y === null) return undefined
    return { x, y }
  })()

  /**
   * HOW CLOSE THE COVER IS DRAWN, 1 to COVER_ZOOM_MAX. It sizes an image box
   * on a public page, so it is clamped here as well as in the editor: a
   * zoom of a thousand would be a request for a picture a thousand times
   * the screen. `null` means back to 1, and 1 itself is not stored, so a
   * page that never zoomed keeps the settings it had.
   */
  const coverZoom = (() => {
    if (!("coverZoom" in body)) return undefined
    const raw = body.coverZoom
    if (raw === null) return null
    if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined
    const z = Math.round(clampZoom(raw) * 1000) / 1000
    return z <= 1 ? null : z
  })()

  if (displayName !== undefined && displayName.length === 0) {
    return NextResponse.json({ error: "A display name is required" }, { status: 400 })
  }

  const profileUpdate: Record<string, unknown> = {}
  if (displayName !== undefined) profileUpdate.display_name = displayName
  if (avatarUrl !== undefined) profileUpdate.avatar_url = avatarUrl

  if (Object.keys(profileUpdate).length > 0) {
    /* What the name and the photo were, read before they are overwritten:
       every other row that holds a copy of them follows this change, and
       only a copy that still holds the OLD value moves
       (lib/account/profile-follow). */
    const { data: before } = await supabase.from("profiles").select("display_name, avatar_url").eq("id", user.id).maybeSingle()

    const { error } = await supabase.from("profiles").update(profileUpdate).eq("id", user.id)
    if (error) {
      console.error("[creator-profile] profile update failed", error)
      return NextResponse.json({ error: "Could not save your profile" }, { status: 500 })
    }

    const followed = await followProfileIdentity(supabase as unknown as FollowClient, user.id, {
      ...(displayName !== undefined ? { name: { before: before?.display_name, after: displayName } } : {}),
      ...(avatarUrl !== undefined ? { photo: { before: before?.avatar_url, after: avatarUrl } } : {}),
    })
    /* The public pages read the profile through a cache shared between
       visitors (lib/commerce/product-page-cache): they show the new name on
       their next view, not a minute later. */
    /* The website's own copy of the profile too, expired now rather than marked stale (lib/account/identity-caches). */
    await identityChanged({ userId: user.id, creatorId: followed.creatorId })
  }

  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle()

  // A user who has not become a creator has no storefront to edit; the name is
  // still theirs to change, so that half is already saved and this is a
  // success, not an error.
  if (!creator) {
    return NextResponse.json({ ok: true, storefront: false })
  }

  const creatorUpdate: Record<string, unknown> = {}
  if (bio !== undefined) creatorUpdate.bio = bio
  if (coverUrl !== undefined) creatorUpdate.cover_url = coverUrl
  /**
   * THE SALES BADGE HAS TWO FLAGS and the renderer requires both:
   * `creators.show_total_sales_badge` AND `headerSettings.showTotalSalesBadge`.
   * A control that writes one of them is a control that appears not to work,
   * which is the same bug as the per-platform social `enabled` switch and the
   * sticky bar. One switch, both flags, written together.
   */
  if (display?.showTotalSalesBadge !== undefined) {
    creatorUpdate.show_total_sales_badge = display.showTotalSalesBadge
  }

  if (Object.keys(creatorUpdate).length > 0) {
    const { error } = await supabase.from("creators").update(creatorUpdate).eq("id", creator.id)
    if (error) console.error("[creator-profile] creators update failed", error)
  }

  const { data: config } = await supabase
    .from("store_builder_configs")
    .select("id, draft_config, published_config")
    .eq("creator_id", creator.id)
    .eq("page_type", "shop")
    .maybeSingle()

  /* The page has changed by here: its address, to the search engines that
     take IndexNow, after the answer and never in its way. */
  const announcedCreator = creator.id
  const announceProfile = () => after(() => announce(() => profileAddresses(announcedCreator)))

  if (!config) {
    announceProfile()
    return NextResponse.json({ ok: true, storefront: false })
  }

  /**
   * The About section's story, edited from the storefront rather than only
   * from the builder.
   *
   * It lives in a SECTION's settings, not in headerSettings, so it is merged
   * by walking `sections` for the one of type "about". A config with no About
   * section is left alone: adding one from here would put a block on the page
   * the creator never asked for.
   */
  const mergeAbout = (sections: unknown) => {
    if (!Array.isArray(sections) || !about) return sections
    return sections.map((section) => {
      const s = section as { type?: string; settings?: Record<string, unknown> }
      if (s?.type !== "about") return section
      const settings = { ...(s.settings || {}) }
      if (about.headline !== undefined) settings.headline = about.headline
      if (about.aboutContent !== undefined) settings.aboutContent = about.aboutContent
      if (about.mediaItems !== undefined) settings.mediaItems = about.mediaItems
      return { ...s, settings }
    })
  }

  const merge = (raw: unknown) => {
    if (!raw || typeof raw !== "object") return raw
    const cfg = raw as { headerSettings?: ShopHeaderSettings; sections?: unknown }
    const header = (cfg.headerSettings || {}) as ShopHeaderSettings
    const next: ShopHeaderSettings = { ...header }
    if (bio !== undefined) next.bio = bio
    /**
     * The storefront reads `headerSettings.avatarUrl` and `coverImageUrl`
     * FIRST and only falls back to the profile and creator rows. Writing only
     * those rows would look like the save silently did nothing — an empty
     * string in `avatarUrl` even means "show initials" rather than "inherit",
     * so a cleared image has to be written as `undefined`, not "".
     */
    if (avatarUrl !== undefined) next.avatarUrl = avatarUrl ?? undefined
    if (coverUrl !== undefined) next.coverImageUrl = coverUrl ?? undefined
    if ("socialLinks" in body) {
      next.socialLinks = buildSocialLinks(body.socialLinks, header.socialLinks)
    }
    if (display) Object.assign(next, display)
    /*
      An empty array is a real value here — "forget the arrangement, newest
      first again" — so this tests for undefined rather than for truthiness.
    */
    if (productsOrder !== undefined) next.productsOrder = productsOrder
    if (coverFocalPoint !== undefined) next.coverFocalPoint = coverFocalPoint ?? undefined
    if (coverZoom !== undefined) next.coverZoom = coverZoom ?? undefined
    /*
      A CROP BELONGS TO ONE PICTURE. Where it sits and how close it is drawn
      mean nothing for a different photograph, so a cover that is removed or
      replaced without a crop of its own starts from the middle at zoom 1,
      whoever sent it. The profile sheet already sends both; this is the rule
      for any caller that does not.
    */
    if (coverUrl !== undefined && (coverUrl ?? undefined) !== header.coverImageUrl) {
      if (coverFocalPoint === undefined) next.coverFocalPoint = undefined
      if (coverZoom === undefined) next.coverZoom = undefined
    }
    if (subscribeBar) {
      const existing = (header.subscribeBar || {}) as Record<string, unknown>
      /**
       * THE BAR KEEPS ITS TWO COLOURS IN TWO PLACES, and this wrote only one.
       *
       * The builder stores the bar's background and text under `colors`,
       * because every section's settings extend a base that has a `colors`
       * block; the button's two live at the top level, which is not part of
       * that base. Writing all four at the top level meant Background and
       * Text saved, round-tripped back into the editor, and never reached the
       * page, which reads those two out of `colors`. Both places are written
       * now, merged over whatever is already there so nothing else in the
       * block is dropped.
       */
      const colors = { ...((existing.colors as Record<string, unknown>) || {}) }
      if (subscribeBar.backgroundColor) colors.backgroundColor = subscribeBar.backgroundColor
      if (subscribeBar.textColor) colors.textColor = subscribeBar.textColor
      /**
       * A RECORD OF EVERY COLOUR EVER CHOSEN, not of this save's.
       *
       * The editor sends only what was touched in the session it is open for,
       * so a creator who picks a background today and a button tomorrow sends
       * one field each time. A straight spread would replace yesterday's
       * record with today's and the background would go back to the scheme —
       * the same bug, arriving a day late.
       */
      const existingChosen = Array.isArray(existing.colorChoices) ? (existing.colorChoices as string[]) : []
      const chosen = Array.from(new Set([...existingChosen, ...((subscribeBar.colorChoices as string[]) || [])]))
      next.subscribeBar = {
        ...existing,
        ...subscribeBar,
        ...(chosen.length > 0 ? { colorChoices: chosen } : {}),
        ...(Object.keys(colors).length > 0 ? { colors } : {}),
      } as unknown as ShopHeaderSettings["subscribeBar"]
    }
    /** "" is a real value here: it means take the link off the page. */
    if (contactEmail !== undefined) next.contactEmail = contactEmail || undefined

    const cfgAny = cfg as { globalSettings?: Record<string, unknown> }
    const globalSettings = themePreset
      ? { ...(cfgAny.globalSettings || {}), themePreset }
      : cfgAny.globalSettings

    return { ...cfg, headerSettings: next, globalSettings, sections: mergeAbout(cfg.sections) }
  }

  const { error } = await supabase
    .from("store_builder_configs")
    .update({
      draft_config: merge(config.draft_config),
      published_config: merge(config.published_config),
    })
    .eq("id", config.id)

  if (error) {
    console.error("[creator-profile] config update failed", error)
    return NextResponse.json({ error: "Could not save your profile" }, { status: 500 })
  }

  announceProfile()
  return NextResponse.json({ ok: true, storefront: true })
}
