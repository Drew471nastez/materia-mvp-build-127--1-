/**
 * ===========================================================================
 *  THE PAGES EVERY SHOP NEEDS AND NOBODY WANTS TO WRITE
 * ===========================================================================
 * A refund policy, a privacy policy and terms of service. Every real store
 * has them, payment processors ask for them, and a creator who has just built
 * a website is not going to stop and write three legal pages from nothing. So
 * the website arrives with them, the way it arrives with a home page: real
 * pages, in the page switcher, made of ordinary sections, linked from the
 * footer, and editable like anything else.
 *
 * THEY ARE TEMPLATES, NOT LEGAL ADVICE, and they are written to look like it.
 * Every place that has to say something specific about the business is a
 * bracketed placeholder, so an unedited page reads as obviously unfinished
 * rather than as a confident statement about a refund window nobody chose.
 * That is deliberate: a wrong policy presented as finished is worse than no
 * policy, because somebody will rely on it.
 *
 * PURE. No database, no Supabase, no request. What turns these into rows is
 * ensure-policy-pages.ts, and what puts them on a NEW theme is the preset in
 * theme-registry. This file is the content and the shape, so a test can read
 * both without a network.
 */

import type { SectionInstance } from "./types"

export interface PolicyPage {
  /** The page key, which is also the address: /refund-policy. */
  key: string
  /** What the page switcher and the footer link call it. */
  title: string
  /** The body, as the richtext a `rich_text` section takes. */
  body: (brand: string) => string
}

const today = () => new Date().toISOString().slice(0, 10)

/**
 * Written as short numbered sections rather than a wall of prose, because the
 * first thing a creator does is delete the parts that do not apply, and that
 * is much easier when the parts are separable.
 */
