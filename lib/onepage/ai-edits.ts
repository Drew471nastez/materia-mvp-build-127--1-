/**
 * ===========================================================================
 *  WHAT THE ONEPAGE AI MAY CHANGE, AND THE CHECKS IT GOES THROUGH (round AR)
 * ===========================================================================
 * The owner: "make sure the AI can also edit the social links, from the
 * social icons, the social links block, as well as link blocks".
 *
 * The AI never writes the page. It names edits, as tool calls
 * (AI_EDIT_TOOLS), and each one is checked here the way the editor checks
 * the same change made by hand, then applied to the owner's draft:
 *
 *   set_social      a social icon: the address or handle is read by
 *                   lib/onepage/social-input parseSocialInput, the function
 *                   the editor's social sheet uses, and saved as it saves it
 *                   (https, the platform's own site, a handle made a link)
 *   remove_social   a social icon taken off
 *   add_link        a link block, its address made whole (lib/onepage/
 *                   public-shape linkHref, as the page draws it) and only an
 *                   http or https address on a real host is taken
 *   update_link     a link block's title or address, the same checks
 *   remove_link     a link block taken off the page (into nothing: the
 *                   editor's Undo still has it)
 *   social_block    the social links block: shown or not, icons or buttons
 *
 * Only top level blocks of type link_button are touched by the link edits,
 * named by their id; anything else (another block's id, a group, a product)
 * is refused with the reason, and the other edits still apply. Pure: no
 * database and no clock, so the route (app/api/onepage/ai) and the tests
 * run the same code.
 */
import { canonicalSocialPlatform } from "./social-url"
import { parseSocialInput } from "./social-input"
import { linkHref } from "./public-shape"

/** The social icons a page can have (lib/onepage/types OnePageSocialLinks). */
export const AI_SOCIAL_PLATFORMS = [
  "instagram", "tiktok", "youtube", "twitter", "spotify", "website", "email", "threads", "facebook", "whatsapp",
  "snapchat", "discord", "github", "kick", "linkedin", "patreon", "pinterest", "soundcloud", "telegram", "twitch",
] as const

export const MAX_AI_EDITS = 20
export const MAX_LINK_LABEL = 120

export type AiEdit =
  | { op: "set_social"; platform: string; value: string }
  | { op: "remove_social"; platform: string }
  | { op: "add_link"; label: string; url: string; after_id?: string | null }
  | { op: "update_link"; id: string; label?: string; url?: string }
  | { op: "remove_link"; id: string }
  | { op: "social_block"; show?: boolean; style?: "icons" | "buttons" }

interface Block {
  id: string
  type: string
  enabled?: boolean
  sort_order?: number
  data?: Record<string, unknown>
  [k: string]: unknown
}

export interface AiEditPage {
  social_links: Record<string, string | null | undefined>
  draft_blocks: Block[]
}

export interface AiEditResult {
  page: AiEditPage
  /** What changed, in plain words, one line per edit applied. */
  applied: string[]
  /** What was refused, and why, in plain words. */
  refused: string[]
}

/** A link block's address as the AI may set it: http or https, a real host, nothing else. */
export function aiLinkUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const typed = raw.trim()
  if (!typed || typed.length > 2048 || /\s/.test(typed)) return null
  const whole = linkHref(typed)
  if (typeof whole !== "string") return null
  try {
    const u = new URL(whole)
    if (u.protocol !== "https:" && u.protocol !== "http:") return null
    if (u.username || u.password) return null
    if (!/\.[a-z][a-z0-9-]+$/i.test(u.hostname)) return null
    return u.toString().replace(/\/$/, u.pathname === "/" && !u.search && !u.hash ? "" : "/")
  } catch {
    return null
  }
}

function cleanLabel(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const s = raw.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim()
  return s ? s.slice(0, MAX_LINK_LABEL) : null
}

function platformOf(raw: unknown): string | null {
  const key = canonicalSocialPlatform(typeof raw === "string" ? raw : "")
  return (AI_SOCIAL_PLATFORMS as readonly string[]).includes(key) ? key : null
}

function renumber(blocks: Block[]): Block[] {
  return blocks.map((b, i) => (b.sort_order === i ? b : { ...b, sort_order: i }))
}

