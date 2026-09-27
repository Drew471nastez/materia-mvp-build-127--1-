/**
 * ===========================================================================
 *  ONE EMAIL OF A FLOW, AS A BUYER WILL GET IT
 * ===========================================================================
 * The builder's preview (app/app/emails/flow/[id]/builder.tsx) draws a step
 * through exactly what a real send goes through: engine prepareEmail fills
 * every field with the one resolver (lib/email-variables), then
 * automationEmail frames it in the creator's brand, with the photo, name
 * and store the send path reads (supabase-store readIdentity). Only the
 * reader is made up: SAMPLE_READER, a real looking name and order.
 *
 * So a "[Your name]" left in a saved flow shows as the creator's name here
 * too, and a creator never sees one thing and sends another.
 *
 * Pure and browser-safe.
 */
import { automationEmail, brandOfIdentity } from "@/lib/email-automation"
import { SAMPLE_READER } from "@/lib/email-variables"
import { prepareEmail, type Identity } from "./engine"
import type { EmailStep, TriggerType } from "./flow-model"

export interface FlowPreview {
  subject: string
  previewText: string
  html: string
}

const ORDERS: TriggerType[] = ["purchase", "first_purchase"]

export function previewFlowEmail(step: EmailStep, trigger: TriggerType, identity: Identity, productName?: string | null): FlowPreview {
  const bought = ORDERS.includes(trigger)
  const run = {
    name: SAMPLE_READER.name,
    context: {
      product_title: (productName ?? "").trim() || SAMPLE_READER.productName,
      ...(bought ? { order_id: SAMPLE_READER.orderId } : {}),
    },
  }
  /* A preview has no real order or checkout: those links go to the creator's page, as a test send's do. */
  const ready = prepareEmail(step, run, identity, { productUrl: null, orderUrl: null, checkoutUrl: null, unsubscribeUrl: null })
  const subject = ready.step.config.subject.replace(/[\r\n]+/g, " ")
  const previewText = ready.step.config.preview_text ?? ""
  const mail = automationEmail({
    subject,
    previewText: previewText || null,
    body: ready.step.config.body,
    fromName: identity.fromName,
    brand: brandOfIdentity(identity),
    avatarUrl: identity.avatarUrl ?? null,
    unsubscribeToken: "preview",
    because: bought ? "customer" : "subscribed",
  })
  return { subject, previewText, html: mail.html }
}
