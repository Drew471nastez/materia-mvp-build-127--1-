/**
 * ===========================================================================
 *  ONE LOGO, ONE COMPONENT, 7PX CORNERS AND ALMOST NO SHADOW, EVERYWHERE
 * ===========================================================================
 * The owner: "Replace every Storelib logo with this new one. Make sure it's
 * live, public to Google, optimized to load fast, clean everywhere.
 * Everywhere it appears it must sit in a 7px border radius (no sharp
 * corners) with extremely little depth, just a tiny, almost unnoticeable
 * shadow. Update it fully across all of Storelib, every place."
 *
 * So this pins three things:
 *
 *   ONE FILE SET   lib/brand/logo.ts names the pictures, versioned by name so
 *                  no cache anywhere can keep showing the old one.
 *   ONE COMPONENT  components/brand/storelib-logo.tsx is the only thing on a
 *                  page that draws the logo, and it owns the 7px corner and
 *                  the faint shadow. Any other file that reaches for the
 *                  picture is named here, so the place that gets missed is
 *                  found before somebody screenshots it.
 *   THE OUTSIDE    emails, Google's Organization logo, the share card and the
 *                  invoice read absolute storelib.com addresses of the same
 *                  files, and the email one is a PNG because Outlook has no
 *                  webp.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs"
import { join } from "node:path"
import {
  STORELIB_LOGO,
  STORELIB_LOGO_PNG,
  STORELIB_EMAIL_LOGO,
  STORELIB_OG_IMAGE,
  STORELIB_LOGO_RADIUS,
  STORELIB_LOGO_SHADOW,
  storelibLogoRadius,
  storelibLogoUrl,
  storelibAssetUrl,
} from "@/lib/brand/logo"
import { PLATFORM_DISALLOW } from "@/lib/seo/indexing"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  const d = detail === undefined ? "" : ` (${typeof detail === "string" ? detail : JSON.stringify(detail)})`
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label + d)
    console.log(`  FAIL  ${label}${d}`)
  }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const bytes = (p: string) => statSync(join(root, p)).size

const SKIP = new Set(["node_modules", ".next", ".git", "dist", "build", "out", "android", "ios"])
function walk(dir: string, re: RegExp): string[] {
  let out: string[] = []
  let entries: string[]
  try { entries = readdirSync(join(root, dir)) } catch { return out }
  for (const name of entries) {
    if (SKIP.has(name) || name.startsWith(".")) continue
    const p = `${dir}/${name}`
    let s
    try { s = statSync(join(root, p)) } catch { continue }
    if (s.isDirectory()) out = out.concat(walk(p, re))
    else if (re.test(p)) out.push(p)
  }
  return out
}

/* The pixel size a PNG or a lossy WebP says it is, from its own header. */
function pngSize(p: string): { w: number; h: number; alpha: boolean } {
  const b = readFileSync(join(root, p))
  const colorType = b[25]
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), alpha: colorType === 4 || colorType === 6 || (colorType === 3 && b.includes(Buffer.from("tRNS"))) }
}
function webpSize(p: string): { w: number; h: number } {
  const b = readFileSync(join(root, p))
  if (b.toString("ascii", 12, 16) !== "VP8 ") return { w: 0, h: 0 }
  return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff }
}

