# OnePage profile photos and hover colors

`profiles.avatar_url` is the canonical account photo. A successfully read
`null` means removal and must win over every OnePage draft/published copy.
An omitted profile value means the profile was not supplied; only that
legacy case may use a stored copy. Failed profile reads are errors, never
empty photos to save, publish or cache.

The editor's server data and GET endpoint include the canonical photo.
Confirmed writes announce it to the account store and other tabs. The
OnePage provider follows that store outside draft/undo history. A reader
captures `avatarReadToken()` before starting and adopts its answer only if
no newer announcement arrived. Editor entry, focus and reconnect read the
profile again. Team members retain the store owner's identity.

Uploads and removals await the account route before announcing success.
The choice marker must save before changing the profile; otherwise a later
provider sign-in could restore a removed photo. Requests from one tab are
serialized and have a deadline. Original uploaded files are kept.

Avatar URLs are unwrapped before resizing. Previously, Share and Subscribe
passed an optimized URL into an avatar that built another optimized
srcset, yielding nested optimizer requests and permanent initials. The
shared loader tries the original after an optimizer failure, retries twice,
and permits recovery on reconnect/returning to the tab. Cached public-file
misses get a rendering-only retry query; signed and external queries are
preserved. Replacements retain their decoded predecessor while loading;
removals clear immediately. The first render is deterministic for SSR and
hydration, with decoded-cache adoption before paint. Lazy avatars stay lazy.

Hover fill and text share the same variables in editor samples, preview and
published buttons. Highlighted swipe links retain their highlight and use
the other layer for hover fill. Grouped links can change color while staying
still. Each color resets independently. Pending picker writes cannot undo
a reset; pointer release commits the final drag value before Save.

Regression checks, with Node 22 and the repository dependencies installed:

```sh
pnpm test:push
node scripts/check-onepage-avatar-routes.mjs
CHROMIUM=/path/to/chromium PROBE_CSS=source node scripts/check-onepage-avatar-sync.mjs
CHROMIUM=/path/to/chromium node scripts/check-avatar-hydration.mjs
CHROMIUM=/path/to/chromium PROBE_CSS=source node scripts/check-avatar-everywhere.mjs
```

The browser audit exercises actual file selection, cropping, upload,
replacement, removal, failed saves, stale reads, URL retries, navigation,
refresh, preview, both public modals and independent hover resets at 1440px
and 390px. Anonymous pages use a separate browser context. It runs the real
components with local storage/API fixtures; the route check separately runs
the real GET, save and publish handlers against database failures and stale
payloads. The hydration check starts with actual server-rendered HTML and an
image failure before JavaScript loads. No production profiles are changed.