/** One AI edit, read from whatever the model sent: the shape is checked before anything else. */
export function readAiEdit(raw: unknown): AiEdit | null {
  const r = (raw && typeof raw === "object" ? raw : null) as Record<string, unknown> | null
  if (!r || typeof r.op !== "string") return null
  const str = (v: unknown) => (typeof v === "string" ? v : undefined)
  switch (r.op) {
    case "set_social":
      return typeof r.platform === "string" && typeof r.value === "string" ? { op: "set_social", platform: r.platform, value: r.value } : null
    case "remove_social":
      return typeof r.platform === "string" ? { op: "remove_social", platform: r.platform } : null
    case "add_link":
      return typeof r.label === "string" && typeof r.url === "string" ? { op: "add_link", label: r.label, url: r.url, after_id: str(r.after_id) ?? null } : null
    case "update_link":
      return typeof r.id === "string" && (typeof r.label === "string" || typeof r.url === "string") ? { op: "update_link", id: r.id, label: str(r.label), url: str(r.url) } : null
    case "remove_link":
      return typeof r.id === "string" ? { op: "remove_link", id: r.id } : null
    case "social_block": {
      const style = r.style === "icons" || r.style === "buttons" ? r.style : undefined
      const show = typeof r.show === "boolean" ? r.show : undefined
      return style || show !== undefined ? { op: "social_block", show, style } : null
    }
    default:
      return null
  }
}

/**
 * The edits applied in order to a copy of the page. Each is checked on its
 * own; a refused one changes nothing and says why.
 */
export function applyAiEdits(page: AiEditPage, edits: unknown[], opts: { newId: () => string }): AiEditResult {
  let social = { ...(page.social_links || {}) }
  let blocks: Block[] = (page.draft_blocks || []).map((b) => ({ ...b }))
  const applied: string[] = []
  const refused: string[] = []
  const list = Array.isArray(edits) ? edits.slice(0, MAX_AI_EDITS) : []
  if (Array.isArray(edits) && edits.length > MAX_AI_EDITS) refused.push(`Only the first ${MAX_AI_EDITS} changes were made.`)
  const linkAt = (id: string) => blocks.findIndex((b) => b.id === id && b.type === "link_button")

  for (const raw of list) {
    const edit = readAiEdit(raw)
    if (!edit) {
      refused.push("A change could not be read.")
      continue
    }
    switch (edit.op) {
      case "set_social": {
        const platform = platformOf(edit.platform)
        if (!platform) {
          refused.push(`${edit.platform} is not a social icon a page can have.`)
          break
        }
        const read = parseSocialInput(platform, edit.value)
        if (!read.ok) {
          refused.push(read.error === "empty" ? `No address was given for ${platform}.` : `That is not a ${platform} address or username.`)
          break
        }
        social = { ...social, [platform]: read.url }
        applied.push(`Set ${platform} to ${read.url}.`)
        break
      }
      case "remove_social": {
        const platform = platformOf(edit.platform)
        if (!platform || !social[platform]) {
          refused.push(`There is no ${edit.platform} icon to remove.`)
          break
        }
        social = { ...social, [platform]: null }
        applied.push(`Removed ${platform}.`)
        break
      }
      case "add_link": {
        const label = cleanLabel(edit.label)
        const url = aiLinkUrl(edit.url)
        if (!label || !url) {
          refused.push(!label ? "A new link needs a title." : `"${String(edit.url).slice(0, 80)}" is not a web address.`)
          break
        }
        const block: Block = { id: opts.newId(), type: "link_button", enabled: true, sort_order: 0, data: { label, url, icon: null, thumbnail_url: null } }
        const after = edit.after_id ? blocks.findIndex((b) => b.id === edit.after_id) : -1
        blocks = after >= 0 ? [...blocks.slice(0, after + 1), block, ...blocks.slice(after + 1)] : [...blocks, block]
        applied.push(`Added the link "${label}".`)
        break
      }
      case "update_link": {
        const i = linkAt(edit.id)
        if (i < 0) {
          refused.push("That link is not on the page.")
          break
        }
        const patch: Record<string, unknown> = {}
        if (edit.label !== undefined) {
          const label = cleanLabel(edit.label)
          if (!label) {
            refused.push("A link needs a title.")
            break
          }
          patch.label = label
        }
        if (edit.url !== undefined) {
          const url = aiLinkUrl(edit.url)
          if (!url) {
            refused.push(`"${edit.url.slice(0, 80)}" is not a web address.`)
            break
          }
          patch.url = url
          /* The old address's preview and the action that pointed elsewhere go with it, as a new address typed by hand. */
          patch.link_preview = undefined
          patch.action = undefined
        }
        const was = blocks[i]
        blocks = blocks.map((b, j) => (j === i ? { ...was, data: { ...(was.data || {}), ...patch } } : b))
        applied.push(`Changed the link "${String((patch.label ?? was.data?.label) || "")}".`)
        break
      }
      case "remove_link": {
        const i = linkAt(edit.id)
        if (i < 0) {
          refused.push("That link is not on the page.")
          break
        }
        const label = String(blocks[i].data?.label || "")
        blocks = blocks.filter((_, j) => j !== i)
        applied.push(`Removed the link "${label}".`)
        break
      }
      case "social_block": {
        let i = blocks.findIndex((b) => b.type === "social_row")
        if (i < 0 && edit.show === false) {
          applied.push("The social links block is already off.")
          break
        }
        if (i < 0) {
          /* Under the header, where the editor puts it. */
          const header = blocks.findIndex((b) => b.type === "header")
          const block: Block = { id: opts.newId(), type: "social_row", enabled: true, sort_order: 0, data: { platforms: [], style: edit.style ?? "icons" } }
          blocks = [...blocks.slice(0, header + 1), block, ...blocks.slice(header + 1)]
          i = header + 1
        }
        const was = blocks[i]
        blocks = blocks.map((b, j) =>
          j === i ? { ...was, ...(edit.show !== undefined ? { enabled: edit.show } : {}), data: { ...(was.data || {}), ...(edit.style ? { style: edit.style } : {}) } } : b,
        )
        applied.push(`Social links block: ${[edit.show === undefined ? null : edit.show ? "shown" : "hidden", edit.style ?? null].filter(Boolean).join(", ")}.`)
        break
      }
    }
  }
  return { page: { social_links: social, draft_blocks: renumber(blocks) }, applied, refused }
}

