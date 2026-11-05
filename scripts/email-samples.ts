/**
 * Finished emails, written to files for scripts/check-email-html.mjs to
 * open in Chromium: a campaign exactly as the send builds it
 * (lib/email-campaigns/queue.ts messageFor, with a reader, tracking and the
 * one-click headers), and an automated email through the same steps a real
 * one takes: the engine fills the step (lib/automations/engine.ts
 * prepareEmail), and the mailer (lib/automations/run.ts mailerFor) tracks
 * its links and draws it in the engine's brand with the postal address.
 * The brand is a creator's with a logo, an accent, and an address; a second
 * campaign has a pale accent and no logo, to see the contrast fallback, and
 * a second automation goes to a buyer who never joined the list.
 *
 *   OUT_DIR=<dir> node <bundle of this file>
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { messageFor, type Frame } from "@/lib/email-campaigns/queue"
import { newBlock, renderBlocks, storeBlocks, type Block } from "@/lib/email-campaigns/blocks"
import { readStoredBody } from "@/lib/email-campaigns/stored"
import { themeOf, type Brand } from "@/lib/email-campaigns/brand"
import { automationEmail, brandOfIdentity } from "@/lib/email-automation"
import { prepareEmail, type Identity, type RunRow } from "@/lib/automations/engine"
import { textOn } from "@/lib/automations/merge-fields"
import { trackLinks as trackAutomationLinks } from "@/lib/automations/tracking"
import type { EmailStep } from "@/lib/automations/flow-model"

process.env.EMAIL_LINK_SECRET = process.env.EMAIL_LINK_SECRET || "sample-signing-key-for-the-probe"
process.env.AUTOMATION_LINK_SECRET = process.env.AUTOMATION_LINK_SECRET || "sample-automation-key-for-the-probe"
const out = process.env.OUT_DIR || join(process.cwd(), ".email-html-probe")
mkdirSync(out, { recursive: true })

const brand: Brand = {
  name: "Ana Pop Studio",
  logoUrl: "https://cdn.example.com/logo.png",
  storeUrl: "https://storelib.com/anapop",
  accent: "#0f766e",
  address: "12 Harbour Street, Unit 4, Portland, ME 04101, United States",
}

const blocks: Block[] = [
  newBlock("rich", {
    html: "<h2>The autumn presets are here</h2><p>Hi {{first_name}},</p><p>Twelve new presets for <strong>warm evening light</strong>, made on the coast this summer. They work in Lightroom on a phone and a computer, and they are <em>half price</em> until Sunday.</p><ul><li>Twelve presets, each with a lighter and a stronger version</li><li>A short video on getting skin tones right</li><li>Free updates when I add more</li></ul><p>Questions? <a href=\"https://anapop.studio/faq\">Read the answers</a> or reply to this email.</p>",
  } as Partial<Block>),
  newBlock("button", { label: "Get the autumn pack", url: "https://storelib.com/anapop/autumn-presets" } as Partial<Block>),
  newBlock("image", { src: "https://cdn.example.com/cover.png", alt: "Three photos of a harbour at sunset, edited with the presets", width: 100 } as Partial<Block>),
  newBlock("product", { productId: "p1", title: "Autumn preset pack", price: "$19.00", imageUrl: "https://cdn.example.com/p1.png", url: "https://storelib.com/anapop/autumn-presets" } as Partial<Block>),
  newBlock("divider"),
  newBlock("rich", { html: "<blockquote><p>The best presets I have bought this year.</p></blockquote><p>Thank you for being here,<br>Ana</p>" } as Partial<Block>),
]

/* The draft as saved, read back and rendered by the send, the way a real send does it. */
const stored = storeBlocks(blocks)
const sendBlocks = readStoredBody(stored).blocks

