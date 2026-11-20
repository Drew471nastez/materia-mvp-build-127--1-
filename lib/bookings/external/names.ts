/** Calendly and Cal.com by name, for the screens: nothing here needs a server (./providers holds the rest). */
export const EXTERNAL_PROVIDERS = ["calendly", "calcom"] as const
export type ExternalProvider = (typeof EXTERNAL_PROVIDERS)[number]

/* i18n-ignore-start: names of services. */
export const EXTERNAL_PROVIDER_NAME: Record<ExternalProvider, string> = { calendly: "Calendly", calcom: "Cal.com" }
/* i18n-ignore-end */

export function isExternalProvider(v: unknown): v is ExternalProvider {
  return v === "calendly" || v === "calcom"
}
