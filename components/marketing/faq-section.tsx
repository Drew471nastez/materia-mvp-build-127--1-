"use client"

import { StoryHeading } from "./story-heading"

import Link from "next/link"
import { useState } from "react"
import { publicHelpUrl } from "@/lib/help/paths"
import { AnimateOnScroll } from "./animate-on-scroll"

const FAQS = [
  {
    q: "What is Storelib?",
    a: "Storelib is one place for creators to sell what they make: digital products, merch, courses and memberships, with a link-in-bio page, an online store and product pages, and a marketplace that brings more buyers to you. No technical setup, and no stack of six tools.",
  },
  {
    q: "What can I sell on Storelib?",
    a: "You can sell digital products (e-books, courses, templates, presets, music, software), offer services, showcase your portfolio, set up your link-in-bio, and more. If you create it, you can sell it on Storelib.",
  },
  {
    q: "What's the difference between Storelib and a link-in-bio tool?",
    a: "Link-in-bio tools just list your links. Storelib is a complete e-commerce platform. Real product pages, checkout, analytics, email capture. OnePage combines link-in-bio with actual selling power.",
  },
  {
    q: "Can I use my own domain?",
    a: "Yes, on Grow ($29 a month) and Pro ($99 a month). Your store lives at yourname.com.",
  },
  {
    q: "How fast do I get paid?",
    a: "Payments go directly through Stripe to your bank account. Typically 2 business days. No waiting weeks.",
  },
  {
    q: "What if I already sell on another platform?",
    a: "Start selling on Storelib alongside your current platform. Upload products, set up your store, redirect links when ready.",
  },
  {
    q: "Do I need any coding skills to set up my store?",
    a: "No. You set up your store, product pages and OnePage by dragging and dropping. Pick a layout, add your content, and you're live in minutes.",
  },
]

/*
  ONE QUESTION (landing round 4, the owner: the purple × on an open question
  looked bad). A plain row between hairlines: the question, and a thin plus in
  the text's own colour whose upright bar turns flat as the answer opens, so
  the plus becomes a minus. The answer opens by its grid row going from 0fr to
  1fr (the browser animates the height; nothing is measured, no state but
  which question is open), and fades in as it does. Under reduced motion it
  simply opens.
*/
const FAQ_CSS = `
.faq-list{border-top:1px solid #e9e9ee}
.faq-item{border-bottom:1px solid #e9e9ee}
.faq-q{display:flex;width:100%;align-items:center;justify-content:space-between;gap:24px;padding:22px 2px;text-align:left;color:#18181b;font-size:clamp(16px,1.25vw,18px);font-weight:500;letter-spacing:-.01em;line-height:1.4;background:none;border:0;cursor:pointer;transition:color .2s ease}
.faq-q:hover{color:#55535c}
.faq-q:focus-visible{outline:2px solid #18181b;outline-offset:4px;border-radius:6px}
.faq-mark{position:relative;flex:none;width:14px;height:14px;color:currentColor}
.faq-mark::before,.faq-mark::after{content:"";position:absolute;left:0;top:6.25px;width:14px;height:1.5px;border-radius:2px;background:currentColor;transition:transform .35s cubic-bezier(.22,1,.36,1)}
.faq-mark::after{transform:rotate(90deg)}
.faq-q[aria-expanded="true"] .faq-mark::after{transform:rotate(0deg)}
.faq-a{display:grid;grid-template-rows:0fr;transition:grid-template-rows .4s cubic-bezier(.22,1,.36,1)}
.faq-item[data-open] .faq-a{grid-template-rows:1fr}
.faq-a-in{min-height:0;overflow:hidden}
.faq-a p{margin:0;padding:0 48px 24px 2px;max-width:64ch;color:#6b6874;font-size:clamp(15px,1.1vw,16px);line-height:1.65;opacity:0;transform:translate3d(0,-4px,0);transition:opacity .3s ease,transform .4s cubic-bezier(.22,1,.36,1)}
.faq-item[data-open] .faq-a p{opacity:1;transform:none;transition-delay:.06s}
@media (prefers-reduced-motion:reduce){.faq-q,.faq-mark::before,.faq-mark::after,.faq-a,.faq-a p{transition:none}}
`

