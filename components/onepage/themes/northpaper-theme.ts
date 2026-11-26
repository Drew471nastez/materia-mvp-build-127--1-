/**
 * ===========================================================================
 *  NORTHPAPER: A NOTION TEMPLATE SELLER'S PAGE
 * ===========================================================================
 * The owner (round 65): "based on the UI and template of the North Paper
 * template in the websites and of the Notion creator as well, matching very
 * well with that kind of outline thing, create a one-page theme ... so that
 * people can have their own Notion template link in bio thing ... with the
 * preset blocks added as default."
 *
 * The look is the Northpaper website template's (theme-packages/materia/
 * templates/notionpage, config/settings_data.json), read off its own
 * settings rather than guessed:
 *
 *   page        #f7f7f5, the warm off white of its footer
 *   ink         #191918 for the name and the buttons' words, #55534e for
 *               the rest (its text_color)
 *   rules       #dddcd7 (its btn_secondary_border), one pixel
 *   buttons     its secondary button: white, a one pixel rule, an 8px
 *               corner (btn_radius), the words in ink; under the pointer it
 *               fills with the ink and the words turn white, as the
 *               website's does
 *   type        Inter, the nearest face the page loads to the template's
 *               Helvetica, the name bold and tight, flush left like a Notion
 *               page's title
 *   picture     a rounded square with a one pixel ink rule, the outlined
 *               mark of the website's logo and the Notion creator template's
 *               line drawn avatar
 *   socials     outlined, in ink
 *   products    rows, a Notion database in list view
 *
 * Every pair reads at 4.5:1 or more (tests/onepage-notion-r65.test.ts).
 *
 * THE BLOCKS IT COMES WITH (lib/onepage/theme-blocks): a page that holds
 * nothing of the creator's own yet (the starter links every new page has)
 * gets a ready Notion template page when this theme is picked: socials, the
 * creator's templates, a free template for an email, two links and three
 * questions buyers ask. Only block types the editor already has.
 */
import { createDefaultBlock, type OnePageBlock, type OnePageBlockType } from "@/lib/onepage/types"
import { tt } from "@/lib/i18n/text"

const INK = "#191918"
const MUTED = "#55534e"
const RULE = "#dddcd7"
const PAGE = "#f7f7f5"

export const NORTHPAPER_THEMES = [
  {
    id: "northpaper",
    name: "Northpaper",
    category: "light",
    theme_config: {
      background_type: "solid" as const,
      background_color: PAGE,
      background_gradient: "",
      background_image_url: "",
      text_color: INK,
      secondary_text_color: MUTED,
      button_color: "#ffffff",
      button_text_color: INK,
      button_style: "filled" as const,
      button_border_radius: 8,
      button_border_width: 1,
      button_border_color: RULE,
      button_shadow: "none",
      button_hover_animation: "fill",
      button_hover_fill: INK,
      button_hover_text: "#ffffff",
      button_text_align: "left",
      button_icon_position: "left",
      font_family: "'Inter', sans-serif",
      title_font: "'Inter', sans-serif",
      title_color: INK,
      title_weight: 700,
      title_tracking: "tight",
      avatar_shape: "rounded",
      avatar_radius: 14,
      avatar_border_width: 1,
      avatar_border_color: INK,
      social_icon_color: INK,
      social_icon_style: "outline",
      social_icon_tone: "mono",
      spacing: "normal" as const,
      card_width: "standard" as const,
      header_layout: "classic",
      laser_glow_enabled: false,
      background_pattern: "none",
      block_layout: "list",
      product_layout: "rows",
      header_align: "left",
    },
    profile_layout: "classic" as const,
    light_button_text_color: INK,
    solid_button_text_color: INK,
    outline_button_text_color: INK,
    glass_button_text_color: INK,
    share_style: "white",
    subscribe_style: "white",
  },
]

/** A block as the editor makes one, with this theme's words in it. */
function block(type: OnePageBlockType, data: Record<string, unknown> = {}): OnePageBlock {
  const b = createDefaultBlock(type)
  return { ...b, data: { ...(b.data as object), ...data } as OnePageBlock["data"] }
}

/**
 * The page Northpaper starts a creator on, after the header: who they are is
 * the header's (their picture, name and bio), then this.
 */
export function northpaperBlocks(): OnePageBlock[] {
  return [
    block("social_row", { platforms: [], style: "icons" }),
    block("heading", { text: tt("Templates"), size: "small", alignment: "left" }),
    /* The creator's own digital products, read live (lib/onepage/storelib-blocks); the page leaves it out until there is one. */
    block("storelib_shelf", { source: "digital", title: "", layout: "list", limit: 6 }),
    block("email_capture", {
      headline: tt("Free Notion template"),
      description: tt("A weekly planner for Notion. Leave your email and the link comes to you."),
      placeholder: tt("Your email"),
      button_preset: "custom",
      custom_button_text: tt("Send it"),
      button_text: tt("Send it"),
      success_message: tt("Sent. The link is in your inbox."),
      layout_type: "default",
    }),
    block("heading", { text: tt("Links"), size: "small", alignment: "left" }),
    block("link_button", { label: tt("My Notion Marketplace profile"), url: "https://www.notion.com/templates", icon: "notion" }),
    block("link_button", { label: tt("Video walkthroughs"), url: "https://youtube.com/", icon: "youtube" }),
    block("faq", {
      title: tt("Questions"),
      items: [
        { id: "np_q1", question: tt("How do I get the template?"), answer: tt("A link comes by email right after you pay. Open it and press Duplicate to copy the template into your own Notion.") },
        { id: "np_q2", question: tt("Does it work on Notion's free plan?"), answer: tt("Yes. Every template works on the free plan, on a computer and on a phone.") },
        { id: "np_q3", question: tt("Can I change it once it is mine?"), answer: tt("Yes. It is your own copy, so rename, move or delete anything in it.") },
      ],
    }),
  ]
}

/** The blocks a theme comes with, by theme id (lib/onepage/theme-blocks); a theme that is only a look has none. */
const THEME_BLOCKS: Record<string, () => OnePageBlock[]> = { northpaper: northpaperBlocks }

export function themeStarterBlocks(id: string | null | undefined): OnePageBlock[] | null {
  const make = id ? THEME_BLOCKS[id] : undefined
  return make ? make() : null
}
