import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { looksLikeRequestToken, verifyDraft } from "@/lib/reviews/request-token"
import { draftView } from "@/lib/reviews/site-server"
import { mediaUrl } from "@/lib/storage/media-url"

export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  CONFIRM A WEBSITE REVIEW (Storelib Reviews)
 * ===========================================================================
 * /review/confirm/<token>, from the email sent to the address typed into a
 * website's review form. Opening it posts nothing (mail scanners open
 * links); the button does (/api/reviews/confirm), and the page then says
 * where the review is. Never indexed, no Referer.
 */
export const metadata: Metadata = {
  title: "Confirm your review",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

const WORDS: Record<string, string> = {
  posted: "Thanks. Your review is up.",
  pending: "Thanks. Your review shows once the store has read it.",
  closed: "This link doesn't work any more. Links last seven days, and each one posts a review once.",
}

export default async function ConfirmReviewPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token } = await params
  const query = await searchParams
  if (!looksLikeRequestToken(token)) notFound()
  const id = verifyDraft(token)
  if (!id) notFound()
  const view = await draftView(createAdminClient(), id)
  const failed = typeof query.error === "string" && view.state === "waiting"
  const back = typeof query.back === "string" && query.back.length <= 1000 && /^https:\/\//.test(query.back) ? query.back : null
  const image = mediaUrl(view.product?.thumbnail_url) ?? null
  const title = view.product?.title || "Your review"
  return (
    <main className="min-h-[100dvh] bg-[#f8f9fa] px-4 pb-[calc(40px+env(safe-area-inset-bottom))] pt-[calc(28px+env(safe-area-inset-top))] sm:pt-14" data-review-confirm={view.state}>
      <div className="mx-auto w-full max-w-[520px]">
        <p className="text-[13px] font-medium text-[#6b7280]">{view.storeName}</p>
        <div className="mt-3 flex items-center gap-3.5">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" width={56} height={56} className="h-14 w-14 shrink-0 rounded-xl border border-[#e5e7eb]/70 bg-white object-cover" />
          ) : (
            <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#eceef1] text-[18px] font-semibold text-[#4b5563]">
              {title.slice(0, 1).toUpperCase()}
            </span>
          )}
          <h1 className="min-w-0 text-[22px] font-bold leading-tight text-[#1a1a2e] sm:text-[24px]">{view.state === "waiting" ? "Post your review?" : title}</h1>
        </div>
        <section className="mt-6 rounded-2xl border border-[#e5e7eb]/60 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-6">
          {view.state === "waiting" && view.draft ? (
            <>
              <p className="text-[15px] font-semibold text-[#1a1a2e]">
                {"★".repeat(view.draft.rating)}
                <span className="text-[#dcdfe4]">{"★".repeat(5 - view.draft.rating)}</span>
              </p>
              {view.draft.title ? <p className="mt-2 text-[15px] font-semibold text-[#1a1a2e] [overflow-wrap:anywhere]">{view.draft.title}</p> : null}
              <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-[#374151] [overflow-wrap:anywhere]">{view.draft.content}</p>
              {view.draft.reviewer_name ? <p className="mt-2 text-[13px] text-[#6b7280]">By {view.draft.reviewer_name}</p> : null}
              {failed ? <p role="alert" className="mt-4 rounded-xl bg-[#fef3f2] px-3.5 py-2.5 text-[14px] text-[#b42318]">That didn&apos;t go through. Try again.</p> : null}
              <form method="post" action="/api/reviews/confirm" className="mt-5">
                <input type="hidden" name="token" value={token} />
                {/* The website page it was written on: posting sends the buyer back there (app/api/reviews/confirm). */}
                {back ? <input type="hidden" name="back" value={back} /> : null}
                <button type="submit" className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#1a1a2e] text-[15px] font-semibold text-white transition-colors hover:bg-[#2a2a40]" data-review-confirm-button="">
                  Post my review
                </button>
              </form>
              <p className="mt-3 text-[13px] text-[#6b7280]">Didn&apos;t write this? Close this page and nothing is posted.</p>
            </>
          ) : (
            <p className="text-[15px] leading-relaxed text-[#374151]">{WORDS[view.state] ?? WORDS.closed}</p>
          )}
        </section>
      </div>
    </main>
  )
}
