import "server-only"

/**
 * ONE EMAIL OF A FLOW, DRAWN EXACTLY AS IT GOES OUT, for the builder's
 * Preview and its Send test. Both used to be only the test: the builder had
 * no way to see an automated email without mailing it to yourself. Now the
 * same step, filled and branded by the engine's own prepareEmail and framed
 * by the same mailer a real send uses, is either shown (preview) or sent to
 * the creator's own address (test), so the two can never disagree.
 *
 * A preview has no person and no order: the reader is "Alex Example", the
 * product is the one named or "Your product", and the order and product
 * links go to the creator's page.
 */

import { randomUUID } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { prepareEmail, type Identity, type RunRow } from "./engine"
import type { EmailStep } from "./flow-model"
import { mailerFor } from "./run"
import { supabaseStore } from "./supabase-store"

export interface DrawnFlowEmail {
  identity: Identity
  subject: string
  previewText: string
  html: string
  text: string
  headers?: Record<string, string>
  mailer: ReturnType<typeof mailerFor>
}

export async function drawFlowEmail(input: { flowId: string; creatorId: string; to: string; step: EmailStep; product?: unknown }): Promise<DrawnFlowEmail> {
  const admin = createAdminClient()
  const identity = await supabaseStore(admin).identity(input.creatorId)
  const mailer = mailerFor(admin)
  const product = typeof input.product === "string" && input.product.trim() ? input.product.trim().slice(0, 120) : "Your product"
  const run: RunRow = { id: "test", flow_id: input.flowId, creator_id: input.creatorId, email: input.to, name: "Alex Example", status: "active", started_at: new Date().toISOString(), context: { product_title: product } }
  const ready = prepareEmail(input.step, run, identity, { productUrl: null, orderUrl: null, checkoutUrl: null })
  const mail = mailer.compose({
    step: ready.step,
    run,
    identity,
    standing: { suppressed: false, unsubscribeToken: null, subscribed: true, status: "subscribed" },
    token: randomUUID(),
    merge: ready.merge,
  })
  return { identity, subject: mail.subject, previewText: ready.step.config.preview_text ?? "", html: mail.html, text: mail.text, headers: mail.headers, mailer }
}
