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
import { ownerAddress } from "@/lib/businesses/email-alias"
import { loadSender, prepareContent } from "@/lib/email-campaigns/queue"
import { buildEmail, emailText, personalizeHtml, personalizeSubject } from "@/lib/email-campaigns/template"
import { renderBlocks } from "@/lib/email-campaigns/blocks"
import { themeOf } from "@/lib/email-campaigns/brand"
import { esc } from "@/lib/email-campaigns/rich"
import { plainReason } from "@/lib/email-campaigns/retry"
import { isResponse, readJson, requireCreator, UUID } from "@/lib/email-campaigns/route-auth"
import { APP_URL } from "@/lib/email-automation"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const ctx = await requireCreator()
  if (isResponse(ctx)) return ctx
  const body = await readJson(request)

  const sender = await loadSender(ctx.admin, ctx.creatorId)
  if (!sender) return NextResponse.json({ error: "Set up your store before sending email." }, { status: 404 })

  /*
    The account's own addresses, and nothing else. A second business's account
    address carries a tag Storelib made up, so the owner's own address counts
    as theirs too (lib/businesses/email-alias.ts ownerAddress): it is where
    the tagged one delivers anyway, and it is the one the composer shows them,
    so typing what they can see is not refused. It also leads the list, so a
    test with nothing typed goes there and the refusal below names it rather
    than a tag they never wrote.
  */
  const { data: creator } = await ctx.admin.from("creators").select("support_email").eq("id", ctx.creatorId).maybeSingle()
  const ownAddresses = [
    normalizeAddress(ownerAddress(ctx.userEmail)),
    normalizeAddress(ctx.userEmail),
    sender.accountEmail,
    normalizeAddress(creator?.support_email),
  ].filter((x): x is string => !!x)
  const asked = typeof body.test_email === "string" && body.test_email.trim() ? normalizeAddress(body.test_email) : ownAddresses[0] ?? null
  if (!asked) return NextResponse.json({ error: "Add an email address to your account to send tests to it." }, { status: 400 })
  if (!ownAddresses.includes(asked)) {
    return NextResponse.json({ error: `Tests go to your own address, ${maskEmail(ownAddresses[0] ?? "")}. Add a subscriber to see it as they would.` }, { status: 403 })
  }

  /* The automation editor tests through here too, with its own two fields. */
  const flowFields = (v: unknown) =>
    typeof v === "string" ? v.replace(/\{\{\s*customer_name\s*\}\}/gi, "{{name}}").replace(/\{\{\s*product_name\s*\}\}/gi, "your product") : v
  /* From an email's page: the saved email itself, only if it is this creator's. */
  let source: { subject?: unknown; preview_text?: unknown; body?: unknown } = body
  if (typeof body.campaign_id === "string" && UUID.test(body.campaign_id)) {
    const { data: saved } = await ctx.admin.from("email_campaigns").select("subject, preview_text, body").eq("id", body.campaign_id).eq("creator_id", ctx.creatorId).maybeSingle()
    if (!saved) return NextResponse.json({ error: "This email was not found. It may have been deleted." }, { status: 404 })
    source = saved
  }
  const content = prepareContent({ subject: flowFields(source.subject), preview_text: source.preview_text, body: flowFields(source.body) })
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

  /* The body as the send renders it: the blocks read back out, in the brand's look as it is now. */
  const page = `${APP_URL}/unsubscribe`
  const reader = { name: sender.name, email: asked, creatorName: sender.name, storeName: sender.brand.name, storeUrl: sender.brand.storeUrl, unsubscribeUrl: page }
  const html = personalizeHtml(renderBlocks(content.blocks, themeOf(sender.brand)), reader).replace(/\{\{\s*unsubscribe_url\s*\}\}/gi, esc(page))
  const subject = personalizeSubject(content.subject, reader)
  const result = await sendMailgunOnce({
    to: asked,
    from: sender.from,
    replyTo: sender.replyTo,
    subject: `Test: ${subject}`,
    html: buildEmail({
      subject,
      previewText: personalizeSubject(content.previewText, reader),
      bodyHtml: html,
      brand: sender.brand,
      avatarUrl: sender.avatarUrl,
      kind: "marketing",
      unsubscribeUrl: page,
    }),
    text: emailText({ bodyHtml: html, brand: sender.brand, kind: "marketing", unsubscribeUrl: page }),
    tags: ["campaign-test"],
  })

  if (!result.success) {
    console.error(`[email/send-test] not sent to ${maskEmail(asked)}: ${result.status ?? (result.timedOut ? "timeout" : "no answer")}`)
    return NextResponse.json({ error: `The test was not sent. ${plainReason(result)}` }, { status: 502 })
  }
  return NextResponse.json({ success: true, sent_to: asked })
}