/*
  LANDING ROUND 9, THE HOME PAGE (the owner: "make the FAQ section actually
  like the reference"). A centred heading, then one centred column of light
  grey rows with a small gap between them, each a question with a plus at its
  right, and one small line under them with the two places to read more. The
  grey that round 8 took off the section is on each row now. The rows open and
  close the same way as before (the grid row from 0fr to 1fr, the plus turning
  into a minus), so nothing is measured and only the open row's own height
  moves. /pricing keeps the hairline list above.
*/
const FAQ_ROWS_CSS = `
.faq-rows{display:grid;gap:6px;border-top:0}
.faq-rows .faq-item{border-bottom:0;border-radius:10px;background:#f5f5f6}
.faq-rows .faq-q{gap:20px;padding:20px 18px;border-radius:10px}
.faq-rows .faq-q:hover{color:#18181b}
.faq-rows .faq-q:focus-visible{outline-offset:-2px;border-radius:10px}
.faq-rows .faq-mark{width:16px;height:16px;color:#3f3f46}
.faq-rows .faq-mark::before,.faq-rows .faq-mark::after{top:7.25px;width:16px}
.faq-rows .faq-a p{padding:0 44px 22px 18px;max-width:none;color:#55535c}
.faq-more{margin:28px 0 0;text-align:center;color:#6b6874;font-size:15px;line-height:1.6}
.faq-more a{color:#18181b;text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:3px;text-decoration-color:#c9c9d1}
.faq-more a:hover{text-decoration-color:#18181b}
.faq-more a:focus-visible{outline:2px solid #18181b;outline-offset:3px;border-radius:4px}
@media (hover:hover){.faq-rows .faq-item:hover{background:#efeff1}}
@media (min-width:640px){.faq-rows .faq-q{padding:25px 30px}.faq-rows .faq-a p{padding:0 76px 26px 30px}.faq-more{margin-top:36px}}
`

function FaqItem({ faq, index, isOpen, onToggle }: { faq: typeof FAQS[number]; index: number; isOpen: boolean; onToggle: () => void }) {
  const id = `faq-a-${index}`
  return (
    <div className="faq-item" data-open={isOpen ? "" : undefined}>
      <h3 className="m-0">
        <button type="button" className="faq-q" aria-expanded={isOpen} aria-controls={id} id={`faq-q-${index}`} onClick={onToggle}>
          <span>{faq.q}</span>
          <span className="faq-mark" aria-hidden="true" />
        </button>
      </h3>
      {/* inert while closed: a closed answer is not read out and holds no tab stop. */}
      <div className="faq-a" id={id} role="region" aria-labelledby={`faq-q-${index}`} inert={!isOpen}>
        <div className="faq-a-in">
          <p>{faq.a}</p>
        </div>
      </div>
    </div>
  )
}

export function FaqSection({ editorial = false }: { editorial?: boolean } = {}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const items = FAQS.map((faq, i) => (
    <FaqItem key={i} faq={faq} index={i} isOpen={openIndex === i} onToggle={() => setOpenIndex(openIndex === i ? null : i)} />
  ))

  if (editorial) {
    return (
      /*
        Landing round 7: the questions stand in the page's one width. Round 8:
        no light grey box behind them; the section is the white sheet itself
        (the inline background beats the grey ground app/globals.css gives
        [data-story-section="faq"]). Round 9: inside that width, one centred
        880px column, as in the owner's reference.
      */
      <section
        data-story-section="faq"
        data-faq-plain=""
        className="py-20 sm:py-28 home-wrap !max-w-[var(--home-max)] !px-[var(--home-edge)] !rounded-none"
        style={{ background: "transparent" }}
        id="faq"
      >
        <style href="faq-section" precedence="default">{FAQ_CSS}</style>
        <style href="faq-section-rows" precedence="default">{FAQ_ROWS_CSS}</style>
        <div data-faq-column="" className="!mx-auto w-full !max-w-[880px] !px-0">
          <AnimateOnScroll variant="fade-up">
            <div className="story-section-heading !mx-auto !mb-9 w-full !text-center sm:!mb-12">
              <StoryHeading text="Frequently asked questions" accent={["questions"]} />
            </div>
            <div className="faq-list faq-rows">{items}</div>
            <p className="faq-more">
              More questions? Browse <Link href="/faq">all FAQs</Link> or visit the <a href={publicHelpUrl()}>help center</a>.
            </p>
          </AnimateOnScroll>
        </div>
      </section>
    )
  }

  return (
    <section className="py-20 sm:py-28 bg-[#fafafa]" id="faq">
      <div className="max-w-[1200px] mx-auto px-6">
        <AnimateOnScroll variant="slide-right">
          {/*
            Wave 13: the heading and its line had a 280 to 320px column, so a
            62px heading broke a word to a line. They stack over the answers
            until there is room for a 420px column beside them.
          */}
          <div className="flex flex-col lg:flex-row lg:gap-20 xl:gap-24">
            {/* Left: title */}
            <div className="lg:w-[420px] xl:w-[460px] shrink-0 mb-10 lg:mb-0 lg:sticky lg:top-32 lg:self-start max-w-[640px]">
              <h2 className="text-[clamp(30px,4vw,42px)] font-bold tracking-tight leading-[1.15] mb-3">
                Faq
              </h2>
              <p className="text-base text-neutral-500 leading-relaxed">
                Everything you need to know about Storelib.
              </p>
            </div>

            {/* Right: accordion */}
            <div className="faq-list flex-1 min-w-0">
              <style href="faq-section" precedence="default">{FAQ_CSS}</style>
              {items}
            </div>
          </div>
        </AnimateOnScroll>
      </div>
    </section>
  )
}
