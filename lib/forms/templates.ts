import type { FormDefinition, FormField } from "./definition"
const contact: FormField[] = [
  { id: "name", type: "name", label: "Your name", required: true },
  { id: "email", type: "email", label: "Email address", required: true },
]
const base: Omit<FormDefinition, "title" | "fields"> = {
  description: "",
  mode: "form",
  button_text: "Send",
  consent_text:
    "I agree that my answers and contact details may be used to respond to this request.",
  marketing_opt_in: false,
  completion: { message: "Thanks. Your answers have been received." },
}
export const FORM_TEMPLATES: Record<string, FormDefinition> = {
  contact: {
    ...base,
    title: "Get in touch",
    fields: [
      ...contact,
      {
        id: "message",
        type: "textarea",
        label: "How can I help?",
        required: true,
      },
    ],
  },
  waitlist: {
    ...base,
    title: "Join the waitlist",
    fields: contact,
    marketing_opt_in: true,
    completion: { message: "You are on the list. We will be in touch." },
  },
  fitness: {
    ...base,
    title: "Find your training plan",
    mode: "quiz",
    button_text: "Send my answers",
    fields: [
      {
        id: "goal",
        type: "single",
        label: "What would you like to work on?",
        required: true,
        options: [
          { id: "strength", label: "Build strength" },
          { id: "fitness", label: "Improve fitness" },
          { id: "routine", label: "Build a routine" },
        ],
      },
      {
        id: "support",
        type: "multiple",
        label: "Where would you like support?",
        required: false,
        options: [
          { id: "training", label: "Training" },
          { id: "nutrition", label: "Nutrition" },
          { id: "consistency", label: "Consistency" },
        ],
      },
      ...contact,
    ],
  },
  brief: {
    ...base,
    title: "Tell me about your project",
    fields: [
      ...contact,
      {
        id: "project",
        type: "textarea",
        label: "What are you planning?",
        required: true,
      },
      {
        id: "budget",
        type: "single",
        label: "What is your budget?",
        required: false,
        options: [
          { id: "small", label: "Under 1,000" },
          { id: "medium", label: "1,000 to 5,000" },
          { id: "large", label: "Over 5,000" },
        ],
      },
    ],
  },
}
export function formTemplate(id = "contact"): FormDefinition {
  return JSON.parse(
    JSON.stringify(FORM_TEMPLATES[id] || FORM_TEMPLATES.contact),
  )
}
