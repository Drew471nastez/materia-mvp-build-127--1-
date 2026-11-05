# Pro Feature Gating — Pattern Guide

This document describes the exact pattern used for the **"Hide Storelib Branding"** pro feature in the OnePage editor. Use this as the blueprint when adding any other premium-only feature to the editor or elsewhere in the app.

---

## Overview

A pro-gated feature has three layers:

1. **Visual indicator** — an animated circle that morphs into a purple "Pro" pill badge on hover, with a tooltip
2. **Preview access** — free users CAN toggle/interact with the feature to preview it, but cannot save it
3. **Upgrade gate on save** — the save button is intercepted; if pro features are enabled and the user is on the Free plan, a modal appears offering to upgrade instead of saving

---

## Layer 1 — The Animated "Pro" Badge

### Location: next to the feature label in the editor panel

```tsx
{/* Animated circle → purple Pro badge */}
<div className="group/badge relative flex items-center">
  {/* Tooltip */}
  <div className="absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-gray-900 text-white text-[11px] leading-tight rounded-lg whitespace-nowrap opacity-0 group-hover/badge:opacity-100 transition-opacity duration-200 pointer-events-none shadow-lg">
    {userHasPaidPlan
      ? "You have access to this feature"
      : "Click it to preview the feature for free."}
    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
  </div>

  {/* Badge shape: circle → purple pill on hover */}
  <div
    className={cn(
      "relative flex items-center justify-center overflow-hidden bg-black text-white cursor-pointer select-none",
      "transition-all duration-300 ease-in-out",
      "w-5 h-5 rounded-full",
      // row hover AND badge hover both expand + turn purple
      "group-hover/row:w-9 group-hover/row:rounded-full group-hover/row:bg-violet-600",
      "group-hover/badge:w-9 group-hover/badge:rounded-full group-hover/badge:bg-violet-600",
      userHasPaidPlan ? "opacity-50" : "opacity-30",
      "group-hover/row:opacity-100 group-hover/badge:opacity-100",
    )}
  >
    {/* Lightning bolt — fades out when pill opens */}
    <svg viewBox="0 0 24 24" fill="currentColor"
      className={cn(
        "absolute w-3 h-3 transition-all duration-200",
        "group-hover/row:opacity-0 group-hover/row:scale-50",
        "group-hover/badge:opacity-0 group-hover/badge:scale-50",
      )}
    >
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>

    {/* "Pro" text — fades in when pill opens */}
    <span className={cn(
      "absolute text-[10px] font-bold whitespace-nowrap",
      "opacity-0 transition-opacity duration-150 delay-100",
      "group-hover/row:opacity-100 group-hover/badge:opacity-100",
    )}>
      Pro
    </span>
  </div>
</div>
```

### How the row hover works

Wrap the entire feature row with `group/row` so hovering anywhere on the row expands the badge:

```tsx
<div className="group/row flex items-center justify-between p-3 md:p-4 border rounded-xl">
  {/* ... feature label + badge + toggle ... */}
</div>
```

The badge has `group/badge` so hovering directly on it also triggers the expand independently.

---

## Layer 2 — Free Preview (let them toggle, but don't block)

Do NOT disable the toggle for free users. Allow them to turn the feature on and experience it in the live preview. This increases conversion — they see the value before they're asked to pay.

The toggle fires `updateSettings({ show_branding: false, hide_branding_pro_enabled: true })` regardless of plan.

---

## Layer 3 — Save Gate

### Step A: Track which settings are "pro features"

In `onepage-editor.tsx`, `hasProFeaturesEnabled()` checks if any pro-only setting is currently enabled:

```ts
const hasProFeaturesEnabled = useCallback(() => {
  if (!onepage) return false
  // Each new pro feature: add its check here
  return onepage.settings.show_branding === false
}, [onepage])
```

When adding a new pro feature, add its check here. Example:
```ts
return (
  onepage.settings.show_branding === false ||
  onepage.settings.custom_button_color === true ||   // ← new feature
  onepage.settings.remove_watermark === true
)
```

### Step B: Intercept the save button

`handleSaveWithProCheck` (called by the Save button) checks plan before saving:

```ts
const handleSaveWithProCheck = useCallback(async () => {
  const userHasPro = userPlan === "growth" || userPlan === "pro"
  if (hasProFeaturesEnabled() && !userHasPro) {
    setShowProUpgradeDialog(true)  // show modal instead of saving
    return
  }
  await save()
  setSaveToastSequence((prev) => prev + 1)
}, [hasProFeaturesEnabled, save])
```

