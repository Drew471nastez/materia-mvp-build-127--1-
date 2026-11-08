/**
 * The flows a creator can start from. Each one is a trigger and steps that
 * work as they are: a creator who turns one on without changing a word sends
 * something true, with every field filled (lib/automations/merge-fields).
 *
 * Only what the platform actually starts is here (flow-model TRIGGERS says
 * where each trigger is emitted). There is no birthday flow: nothing records
 * a birthday. tests/automation-templates.test.ts runs every one of these end
 * to end, from the trigger to the send, the retry and the open.
 *
 * The copy is plain and short, in the creator's own voice, because it goes
 * out under their name, and it signs off with {{creator_name}}: the name on
 * their profile when each email is sent, never a bracketed name to fill in.
 * A button is drawn in the editor's ink and wears the creator's colour when
 * it is sent (merge-fields brandButtons).
 */

import type { Audience, EntryRule, FlowStep, TriggerType } from "./flow-model"
import { tt } from "@/lib/i18n/text"

export interface FlowTemplate {
  id: string
  name: string
  /** One line: what it is for, in the creator's terms. */
  purpose: string
  trigger: TriggerType
  entry: EntryRule
  /** Purchase flows that sell rather than serve the order. */
  audience?: Audience
  /** Purchase flows only (round 51): the kinds of product that start it, products.type. */
  productKinds?: string[]
  steps: FlowStep[]
}

const button = (text: string, field: string) =>
  `<p><a href="{{${field}}}" style="display:inline-block;padding:10px 18px;border-radius:8px;background-color:#1a1a2e;color:#ffffff;text-decoration:none;font-weight:600;">${text}</a></p>`