function main() {
  console.log("\nThe Storelib logo")

  /* ---------------------------------------------------------------------
     THE FILES
     --------------------------------------------------------------------- */
  console.log("\n  the files, versioned by name")
  check("the page logo is a versioned webp", STORELIB_LOGO === "/images/brand/storelib-logo-v2.webp")
  check("with a PNG of the same square beside it", STORELIB_LOGO_PNG === "/images/brand/storelib-logo-v2.png")
  check("an email PNG", STORELIB_EMAIL_LOGO === "/images/brand/storelib-logo-email-v2.png")
  check("and a share card", STORELIB_OG_IMAGE === "/images/brand/storelib-og-v2.jpg")
  /*
    WHY THE NAME CHANGED: next/image keeps a resized copy for a year, keyed on
    the path, and /images/* is served immutable. A new picture at an old path
    would be the old logo for a year.
  */
  const nextConfig = read("next.config.mjs")
  check("the optimizer's long cache is still what makes the version name necessary", /minimumCacheTTL:\s*31536000/.test(nextConfig))
  check("and /images/* is served immutable, which a versioned file wants", /source: '\/images\/:path\*'[\s\S]{0,120}immutable/.test(nextConfig))

  const budgets: [string, number][] = [
    ["public" + STORELIB_LOGO, 20_000],
    ["public" + STORELIB_LOGO_PNG, 60_000],
    ["public" + STORELIB_EMAIL_LOGO, 8_000],
    ["public" + STORELIB_OG_IMAGE, 60_000],
    ["public/storelib-logo.webp", 20_000],
    ["app/icon.png", 20_000],
    ["app/apple-icon.png", 20_000],
    ["public/icon-light-32x32.png", 4_000],
    ["public/icon-dark-32x32.png", 4_000],
    ["android/app/src/main/assets/welcome/storelib-logo.webp", 8_000],
  ]
  for (const [p, budget] of budgets) {
    const there = existsSync(join(root, p))
    check(`${p} exists`, there)
    if (there) check(`  and is under ${(budget / 1000).toFixed(0)}KB`, bytes(p) <= budget, `${bytes(p)} bytes`)
  }
  const page = webpSize("public" + STORELIB_LOGO)
  check("the page logo is 512 square: three times the largest it is drawn (80px) at 2x, and no more", page.w === 512 && page.h === 512, page)
  check(
    "the old path holds the same new picture, so a link to it from outside shows the new logo",
    readFileSync(join(root, "public/storelib-logo.webp")).equals(readFileSync(join(root, "public" + STORELIB_LOGO))),
  )
  const email = pngSize("public" + STORELIB_EMAIL_LOGO)
  check("the email logo is 96 square (32px at 3x) with see-through corners cut in", email.w === 96 && email.h === 96 && email.alpha, email)
  const png = pngSize("public" + STORELIB_LOGO_PNG)
  check("Google's logo is at least 112px, as it asks", png.w >= 112 && png.h >= 112 && png.w === png.h, png)
  const icon = pngSize("app/icon.png")
  check("the favicon is a multiple of 48px, as Google asks, with rounded see-through corners", icon.w % 48 === 0 && icon.w === icon.h && icon.alpha, icon)
  check(
    "public/apple-icon.png is gone: app/apple-icon.png serves that path now, and Next refuses both",
    !existsSync(join(root, "public/apple-icon.png")),
  )

  /* ---------------------------------------------------------------------
     THE CORNER AND THE SHADOW
     --------------------------------------------------------------------- */
  console.log("\n  7px corners and almost no shadow")
  check("the radius is 7px", STORELIB_LOGO_RADIUS === 7)
  const sizes = [18, 24, 27, 28, 31, 32, 34, 37, 38, 40, 42, 44, 46, 56, 68, 80]
  check("7px at every size it is drawn from 18px up", sizes.every((s) => storelibLogoRadius(s) === 7), sizes.map((s) => storelibLogoRadius(s)))
  /* Under 18px, 7px is most of the way to a circle, and "no sharp corners" does not mean round. */
  const small = [12, 15, 16].map((s) => [s, storelibLogoRadius(s)])
  check("under 18px it keeps the logo's shape instead of turning into a circle", small.every(([s, r]) => r > 0 && r / s < 0.3), small)
  const alphas = (STORELIB_LOGO_SHADOW.match(/rgba\([^)]*,\s*([\d.]+)\)/g) ?? []).map((m) => Number(m.match(/([\d.]+)\)$/)?.[1]))
  const lengths = (STORELIB_LOGO_SHADOW.match(/[\d.]+px/g) ?? []).map((m) => parseFloat(m))
  check(
    "the shadow is almost invisible: nothing darker than 6%, nothing longer than 1.5px",
    alphas.length === 2 && alphas.every((a) => a > 0 && a <= 0.06) && lengths.every((l) => l <= 1.5),
    { alphas, lengths },
  )

  /* ---------------------------------------------------------------------
     ONE COMPONENT
     --------------------------------------------------------------------- */
  console.log("\n  one component draws it")
  const COMPONENT = "components/brand/storelib-logo.tsx"
  const component = read(COMPONENT)
  check("it exists and draws the page logo", /export function StorelibLogo/.test(component) && /src=\{STORELIB_LOGO\}/.test(component))
  check(
    "with its size as its intrinsic width and height, so nothing moves when the file arrives",
    /width=\{size\}/.test(component) && /height=\{size\}/.test(component),
  )
  check(
    "and the corner and the shadow come from lib/brand/logo.ts, not from each caller",
    /borderRadius: `var\(--storelib-logo-radius, \$\{storelibLogoRadius\(size\)\}px\)`/.test(component) && /boxShadow: STORELIB_LOGO_SHADOW/.test(component),
  )
  check("through next/image, so a 32px logo downloads as a small resized copy", /import Image from "next\/image"/.test(component))
  check("and it can be drawn on the server or the client", !/^\s*["']use client["']/m.test(component))

  const code = walk("app", /\.(ts|tsx)$/).concat(walk("components", /\.(ts|tsx)$/), walk("lib", /\.(ts|tsx)$/))

  /*
    NOBODY ELSE DRAWS THE PICTURE. The files allowed to name it are the ones
    that are not a page: the email templates, a print window's HTML, the
    unsubscribe page's HTML, the favicon's canvas crop, the invoice PDF, and
    Google's and the share card's metadata. Everything else goes through the
    component.
  */
  const NAMES_ASSET = /\bSTORELIB_LOGO\b|\bSTORELIB_LOGO_PNG\b|\bSTORELIB_EMAIL_LOGO\b|storelib-logo[\w-]*\.(webp|png)|storelibLogoUrl\(/
  const ALLOWED = new Set([
    "lib/brand/logo.ts",
    COMPONENT,
    /* Every email draws the logo through the one shared layout. */
    "lib/emails/layout.ts",
    "lib/unsubscribe-card.ts",
    "app/app/products/products-client.tsx",
    "components/store-builder/dynamic-favicon.tsx",
    "app/api/invoice/route.ts",
    "app/(marketing)/page.tsx",
    "app/(marketing)/blog/[slug]/page.tsx",
  ])
  const reaching = code.filter((f) => !ALLOWED.has(f) && NAMES_ASSET.test(read(f)))
  check("no other file names the logo's picture", reaching.length === 0, reaching.join(", "))

  const otherDefinitions = code.filter((f) => f !== COMPONENT && /(const|function) StorelibLogo\b/.test(read(f)))
  check("and no file keeps a logo component of its own", otherDefinitions.length === 0, otherDefinitions.join(", "))

  /* THE OLD LOGO, in every form it used to be drawn: none of it is left. */
  const OLD = [
    ["the old email PNG in storage", /storelilgoo\.png/],
    ["the old SVG in storage", /logostorelib\.svg/],
    ["the old share card in storage", /platform%20images\/89\.jpg/],
    ["the old storage literal", /Untitled%20\(512%20x%20512%20px\)/],
    ["the old SVG file in public", /["']\/storelib-mark\.svg["']/],
    ["the old inline SVG component", /\bStorelibMark\b/],
    ["the old inline artwork", /viewBox="0 0 200 200"[\s\S]{0,200}fill="#8B56FA"/],
    ["an apple-icon path used as the logo", /["']\/apple-icon\.png["']/],
  ] as const
  for (const [what, re] of OLD) {
    const left = code.filter((f) => re.test(read(f)))
    check(`${what} is gone`, left.length === 0, left.join(", "))
  }

  /*
    THE PLACES IT APPEARS, checked by name so a rename cannot quietly drop
    one. Each draws it through the component.
  */
  console.log("\n  every place it appears draws it through the component")
  const PLACES: [string, string][] = [
    ["the site header (Explore, product and marketing pages)", "components/platform/platform-header-client.tsx"],
    ["the marketing footer", "components/marketing/footer.tsx"],
    ["the homepage tool comparison", "components/marketing/tool-stack-section.tsx"],
    ["the homepage closing banner", "components/marketing/cta-section.tsx"],
    ["the /app top bar", "components/app/sidebar.tsx"],
    ["the /app top bar while switching business", "components/app/shell-header-still.tsx"],
    ["the Library sidebar", "components/dashboard/sidebar.tsx"],
    ["sign in, sign up, password reset, verify", "components/auth/auth-logo.tsx"],
    ["the welcome screen", "app/(auth)/welcome/page.tsx"],
    /* Changed on purpose: the "choose how to use Storelib" screen after sign up is gone; a new account is a buyer (lib/account/seller-access.ts). */
    ["the welcome modal", "components/app/welcome-modal.tsx"],
    ["creator onboarding's setup step", "components/app/creator-onboarding-modal.tsx"],
    ["OnePage onboarding", "components/onepage/onboarding-modal.tsx"],
    ["the Home store guide card", "components/app/home/home-cards.tsx"],
    ["the upgrade page", "components/app/billing/upgrade-page-client.tsx"],
    ["the plan checkout", "components/app/billing/checkout-modal.tsx"],
    ["the offline screen", "components/app/offline-guard.tsx"],
    ["Powered by Storelib on product and creator pages", "components/storefront/seller-footer.tsx"],
    ["the Create your own page card on a OnePage", "components/onepage/public-onepage.tsx"],
    ["the public wishlist", "components/wishlist/public-wishlist-shell.tsx"],
    ["the website editor's Ask AI buttons", "app/website-builder/editor/[installId]/page.tsx"],
    ["the code editor's Solve with AI", "app/website-builder/code/[installId]/page.tsx"],
    ["the theme assistant", "components/website-builder/theme-chat.tsx"],
    ["the site editor header", "components/sites/editor/editor-shell.tsx"],
    ["the site editor's Storelib AI pane", "components/sites/editor/chat-pane.tsx"],
  ]
  for (const [label, file] of PLACES) {
    const src = read(file)
    check(label, /<StorelibLogo\b/.test(src) && /from "@\/components\/brand\/storelib-logo"/.test(src), file)
  }
  /* No draw of it slips back to a hand-made corner: only the component sets one. */
  const handRounded = PLACES.map(([, f]) => f).filter((f) => /<StorelibLogo[^>]*rounded-/.test(read(f)))
  check("and none of them rounds it by hand", handRounded.length === 0, handRounded.join(", "))

  /* ---------------------------------------------------------------------
     OUTSIDE THE PAGE: EMAILS, GOOGLE, THE SHARE CARD, THE INVOICE
     --------------------------------------------------------------------- */
  console.log("\n  outside the page, absolute storelib.com addresses")
  check("the absolute form is always the live host", storelibAssetUrl(STORELIB_EMAIL_LOGO) === "https://storelib.com/images/brand/storelib-logo-email-v2.png")
  check("and Google's logo is the PNG on it", storelibLogoUrl() === "https://storelib.com/images/brand/storelib-logo-v2.png")

  for (const file of ["lib/emails/layout.ts"]) {
    const src = read(file)
    const tags = src.match(/<img[^>]*(storelibAssetUrl\(STORELIB_EMAIL_LOGO\)|EMAIL_LOGO_URL)[^>]*>/g) ?? []
    check(`${file}: the email logo is the PNG from storelib.com`, tags.length > 0 && /storelibAssetUrl\(STORELIB_EMAIL_LOGO\)/.test(src), tags.length)
    check(
      "  with its width and height, 7px corners and the same faint shadow",
      tags.every((t) => /width="\d+" height="\d+"/.test(t) && /border-radius:7px;/.test(t) && /box-shadow:\$\{STORELIB_LOGO_SHADOW\};/.test(t)),
      tags,
    )
  }
  check(
    "a dark mode rule no longer paints white behind the email logo's cut corners",
    !/\.sn-logo\{background-color:#ffffff/.test(read("lib/notify/templates/layout.ts")),
  )

  const home = read("app/(marketing)/page.tsx")
  check("the Organization JSON-LD names the logo by its absolute address", /"@type": "Organization"[\s\S]{0,200}"logo": storelibLogoUrl\(\)/.test(home))
  check(
    "a blog post's publisher logo is the logo too, not a favicon.ico that does not exist",
    /publisher: \{ "@type": "Organization"[^}]*logo: \{ "@type": "ImageObject", url: storelibLogoUrl\(\)/.test(read("app/(marketing)/blog/[slug]/page.tsx")),
  )
  const blocked = PLATFORM_DISALLOW.filter((rule) => {
    const path = STORELIB_LOGO_PNG
    return rule.endsWith("$") ? path === rule.slice(0, -1) : path.startsWith(rule)
  })
  check("robots.txt lets Google fetch it", blocked.length === 0, blocked)

  for (const file of ["app/layout.tsx", "app/(auth)/layout.tsx", "app/(marketing)/explore/page.tsx", "app/(marketing)/explore/[category]/page.tsx"]) {
    check(`${file}: the share card is the new one`, (read(file).match(/storelibAssetUrl\(STORELIB_OG_IMAGE\)/g) ?? []).length === 2)
  }

  const invoice = read("app/api/invoice/route.ts")
  check(
    "the invoice draws the PNG with its corner clipped to the same 7px (5.25pt at 24pt)",
    /LOGO_PATH = STORELIB_LOGO_PNG/.test(invoice) && /roundedRect\(L, 47, 24, 24, 5\.25\)\.clip\(\)/.test(invoice),
  )
  check(
    "the unsubscribe page shows the new logo with the same corner and shadow",
    /<img class="mark" src="\$\{STORELIB_LOGO\}"/.test(read("lib/unsubscribe-card.ts")) &&
      /\.mark \{ border-radius: 7px; box-shadow: \$\{STORELIB_LOGO_SHADOW\}/.test(read("lib/unsubscribe-card.ts")),
  )
  check(
    "a push notification wears the new logo, with its corners cut in",
    /icon: "\/images\/brand\/storelib-logo-email-v2\.png"/.test(read("public/storelib-push-sw.js")),
  )
  const print = read("app/app/products/products-client.tsx")
  check(
    "the printed products report rounds its two logos at 7px",
    /\.logo img \{ width: 32px; height: 32px; border-radius: 7px; box-shadow: \$\{STORELIB_LOGO_SHADOW\}/.test(print) &&
      /\.footer img \{ width: 20px; height: 20px; border-radius: 7px;/.test(print),
  )

  /* ---------------------------------------------------------------------
     THE ANDROID WELCOME SCREEN
     --------------------------------------------------------------------- */
  console.log("\n  the Android welcome screen")
  const welcome = read("android/app/src/main/assets/welcome/index.html")
  const logoTag = welcome.match(/<img[^>]*class="logo-icon"[^>]*>/)?.[0] ?? ""
  check("the logo's own tag exists", logoTag.length > 0)
  check("it is not a metered Supabase resize", !/render\/image/.test(logoTag), logoTag.slice(0, 120))
  check("it loads the logo from its own asset folder, so it works with no network", /src="storelib-logo\.webp"/.test(welcome))
  check("with the 7px corner and the faint shadow", /\.logo-icon\{[^}]*border-radius:7px;box-shadow:0 0 0 \.5px rgba\(15,23,42,\.06\)/.test(welcome))
  const collageTransforms = (welcome.match(/render\/image/g) ?? []).length
  if (collageTransforms > 0) {
    console.log(`        note: ${collageTransforms} /render/image/ reference(s) remain in this file for the marketing collage, pre-existing, not the logo`)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
