/**
 * The five emails a ticket for a paid event can send, drawn by the same
 * renderEmail() the engine uses, so what is photographed is what an inbox
 * gets (scripts/check-event-emails.mjs opens and measures them):
 *
 *   ticket-receipt    the buyer's receipt, with the event attached as a
 *                     calendar file
 *   ticket-invited    a free seat staff gave somebody: who gave it, and
 *                     what a ticket costs, never a price paid
 *   ticket-refund     what came back, and how long a card takes
 *   event-cancelled   the event is off AND the money is on its way, in one
 *   invite-event      the community's invite link, carrying the event, for
 *                     an address with no account yet
 *
 * Each is written as HTML, as the plain text part, and as what the email
 * carries beside its words.
 *
 *   OUT_DIR=<dir> node <bundle of this file>
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { renderEmail } from "@/lib/notify/templates"
import type { TemplateContext } from "@/lib/notify/types"

const out = process.env.OUT_DIR || join(process.cwd(), ".event-email-probe", "out")
mkdirSync(out, { recursive: true })

const BASE = "https://storelib.com"
const EVENT = "7f1b2c33-4d55-4e66-8f77-99aabbccddee"

const holder: TemplateContext = {
  baseUrl: BASE,
  recipientName: "Mara Pop",
  unsubscribeUrl: null,
  preferencesUrl: null,
  when: null,
}

const event = {
  communityId: "11111111-2222-4333-8444-555555555555",
  communityName: "Film Loft",
  communitySlug: "film-loft",
  creatorName: "Owen Marin",
  eventId: EVENT,
  eventTitle: "Darkroom night",
  startsAt: "2026-11-20T18:00:00.000Z",
  endsAt: "2026-11-20T20:00:00.000Z",
  timezone: "Europe/Bucharest",
  location: "",
  online: true,
  currency: "usd",
  eventUpdatedAt: "2026-11-01T09:00:00.000Z",
  eventDescription: "Two hours in the darkroom, prints to take home.",
  refundPolicy: "Refunds up to 24 hours before it starts. After that the seat is yours to give away.",
}

const samples: [string, Parameters<typeof renderEmail>[0], Record<string, unknown>][] = [
  ["ticket-receipt", "COMMUNITY_EVENT_TICKET", { ...event, amountCents: 2500, ticketSource: "purchase", paidAt: "2026-11-04T08:12:00.000Z" }],
  ["ticket-invited", "COMMUNITY_EVENT_TICKET_INVITE", { ...event, priceCents: 2500, inviterName: "Sam Petre", message: "Come along, there is a spare enlarger." }],
  ["ticket-refund", "COMMUNITY_EVENT_REFUND", { ...event, amountCents: 2500, byHolder: true, refundedAt: "2026-11-10T11:00:00.000Z" }],
  ["event-cancelled", "COMMUNITY_EVENT_CANCELLED", { ...event, amountCents: 2500, refundedAt: "2026-11-10T11:00:00.000Z" }],
  [
    "invite-event",
    "COMMUNITY_INVITE",
    {
      communityName: event.communityName,
      communitySlug: event.communitySlug,
      creatorName: event.creatorName,
      inviterName: "Sam Petre",
      inviteCode: "Hc3lQe9rVv1kZt7xBn4mPs2dAj6yUw0o",
      tagline: "A darkroom and a small film club in Bucharest.",
      eventId: EVENT,
      eventTitle: event.eventTitle,
      eventTag: "9f2c41ab7d6e5f4a3b2c1d0e9f8a7b6c",
      expiresAt: "2026-12-04T00:00:00.000Z",
    },
  ],
]

for (const [name, type, data] of samples) {
  const m = renderEmail(type, data, holder)
  writeFileSync(join(out, `${name}.html`), m.html)
  writeFileSync(join(out, `${name}.txt`), m.text)
  writeFileSync(
    join(out, `${name}.json`),
    JSON.stringify(
      {
        subject: m.subject,
        preview: m.preview,
        fromName: m.fromName ?? null,
        files: (m.attachments ?? []).map((f) => ({ filename: f.filename, contentType: f.contentType, text: Buffer.from(f.content).toString("utf8") })),
      },
      null,
      2,
    ),
  )
  console.log(`  ${name}: ${m.subject}`)
}
