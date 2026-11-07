import type { FormDefinition, FormField } from "./definition"

const name: FormField = { id: "name", type: "name", label: "Your name", required: true, placeholder: "First and last name" }
const email: FormField = { id: "email", type: "email", label: "Email address", required: true, placeholder: "you@example.com" }
const phone: FormField = { id: "phone", type: "phone", label: "Phone number", required: false, placeholder: "+44 7700 900123" }
const contact: FormField[] = [name, email]

const base: Omit<FormDefinition, "title" | "fields"> = {
  description: "",
  mode: "form",
  layout: "single",
  button_text: "Send",
  consent_text: "I agree that my answers and contact details may be used to respond to this request.",
  marketing_opt_in: false,
  completion: { kind: "message", message: "Thanks. Your answers have been received." },
}

/** The starting points offered in Audience → Forms. The key is stored nowhere; a form keeps its own copy. */
export const FORM_TEMPLATES: Record<string, FormDefinition> = {
  contact: {
    ...base,
    title: "Get in touch",
    fields: [...contact, { id: "message", type: "textarea", label: "How can I help?", required: true }],
  },
  lead: {
    ...base,
    title: "Get the free guide",
    button_text: "Send me the guide",
    fields: [{ ...name, required: false, label: "First name", placeholder: "" }, email],
    marketing_opt_in: true,
    completion: { kind: "gated", message: "Here is your guide.", gated: { url: "", label: "Download the guide" } },
  },
  coaching: {
    ...base,
    title: "Apply for coaching",
    layout: "steps",
    button_text: "Send application",
    fields: [
      ...contact,
      phone,
      { id: "goal", type: "textarea", label: "What do you want to achieve in the next 3 months?", required: true, new_step: true },
      {
        id: "tried",
        type: "single",
        label: "Have you worked with a coach before?",
        required: true,
        options: [
          { id: "yes", label: "Yes" },
          { id: "no", label: "No" },
        ],
      },
      { id: "tried_detail", type: "textarea", label: "What worked and what did not?", required: false, show_if: [{ field: "tried", op: "is", value: "yes" }] },
      {
        id: "budget",
        type: "dropdown",
        label: "Monthly budget",
        required: true,
        new_step: true,
        options: [
          { id: "b1", label: "Under 200" },
          { id: "b2", label: "200 to 500" },
          { id: "b3", label: "Over 500" },
        ],
      },
      { id: "start", type: "date", label: "When would you like to start?", required: false },
    ],
    completion: { kind: "message", message: "Thanks for applying. I read every application and reply within two working days." },
  },
  service: {
    ...base,
    title: "Request a quote",
    fields: [
      ...contact,
      phone,
      {
        id: "service",
        type: "dropdown",
        label: "Which service?",
        required: true,
        options: [
          { id: "s1", label: "Consultation" },
          { id: "s2", label: "Full project" },
          { id: "s3", label: "Something else" },
        ],
      },
      { id: "details", type: "textarea", label: "Project details", required: true, placeholder: "Scope, timing and anything I should know" },
      { id: "brief_file", type: "file", label: "Brief or reference (optional)", required: false, description: "PDF, JPG, PNG or WebP, up to 4 MB." },
    ],
  },
  waitlist: {
    ...base,
    title: "Join the waitlist",
    fields: contact,
    marketing_opt_in: true,
    completion: { kind: "message", message: "You are on the list. We will be in touch." },
  },
  feedback: {
    ...base,
    title: "Share your feedback",
    fields: [
      { id: "rating", type: "rating", label: "How would you rate your experience?", required: true, max: 5 },
      { id: "liked", type: "textarea", label: "What did you like?", required: false },
      { id: "improve", type: "textarea", label: "What could be better?", required: false, show_if: [{ field: "rating", op: "lte", value: "3" }] },
      { ...email, required: false, label: "Email, if you would like a reply" },
    ],
    completion: { kind: "message", message: "Thank you for the feedback." },
  },
  registration: {
    ...base,
    title: "Register",
    button_text: "Register",
    fields: [
      ...contact,
      phone,
      {
        id: "session",
        type: "single",
        label: "Which session?",
        required: true,
        options: [
          { id: "morning", label: "Morning" },
          { id: "evening", label: "Evening" },
        ],
      },
      { id: "terms", type: "consent", label: "I have read the event terms.", required: true },
    ],
    completion: { kind: "message", message: "You are registered. Details are on their way by email." },
  },
  appointment: {
    ...base,
    title: "Book a call",
    button_text: "Request this time",
    fields: [...contact, { id: "topic", type: "textarea", label: "What would you like to talk about?", required: false }],
    booking: {
      duration: 30,
      buffer: 10,
      timezone: "Europe/London",
      weekly: [1, 2, 3, 4, 5].map((day) => ({ day, start: "09:00", end: "17:00" })),
      notice_hours: 12,
      days_ahead: 30,
      approval: true,
    },
    completion: { kind: "message", message: "Request sent. You will get an email when it is confirmed." },
  },
  fitness: {
    ...base,
    title: "Find your training plan",
    mode: "quiz",
    layout: "one_by_one",
    button_text: "Send my answers",
    fields: [
      {
        id: "goal",
        type: "single",
        label: "What would you like to work on?",
        required: true,
        options: [
          { id: "strength", label: "Build strength", score: 3 },
          { id: "fitness", label: "Improve fitness", score: 2 },
          { id: "routine", label: "Build a routine", score: 1 },
        ],
      },
      {
        id: "support",
        type: "multiple",
        label: "Where would you like support?",
        required: false,
        options: [
          { id: "training", label: "Training", score: 1 },
          { id: "nutrition", label: "Nutrition", score: 1 },
          { id: "consistency", label: "Consistency", score: 1 },
        ],
      },
      ...contact,
    ],
    results: [
      { id: "starter", min: -1000, max: 2, title: "Starter plan", message: "Three short sessions a week to build the habit." },
      { id: "build", min: 3, max: 1000, title: "Strength plan", message: "Four structured sessions a week with progressive loads." },
    ],
  },
  brief: {
    ...base,
    title: "Tell me about your project",
    fields: [
      ...contact,
      { id: "project", type: "textarea", label: "What are you planning?", required: true },
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

export const TEMPLATE_CHOICES: { id: string; label: string }[] = [
  { id: "contact", label: "Contact" },
  { id: "lead", label: "Lead magnet" },
  { id: "coaching", label: "Coaching application" },
  { id: "service", label: "Service inquiry" },
  { id: "appointment", label: "Appointment booking" },
  { id: "waitlist", label: "Waitlist" },
  { id: "feedback", label: "Feedback" },
  { id: "registration", label: "Registration" },
  { id: "fitness", label: "Quiz with results" },
]

export function formTemplate(id = "contact"): FormDefinition {
  return JSON.parse(JSON.stringify(FORM_TEMPLATES[id] || FORM_TEMPLATES.contact))
}
