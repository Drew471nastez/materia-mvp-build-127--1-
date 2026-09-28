/**
 * A creator's update drawn as the email each member gets
 * (./update-email.ts sends it). Its own module, with nothing that sends or
 * reads the database, so the tests draw it exactly as it goes out.
 *
 * The creator's layout (lib/email-campaigns/template.ts buildEmail), with
 * the one picture of the creator an email carries (./sender.ts
 * senderPicture, applied inside buildEmail from the photo and the logo it is
 * given), marketing kind: a reason line and the way out in the footer.
 */
import { buildEmail, emailText } from "@/lib/email-campaigns/template"
import { renderBlocks } from "@/lib/email-campaigns/blocks"
import { themeOf, type Brand } from "@/lib/email-campaigns/brand"
import { esc } from "@/lib/email-campaigns/rich"
import { excerpt, type PostAttachment, type PostImage } from "./plan"
import { siteUrl, unsubscribeUrl } from "./server"

export interface PostForEmail {
  id: string
  product_id: string
  creator_id: string
  title: string
  body: string
  images: PostImage[]
  attachments: PostAttachment[]
}

/** The email for one member. Pure given the sender: the tests draw it. */
export function renderUpdateEmail(input: { post: PostForEmail; membershipId: string; membershipTitle: string; sender: { name: string; brand: Brand; avatarUrl: string | null } }) {
  const { post, sender } = input
  const readUrl = siteUrl(`/library/memberships/${input.membershipId}#post-${post.id}`)
  const leave = unsubscribeUrl(input.membershipId)
  const subject = (post.title || `New from ${sender.name}`).slice(0, 150)
  const paragraphs = post.body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.split("\n").map(esc).join("<br>")}</p>`)
    .join("")
  const files = post.attachments.length
  const more = post.images.length > 1 ? post.images.length - 1 : 0
  const extra = [more ? `${more} more ${more === 1 ? "picture" : "pictures"}` : "", files ? `${files} ${files === 1 ? "file" : "files"} attached` : ""].filter(Boolean).join(" and ")
  const rich = `${post.title ? `<h2>${esc(post.title)}</h2>` : ""}${paragraphs}${extra ? `<p><em>${esc(extra)} on the membership page.</em></p>` : ""}`
  const theme = themeOf(sender.brand)
  const bodyHtml = renderBlocks(
    [
      { id: "text", type: "rich", html: rich },
      ...(post.images[0] ? [{ id: "picture", type: "image" as const, src: post.images[0].url, alt: post.title || "", width: 100, align: "center" as const, href: readUrl }] : []),
      { id: "read", type: "button", label: "Read on the membership page", url: readUrl, align: "left", color: "" },
    ],
    theme,
  )
  const reason = `You are getting this because you are a member of ${input.membershipTitle || sender.name}.`
  const html = buildEmail({
    subject,
    previewText: excerpt(post, 120) || `${sender.name} posted an update for members.`,
    bodyHtml,
    brand: sender.brand,
    avatarUrl: sender.avatarUrl,
    kind: "marketing",
    reason,
    unsubscribeUrl: leave,
  })
  const text = emailText({ bodyHtml, brand: sender.brand, kind: "marketing", reason, unsubscribeUrl: leave })
  return { subject, html, text, readUrl, unsubscribeUrl: leave }
}

