/**
 * People's photos for the front page hero's pictures (scripts/hero-shots.mjs).
 *
 * Round 12, the owner: "the avatars of some profile pictures [should be]
 * pictures of people". The demo community's members (and the dashboard's
 * signed in creator) show these in place of a grey blank face.
 *
 * SOURCES AND LICENCE. Every photo is from Unsplash, used under the Unsplash
 * License (https://unsplash.com/license): free to use, no permission or
 * credit needed. The same CDN (images.unsplash.com) the OnePage's wallpapers
 * already use. Each is cropped to the face by Unsplash's own crop and kept
 * here at 256 x 256; the names are the demo's invented people, not the
 * people photographed, and no real creator's page or photo is used.
 *
 * Fetched once with curl (through the machine's proxy) into a cache folder,
 * then written as PNG into the shots' /demo/ folder as face-<name>.png.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import sharp from "sharp"

/** The licence every photo here is used under. */
export const FACES_LICENSE = "Unsplash License, https://unsplash.com/license"

/** Demo person -> Unsplash photo id (https://images.unsplash.com/photo-<id>). */
export const HERO_FACES = {
  ana: "1544005313-94ddf0286df2",
  priya: "1494790108377-be9c29b29330",
  jonas: "1500648767791-00dcc994a43e",
  sam: "1531123897727-8f129e1688ce",
  lena: "1438761681033-6461ffad8d80",
  marco: "1507003211169-0a1dd7228f2d",
  elif: "1580489944761-15a19d654956",
  tom: "1599566150163-29194dcaad36",
  mia: "1534528741775-53994a69daeb",
  noah: "1539571696357-5a69c17a67c6",
  nadia: "1573496359142-b8d87734a5a2",
}

export const faceSource = (id) => `https://images.unsplash.com/photo-${id}?w=256&h=256&fit=crop&crop=faces&q=82&fm=jpg`

/** Writes face-<name>.png for every person into `demo`; a photo that cannot be fetched is left out (the avatar then shows initials). */
export async function writeFaces(demo, cacheDir) {
  mkdirSync(cacheDir, { recursive: true })
  let n = 0
  for (const [name, id] of Object.entries(HERO_FACES)) {
    const cached = join(cacheDir, `${id}.jpg`)
    if (!existsSync(cached)) {
      try {
        writeFileSync(cached, execFileSync("curl", ["-sSfL", "--max-time", "30", faceSource(id)], { maxBuffer: 8 * 1024 * 1024 }))
      } catch {
        console.log(`  could not fetch the photo for ${name} (${id})`)
        continue
      }
    }
    await sharp(readFileSync(cached)).resize(256, 256, { fit: "cover", position: "attention" }).png().toFile(join(demo, `face-${name}.png`))
    n++
  }
  return n
}
