# Theme import, updates, publishing, and compatibility

Shopify import is **translation**, not execution. If enabled, parse uploaded assets, Liquid sections, JSON templates/settings/presets into a safe intermediate format. Never execute raw Liquid or arbitrary untrusted scripts as Storelib templates. Flag all unsupported Liquid filters, dynamic objects, app blocks, checkout dependencies and file limits. Rewrite into Storelib-native components and platform bindings with validation. Any unsupported behavior goes in an import report, not silent approximation.

## Publishing
Drafts, preview, publish and rollback must use consistent rendering. Version project/sections/assets and save change snapshots. No incomplete site automatically published. Publish gated by existing user authorization and test status. Rollback must preserve orders, payment transactions and unrelated commerce data.

## Existing themes
Keep existing user themes working; include schema versioning and migration tests. New AI components should not break old section IDs, saved settings or `*.storelib-theme` packages. Migrate deprecated components with reference rewrites or a compatibility adapter. Ensure asset files match manifest exactly, no missing paths, no extra invalid `...dump.txt` in theme archive, no undeclared section type.

## User customizations
On AI upgrade or brand-wide restyle: preserve user-written copy, media, SEO, dynamic bindings and integrations unless instruction explicitly says replace; provide diff, undo, rollback and idempotency. If removed section contains user content, save retrievable snapshot.
