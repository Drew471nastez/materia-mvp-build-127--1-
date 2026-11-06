import React from "react"
import { renderToString } from "react-dom/server"
import { AppAvatar } from "../components/app/app-avatar"
import { buttonHover } from "../lib/onepage/button-style"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { creatorPhoto } from "../lib/account/identity"
import { profileAvatar } from "../lib/account/avatar"
import { avatarRetryUrl, originalAvatarUrl } from "../lib/account/avatar-image"
import { optimizedImageUrl } from "../lib/images/optimized-url"
import { publicOnePage, publicOnePageFromDraft } from "../lib/onepage/public-shape"
import { saveAccountPhoto, SaveError } from "../lib/onepage/photo-save"

async function main() {
  const old = "https://storelib.com/media/avatars/owner/old.png"
  const next = "https://storelib.com/media/avatars/owner/new.png"
  const row = { id: "page", avatar_url: old, published_profile: { avatar_url: old } }
  assert.equal(creatorPhoto({ live: null, own: old, published: old }), null)
  assert.equal(creatorPhoto({ own: old }), old)
  assert.equal(creatorPhoto({ live: next, own: old, published: old }), next)
  assert.equal(publicOnePage(row, { source: "published", liveAvatarUrl: null }).avatar_url, null)
  assert.equal(publicOnePageFromDraft(row, { liveAvatarUrl: null }).avatar_url, null)
  assert.equal(publicOnePage(row, { source: "published" }).avatar_url, old)
  assert.equal(profileAvatar("   "), null)

  const ssr = renderToString(React.createElement(AppAvatar, { src: next, name: "Owner", size: 64, kind: "mark", waitForPhoto: true }))
  assert.ok(ssr.includes("opacity:1"), "Server HTML must show the image without waiting for hydration")
  assert.ok(!ssr.includes("&url=%2F_next%2Fimage"), "Server avatar must not nest optimizer URLs")
  assert.equal(buttonHover({ button_hover_animation: "pop" }, true), "fill")
  assert.equal(buttonHover({ button_hover_animation: "fill" }, true), "fill")
  assert.equal(buttonHover({ button_hover_animation: "lift" }, true), "none")
  const optimized = optimizedImageUrl(next, 160)
  assert.equal(originalAvatarUrl(optimized), next)
  assert.equal(originalAvatarUrl("https://other.example/_next/image?url=%2Fportrait.png&w=128"), "https://other.example/_next/image?url=%2Fportrait.png&w=128")
  assert.notEqual(avatarRetryUrl(next, 1, 5000), next)
  assert.equal(new URL(avatarRetryUrl(next, 1, 5000)).pathname, new URL(next).pathname)
  const signed = "https://project.supabase.co/storage/v1/object/sign/avatars/owner/a.png?token=signature"
  assert.equal(avatarRetryUrl(signed, 1), signed)
  assert.equal(avatarRetryUrl("https://external.example/avatar.png?signature=x", 1), "https://external.example/avatar.png?signature=x")
  assert.equal(originalAvatarUrl(optimizedImageUrl(optimized, 64)), next)
  assert.equal(new URL(optimizedImageUrl(originalAvatarUrl(optimized), 64), "https://storelib.com").searchParams.get("url"), next)

  await assert.rejects(saveAccountPhoto(null, async () => ({ ok: false, status: 503, json: async () => ({ error: "Not saved" }) })), e => e instanceof SaveError && e.status === 503)
  const calls: Array<string | null> = []
  let finish!: () => void
  const first = saveAccountPhoto(next, async (_url, init) => {
    calls.push(JSON.parse(init!.body as string).url)
    await new Promise<void>(r => { finish = r })
    return { ok: true, status: 200, json: async () => ({}) }
  })
  const second = saveAccountPhoto(null, async (_url, init) => {
    calls.push(JSON.parse(init!.body as string).url)
    return { ok: true, status: 200, json: async () => ({}) }
  })
  await new Promise(r => setTimeout(r, 0))
  assert.deepEqual(calls, [next], "A removal cannot race an earlier replacement")
  finish()
  await Promise.all([first, second])
  assert.deepEqual(calls, [next, null])
  execFileSync(process.execPath, ["scripts/check-onepage-avatar-routes.mjs"], { stdio: "inherit" })
  console.log("OnePage avatar source, removal, URL normalization, failure and write ordering passed")
}
void main().catch(e => { console.error(e); process.exitCode = 1 })
