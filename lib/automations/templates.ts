/**
 * The flows a creator can start from. Each one is a trigger and steps that
 * work as they are: a creator who turns one on without changing a word sends
 * something true. Only what the platform can actually trigger is here. There
 * is no abandoned checkout: nothing records a checkout that was started and
 * left with an address, so a flow for it would never run.
 */

import type { EntryRule, FlowStep, TriggerType } from "./flow-model"

export interface FlowTemplate {
  id: string
  name: string
  /** One line: what it is for, in the creator's terms. */
  purpose: string
  trigger: TriggerType
  entry: EntryRule
  steps: FlowStep[]
}

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
          body: "<p>Hi {{first_name}},</p><p>You joined my list a few days ago. If there is something you would like me to make or write about, reply and tell me. It shapes what I work on next.</p><p><a href=\"{{store_url}}\" style=\"display:inline-block;padding:10px 18px;border-radius:8px;background-color:#1a1a2e;color:#ffffff;text-decoration:none;font-weight:600;\">See my products</a></p>",
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
    id: "win_back",
    name: "Bring buyers back",
    purpose: "Two months after a purchase, and only if they have not bought since.",
    trigger: "purchase",
    entry: { mode: "each" },
    steps: [
      { id: "winback_wait", type: "wait", config: { amount: 60, unit: "days" } },
      { id: "winback_check", type: "condition", config: { check: "no_purchase_since_entry" } },
      {
        id: "winback_1",
        type: "email",
        config: {
          subject: "New since you bought {{product_name}}",
          body: "<p>Hi {{first_name}},</p><p>It has been a couple of months since you bought {{product_name}}. I have made new things since then.</p><p><a href=\"{{store_url}}\" style=\"display:inline-block;padding:10px 18px;border-radius:8px;background-color:#1a1a2e;color:#ffffff;text-decoration:none;font-weight:600;\">See what is new</a></p><p>Thanks for supporting my work.</p>",
        },
      },
    ],
  },
]

export const BLANK_TEMPLATE = "blank"

export function templateById(id: string): FlowTemplate | null {
  return TEMPLATES.find((t) => t.id === id) ?? null
}