export const TEMPLATES: FlowTemplate[] = [
  {
    id: "welcome",
    name: "Welcome series",
    get purpose() { return tt("Say hello to new subscribers, then check in a few days later.") },
    trigger: "new_subscriber",
    entry: { mode: "after", days: 30 },
    steps: [
      {
        id: "welcome_1",
        type: "email",
        config: {
          get subject() { return tt("Welcome, {{first_name}}") },
          body: "<p>Hi {{first_name}},</p><p>Thanks for signing up. You will hear from me when I have something new, and now and then about a sale. That is all.</p><p>You can reply to any of my emails. It comes straight to me.</p><p>{{creator_name}}</p>",
        },
      },
      { id: "welcome_wait", type: "wait", config: { amount: 3, unit: "days" } },
      {
        id: "welcome_2",
        type: "email",
        config: {
          get subject() { return tt("Can I ask you something?") },
          get body() { return `<p>Hi {{first_name}},</p><p>Quick question: what made you sign up? Reply with a line or two. It helps me decide what to make next.</p>${button(tt("See what I have made"), "store_url")}<p>{{creator_name}}</p>` },
        },
      },
    ],
  },
  {
    id: "checkout_reminder",
    name: "Checkout reminder",
    get purpose() { return tt("Remind someone who reached checkout and did not pay.") },
    trigger: "abandoned_checkout",
    entry: { mode: "after", days: 7 },
    steps: [
      {
        id: "cart_1",
        type: "email",
        config: {
          get subject() { return tt("You left {{product_name}} at checkout") },
          get body() { return `<p>Hi {{first_name}},</p><p>You got as far as checkout with {{product_name}} and stopped there. If the payment failed or something looked off, you can pick up where you left off.</p>${button(tt("Finish checkout"), "checkout_url")}<p>Got a question first? Just reply.</p><p>{{creator_name}}</p>` },
        },
      },
      { id: "cart_wait", type: "wait", config: { amount: 1, unit: "days" } },
      {
        id: "cart_2",
        type: "email",
        config: {
          get subject() { return tt("Still thinking about {{product_name}}?") },
          get body() { return `<p>Hi {{first_name}},</p><p>One more note about {{product_name}}, in case my last email got buried. It is still there if you want it.</p>${button(tt("Take another look"), "product_url")}<p>I will not email you about it again.</p><p>{{creator_name}}</p>` },
        },
      },
    ],
  },
  {
    id: "first_order",
    name: "First order welcome",
    get purpose() { return tt("Thank someone for their first order, then check it all worked.") },
    trigger: "first_purchase",
    entry: { mode: "once" },
    steps: [
      {
        id: "first_1",
        type: "email",
        config: {
          get subject() { return tt("Thanks for your first order, {{first_name}}") },
          get body() { return `<p>Hi {{first_name}},</p><p>Thank you for buying {{product_name}}. It is your first order from {{store_name}}, and I am glad you picked it.</p><p>Your download is on your order page. Keep the link and you can go back to it whenever you like.</p>${button(tt("Open your order"), "order_url")}<p>If something does not work, reply and I will sort it out.</p><p>{{creator_name}}</p>` },
        },
      },
      { id: "first_wait", type: "wait", config: { amount: 5, unit: "days" } },
      {
        id: "first_2",
        type: "email",
        config: {
          get subject() { return tt("Did the download work?") },
          body: "<p>Hi {{first_name}},</p><p>Checking in a few days after your order. Did {{product_name}} download all right, and is it what you expected?</p><p>If anything is missing or confusing, reply and tell me. I will fix it.</p><p>{{creator_name}}</p>",
        },
      },
    ],
  },
  {
    id: "thank_you",
    name: "Thank you after a purchase",
    get purpose() { return tt("A personal note from you, right after someone buys.") },
    trigger: "purchase",
    entry: { mode: "each" },
    steps: [
      {
        id: "thanks_1",
        type: "email",
        config: {
          get subject() { return tt("Thank you for buying {{product_name}}") },
          get body() { return `<p>Hi {{first_name}},</p><p>Thank you for buying {{product_name}}. It means a lot.</p><p>Your receipt and download link are in a separate email, and your order page has them too:</p>${button(tt("Open your order"), "order_url")}<p>If anything is unclear, reply to this email. It comes straight to me.</p><p>Thanks again,<br>{{creator_name}}</p>` },
        },
      },
    ],
  },
  {
    id: "how_to_use",
    name: "How to use it",
    get purpose() { return tt("The day after a purchase, where to find it and how to get help.") },
    trigger: "purchase",
    entry: { mode: "each" },
    steps: [
      { id: "use_wait", type: "wait", config: { amount: 1, unit: "days" } },
      {
        id: "use_1",
        type: "email",
        config: {
          get subject() { return tt("Getting started with {{product_name}}") },
          get body() { return `<p>Hi {{first_name}},</p><p>A quick note now that you have had {{product_name}} for a day. Your files are on your order page. Download them once and keep a copy somewhere you will find it.</p>${button(tt("Open your order"), "order_url")}<p>Not sure where to start? Reply with what you are working on and I will point you to the right part.</p><p>{{creator_name}}</p>` },
        },
      },
    ],
  },
  {
    id: "check_in",
    name: "Check in after a week",
    get purpose() { return tt("Ask a buyer how it is going, seven days after they bought.") },
    trigger: "purchase",
    entry: { mode: "each" },
    steps: [
      { id: "checkin_wait", type: "wait", config: { amount: 7, unit: "days" } },
      {
        id: "checkin_1",
        type: "email",
        config: {
          get subject() { return tt("How is {{product_name}} going?") },
          body: "<p>Hi {{first_name}},</p><p>It has been a week since you bought {{product_name}}. How is it going so far?</p><p>If you have a minute, reply with a sentence or two. I read every one, and it shapes what I make next.</p><p>{{creator_name}}</p>",
        },
      },
    ],
  },
  {
    id: "review_request",
    name: "Ask for a review",
    get purpose() { return tt("Ten days after a purchase, ask for a short review.") },
    trigger: "purchase",
    entry: { mode: "each" },
    steps: [
      { id: "review_wait", type: "wait", config: { amount: 10, unit: "days" } },
      {
        id: "review_1",
        type: "email",
        config: {
          get subject() { return tt("Would you review {{product_name}}?") },
          get body() { return `<p>Hi {{first_name}},</p><p>If you have a minute, would you leave a short review of {{product_name}}? A few honest words help other people decide, and they help me too.</p>${button(tt("Leave a review"), "review_url")}<p>If something did not work, reply here instead and I will fix it.</p><p>Thank you,<br>{{creator_name}}</p>` },
        },
      },
    ],
  },
  {
    id: "win_back",
    name: "Bring buyers back",
    get purpose() { return tt("Two months after a purchase, and only if they have not bought since.") },
    trigger: "purchase",
    entry: { mode: "each" },
    audience: "subscribers",
    steps: [
      { id: "winback_wait", type: "wait", config: { amount: 60, unit: "days" } },
      { id: "winback_check", type: "condition", config: { check: "no_purchase_since_entry" } },
      {
        id: "winback_1",
        type: "email",
        config: {
          get subject() { return tt("New since you bought {{product_name}}") },
          get body() { return `<p>Hi {{first_name}},</p><p>It has been a couple of months since you bought {{product_name}}. I have made a few new things since then that you might like.</p>${button(tt("See what is new"), "store_url")}<p>Thanks for supporting my work.</p><p>{{creator_name}}</p>` },
        },
      },
    ],
  },
]

