/**
 * ===========================================================================
 *  EVERY SAVED BUTTON STILL DRAWS EXACTLY AS IT DID
 * ===========================================================================
 * The link button grew a Shape, a Size, Soft fill, text and icon placement
 * and a hover of its own. lib/onepage/button-style.ts now draws every button
 * on the page, the preview and the Design tab's samples. Nothing saved was
 * rewritten to get there: the old values are read as they are.
 *
 * This suite keeps the OLD drawing code (copied from
 * components/onepage/public-onepage.tsx before the change) and checks the new
 * one against it for every theme in the catalogue and for every combination
 * of saved style, corners, border and shadow. Then: the defaults a page
 * without the new fields gets, the hover system (pointer devices only, real
 * property names, no violet), and that the page uses all of it.
 *
 * The hover states and every style at 390 and 1440:
 *   scripts/check-onepage-buttons.mjs
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import type React from "react"
import {
  BUTTON_ICON_CLASS,
  BUTTON_ICON_INSET,
  BUTTON_SIZE_CLASS,
  buttonAlign,
  buttonHover,
  buttonIconSide,
  buttonShape,
  buttonSize,
  cardButtonTheme,
  cardRadius,
  themeButtonStripFill,
  themeButtonStyle,
} from "@/lib/onepage/button-style"
import { stripComments } from "./_source"
import { contrastRatio } from "@/lib/onepage/theme-apply"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}

/* ─── The old code, as it was ─────────────────────────────────────────── */
function oldButtonStyles(theme: any): React.CSSProperties {
  const buttonShadow = theme.button_shadow || "none"
  const shadowColor = theme.button_shadow_color || "#000000"
  const hexToRgba = (hex: string, alpha: number) => {
    const r = Number.parseInt(hex.slice(1, 3), 16)
    const g = Number.parseInt(hex.slice(3, 5), 16)
    const b = Number.parseInt(hex.slice(5, 7), 16)
    return `rgba(${r},${g},${b},${alpha})`
  }
  const shadowStyles: Record<string, string> = {
    none: "none",
    subtle: `0 2px 4px ${hexToRgba(shadowColor, 0.15)}`,
    strong: `0 4px 12px ${hexToRgba(shadowColor, 0.3)}`,
    hard: `4px 4px 0px ${hexToRgba(shadowColor, 0.9)}`,
  }
  return {
    backgroundColor:
      theme.button_style === "outline"
        ? "transparent"
        : theme.button_style === "glass"
          ? "rgba(255, 255, 255, 0.15)"
          : theme.button_color,
    color: theme.button_text_color,
    borderRadius: `${theme.button_border_radius}px`,
    borderWidth: `${theme.button_style === "outline" ? Math.max(2, theme.button_border_width || 0) : (theme.button_border_width || 0)}px`,
    borderStyle: "solid",
    borderColor: theme.button_style === "outline" ? (theme.button_border_color || theme.button_color) : theme.button_border_color,
    backdropFilter: theme.button_style === "glass" ? "blur(10px)" : undefined,
    boxShadow: shadowStyles[buttonShadow] || "none",
  }
}
const OLD_SIZE = "py-[19.5px] sm:py-[21.5px] px-5 sm:px-6 text-[13px] sm:text-[15px]"
const OLD_ICON = "w-[32px] h-[32px] sm:w-[36px] sm:h-[36px]"

const same = (a: React.CSSProperties, b: React.CSSProperties) => JSON.stringify(a) === JSON.stringify(b)

