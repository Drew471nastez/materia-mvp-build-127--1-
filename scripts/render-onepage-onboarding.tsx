/**
 * The OnePage onboarding (components/onepage/onboarding-modal.tsx) opened on
 * the step named in the address (?step=1 to 4, 1 when there is none), with
 * the name and bio already filled, for scripts/check-onepage-onboarding.mjs.
 * ?goal=artist and ?template=neon open with that goal or template picked;
 * ?avatar puts a profile picture in the theme cards. Served through
 * scripts/onepage-probe-server.mjs, which stubs the router and Supabase.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { OnePageProvider } from "@/lib/onepage/context"
import { OnboardingModal } from "@/components/onepage/onboarding-modal"
import { defaultTheme, defaultSettings, type OnePage } from "@/lib/onepage/types"

/* Every read comes back empty, so the name typed on the first step is free. */
;(globalThis as any).PROBE_EMPTY_READS = true

const params = new URLSearchParams(location.search)
const step = Math.min(4, Math.max(1, Number(params.get("step")) || 1))
const avatar = params.has("avatar")
  ? `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#6d8f6a"/><circle cx="100" cy="86" r="42" fill="#f4efe9"/></svg>`)}`
  : null

const onepage: OnePage = {
  id: "op_probe",
  owner_id: "probe-user",
  slug: "satori",
  title: "Satori Studio",
  bio: "Prints, posters and a newsletter",
  avatar_url: avatar,
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
    step,
    displayName: "Satori Studio",
    bio: "Prints, posters and a newsletter",
    selectedGoal: params.get("goal"),
    socials: { instagram: "", tiktok: "", youtube: "" },
    avatarUrl: avatar,
    selectedTemplate: params.get("template") || "default",
    onepageId: "op_probe",
  }))
} catch {}

createRoot(document.getElementById("app")!).render(
  <OnePageProvider initialOnePage={onepage}>
    <OnboardingModal open onClose={() => {}} onComplete={() => {}} />
  </OnePageProvider>,
)
