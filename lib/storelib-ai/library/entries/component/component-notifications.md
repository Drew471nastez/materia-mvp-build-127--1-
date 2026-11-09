---
id: component-notifications
title: Notifications, toasts and banners
category: component
summary: Feedback messages: inline alerts, toasts for background events, announcement bars, timing and live regions.
intents: [build-component, build-section]
tags: [toast, notification, alert, banner, announcement, snackbar]
components: [toast, alert, banner]
capabilities: []
phases: [build, review]
priority: 3
related: [state-async, announcement]
version: 1
---
**Inline alert**: for messages about a specific area (form errors, payment problems). Stays until resolved. Icon plus text plus colour.

**Toast**: brief confirmation of something that happened elsewhere ("Added to bag"). Appears bottom (phones) or bottom right, 4 to 6 seconds, pauses on hover and focus, dismiss button, never the only place important info appears. Announce with a polite live region (`role="status"`).

**Announcement bar**: one true line (shipping, next date). Dismissible if it is promotional. Not a rotating carousel of offers.

**Errors that block**: `role="alert"` (assertive) only for urgent problems.

**Copy**: what happened and what to do next. "Could not add to bag. Try again." not "Oops! Something went wrong."