export const POLICY_PAGES: PolicyPage[] = [
  {
    key: "refund-policy",
    title: "Refund Policy",
    body: (brand) => `<p><em>Last updated: ${today()}</em></p>
<p>This policy explains when you can ask ${brand} for a refund and how to do it. Replace anything in square brackets with your own terms before you publish.</p>
<h3>Returns</h3>
<p>You have [30] days from the day you receive your order to request a return. To be eligible, the item must be in the condition you received it, unused, and in its original packaging, and you will need the receipt or proof of purchase.</p>
<h3>Digital products</h3>
<p>Because digital downloads are available immediately, they are [not refundable once downloaded, except where the file is faulty or not as described]. If something you bought does not work, contact us and we will put it right.</p>
<h3>Damaged or wrong items</h3>
<p>Check your order as soon as it arrives. If anything is damaged, faulty, or not what you ordered, tell us within [14] days and we will arrange a replacement or a refund.</p>
<h3>How to start a return</h3>
<p>Email [your@email.com] with your order number and what you would like to happen. We will reply within [2 working days] and tell you where to send the item. Items sent back without asking first cannot be accepted.</p>
<h3>Refunds</h3>
<p>Once we have received and checked the return we will let you know whether the refund was approved. An approved refund goes back to your original payment method within [10] working days. Banks and card providers usually take a few days more to show it.</p>
<h3>Exceptions</h3>
<p>We cannot refund [perishable goods, custom or personalised items, gift cards, or sale items]. Ask us before ordering if you are unsure.</p>
<h3>Contact</h3>
<p>Questions about this policy: [your@email.com].</p>`,
  },
  {
    key: "privacy-policy",
    title: "Privacy Policy",
    body: (brand) => `<p><em>Last updated: ${today()}</em></p>
<p>This policy explains what ${brand} does with your personal information when you visit this website or buy something. Replace anything in square brackets with your own details before you publish.</p>
<h3>What we collect</h3>
<p>When you place an order we collect your name, billing and delivery address, email address, phone number and what you bought. Payment card details go straight to our payment provider and are never stored by us.</p>
<p>When you browse, we collect information about your device and how you use the site, which helps us keep it working and understand what people are looking for.</p>
<h3>Why we use it</h3>
<p>To take and deliver your order, to answer you when you get in touch, to prevent fraud, to meet our legal obligations, and, if you have asked for it, to send you marketing. You can unsubscribe from marketing at any time using the link in any email.</p>
<h3>Who we share it with</h3>
<p>Only the services that make the shop work: our payment provider, our delivery partner, and the platform hosting this website. Each of them may only use your information to do their part. We do not sell your personal information.</p>
<h3>How long we keep it</h3>
<p>Order records are kept for [7 years] because tax rules require it. Anything else is kept only while it is needed for the reason it was collected.</p>
<h3>Your rights</h3>
<p>You can ask for a copy of the information we hold about you, ask us to correct it, or ask us to delete it. Write to [your@email.com] and we will reply within [30] days.</p>
<h3>Cookies</h3>
<p>This site uses cookies to keep your basket, remember your choices, and measure how the site is used. You can block cookies in your browser, though parts of the shop may stop working if you do.</p>
<h3>Contact</h3>
<p>[Your business name], [your business address]. Questions about this policy: [your@email.com].</p>`,
  },
  {
    key: "terms-of-service",
    title: "Terms Of Service",
    body: (brand) => `<p><em>Last updated: ${today()}</em></p>
<p>These terms cover your use of this website and anything you buy from ${brand}. By using the site you agree to them. Replace anything in square brackets with your own terms before you publish.</p>
<h3>Who we are</h3>
<p>This shop is run by [Your business name], [your business address], [company or tax number if you have one].</p>
<h3>Orders</h3>
<p>An order is an offer to buy. It is accepted when we send you confirmation. If we cannot fulfil an order, or a price or description was wrong, we may cancel it and refund you in full.</p>
<h3>Prices and payment</h3>
<p>Prices are shown in [your currency] and include [tax / exclude tax, which is added at checkout]. Payment is taken when the order is placed. Delivery costs are shown before you pay.</p>
<h3>Delivery</h3>
<p>We aim to dispatch within [2 working days]. Delivery times are estimates, not guarantees, and anything outside our control may delay them. Risk passes to you when the order is delivered.</p>
<h3>Cancelling and returning</h3>
<p>Your right to cancel and return is set out in our refund policy, which forms part of these terms.</p>
<h3>Digital products and licences</h3>
<p>Anything you download is licensed to you for [personal, non-commercial use]. You may not resell, redistribute, or claim it as your own work.</p>
<h3>Our content</h3>
<p>The text, images and design on this site belong to us or to whoever licensed them to us. Please do not copy them without asking.</p>
<h3>Acceptable use</h3>
<p>Do not use this site to break the law, to interfere with how it works, or to collect other people's information.</p>
<h3>Liability</h3>
<p>Nothing here limits liability where the law does not allow it, including for death or personal injury caused by negligence, or for fraud. Otherwise our liability for any order is limited to what you paid for it.</p>
<h3>Changes</h3>
<p>We may update these terms. The version published here when you place an order is the one that applies to it.</p>
<h3>Law</h3>
<p>These terms are governed by the law of [your country], and its courts have jurisdiction.</p>
<h3>Contact</h3>
<p>[your@email.com].</p>`,
  },
]

/**
 * A SHIPPING POLICY, WRITTEN WHEN IT IS WANTED. Not every shop ships
 * anything, so it is not one of the pages every site is given: the footer
 * lists it only once a page for it exists (footer-settings.ts,
 * SHIPPING_KEYS). Website Settings › Policies offers it with the other
 * three, and "Use template" is what creates the page, with this text in it.
 */
export const SHIPPING_POLICY: PolicyPage = {
  key: "shipping-policy",
  title: "Shipping Policy",
  body: (brand) => `<p><em>Last updated: ${today()}</em></p>
<p>This policy explains how ${brand} gets your order to you. Replace anything in square brackets with your own terms before you publish.</p>
<h3>Where we ship</h3>
<p>We ship to [your countries or regions]. If your address is not on the list, contact us before ordering.</p>
<h3>Processing time</h3>
<p>Orders are packed and sent within [2 working days]. Orders placed on weekends or holidays are sent the next working day.</p>
<h3>Delivery times and costs</h3>
<p>[Standard delivery: 3 to 5 working days, price]. [Express delivery: 1 to 2 working days, price]. The cost for your address is shown at checkout before you pay.</p>
<h3>Digital products</h3>
<p>Downloads are available as soon as payment goes through, from the confirmation page and the email we send you. Nothing is shipped.</p>
<h3>Tracking</h3>
<p>When your order leaves us you get an email with a tracking link where the carrier offers one.</p>
<h3>Customs and import fees</h3>
<p>Orders sent outside [your country] may be charged import duties or taxes on arrival. These are set by the destination country and paid by the recipient.</p>
<h3>Lost or late parcels</h3>
<p>If your order has not arrived within [10] working days of dispatch, email [your@email.com] with your order number and we will look into it with the carrier.</p>`,
}

