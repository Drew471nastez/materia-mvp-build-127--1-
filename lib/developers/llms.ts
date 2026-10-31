/**
 * The text of storelib.com/llms.txt, in the llms.txt format (llmstxt.org).
 * Here rather than in the route because a Next route file may only export
 * its handlers and its config, and the tests want to read this directly.
 *
 * The pages are listed by hand, not looped over, because the order is for an
 * agent rather than for the sidebar: the rules and the AI guide come before
 * everything else, whatever category the site files them under.
 * tests/developer-hub.test.ts fails when a page of the hub is missing here.
 */
import { DEV_PAGES, FRAMEWORK_NAME, HUB_NAME, SITE_ORIGIN, devPath } from "./pages"
import { OFFERED_PLANS } from "@/lib/billing/plans"
import { getFeeDescription } from "@/lib/billing/fee-calculator"

export function llmsTxt(): string {
  const link = (slug: string) => `${SITE_ORIGIN}${devPath(slug)}`
  const line = (slug: string) => {
    const p = DEV_PAGES.find((x) => x.slug === slug)
    return p ? `- [${p.title}](${link(slug)}): ${p.description}` : ""
  }
  return [
    `# ${HUB_NAME}`,
    "",
    `> Storelib is a platform where creators sell digital products, courses, memberships and physical products, from a creator page, a OnePage (a link in bio page), their own website and communities, with payments through Stripe. Every section of every Storelib website is written in the ${FRAMEWORK_NAME}: one .storelib file per section, holding a <template>, a scoped <style>, an optional <script> and a JSON <schema>. These pages are its complete reference.`,
    "",
    "Before writing a section, read the AI guide. Two facts matter more than any other: the template language is not Vue, React or JSX, and a section's script runs in a sandbox against a copy of its own markup, so it can toggle classes, styles and text but cannot add elements, measure layout or reach the page.",
    "",
    `Before writing any code on a Storelib site, an agent reads and follows ${SITE_ORIGIN}/developers/rules: it writes section files only, never changes a built-in section, writes a header, navigation bar, footer, mega menu, drawer, product page, collection page or cart drawer of its own as a section when the design wants one, keeping menus, the logo, products, prices, the cart and checkout live (${SITE_ORIGIN}/developers/header-and-footer, ${SITE_ORIGIN}/developers/building-a-store), and makes every link, button and menu editable. A creator can connect an agent to one of their sites from Website Settings › Connections, in two ways. Through GitHub: the site's section files live in a repository, and every push to the linked branch is compiled and saved to the site as a draft (${SITE_ORIGIN}/developers/ai#connect-through-github); this is also how ChatGPT's Codex connects. Or directly: the site is an MCP server at https://mcp.storelib.com, with tools to read the project, its pages and the section the creator has selected, search the section library, create and edit sections, change settings and styles, create pages, apply several changes as one safe patch with a restore point, run tests and preview drafts; the rules and the skills for the task arrive with the connection (${SITE_ORIGIN}/developers/ai#connect-an-agent-directly).`,
    "",
    "A section never takes a payment. It shows the creator's products (`products` on every page, `page.product` on a product page, each with its prices, pictures, options and `checkout_url`) and links to their page or to Storelib checkout, which brings the buyer back to the site after paying; see the Selling page.",
    "",
    "When a fact that changes the result is missing and nothing on the site has it, an agent asks its person one short question with a few options instead of guessing, and never asks what a tool can tell it.",
    "",
    "## Start here",
    "",
    line(""),
    line("rules"),
    line("ai"),
    line("builder"),
    line("website-builder"),
    "",
    "## Themes",
    "",
    line("themes"),
    line("pages"),
    line("header-and-footer"),
    line("building-a-store"),
    line("sharing-themes"),
    line("imported-shopify-themes"),
    line("publishing"),
    "",
    `## Sections: the ${FRAMEWORK_NAME}`,
    "",
    line("sections"),
    line("schema"),
    line("blocks"),
    line("styling"),
    line("javascript"),
    line("examples"),
    line("shopify"),
    "",
    "## Data and logic",
    "",
    line("dynamic-values"),
    line("selling"),
    line("physical-commerce"),
    "",
    "## Reference",
    "",
    line("data-model"),
    line("shopify-parity"),
    "",
    /*
      Round 44: storelib.com/llms.txt is read as the map of the whole domain,
      and it named none of Storelib's own pages. These are the public pages an
      agent answering a question about Storelib itself needs, at the addresses
      the sitemap lists them under (the Help Center at its own host).
    */
    "## Storelib",
    "",
    /*
      Round 45: the plans as plain facts, written from lib/billing/plans.ts
      and the fee table, so this file cannot quote a price the pricing page
      does not.
    */
    planFacts(),
    "",
    `- [Features](${SITE_ORIGIN}/features): what a creator can do with Storelib.`,
    `- [Pricing](${SITE_ORIGIN}/pricing): the Free and Pro plans and the fee on each sale.`,
    `- [Help Center](https://help.storelib.com): step by step guides for selling on Storelib: products, shipping, orders and payouts, websites, email and billing.`,
    `- [FAQ](${SITE_ORIGIN}/faq): short answers about getting started, selling, payments and pricing.`,
    `- [Blog](${SITE_ORIGIN}/blog): guides for creators who sell digital products. Feed: ${SITE_ORIGIN}/blog/rss.xml.`,
    `- [Terms of service](${SITE_ORIGIN}/terms): the agreement for using Storelib.`,
    `- [Privacy policy](${SITE_ORIGIN}/privacy): what Storelib collects and why.`,
    "",
    "## Optional",
    "",
    line("changelog"),
    `- [Everything in one file](${SITE_ORIGIN}/llms-full.txt): every page above as plain markdown, with every reference table filled in.`,
    "",
  ].join("\n")
}

/** One line: each plan on sale, its monthly price and Storelib's fee per sale. Stripe's processing fee is on top on every plan. */
export function planFacts(): string {
  const plans = OFFERED_PLANS.map((p) => `${p.name}: ${p.priceCents === 0 ? "no monthly fee" : `${p.price} a month`}, ${getFeeDescription(p.id)}`)
  return `Plans, in US dollars: ${plans.join("; ")}. Stripe's payment processing fee applies on every plan.`
}
