import { NextResponse } from "next/server"
import { READ, physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { rateLimit } from "@/lib/api/rate-limit"
import { realDeps } from "@/lib/community-roles/engine"
import { disconnectDiscord, loadDiscordSetup, loadTelegramSetup, makeTelegramLinkCode, removeMapping, removeTelegramChat, retryGrant, saveDiscordMapping, saveTelegramMapping } from "@/lib/community-roles/setup"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Settings › Integrations › Discord and Telegram (lib/community-roles/setup).
 * The store's owner only.
 *
 *   GET  ?provider=discord|telegram   the connection, roles or chats, the
 *                                     mappings and each member's access
 *   POST { provider, action, ... }    map, unmap, disconnect, retry,
 *                                     link_code, remove_chat
 */
const provider = (v: unknown) => (v === "discord" || v === "telegram" ? v : null)

export async function GET(request: Request) {
  const c = await shopCaller("store", READ)
  if (c instanceof NextResponse) return c
  const p = provider(new URL(request.url).searchParams.get("provider"))
  if (!p) return physicalJson({ error: "Bad request." }, 400)
  const deps = realDeps(c.db)
  try {
    return physicalJson(p === "discord" ? { discord: await loadDiscordSetup(deps, c.creatorId) } : { telegram: await loadTelegramSetup(deps, c.creatorId) })
  } catch {
    return physicalJson({ error: "Could not read your setup. Try again in a moment." }, 503)
  }
}

export async function POST(request: Request) {
  const c = await shopCaller("store", { strict: true })
  if (c instanceof NextResponse) return c
  const limited = await rateLimit({ bucket: "community-roles-setup", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 60, seconds: 600 }], message: "That is a lot of changes. Wait a few minutes and try again." })
  if (limited) return limited
  const body = await readBody(request)
  const p = provider(body?.provider)
  if (!body || !p) return physicalJson({ error: "Bad request." }, 400)
  const deps = realDeps(c.db)
  let r: { ok: boolean; error?: string; status?: number; [k: string]: unknown }
  switch (body.action) {
    case "map":
      r = p === "discord" ? await saveDiscordMapping(deps, c.creatorId, { productId: body.productId, roleId: body.roleId }) : await saveTelegramMapping(deps, c.creatorId, { productId: body.productId, chatRef: body.chatRef })
      break
    case "unmap":
      r = await removeMapping(deps, c.creatorId, p, body.id)
      break
    case "retry":
      r = await retryGrant(deps, c.creatorId, p, body.grantId)
      break
    case "disconnect":
      r = p === "discord" ? await disconnectDiscord(deps, c.creatorId) : { ok: false, error: "Bad request.", status: 400 }
      break
    case "link_code":
      r = p === "telegram" ? await makeTelegramLinkCode(deps, c.creatorId, c.userId) : { ok: false, error: "Bad request.", status: 400 }
      break
    case "remove_chat":
      r = p === "telegram" ? await removeTelegramChat(deps, c.creatorId, body.id) : { ok: false, error: "Bad request.", status: 400 }
      break
    default:
      return physicalJson({ error: "Bad request." }, 400)
  }
  if (!r.ok) return physicalJson({ error: r.error }, r.status ?? 400)
  const { ok: _ok, ...rest } = r
  void _ok
  const view = p === "discord" ? { discord: await loadDiscordSetup(deps, c.creatorId) } : { telegram: await loadTelegramSetup(deps, c.creatorId) }
  return physicalJson({ ...rest, ...view })
}
