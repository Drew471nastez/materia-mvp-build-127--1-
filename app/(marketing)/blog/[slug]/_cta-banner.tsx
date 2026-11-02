"use client"

/**
 * THE "START SELLING" BOX INSIDE AN ARTICLE. Its title follows what the post
 * is about (lib/blog/article ctaVariant: digital, physical, community), and
 * it goes to /signup tagged src=blog-<variant> and ref (the visit's own ref
 * when it arrived with one), which the signup page reads with
 * readSignupSource and reports to analytics.
 *
 * Round 49, the owner: "smoother, cleaner, less text, not only digital
 * products". A short title and one line on the left, one button on the
 * right (under them on a phone), on a white box with a hairline: quieter
 * than the grey box with a logo and an email field it replaces. Signup asks
 * for the email itself.
 *
 * A plain GET form to /signup: it works with no script. With script it also
 * carries the visit's ref and utm tags, as the comparison pages' buttons do.
 */
import { BLOG_CTA, type CtaVariant } from "@/lib/blog/article"
import { CARRIED_PARAMS, incomingTags } from "@/lib/alternatives/attribution"

export default function CtaBanner({ variant }: { variant: CtaVariant }) {
  const copy = BLOG_CTA[variant]
  const src = `blog-${variant}`

  function carry(e: React.FormEvent<HTMLFormElement>) {
    const form = e.currentTarget
    const tags = incomingTags(window.location.search)
    for (const k of CARRIED_PARAMS) {
      const v = tags[k]
      if (!v) continue
      const input = form.elements.namedItem(k) as HTMLInputElement | null
      if (input) input.value = v
      else {
        const add = document.createElement("input")
        add.type = "hidden"
        add.name = k
        add.value = v
        form.appendChild(add)
      }
    }
  }

  return (
    <section aria-labelledby="blog-cta-title" className="my-12 flex flex-col gap-4 rounded-2xl border border-[#e5e7eb] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:px-6" data-blog-cta={variant}>
      <div className="min-w-0">
        <h2 id="blog-cta-title" className="text-[18px] font-semibold leading-[1.3] tracking-[-0.01em] text-[#1a1a2e]">
          {copy.title}
        </h2>
        <p className="mt-1 text-pretty text-[15px] leading-[1.5] text-[#6b7280]">{copy.body}</p>
      </div>
      <form action="/signup" method="get" onSubmit={carry} className="shrink-0">
        <input type="hidden" name="intent" value="sell" />
        <input type="hidden" name="src" value={src} />
        <input type="hidden" name="ref" value={src} />
        <button type="submit" className="inline-flex h-11 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-[#1a1a2e] px-5 text-[15px] font-semibold text-white transition-colors hover:bg-[#2b2b42] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a1a2e] sm:w-auto">
          Start free
          <span aria-hidden>&rarr;</span>
        </button>
      </form>
    </section>
  )
}
