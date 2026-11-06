# OnePage blocks, stable Share, and receipts

Block appearance is optional `style.presentation` JSON on the existing block.
There is no schema migration. A missing appearance preserves the original
rendering and styling; Reset removes the override. Original platform-specific
settings, purchase actions, analytics, schedules and sensitive-link prompts
remain in place. The editor merges changes against its current page reference,
including group children, so rapid typing/resizing and an upload finishing
later cannot overwrite another appearance field. Leaving the editor or
resetting cancels an outstanding card-image upload.

Link cards offer compact, image background, image-first and featured designs.
Titles, descriptions and icons have separate controls. Blocks can use full,
half or tall sizes; Mixed tiles uses a two-column grid in reading order, with
no dense reordering. Below 360px it stacks. Existing List, Grid, Cards and
Compact layouts retain their defaults. Card media stays lazy, reserves its
frame, and uses the bounded optimizer/original retry loader. Native social
embeds are optional, parsed from allowlisted provider addresses, loaded lazily
in sized frames, and retain an ordinary link if a provider refuses embedding.

Share fades in without scaling or translating its contents. It preserves the
page scrollbar and scroll position, reserves avatar/text geometry, cancels
both entrance animation frames, and traps/restores keyboard focus. Other
centered dialogs retain their existing entrance; reduced motion disables it.

Receipt paths omit both desktop and mobile marketplace search. The receipt
and its loading state have matching gutters/top spacing and safe-area padding.
The existing token-verified downloads, guest grants, verified sign-in return
address, explicit library attachment and account ownership checks are retained.
No payment or entitlement rule changes are required for the layout repair.

Validation (Node 22, pnpm dependencies, Chromium):

```sh
pnpm test:push
CHROMIUM=/path/to/chromium PROBE_CSS=source node scripts/check-onepage-modern-blocks.mjs
CHROMIUM=/path/to/chromium PROBE_CSS=source node scripts/check-receipt-frame.mjs
CHROMIUM=/path/to/chromium PROBE_CSS=source node scripts/check-receipt.mjs
node scripts/check-onepage-avatar-routes.mjs
```

The new browser checks exercise the real editor/preview/public renderer at
1440, 390 and 320px, save/refresh, descriptions and sizes, anonymous rendering,
provider frames, repeated Share openings and keyboard focus. The receipt
frame check combines the real platform header with receipt fixtures at 320,
390, 768 and 1440px for free, paid, guest and signed-out account purchases.
The existing receipt audit covers signed downloads and failures, receipt email,
account return links, reviews, hydration and loading-state alignment. APIs and
provider responses in these browser audits are local fixtures: they do not
charge cards or alter production purchases.
