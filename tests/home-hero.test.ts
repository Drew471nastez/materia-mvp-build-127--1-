/** Cinematic replacement: real server markup, stable phrase layout, auth and media safeguards. */
import assert from "node:assert/strict"
import { readFileSync, existsSync, statSync } from "node:fs"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { BuildShowcase, SHOWCASE_HEADING } from "../components/marketing/build-showcase"
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
for (const phrase of HERO_PHRASES)
  assert.ok(doc.replace(/<[^>]*>/g, "").includes(phrase))
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
  !/<video[^>]+\ssrc=/.test(doc),
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

/* The hero's own line, unchanged; the showcase heading is checked below (SHOWCASE_HEADING). */
assert.ok(doc.includes("Everything you need to create, sell,"))
assert.ok(!doc.includes("Free to start. No card required."))
assert.ok(
  read("components/marketing/hero.tsx").includes(
    "--hero-grain-opacity: .03675",
  ),
)
assert.ok(
  read("components/marketing/hero.tsx").includes(
    "min-height: 0; padding-block: 40px",
  ),
)
assert.ok(
  read("lib/marketing/hero-startup.ts").includes("navigator.connection"),
)
assert.ok(
  read("components/marketing/hero-cta.tsx").includes("subscribeAuthSnapshot"),
)
assert.ok(read("components/marketing/hero-cta.tsx").includes('"/account"'))
assert.ok(
  read("components/marketing/hero-headline.tsx").includes(
    'className="cinematic-period"',
  ),
)
assert.ok(HERO_VIDEO.src.includes("1794426925775466.mp4"))
const showcase = read("components/marketing/build-showcase.tsx")
assert.equal(SHOWCASE_HEADING, "Build your page, sell your products, reach your audience, and manage everything in one platform.")
assert.ok(
  /* Round 60: the showcase's own rail motion (lib/ui/rail-motion, tests/rail-motion.test.ts), no slider library. */
  read("components/marketing/use-showcase-motion.ts").includes("new RailMotion(") &&
    !read("components/marketing/use-showcase-motion.ts").includes("keen-slider") &&
    showcase.includes('loading="lazy"'),
)

const showcaseMarkup = renderToString(createElement(BuildShowcase))
assert.equal((showcaseMarkup.match(/data-showcase-slide=""/g) || []).length, 9)
assert.equal((showcaseMarkup.match(/data-showcase-word=""/g) || []).length, SHOWCASE_HEADING.split(/\s+/).length)
assert.ok(!showcaseMarkup.includes("<button"))
assert.ok(
  showcaseMarkup.includes('aria-label="What you can build with Storelib"'),
)

assert.ok(
  !read("app/(storelib)/(marketing)/page.tsx").includes("overflow-x-hidden"),
)
assert.ok(read("components/marketing/hero.tsx").includes("overflow: clip"))