/** What the model is told about the page: the links and icons it may change, nothing else. */
export function aiPageSummary(page: AiEditPage): string {
  const icons = AI_SOCIAL_PLATFORMS.filter((p) => page.social_links?.[p]).map((p) => `${p}: ${page.social_links[p]}`)
  const links = (page.draft_blocks || []).filter((b) => b.type === "link_button").map((b) => `id ${b.id}: "${String(b.data?.label ?? "")}" -> ${String(b.data?.url ?? "")}`)
  const row = (page.draft_blocks || []).find((b) => b.type === "social_row")
  return [
    `Social icons: ${icons.length ? icons.join("; ") : "none"}`,
    `Social links block: ${row ? `${row.enabled === false ? "hidden" : "shown"}, ${String(row.data?.style ?? "icons")}` : "none"}`,
    `Link blocks: ${links.length ? links.join("; ") : "none"}`,
  ].join("\n")
}

/** The tools the model is given: the edits above, one tool each. */
export const AI_EDIT_TOOLS = [
  {
    name: "set_social",
    description: "Add or change one social icon on the page. value is the username or the profile address.",
    input_schema: { type: "object", properties: { platform: { type: "string", enum: [...AI_SOCIAL_PLATFORMS] }, value: { type: "string" } }, required: ["platform", "value"] },
  },
  {
    name: "remove_social",
    description: "Remove one social icon from the page.",
    input_schema: { type: "object", properties: { platform: { type: "string", enum: [...AI_SOCIAL_PLATFORMS] } }, required: ["platform"] },
  },
  {
    name: "add_link",
    description: "Add a link block with a title and a web address. after_id puts it after that block; without it the link goes last.",
    input_schema: { type: "object", properties: { label: { type: "string" }, url: { type: "string" }, after_id: { type: "string" } }, required: ["label", "url"] },
  },
  {
    name: "update_link",
    description: "Change an existing link block's title or web address, by its id.",
    input_schema: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, url: { type: "string" } }, required: ["id"] },
  },
  {
    name: "remove_link",
    description: "Remove an existing link block, by its id.",
    input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "social_block",
    description: "Show or hide the social links block, or draw it as icons or buttons.",
    input_schema: { type: "object", properties: { show: { type: "boolean" }, style: { type: "string", enum: ["icons", "buttons"] } } },
  },
] as const
