import "server-only"

/**
 * ===========================================================================
 *  WHAT A SHARED COMMUNITY LINK'S PICTURE IS DRAWN FROM
 * ===========================================================================
 * The facts (components/community/public/share-card.tsx CommunityShareModel)
 * come from the same card every list draws (cardsFor: the name, the line, the
 * creator, the member count, the price), so the picture never says what the
 * page does not. The pictures are fetched the careful way the OnePage share
 * image fetches them (lib/onepage/share-image: https only, public hosts,
 * every redirect checked, a few seconds and a few megabytes at most) and cut
 * by sharp to exactly the size they are drawn at, as JPEG or PNG, the kinds
 * next/og reads: a WebP cover (what uploads become) draws as well as any.
 */
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fetchImageBytes } from "@/lib/onepage/share-image"
import type { CommunityShareModel } from "@/components/community/public/share-card"
import type { CommunityRow } from "../types"
import { cardsFor, type CardRow } from "./public"
import type { Db } from "./db"

/** The picture's facts for this community, and the addresses of the three pictures it draws; `invite` draws the invite's words. */
export async function shareModel(db: Db, community: CommunityRow, invite: boolean): Promise<{ model: CommunityShareModel; pictures: { cover: string | null; logo: string | null; avatar: string | null } }> {
  const [card] = await cardsFor(db, [community as unknown as CardRow])
  return {
    model: {
      name: community.name,
      tagline: community.tagline?.trim() || card?.excerpt || null,
      creatorName: card?.creator?.name ?? null,
      memberCount: Math.max(0, community.member_count ?? 0),
      priceLine: card?.priceLine ?? null,
      inviteOnly: community.access === "invite_only",
      invite,
    },
    pictures: { cover: community.cover_url, logo: community.logo_url, avatar: card?.creator?.avatarUrl ?? null },
  }
}

/**
 * A picture at `url` cut to `width` by `height` (cover, from the middle,
 * turned the way the camera held it) as a data URL, or null. A logo keeps
 * its transparency (PNG); a cover and a face are JPEG on white. Never throws.
 */
export async function sharePicture(url: string | null | undefined, width: number, height: number, kind: "jpeg" | "png"): Promise<string | null> {
  if (!url) return null
  const bytes = await fetchImageBytes(url, { maxBytes: 8 * 1024 * 1024, timeoutMs: 3500 })
  if (!bytes) return null
  try {
    const { default: sharp } = await import("sharp")
    const base = sharp(bytes, { failOn: "none", limitInputPixels: 50_000_000 }).rotate().resize(width, height, { fit: "cover", position: "centre" })
    const out = kind === "png" ? await base.png({ compressionLevel: 8 }).toBuffer() : await base.flatten({ background: "#ffffff" }).jpeg({ quality: 84, mozjpeg: true }).toBuffer()
    return `data:image/${kind};base64,${out.toString("base64")}`
  } catch {
    return null
  }
}

let fonts: Promise<{ name: string; data: Buffer; weight: 400 | 600; style: "normal" }[]> | null = null

/** Inter, Storelib's face, from the repository (lib/checkout/fonts; next.config.mjs traces it for this route). */
export function shareFonts() {
  if (!fonts) {
    const dir = join(process.cwd(), "lib/checkout/fonts")
    fonts = Promise.all([readFile(join(dir, "Inter-Regular.woff")), readFile(join(dir, "Inter-SemiBold.woff"))])
      .then(([regular, semibold]) => [
        { name: "Inter", data: regular, weight: 400 as const, style: "normal" as const },
        { name: "Inter", data: semibold, weight: 600 as const, style: "normal" as const },
      ])
      .catch(() => {
        fonts = null
        return []
      })
  }
  return fonts
}
