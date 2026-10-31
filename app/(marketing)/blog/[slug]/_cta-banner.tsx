"use client"

/**
 * THE "START SELLING" BOX INSIDE AN ARTICLE. Its words follow what the post
 * is about (lib/blog/article ctaVariant: digital, physical, community), and
 * it goes to /signup tagged src=blog-<variant> and ref (the visit's own ref
 * when it arrived with one), which the signup page reads with
 * readSignupSource and reports to analytics.
 *
 * A plain GET form to /signup: with no script it still arrives at signup
 * with the email filled in. With script it also carries the visit's ref and
 * utm tags, as the comparison pages' buttons do.
 */
import { BLOG_CTA, type CtaVariant } from "@/lib/blog/article"
import { CARRIED_PARAMS, incomingTags } from "@/lib/alternatives/attribution"
import { StorelibLogo } from "@/components/brand/storelib-logo"

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
    <section aria-labelledby="blog-cta-title" className="my-12 rounded-2xl bg-[#f4f4f6] px-5 py-7 sm:px-8 sm:py-8" data-blog-cta={variant}>
      <h2 id="blog-cta-title" className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[22px] font-semibold leading-tight tracking-[-0.015em] text-[#1a1a2e] sm:text-[24px]">
        <StorelibLogo size={26} alt="" />
        {copy.title}
      </h2>
      <p className="mt-2 max-w-[46ch] text-[15.5px] leading-relaxed text-[#4b5563]">{copy.body}</p>
      <form action="/signup" method="get" onSubmit={carry} className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:gap-0 sm:rounded-xl sm:border sm:border-[#d4d7dc] sm:bg-white sm:p-1.5 sm:focus-within:border-[#1a1a2e]">
        <input type="hidden" name="intent" value="sell" />
        <input type="hidden" name="src" value={src} />
        <input type="hidden" name="ref" value={src} />
        <label htmlFor="blog-cta-email" className="sr-only">
          Email address
        </label>
        <input
          id="blog-cta-email"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="Your email address"
          className="h-12 min-w-0 flex-1 rounded-xl border border-[#d4d7dc] bg-white px-4 text-[16px] text-[#1a1a2e] placeholder:text-[#9ca3af] outline-none focus:border-[#1a1a2e] sm:h-11 sm:border-0 sm:px-3"
        />
        <button type="submit" className="inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] bg-[#16161a] px-5 text-[15px] font-semibold text-white transition-colors hover:bg-[#2c2c34] sm:h-11">
          Start free
        </button>
      </form>
      <p className="mt-3 text-[13px] text-[#6b7280]">Free plan, no monthly fee.</p>
    </section>
  )
}
