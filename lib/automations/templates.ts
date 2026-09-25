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
 * out under their name. A button is drawn in the editor's ink and wears the
 * creator's colour when it is sent (merge-fields brandButtons).
 */

import type { Audience, EntryRule, FlowStep, TriggerType } from "./flow-model"

export interface FlowTemplate {
  id: string
  name: string
  /** One line: what it is for, in the creator's terms. */
  purpose: string
  trigger: TriggerType
  entry: EntryRule
  /** Purchase flows that sell rather than serve the order. */
  audience?: Audience
  steps: FlowStep[]
}

const button = (text: string, field: string) =>
  `<p><a href="{{${field}}}" style="display:inline-block;padding:10px 18px;border-radius:8px;background-color:#1a1a2e;color:#ffffff;text-decoration:none;font-weight:600;">${text}</a></p>`

export const TEMPLATES: FlowTemplate[] = [
  {
    id: "welcome",
    name: "Welcome series",
    purpose: "Say hello to new subscribers, then check in a few days later.",
    trigger: "new_subscriber",
    entry: { mode: "after", days: 30 },
    steps: [
      {
        id: "welcome_1",
        type: "email",
        config: {
          subject: "Welcome, {{first_name}}",
          body: "<p>Hi {{first_name}},</p><p>Thanks for joining. I will send you new work, updates and the occasional offer, and nothing else.</p><p>If you want to say hello, reply to this email. I read every reply.</p>",
        },
      },
      { id: "welcome_wait", type: "wait", config: { amount: 3, unit: "days" } },
      {
        id: "welcome_2",
        type: "email",
        config: {
          subject: "What would help you most?",
          body: `<p>Hi {{first_name}},</p><p>You joined my list a few days ago. If there is something you would like me to make or write about, reply and tell me. It shapes what I work on next.</p>${button("See my products", "store_url")}`,
        },
      },
    ],
  },
  {
    id: "checkout_reminder",
    name: "Checkout reminder",
    purpose: "Remind someone who reached checkout and did not pay.",
    trigger: "abandoned_checkout",
    entry: { mode: "after", days: 7 },
    steps: [
      {
        id: "cart_1",
        type: "email",
        config: {
          subject: "You left {{product_name}} at checkout",
          body: `<p>Hi {{first_name}},</p><p>You started checking out {{product_name}} and did not finish. If the payment did not go through, you can pick up where you left off.</p>${button("Finish checkout", "checkout_url")}<p>If you have a question first, reply to this email.</p>`,
        },
      },
      { id: "cart_wait", type: "wait", config: { amount: 1, unit: "days" } },
      {
        id: "cart_2",
        type: "email",
        config: {
          subject: "Still thinking about {{product_name}}?",
          body: `<p>Hi {{first_name}},</p><p>A quick note in case my last email got buried. {{product_name}} is still here if you want it.</p>${button("See the product", "product_url")}<p>This is the last reminder I will send about it.</p>`,
        },
      },
    ],
  },
  {
    id: "first_order",
    name: "First order welcome",
    purpose: "Thank someone for their first order, then check it all worked.",
    trigger: "first_purchase",
    entry: { mode: "once" },
    steps: [
      {
        id: "first_1",
        type: "email",
        config: {
          subject: "Thanks for your first order, {{first_name}}",
          body: `<p>Hi {{first_name}},</p><p>Thank you for buying {{product_name}}. It means a lot that you picked something from {{store_name}}.</p><p>Your download stays on your order page, so you can come back to it any time.</p>${button("Open your order", "order_url")}<p>If anything is unclear, reply to this email and I will help.</p>`,
        },
      },
      { id: "first_wait", type: "wait", config: { amount: 5, unit: "days" } },
      {
        id: "first_2",
        type: "email",
        config: {
          subject: "Did everything work?",
          body: "<p>Hi {{first_name}},</p><p>It has been a few days since your first order. Did the download work, and is {{product_name}} what you hoped for?</p><p>Reply and tell me. If something is missing, I will sort it out.</p>",
        },
      },
    ],
  },
  {
    id: "thank_you",
    name: "Thank you after a purchase",
    purpose: "A personal note from you, right after someone buys.",
    trigger: "purchase",
    entry: { mode: "each" },
    steps: [
      {
        id: "thanks_1",
        type: "email",
        config: {
          subject: "Thank you for buying {{product_name}}",
          body: "<p>Hi {{first_name}},</p><p>Thank you for buying {{product_name}}. Your receipt and download link are in a separate email.</p><p>If anything is unclear or does not work, reply here and I will help.</p>",
        },
      },
    ],
  },
  {
    id: "how_to_use",
    name: "How to use it",
    purpose: "The day after a purchase, where to find it and how to get help.",
    trigger: "purchase",
    entry: { mode: "each" },
    steps: [
      { id: "use_wait", type: "wait", config: { amount: 1, unit: "days" } },
      {
        id: "use_1",
        type: "email",
        config: {
          subject: "Getting started with {{product_name}}",
          body: `<p>Hi {{first_name}},</p><p>Your files for {{product_name}} are on your order page whenever you need them. Download them once and keep a copy somewhere safe.</p>${button("Open your order", "order_url")}<p>Not sure where to begin? Reply with what you are working on and I will point you to the right place.</p>`,
        },
      },
    ],
  },
  {
    id: "check_in",
    name: "Check in after a week",
    purpose: "Ask a buyer how it is going, seven days after they bought.",
    trigger: "purchase",
    entry: { mode: "each" },
    steps: [
      { id: "checkin_wait", type: "wait", config: { amount: 7, unit: "days" } },
      {
        id: "checkin_1",
        type: "email",
        config: {
          subject: "How is {{product_name}} going?",
          body: "<p>Hi {{first_name}},</p><p>It has been a week since you bought {{product_name}}. How is it going?</p><p>If you have a minute, reply with what you think. I read every reply, and it helps me make the next one better.</p>",
        },
      },
    ],
  },
  {
    id: "review_request",
    name: "Ask for a review",
    purpose: "Ten days after a purchase, ask for a short review.",
    trigger: "purchase",
    entry: { mode: "each" },
    steps: [
      { id: "review_wait", type: "wait", config: { amount: 10, unit: "days" } },
      {
        id: "review_1",
        type: "email",
        config: {
          subject: "Would you review {{product_name}}?",
          body: `<p>Hi {{first_name}},</p><p>You bought {{product_name}} a little while ago. If you have a minute, a short review helps other people decide, and it helps me too.</p>${button("Leave a review", "review_url")}<p>Thank you. If something did not work as it should, reply here instead.</p>`,
        },
      },
    ],
  },
  {
    id: "win_back",
    name: "Bring buyers back",
    purpose: "Two months after a purchase, and only if they have not bought since.",
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
          subject: "New since you bought {{product_name}}",
          body: `<p>Hi {{first_name}},</p><p>It has been a couple of months since you bought {{product_name}}. I have made new things since then.</p>${button("See what is new", "store_url")}<p>Thanks for supporting my work.</p>`,
        },
      },
    ],
  },
]

export const BLANK_TEMPLATE = "blank"

export function templateById(id: string): FlowTemplate | null {
  return TEMPLATES.find((t) => t.id === id) ?? null
}