function campaign(file: string, b: Brand) {
  const frame: Frame = {
    subject: "{{first_name}}, the autumn presets are here",
    previewText: "Twelve presets for warm evening light, half price until Sunday",
    body: renderBlocks(sendBlocks, themeOf(b)),
    trackOpens: true,
    sender: {
      creatorId: "c-1",
      userId: "u-1",
      name: b.name,
      from: `${b.name} <noreply@storelib.com>`,
      replyTo: "hello@anapop.studio",
      avatarUrl: "https://cdn.example.com/avatar.png",
      username: "anapop",
      accountEmail: "ana@example.com",
      planId: "growth",
      planStatus: "active",
      blocked: false,
      brand: b,
    },
  }
  const m = messageFor(frame, "11111111-1111-4111-8111-111111111111", { id: "22222222-2222-4222-8222-222222222222", email: "reader@example.com", name: "Maya Chen", subscriber_id: "s-1", tracking_token: "33333333-3333-4333-8333-333333333333" }, "44444444-4444-4444-8444-444444444444")
  writeFileSync(join(out, `${file}.html`), m.html)
  writeFileSync(join(out, `${file}.txt`), m.text)
  writeFileSync(join(out, `${file}.headers.json`), JSON.stringify({ subject: m.subject, from: m.from, replyTo: m.replyTo, messageId: m.messageId, ...m.headers }, null, 2))
}

campaign("campaign", brand)
campaign("campaign-pale", { ...brand, name: "Sunny Paper Co", logoUrl: null, accent: "#fde047", address: null })

/* An automation's body as the shared editor writes it (app/(storelib)/app/emails/flow/body-editor.tsx), button and fields included. */
const automationBody =
  "<p>Hi {{first_name}},</p><p>Thank you for buying the <strong>{{product_name}}</strong>. Your download link is in your receipt, and here is the fastest way to start:</p><ol><li>Open Lightroom and import the presets</li><li>Try <em>Harbour Warm</em> on a photo taken near sunset</li></ol><p><a href=\"https://storelib.com/anapop/guide\" style=\"display:inline-block;padding:10px 18px;border-radius:8px;background-color:#1a1a2e;color:#ffffff;text-decoration:none;font-weight:600;\">Read the quick guide</a></p><p>Reply to this email if anything does not work.</p><p>{{store_name}}</p>"

/** One automated email through the engine's and the mailer's own steps. */
function automation(file: string, identity: Identity, address: string | null, status: "subscribed" | "customer") {
  const step = { id: "e1", type: "email", config: { subject: "Getting started, {{first_name}}", preview_text: "Two steps and you are editing", body: automationBody } } as EmailStep
  const run = { name: "Maya Lee", context: { product_title: "Autumn preset pack" } } as Pick<RunRow, "name" | "context">
  const ready = prepareEmail(step, run, identity, { productUrl: null, orderUrl: null, checkoutUrl: null })
  const token = "66666666-6666-4666-8666-666666666666"
  const mail = automationEmail({
    subject: ready.step.config.subject,
    previewText: ready.step.config.preview_text ?? null,
    body: trackAutomationLinks(ready.step.config.body, token),
    fromName: identity.fromName,
    brand: { ...brandOfIdentity(identity), address },
    unsubscribeToken: "55555555-5555-4555-8555-555555555555",
    because: status,
    openPixelUrl: `https://storelib.com/api/automations/t/o?k=${token}`,
  })
  writeFileSync(join(out, `${file}.html`), mail.html)
  writeFileSync(join(out, `${file}.txt`), mail.text)
  writeFileSync(join(out, `${file}.headers.json`), JSON.stringify(mail.headers ?? {}, null, 2))
}
const identity = (name: string, logoUrl: string | null, accent: string): Identity => ({
  fromName: "Ana Pop",
  replyTo: "hello@anapop.studio",
  storeUrl: "https://storelib.com/anapop",
  brand: { name, logoUrl, accentColor: accent, onAccent: textOn(accent) },
})
automation("automation", identity(brand.name, brand.logoUrl, brand.accent), brand.address, "subscribed")
automation("automation-customer", identity("Sunny Paper Co", null, "#fde047"), null, "customer")
console.log(`wrote ${out}`)