/** Every policy Website Settings edits: the three every site has, then shipping. */
export const EDITABLE_POLICIES: PolicyPage[] = [...POLICY_PAGES, SHIPPING_POLICY]

export const POLICY_PAGE_KEYS: string[] = POLICY_PAGES.map((p) => p.key)

export function isPolicyPageKey(key: string): boolean {
  return POLICY_PAGE_KEYS.includes(key)
}

let counter = 0
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`

/**
 * The sections one policy page is made of.
 *
 * The header and footer are PASSED IN rather than built, because they are the
 * same on every page of a site and a page that invents its own arrives with a
 * factory header on a site that has been rebranded. Where the site has none
 * yet, the page is simply its content, which is what the renderer expects.
 */
export function policyPageSections(
  page: PolicyPage,
  opts: { brand: string; header?: SectionInstance; footer?: SectionInstance },
): SectionInstance[] {
  const body: SectionInstance = {
    id: newId(page.key),
    type: "rich_text",
    name: page.title,
    settings: {
      heading: page.title,
      body: page.body(opts.brand),
      /**
       * Narrow, left and generously spaced. A policy is read, not scanned,
       * and centred text at full width is the layout nobody finishes.
       */
      alignment: "left",
      max_width: "narrow",
      color_scheme: "white",
      padding_top: 80,
      padding_bottom: 80,
    },
    blocks: [],
    hidden: false,
  }
  return [opts.header, body, opts.footer].filter(Boolean) as SectionInstance[]
}

/** What the footer's link column is called. */
export const POLICY_COLUMN_HEADING = "Legal"

/**
 * The footer blocks that link to the policies.
 *
 * `footer_column` opens a column and the `footer_link`s after it belong to
 * it, which is how the footer section already reads its blocks, so these are
 * appended in that order and nothing else about the footer is touched.
 */
export function policyFooterBlocks(): NonNullable<SectionInstance["blocks"]> {
  return [
    { id: newId("fcol"), type: "footer_column", settings: { heading: POLICY_COLUMN_HEADING } },
    ...POLICY_PAGES.map((p) => ({
      id: newId("flink"),
      type: "footer_link",
      settings: { label: p.title, url: `/${p.key}` },
    })),
  ] as NonNullable<SectionInstance["blocks"]>
}

/**
 * The same footer with the policy links in it, or the footer unchanged.
 *
 * IDEMPOTENT, and that is the whole point: this runs on every load of an
 * existing site, and a creator who deleted the Legal column did that on
 * purpose. A link is "already there" if anything in the footer points at that
 * address, whatever it has been renamed to, so a renamed link is not
 * duplicated either.
 */
export function withPolicyLinks(footer: SectionInstance): SectionInstance {
  const blocks = footer.blocks ?? []
  const urls = new Set(
    blocks
      .map((b) => String((b.settings as Record<string, unknown> | undefined)?.url ?? "").trim().toLowerCase())
      .filter(Boolean),
  )
  const missing = POLICY_PAGES.filter((p) => !urls.has(`/${p.key}`))
  if (missing.length === 0) return footer
  /**
   * All three or none. Adding one link to a footer that already has the other
   * two would put a second Legal column beside the first.
   */
  if (missing.length !== POLICY_PAGES.length) {
    const extra = missing.map((p) => ({
      id: newId("flink"),
      type: "footer_link",
      settings: { label: p.title, url: `/${p.key}` },
    })) as NonNullable<SectionInstance["blocks"]>
    return { ...footer, blocks: [...blocks, ...extra] }
  }
  return { ...footer, blocks: [...blocks, ...policyFooterBlocks()] }
}
