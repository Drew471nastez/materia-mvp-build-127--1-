/** Cinematic replacement: real server markup, stable phrase layout, auth and media safeguards. */
import assert from "node:assert/strict"
import { readFileSync, existsSync, statSync } from "node:fs"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { Hero } from "../components/marketing/hero"
import {
  HERO_PHRASES,
  HERO_ROTATION_MS,
  HERO_VIDEO,
} from "../lib/marketing/hero-video"
const read = (p: string) => readFileSync(p, "utf8")
const doc = renderToString(createElement(Hero))
assert.deepEqual(
  [...HERO_PHRASES],
  [
    "website.",
    "online store.",
    "link in bio.",
    "community.",
    "landing page.",
    "brand.",
    "business.",
  ],
)
assert.equal(HERO_ROTATION_MS, 2000)
assert.equal((doc.match(/<h1/g) || []).length, 1)
assert.ok(
  doc.includes("Build your website.") && doc.includes("Build your</span>"),
)
for (const phrase of HERO_PHRASES) assert.ok(doc.includes(phrase))
assert.ok(
  doc.includes('action="/signup"') &&
    doc.includes('name="intent" value="sell"'),
)
assert.ok(
  doc.includes('type="email"') &&
    doc.includes('autoComplete="email"') &&
    !doc.includes('required=""'),
)
assert.ok(doc.includes("Start for free") && doc.includes('href="/explore"'))
assert.ok(
  read("app/(storelib)/(auth)/signup/page.tsx").includes(
    'searchParams.get("email")',
  ),
)
assert.equal((doc.match(/<video/g) || []).length, 1)
assert.ok(
  /muted=""/.test(doc) && /playsInline=""/.test(doc) && /loop=""/.test(doc),
)
assert.ok(
  !/<video[^>]+src=/.test(doc),
  "SSR must not download video before preferences are known",
)
assert.ok(
  !/HeroCarousel|HERO_BACKDROP|role="search"/.test(
    read("components/marketing/hero.tsx"),
  ),
)
assert.ok(!existsSync("components/marketing/hero-carousel.tsx"))
assert.ok(
  HERO_VIDEO.src.startsWith(
    "https://skgtqglupjcnfhfscink.supabase.co/storage/",
  ),
)
assert.ok(statSync("public" + HERO_VIDEO.poster).size < 50000)
assert.ok(statSync("public/marketing/hero/cinematic-grain.png").size < 50000)
const video = read("components/marketing/hero-video.tsx")
for (const guard of [
  "prefers-reduced-motion",
  "prefers-reduced-data",
  "saveData",
  "document.hidden",
  "IntersectionObserver",
  "requestVideoFrameCallback",
  "video.play()",
  "catch",
])
  assert.ok(video.includes(guard), guard)
const headline = read("components/marketing/hero-headline.tsx")
assert.ok(
  headline.includes('aria-hidden="true"') && !headline.includes("aria-live"),
)
assert.ok(
  headline.includes("clearInterval(timer)") &&
    headline.includes("observer?.disconnect()"),
)
console.log(
  "Cinematic hero passed: server-rendered copy/signup, exact phrases, one deferred video, local fallback, shared auth, accessible motion and cleanup",
)