/* ─── Every theme in the catalogue ────────────────────────────────────── */
console.log("\nEvery theme's button draws as it did")
const design = readFileSync("components/onepage/tabs/design-tab.tsx", "utf8")
const configs = [...design.matchAll(/\n  \{\n    id: "([a-z0-9-]+)",[\s\S]*?theme_config: \{([\s\S]*?)\n    \},/g)].map((m) => {
  const body = m[2].replace(/ as const/g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")
  let theme: Record<string, unknown> = {}
  try {
    theme = new Function(`return {${body}}`)()
  } catch {
    theme = {}
  }
  return { id: m[1], theme }
})
check(`the theme catalogue was read (${configs.length} themes)`, configs.length >= 15 && configs.every((c) => "button_style" in c.theme))
for (const { id, theme } of configs) {
  const old = oldButtonStyles(theme)
  /* Changed on purpose (round 41): a bordered button now stops its fill inside its border (backgroundClip, lib/onepage/button-style), so the rounded edge is the border's alone. Everything else is the same button as before. */
  const { backgroundClip, ...now } = themeButtonStyle(theme as any) as Record<string, unknown>
  check(`${id}: the same button`, same(old, now as any), `${JSON.stringify(old)} vs ${JSON.stringify(now)}`)
  check(`${id}: the fill stops inside a border, and only then`, (backgroundClip === "padding-box") === (parseFloat(String(now.borderWidth)) > 0))
  check(`${id}: the same size, alignment and icon place`, buttonSize(theme as any) === "regular" && buttonAlign(theme as any) === "center" && buttonIconSide(theme as any) === "left")
}

/* ─── Every saved combination ─────────────────────────────────────────── */
console.log("\nEvery saved combination draws as it did")
let combos = 0
let mismatches: string[] = []
for (const style of ["filled", "outline", "glass", undefined, "something-old"]) {
  for (const radius of [0, 4, 8, 14, 24, 999, undefined]) {
    for (const width of [0, 1, 2, 4, undefined]) {
      for (const shadow of ["none", "subtle", "strong", "hard", undefined, "glow"]) {
        for (const shadowColor of ["#000000", "#7a2e1b", undefined]) {
          for (const borderColor of ["#e5e7eb", "", undefined]) {
            const theme = {
              button_style: style,
              button_color: "#1a1a2e",
              button_text_color: "#ffffff",
              button_border_radius: radius,
              button_border_width: width,
              button_border_color: borderColor,
              button_shadow: shadow,
              button_shadow_color: shadowColor,
            }
            combos++
            /* Changed on purpose (round 41): backgroundClip is new (the fill stops inside a border); everything else matches the old drawing. */
            const { backgroundClip: _clip, ...drawn } = themeButtonStyle(theme as any) as Record<string, unknown>
            if (!same(oldButtonStyles(theme), drawn as any)) mismatches.push(JSON.stringify(theme))
          }
        }
      }
    }
  }
}
check(`${combos} combinations of style, corners, border and shadow match the old drawing`, mismatches.length === 0, mismatches.slice(0, 3).join(" | "))
check("a rgba() button colour (glass themes) is passed through untouched", themeButtonStyle({ button_style: "filled", button_color: "rgba(255, 255, 255, 0.55)" }).backgroundColor === "rgba(255, 255, 255, 0.55)")

/* ─── What a page without the new fields gets ─────────────────────────── */
console.log("\nA page saved before keeps its size, layout and hover")
check("no size is Regular, and Regular is the old padding and type", buttonSize({}) === "regular" && BUTTON_SIZE_CLASS.regular === OLD_SIZE)
check("Regular's icon is the old 32/36px at 20px in", BUTTON_ICON_CLASS.regular === OLD_ICON && BUTTON_ICON_INSET.regular.left === "left-[20px]")
check("no alignment is centred, no icon side is left", buttonAlign({}) === "center" && buttonIconSide({}) === "left")
check('hover "default" and none saved are Lift', buttonHover({}) === "lift" && buttonHover({ button_hover_animation: "default" }) === "lift" && buttonHover({ button_hover_animation: null }) === "lift")
check("Fade and Zoom (Midnight) are kept", buttonHover({ button_hover_animation: "fade" }) === "fade" && buttonHover({ button_hover_animation: "zoom" }) === "zoom")
check("the new hovers are read", ["none", "glow", "fill", "underline"].every((h) => buttonHover({ button_hover_animation: h }) === h))
check("shape: 0 Square, 2 to 99 Rounded, 999 Pill, missing Rounded (8px)", buttonShape(0) === "square" && buttonShape(2) === "rounded" && buttonShape(24) === "rounded" && buttonShape(999) === "pill" && buttonShape(undefined) === "rounded")
check("Soft is a 14% tint of the button colour", themeButtonStyle({ button_style: "soft", button_color: "#2f6f4f" }).backgroundColor === "color-mix(in srgb, #2f6f4f 14%, transparent)")
check("a strip inside a button is filled only on Solid", themeButtonStripFill({ button_style: "filled", button_color: "#111" }) === "#111" && themeButtonStripFill({ button_style: "soft", button_color: "#111" }) === "transparent")

/* ─── The hover system ────────────────────────────────────────────────── */
console.log("\nButtons, cards and media each hover their own way")
const css = readFileSync("app/globals.css", "utf8")
const opBlock = css.slice(css.indexOf("OnePage hover: buttons, cards and media"), css.indexOf("/* Button shine animation")).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[\s\S]*?\*\//, "")
check("the hover rules exist", opBlock.length > 500)
const media = /@media \(hover: hover\) and \(pointer: fine\) \{([\s\S]*?)\n\}/.exec(opBlock)
check("every :hover rule sits inside (hover: hover) and (pointer: fine)", !!media && !opBlock.replace(media![0], "").replace(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/, "").includes(":hover"))
check("a button names translate and scale in its transition", /\.op-btn \{[^}]*transition-property: translate, scale, opacity/.test(opBlock))
check("a button lifts with translate and grows with scale (not transform)", /translate: 0 -2px/.test(opBlock) && /scale: 1\.03/.test(opBlock) && !/transform: (translate|scale)/.test(opBlock))
check("the shadow, glow, tint and fill layers fade with opacity only", (opBlock.match(/transition-property: opacity;/g) || []).length >= 3)
check("a card answers with a ring and no movement", /\.op-card:hover::after \{ opacity: 1; \}/.test(opBlock) && !/\.op-card:hover \{[^}]*(translate|scale)/.test(opBlock))
check("media inside a card zooms slowly with scale", /\.op-card:hover \.op-media \{ scale: 1\.03; \}/.test(opBlock) && /\.op-media \{[^}]*transition-property: scale/.test(opBlock))
check("reduced motion keeps buttons still", /prefers-reduced-motion: reduce/.test(opBlock))
check("the Glow animation is not violet any more", !/147,\s*51,\s*234/.test(css.slice(css.indexOf("@keyframes onepage-glow"), css.indexOf("@keyframes onepage-swipe"))))

/* ─── The page and the editor use it ──────────────────────────────────── */
console.log("\nThe page, the preview and the Design tab draw from one place")
const page = stripComments(readFileSync("components/onepage/public-onepage.tsx", "utf8"))
const link = page.slice(page.indexOf('case "link_button": {'), page.indexOf('case "text": {'))
check("the link button is drawn by themeButtonStyle", /themeButtonStyle\(theme\)/.test(link) && !/shadowStyles/.test(link))
check("the link button carries its hover, shadow and alignment", /"data-hover": buttonHover\(theme, isInsideCarousel \|\| isInsideGroup\)/.test(link) && /\{\.\.\.buttonHoverAttrs\}/.test(link))
check("every default-layout button is an .op-btn with the page's size", (link.match(/"op-btn /g) || []).length === 3 && (link.match(/BUTTON_SIZE_CLASS\[size\]/g) || []).length === 3)
check("a featured (Pro) link hovers as a card, its picture as media", (link.match(/"op-card /g) || []).length === 3 && /"op-media"/.test(link))
check("no link button transitions everything", !/transition-all/.test(link))
check("a featured card on a Pill page is a rounded card (28px), not an oval", /const cardRadius = buttonShape\(theme\.button_border_radius\) === "pill" \? 28 : theme\.button_border_radius/.test(link) && (link.match(/borderRadius: `\$\{cardRadius\}px`/g) || []).length === 4)
check("the PDF, menu, booking and email buttons take the same fill (Soft included)", (page.match(/backgroundColor: buttonBackground\(theme\)/g) || []).length >= 4)
// The preview is the same component: components/onepage/preview-document.tsx renders PublicOnePage.
const preview = readFileSync("components/onepage/preview-document.tsx", "utf8")
check("the preview renders the live page's own component", /public-onepage/.test(preview))
const tab = stripComments(readFileSync("components/onepage/tabs/design-tab.tsx", "utf8"))
const buttons = tab.slice(tab.indexOf("function ButtonsSection()"), tab.indexOf("function SocialsSection()"))
check("the Design tab's samples are drawn by the page's own code", /themeButtonStyle\(t\)/.test(buttons) && /buttonHoverVars\(t\)/.test(buttons))
for (const title of ["Style", "Shape", "Size", "Text and icon", "Shadow", "Border", "Colours", "On hover"]) {
  check(`the Buttons panel has a ${title} group`, buttons.includes(`title={tt("${title}")}`))
}
check("Solid, Soft, Outline and Glass are offered", ["filled", "soft", "outline", "glass"].every((s) => buttons.includes(`"${s}"`)))
check("Square, Rounded and Pill are offered", /\["square", "rounded", "pill"\]/.test(buttons))
check("the hover choices run the real hover when pointed at", /className="op-demo"/.test(buttons))
check("no wall of sliders: one slider, for Rounded corners only", (buttons.match(/<RangeRow/g) || []).length === 1 && /shape === "rounded" \? \(/.test(buttons))

/* ─── The product block's buttons are the page's buttons ──────────────── */
console.log("\nA product button and a link button are the same button")
const pick = (st: React.CSSProperties) => ({ bg: st.backgroundColor, border: `${st.borderWidth} ${st.borderStyle} ${st.borderColor}`, radius: st.borderRadius, shadow: st.boxShadow, blur: st.backdropFilter })
let pairs = 0
const off: string[] = []
for (const style of ["filled", "soft", "outline", "glass"]) {
  for (const radius of [0, 12, 999]) {
    for (const width of [0, 2]) {
      for (const shadow of ["none", "subtle", "hard"]) {
        const theme = { button_style: style, button_color: "#2f6f4f", button_text_color: style === "soft" ? "#2f6f4f" : "#ffffff", background_color: "#f6f5f2", button_border_radius: radius, button_border_width: width, button_border_color: "#2f6f4f", button_shadow: shadow, button_shadow_color: "#111113" } as any
        const link = pick(themeButtonStyle(theme))
        /* The "button" layout and the price pill sit on the page: the link button exactly. */
        const productButton = pick(themeButtonStyle(theme))
        /* The button inside a card: same border, corners, shadow; same fill except on a Solid card, where it turns the pair around to be seen. */
        const surface = style === "filled" ? theme.button_color : theme.background_color
        const ctaT = cardButtonTheme(theme, { surface, cardText: "#111113" })
        const cta = pick(themeButtonStyle(ctaT))
        pairs++
        const sameShape = cta.border === link.border && cta.radius === link.radius && cta.shadow === link.shadow && cta.blur === link.blur
        const fillOk = style === "filled" ? cta.bg === theme.button_text_color && (contrastRatio(String(cta.bg), surface) ?? 0) >= 3 : cta.bg === link.bg
        const wordsOk = (contrastRatio(String(ctaT.button_text_color), style === "filled" ? String(cta.bg) : surface) ?? 3) >= 3
        if (JSON.stringify(productButton) !== JSON.stringify(link) || !sameShape || !fillOk || !wordsOk) off.push(`${style}/${radius}/${width}/${shadow}: link ${JSON.stringify(link)} cta ${JSON.stringify(cta)} words ${ctaT.button_text_color}`)
      }
    }
  }
}
check(`${pairs} page looks: the product button resolves to the link button's background, border, corners and shadow`, off.length === 0, off.slice(0, 2).join(" | "))
check("a Soft page has a soft product button", pick(themeButtonStyle(cardButtonTheme({ button_style: "soft", button_color: "#2f6f4f", button_text_color: "#2f6f4f", background_color: "#ffffff" } as any, { surface: "#ffffff", cardText: "#111113" }))).bg === "color-mix(in srgb, #2f6f4f 14%, transparent)")
check("a colour chosen for the block's button still wins, its words readable", (() => { const t = cardButtonTheme({ button_style: "outline", button_color: "#111113", button_text_color: "#111113" } as any, { surface: "#ffffff", cardText: "#111113", ownButtonColor: "#111113" }); return t.button_color === "#111113" && t.button_style === "filled" && t.button_text_color === "#ffffff" })())
check("over a picture the button is white with near-black words, in the page's shape", (() => { const t = cardButtonTheme({ button_style: "outline", button_border_radius: 999 } as any, { surface: "#000", cardText: "#fff", onPhoto: true }); return t.button_color === "#ffffff" && t.button_text_color === "#111113" && t.button_border_radius === 999 })())
check("a card stops at 28px on a Pill page; a Rounded page's card keeps its corners", cardRadius({ button_border_radius: 999 }) === 28 && cardRadius({ button_border_radius: 14 }) === 14 && cardRadius({ button_border_radius: 0 }) === 0)
const product = stripComments(readFileSync("components/onepage/product-block.tsx", "utf8"))
check("the product block keeps no button drawing of its own", !/theme\.button_style ===/.test(product) && !/shadow\[buttonShadow\]/.test(product) && /themeButtonStyle\(theme as ButtonThemeLike\)/.test(product))
check("the button layout, every card's button and the price pill play the page's hover", (product.match(/\{\.\.\.hoverAttrs\(/g) || []).length === 3 && /"op-btn flex w-full/.test(product) && /PRODUCT_CARD_HOST, cls/.test(product))
check("all eight layouts draw their button through ctaButton or the page button", (product.match(/\{ctaButton\(/g) || []).length >= 6)

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log("\nFailures:\n  " + failures.join("\n  "))
  process.exit(1)
}
