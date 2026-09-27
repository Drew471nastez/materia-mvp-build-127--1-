/**
 * The OnePage onboarding (components/onepage/onboarding-modal.tsx) opened on
 * its theme step, with a profile picture taller than it is wide, for the
 * avatar check in scripts/check-onepage-editor-nav.mjs. Served through
 * scripts/onepage-probe-server.mjs, which stubs the router and Supabase.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { OnePageProvider } from "@/lib/onepage/context"
import { OnboardingModal } from "@/components/onepage/onboarding-modal"
import { defaultTheme, defaultSettings, type OnePage } from "@/lib/onepage/types"

/* Portrait on purpose: a picture that is not square shows whether its frame is. */
const tall = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="320"><rect width="200" height="320" fill="#6d8f6a"/><circle cx="100" cy="120" r="50" fill="#f4efe9"/></svg>`)}`

const onepage: OnePage = {
  id: "op_probe",
  owner_id: "probe-user",
  slug: "satori",
  title: "Satori Studio",
  bio: "Prints, posters and a newsletter",
  avatar_url: tall,
  theme: defaultTheme,
  settings: defaultSettings,
  social_links: {},
  draft_blocks: [],
  status: "draft",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  onboarding_completed: false,
} as OnePage

try {
  localStorage.setItem("onepage_onboarding_progress", JSON.stringify({
    step: 4,
    displayName: "Satori Studio",
    bio: "Prints, posters and a newsletter",
    selectedGoal: "artist",
    socials: { instagram: "", tiktok: "", youtube: "" },
    avatarUrl: tall,
    selectedTemplate: "default",
    onepageId: "op_probe",
  }))
} catch {}

createRoot(document.getElementById("app")!).render(
  <OnePageProvider initialOnePage={onepage}>
    <OnboardingModal open onClose={() => {}} onComplete={() => {}} />
  </OnePageProvider>,
)
