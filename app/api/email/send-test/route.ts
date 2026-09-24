/**
 * ===========================================================================
 *  SEND A TEST TO YOURSELF
 * ===========================================================================
 * POST { subject, body, preview_text?, test_email? }
 *
 * The email exactly as a subscriber would get it (the same frame, the same
 * sanitizer, your own name filled in), with "Test:" in front of the subject
 * and no tracking.
 *
 * ONLY TO YOUR OWN ADDRESS. This used to send any HTML to any address from
 * our domain, as often as it was asked: a relay for anyone with an account,
 * and exactly how a sending domain ends up on a blocklist. It now goes to the
 * account's own email or the store's support email, and a few times an hour.
 */
import { NextResponse } from "next/server"
import { isSmtpConfigured } from "@/lib/mail"
import { sendMailgunOnce } from "@/lib/mailgun"
import { rateLimit } from "@/lib/api/rate-limit"
import { maskEmail } from "@/lib/privacy/mask-email"
import { normalizeAddress } from "@/lib/email-campaigns/address"
import { loadSender, prepareContent } from "@/lib/email-campaigns/queue"
import { buildCampaignEmail, campaignPlainText, personalizeHtml, personalizeSubject } from "@/lib/email-campaigns/template"
import { plainReason } from "@/lib/email-campaigns/retry"
import { isResponse, readJson, requireCreator } from "@/lib/email-campaigns/route-auth"
import { APP_URL } from "@/lib/email-automation"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const ctx = await requireCreator()
  if (isResponse(ctx)) return ctx
  const body = await readJson(request)

  const sender = await loadSender(ctx.admin, ctx.creatorId)
  if (!sender) return NextResponse.json({ error: "Set up your store before sending email." }, { status: 404 })

  /* The account's own addresses, and nothing else. */
  const { data: creator } = await ctx.admin.from("creators").select("support_email").eq("id", ctx.creatorId).maybeSingle()
  const ownAddresses = [normalizeAddress(ctx.userEmail), sender.accountEmail, normalizeAddress(creator?.support_email)].filter((x): x is string => !!x)
  const asked = typeof body.test_email === "string" && body.test_email.trim() ? normalizeAddress(body.test_email) : ownAddresses[0] ?? null
  if (!asked) return NextResponse.json({ error: "Add an email address to your account to send tests to it." }, { status: 400 })
  if (!ownAddresses.includes(asked)) {
    return NextResponse.json({ error: `Tests go to your own address, ${maskEmail(ownAddresses[0] ?? "")}. Add a subscriber to see it as they would.` }, { status: 403 })
  }

  /* The automation editor tests through here too, with its own two fields. */
  const flowFields = (v: unknown) =>
    typeof v === "string" ? v.replace(/\{\{\s*customer_name\s*\}\}/gi, "{{name}}").replace(/\{\{\s*product_name\s*\}\}/gi, "your product") : v
  const content = prepareContent({ subject: flowFields(body.subject), preview_text: body.preview_text, body: flowFields(body.body) })
  const blocking = content.errors.filter((e) => e.field !== "audience")
  if (blocking.length) return NextResponse.json({ error: blocking[0].message, errors: blocking }, { status: 422 })

  if (!isSmtpConfigured()) return NextResponse.json({ error: "Email sending is not set up on Storelib right now." }, { status: 503 })

  const limited = await rateLimit({
    bucket: "campaign-test",
    subjects: [`creator:${ctx.creatorId}`],
    windows: [
      { limit: 5, seconds: 600 },
      { limit: 30, seconds: 86_400 },
    ],
    message: "That is a lot of tests in a short time. Wait a few minutes and send another.",
  })
  if (limited) return limited

  const reader = { name: sender.name, email: asked }
  const html = personalizeHtml(content.body, reader).replace(/\{\{\s*unsubscribe_url\s*\}\}/gi, `${APP_URL}/unsubscribe`)
  const result = await sendMailgunOnce({
    to: asked,
    from: sender.from,
    replyTo: sender.replyTo,
    subject: `Test: ${personalizeSubject(content.subject, reader)}`,
    html: buildCampaignEmail({
      subject: personalizeSubject(content.subject, reader),
      previewText: content.previewText,
      bodyHtml: html,
      senderName: sender.name,
      senderAvatarUrl: sender.avatarUrl,
      unsubscribeUrl: `${APP_URL}/unsubscribe`,
    }),
    text: campaignPlainText(html, `${APP_URL}/unsubscribe`),
    tags: ["campaign-test"],
  })

  if (!result.success) {
    console.error(`[email/send-test] not sent to ${maskEmail(asked)}: ${result.status ?? (result.timedOut ? "timeout" : "no answer")}`)
    return NextResponse.json({ error: `The test was not sent. ${plainReason(result)}` }, { status: 502 })
  }
  return NextResponse.json({ success: true, sent_to: asked })
}
