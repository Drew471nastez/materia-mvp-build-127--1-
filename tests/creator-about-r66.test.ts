/**
 * ROUND 66: THE ABOUT PAGE OF A WEBSITE BUILT FROM ADMIN (lib/admin/creator-site/tailor.ts aboutPage).
 *
 * The owner, for liam-bailey.storelib.com: "build his About page", and every built site clean. The page is
 * always built (the store menu links About), from the creator's own content only, in the Storelib Default
 * template's own sections:
 *   intro     Image-and-video-text with their picture, "About", their name as the page's h1, their bio in
 *             paragraphs and a button to the products; text-columns when there is no picture (the image section
 *             draws the theme's demo photograph without one)
 *   products  products-listing under the heading they gave their products
 *   contact   text-columns: a column per social link they have, and the contact form
 * And the theme's Image-and-video-text heading honours its HTML tag setting, so that h1 is an h1.
 *
 * Liam's content is what storelib.com/liam-bailey and liam-bailey.storelib.com showed on 2026-11-26: name
 * "liam bailey", a picture, no bio, no social links, two programmes, products heading "Gym Programmes".
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { composeTemplateFiles } from "@/lib/themes/template-packages"
import { creatorSiteContent, type CreatorRows, type CreatorSiteContent } from "@/lib/admin/creator-site/content"
import { templateSampleText } from "@/lib/admin/creator-site/samples"
import { aboutPage, socialHandle, tailorTemplate } from "@/lib/admin/creator-site/tailor"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `  ${JSON.stringify(detail).slice(0, 400)}`}`)
}

type Block = { type: string; settings: Record<string, unknown> }
type Section = { type: string; settings: Record<string, unknown>; blocks: Record<string, Block>; block_order: string[] }
type Page = { order: string[]; sections: Record<string, Section> }

const AVATAR = "https://storelib.com/media/avatars/a69ef3a8-675a-4324-a4c6-2a2b403fa95f/creator-avatar-1793802301884.png"
const LIAM: CreatorRows = {
  creator: { id: "0eda0834-0749-49d7-aa80-7186a5565ef8", display_name: "liam bailey", username: "liam-bailey", slug: "liam-bailey" },
  profile: { display_name: "liam bailey", username: "liam-bailey", avatar_url: AVATAR },
  shopConfig: { headerSettings: { bio: "", avatarUrl: AVATAR, socialLinks: { instagram: "", tiktok: { url: "", enabled: false }, youtube: "" } } },
  live: { pages: [{ page_key: "products", sections: [{ type: "product_list", settings: { heading: "Gym Programmes" } }] }] },
  menus: { "main-menu": { links: [{ title: "Home", url: "/" }, { title: "Programmes", url: "/products" }, { title: "About", url: "/about" }] } },
  products: [
    { id: "p1", title: "The Skinny To Strong Programme", slug: "the-skinny-to-strong-programme" },
    { id: "p2", title: "Gym Beginner Program", slug: "gym-beginner-program" },
  ],
}

const blocksOf = (s: Section) => s.block_order.map((id) => s.blocks[id])
const texts = (p: Page) => JSON.stringify(p)
const AI_WORDS = /unlock|elevate|seamless|powerful|effortless|supercharge|transform|journey|discover|—/i

console.log("\nLiam's About page, from what his pages show")
const liam = creatorSiteContent(LIAM, templateSampleText())
{
  const p = aboutPage(liam) as unknown as Page
  check("intro, his programmes, contact: in that order", p.order.join(",") === "intro,products,contact", p.order)
  const intro = p.sections.intro
  check("the intro is the template's Image-and-video-text with his picture", intro.type === "Image-and-video-text" && intro.settings.image === AVATAR && intro.settings.image_alt === "liam bailey")
  const ib = blocksOf(intro)
  check("About, then his name as the page's h1", ib[0].type === "eyebrow" && ib[0].settings.text === "About" && ib[1].type === "heading" && ib[1].settings.text === "liam bailey" && ib[1].settings.tag === "h1")
  check("no bio written: no paragraph is made up for him", !ib.some((b) => b.type === "subheading"), ib.map((b) => b.type))
  check("one button, to his products", ib.filter((b) => b.type === "button").length === 1 && ib.find((b) => b.type === "button")!.settings.link === "/collections/all")
  const products = p.sections.products
  check("his programmes as a grid, under the heading he gave them", products.type === "products-listing" && products.settings.items_to_show === 2 && blocksOf(products)[0]?.settings.text === "Gym Programmes")
  const contact = p.sections.contact
  const cols = blocksOf(contact).filter((b) => b.type === "column")
  check("no social links: only the contact form column", cols.length === 1 && cols[0].settings.link === "/pages/contact" && contact.settings.columns_desktop === 1, cols)
  check("every column sets its text, so the theme's sample sentence never shows", cols.every((c) => c.settings.text === ""))
  check("no AI words and no em dash in anything the page says", !AI_WORDS.test(texts(p)), texts(p).match(AI_WORDS))
}

console.log("\nwhat a creator gave, and only that")
{
  const full: CreatorSiteContent = {
    ...liam,
    bio: "I coach beginners.\nEvery programme starts at the first session.",
    socials: { instagram: "https://www.instagram.com/liam_b", youtube: "https://www.youtube.com/@liamb", linkedin: "https://www.linkedin.com/in/liam-b" },
  }
  const p = aboutPage(full) as unknown as Page
  const ib = blocksOf(p.sections.intro)
  check("a bio is his words, each paragraph its own <p>", ib.find((b) => b.type === "subheading")?.settings.text === "<p>I coach beginners.</p><p>Every programme starts at the first session.</p>")
  const cols = blocksOf(p.sections.contact).filter((b) => b.type === "column")
  check("a column per social link he has, then the contact form", cols.map((c) => c.settings.label).join(",") === "Instagram,YouTube,LinkedIn,Message", cols.map((c) => c.settings.label))
  check("each names his handle and links his address", cols[0].settings.heading === "@liam_b" && cols[0].settings.link === "https://www.instagram.com/liam_b" && cols[1].settings.heading === "@liamb" && cols[2].settings.heading === "@liam-b")
  check("four columns at most across", p.sections.contact.settings.columns_desktop === 4 && p.sections.contact.settings.show_dividers === true)
  check("a handle is read from the address or is the host", socialHandle("https://www.youtube.com/channel/UCabcdefghijklmnopqrstuvwxyz0123") === "youtube.com" && socialHandle("https://x.com/someone") === "@someone" && socialHandle("nope") === "")

  const xss = aboutPage({ ...full, name: "<img src=x onerror=1>", bio: "<script>x</script>" }) as unknown as Page
  check("a name and a bio are text, never markup", !texts(xss).includes("<script>") && !xss.order.some((k) => JSON.stringify(xss.sections[k].blocks).includes("<img src=x")))

  const noPicture = aboutPage({ ...full, avatar: null }) as unknown as Page
  check("no picture: the intro is text-columns, never an image section (it would draw the theme's demo photograph)", noPicture.sections.intro.type === "text-columns" && !("image" in noPicture.sections.intro.settings))
  check("  with his name and bio", blocksOf(noPicture.sections.intro).map((b) => b.type).join(",") === "heading,subheading" && blocksOf(noPicture.sections.intro)[0].settings.text === "liam bailey")

  const nothing = aboutPage({ ...liam, avatar: null, bio: "", products: [], socials: {}, productsHeading: "" }) as unknown as Page
  check("nothing but a name: name and contact, no empty grid", nothing.order.join(",") === "intro,contact", nothing.order)
}

console.log("\nthe built website")
{
  const files = tailorTemplate(composeTemplateFiles("materia/default"), liam)
  const about = files.get("templates/page.about.json")?.toString("utf8") ?? ""
  check("the About page is built, his and not the template's sample studio", about.includes("liam bailey") && !/We make a few good things|Sundry|Paper, card and tape|How we work/.test(about))
  check("its sections all exist in the template", ["Image-and-video-text", "products-listing", "text-columns"].every((t) => files.has(`sections/${t}.liquid`)))
  check("the contact page it links is kept", files.has("templates/page.contact.json"))
}

console.log("\nthe theme's heading tag")
{
  const snippet = readFileSync(join(process.cwd(), "theme-packages/materia/base/snippets/media-benefits-text.liquid"), "utf8")
  check("Image-and-video-text's heading draws the tag its setting names (h1 on an About page), h2 otherwise", /assign htag = 'h2'/.test(snippet) && /bs\.tag == 'h1'/.test(snippet) && /<\{\{ htag \}\} class="\{\{ p \}\}__heading mlb__heading"/.test(snippet) && /<\/\{\{ htag \}\}>/.test(snippet) && !/<h2 class="\{\{ p \}\}__heading/.test(snippet))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