/*
  ROUND 51: ONBOARDING, ONLY WHERE A TRIGGER REALLY FIRES.

  Course onboarding is a purchase flow that starts only when what was bought
  is a course (trigger_config.product_kinds, engine.ts enroll reads each
  product's type). Every course order already fires "purchase", free claims
  included.

  Membership onboarding starts when a membership sold on its own first gives
  access (lib/memberships/sync.ts, the "started" change), once per
  membership. The Membership started email (Emails › Settings › Customer
  emails) already goes out at that moment with what they pay, so this one
  waits a day and is about using it: not a second email for the same event.

  Left out on purpose: a community welcome (the community already sends its
  Welcome email and its chat welcome), a renewal reminder and a membership
  ended note (both are customer emails already), a follow-up after a form
  (a form's answer with consent already starts "joins your list"; without
  consent nothing promotional may go).
*/
TEMPLATES.push(
  {
    id: "course_onboarding",
    name: "Course onboarding",
    get purpose() { return tt("Help someone start a course they just got, then check in a few days later.") },
    trigger: "purchase",
    entry: { mode: "each" },
    productKinds: ["course"],
    steps: [
      { id: "course_wait", type: "wait", config: { amount: 1, unit: "hours" } },
      {
        id: "course_1",
        type: "email",
        config: {
          get subject() { return tt("Start here: {{product_name}}") },
          get body() { return `<p>Hi {{first_name}},</p><p>You are in {{product_name}}. The best way to start is the first lesson, today, even if it is only ten minutes.</p>${button(tt("Open the course"), "order_url")}<p>Stuck on something? Reply to this email and I will help.</p><p>{{creator_name}}</p>` },
        },
      },
      { id: "course_wait_2", type: "wait", config: { amount: 4, unit: "days" } },
      {
        id: "course_2",
        type: "email",
        config: {
          get subject() { return tt("How is {{product_name}} going?") },
          body: "<p>Hi {{first_name}},</p><p>A few days in. How far have you got with {{product_name}}? If a lesson was unclear, reply and tell me which one.</p><p>{{creator_name}}</p>",
        },
      },
    ],
  },
  {
    id: "membership_onboarding",
    name: "Membership onboarding",
    get purpose() { return tt("The day after someone starts a membership, show them what it includes.") },
    trigger: "membership_started",
    entry: { mode: "each" },
    steps: [
      { id: "member_wait", type: "wait", config: { amount: 1, unit: "days" } },
      {
        id: "member_1",
        type: "email",
        config: {
          get subject() { return tt("Getting the most from {{product_name}}") },
          get body() { return `<p>Hi {{first_name}},</p><p>Thanks for joining {{product_name}}. Here is where everything is, so you can use it from day one.</p>${button(tt("Open your membership"), "product_url")}<p>If you are not sure where to start, reply and tell me what you are after.</p><p>{{creator_name}}</p>` },
        },
      },
    ],
  },
)

export const BLANK_TEMPLATE = "blank"

export function templateById(id: string): FlowTemplate | null {
  return TEMPLATES.find((t) => t.id === id) ?? null
}
