/**
 * ===========================================================================
 *  WHERE A NEW EMAIL CAN START
 * ===========================================================================
 * Five layouts a creator writes most often, offered on an empty new email
 * (components/email/compose/starter-list.tsx): a letter, an announcement, a
 * new product, a newsletter and a sale. "You should have some templates,
 * clean, correct, standard."
 *
 * Each one is made of the composer's own blocks (./blocks.ts), so it is
 * edited like anything written from scratch, saved the same way and sent
 * through the same renderer: the 600px table layout of ./template.ts, every
 * style inline, buttons as a painted table cell. Nothing here is a second
 * kind of email.
 *
 * The words are there to be replaced. They say what goes in each place, in
 * the voice of the email, so an email sent without changing them still reads
 * as an email and not as a form. The reader's first name is the merge field
 * the send fills in ({{first_name}}, "there" when it is not known).
 *
 * Pure and browser-safe.
 */
import { escapeHtml, newBlock, type Block } from "./blocks"

export type StarterId = "letter" | "announcement" | "product" | "newsletter" | "sale"

/** One line of a starter's sketch, top to bottom: what its rows look like. */
export type SketchRow = "title" | "text" | "short" | "button" | "product" | "rule" | "center-title" | "center-text"

export interface Starter {
  id: StarterId
  name: string
  /** What it is for, in one line. */
  line: string
  sketch: SketchRow[]
}

export interface StarterContext {
  /** The store's name, for the sign-off. */
  name: string
  /** Where a button goes when the creator has not said: their store. Empty for none. */
  storeUrl?: string | null
}

export interface StarterDraft {
  subject: string
  previewText: string
  blocks: Block[]
}

export const STARTERS: Starter[] = [
  { id: "letter", name: "Letter", line: "A few paragraphs, like a note to one person.", sketch: ["text", "text", "short"] },
  { id: "announcement", name: "Announcement", line: "News, when it happens, and one button.", sketch: ["title", "text", "button", "short"] },
  { id: "product", name: "New product", line: "A product with its picture, price and a button.", sketch: ["title", "text", "product", "short"] },
  { id: "newsletter", name: "Newsletter", line: "An update in a few short sections.", sketch: ["title", "text", "rule", "text", "text", "rule"] },
  { id: "sale", name: "Sale", line: "An offer, a code and a deadline, centred.", sketch: ["center-title", "center-text", "button", "center-text"] },
]

const rich = (html: string) => newBlock("rich", { html })

function signOff(words: string, name: string): string {
  return `<p>${words}<br>${escapeHtml(name.trim() || "The team")}</p>`
}

/**
 * The blocks, subject and preview text of a starter, with fresh block ids
 * every time, so two emails started from the same one never share a block.
 */
export function starterDraft(id: StarterId, ctx: StarterContext): StarterDraft {
  const name = ctx.name.trim() || "The team"
  const url = ctx.storeUrl || ""
  switch (id) {
    case "letter":
      return {
        subject: "",
        previewText: "",
        blocks: [
          rich(
            `<p>Hi {{first_name}},</p><p>Write the way you would talk to one person. Say why you are writing today, and keep it to a few short paragraphs.</p><p>If there is one thing you want them to do, ask for it plainly and give them the link.</p>${signOff("Thanks for reading,", name)}`,
          ),
        ],
      }
    case "announcement":
      return {
        subject: `News from ${name}`,
        previewText: "What is new, and when.",
        blocks: [
          rich(`<h2>Something new is coming</h2><p>Hi {{first_name}},</p><p>Say what is happening in two or three sentences: what it is, when it starts, and what the reader can do about it.</p>`),
          newBlock("button", { label: "Find out more", url, align: "left" }),
          rich(signOff("See you there,", name)),
        ],
      }
    case "product":
      return {
        subject: "Just released",
        previewText: "Now in the store.",
        blocks: [
          rich(`<h2>Just released</h2><p>Hi {{first_name}},</p><p>Tell people what it is, who it is for, and one detail you are proud of.</p>`),
          newBlock("product"),
          rich(`<p>Questions about it? Reply to this email and I will answer.</p><p>${escapeHtml(name)}</p>`),
        ],
      }
    case "newsletter":
      return {
        subject: "What is new this month",
        previewText: "A few things from this month.",
        blocks: [
          rich(`<h2>This month</h2><p>Hi {{first_name}}, here is what happened and what is coming next.</p>`),
          newBlock("divider"),
          rich(
            `<h3>The first thing</h3><p>A few lines about it, with a link if there is more to read.</p><h3>The second thing</h3><p>Keep each part short enough to read on a phone in one go.</p>`,
          ),
          newBlock("divider"),
          rich(signOff("Until next month,", name)),
        ],
      }
    case "sale":
      return {
        subject: "20% off until Sunday",
        previewText: "Use the code at checkout.",
        blocks: [
          rich(`<h2 style="text-align: center">20% off everything</h2><p style="text-align: center">Until Sunday at midnight. Use the code <strong>THANKYOU20</strong> at checkout.</p>`),
          newBlock("button", { label: "Shop the sale", url, align: "center" }),
          rich(`<p style="text-align: center">One code per order.</p>`),
        ],
      }
  }
}