The save button also gets a visual indicator (Zap icon) when pro features are active and the user is on the Free plan:

```tsx
{hasProFeaturesEnabled() && !userHasPro
  ? <Zap className="h-4 w-4" strokeWidth={2.5} />
  : <Save className="h-4 w-4" />
}
```

### Step C: The Upgrade Modal (`ProUpgradeDialog`)

When `showProUpgradeDialog` is true, a modal appears with three options:

| Button | Action |
|--------|--------|
| **Upgrade Now** | Auto-saves non-pro changes, then redirects to `/pricing?source=upgrade&returnTo=<currentPath>` |
| **Discard changes** | Resets pro settings to defaults (e.g. `show_branding: true`), closes modal |
| **Keep editing** | Closes modal, user can continue previewing |

The "Upgrade Now" handler:
```ts
const handleUpgradeToPro = useCallback(async () => {
  setShowProUpgradeDialog(false)
  try { await save() } catch { /* ignore */ }
  const returnTo = encodeURIComponent(window.location.pathname)
  window.location.href = `/pricing?source=upgrade&returnTo=${returnTo}`
}, [save])
```

The "Discard" handler resets ALL pro settings:
```ts
const handleDiscardProChanges = useCallback(() => {
  updateSettings({
    show_branding: true,
    hide_branding_pro_enabled: false,
    // ← add resets for each new pro feature here
  })
  setShowProUpgradeDialog(false)
}, [updateSettings])
```

---

## Layer 4 — The Checkout / Upgrade Flow

When the user lands on `/pricing?source=upgrade&returnTo=/app/onepage/<id>`:

1. `PricingPageClient` detects `source=upgrade` and uses `upgradeCallbacks` mode
2. Clicking "Choose Growth/Pro" calls `/api/billing/subscription/create` with:
   - `successUrl = <returnTo>?plan_activated=1`
   - `cancelUrl = /pricing?source=upgrade&returnTo=<returnTo>`
3. Stripe redirects back to the editor after payment
4. The editor page can detect `?plan_activated=1` in the URL if needed

The same Stripe checkout flow is also used from:
- `/app/settings/billing/upgrade` → success redirects to `/app/settings/billing?success=1`
- `/pricing` (logged-in, not upgrade mode) → success redirects to `/app?plan_activated=1`

---

## Checklist: Adding a New Pro Feature

1. **Add the badge** next to the feature label (copy the `group/badge` block above)
2. **Add the row group** — wrap the feature row in `<div className="group/row ...">`
3. **Allow free preview** — do NOT disable the toggle/control for free users
4. **Register in `hasProFeaturesEnabled()`** — add a condition for the new setting
5. **Register in `handleDiscardProChanges()`** — reset the setting to its default value
6. **No other changes needed** — the save gate, modal, and upgrade flow are already wired up

---

## Database / Settings Field Convention

Pro-only settings should have a companion `*_pro_enabled` boolean field alongside the actual value field. Example:

| Setting | Meaning |
|---------|---------|
| `show_branding` | Whether to show branding (the actual behavior) |
| `hide_branding_pro_enabled` | Whether the user intentionally toggled this (used to detect intent) |

This lets you distinguish "user hasn't touched it" (default `true`) from "user explicitly enabled a pro feature" (`false` + `hide_branding_pro_enabled: true`).

---

## Files Reference

| File | Role |
|------|------|
| `components/onepage/onepage-editor.tsx` | Save gate logic, ProUpgradeDialog, upgrade navigation |
| `components/onepage/tabs/design-tab.tsx` | Badge UI, feature toggle, `group/row` + `group/badge` |
| `app/(storelib)/(marketing)/pricing/pricing-client.tsx` | Upgrade checkout flow from pricing page |
| `app/(storelib)/(marketing)/pricing/page.tsx` | Auth-aware: logged-in → checkout, not logged-in → signup |
| `app/(storelib)/app/settings/billing/upgrade/page.tsx` | Upgrade page shown from `/app` |
| `components/app/billing/upgrade-page-client.tsx` | Plan selection UI with Stripe checkout |
| `api/billing/subscription/create/route.ts` | Creates Stripe Checkout Session with custom success/cancel URLs |
