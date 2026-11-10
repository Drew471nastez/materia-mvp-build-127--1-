# Loupe study (round R, R1)

What we read: https://github.com/winchxyz/loupe at commit `1e9c3d78ffab46af10102d8c9e65aaa227f7876c` (read 2026-11-10, cloned into a scratch folder, nothing run). Loupe is an Electron desktop app that drives Claude Code to build static HTML sites, with a curated design library under `baseline/library` and a set of agent cards under `app/agents`.

## Licences

| Part | Licence | What it means for us |
| --- | --- | --- |
| Loupe's code and its own write-ups (`techniques/`, `patterns/`, `recipes/`, `standards/`) | MIT (LICENSE, Copyright (c) 2026 winchxyz) | We may adapt ideas; we keep attribution. We restate everything in our own words and record the source file per record, plus the licence text in `lib/storelib-ai/library/brain/NOTICE.md`. |
| `references/` (about 1,289 entries) | Covered by MIT as Loupe's "original written analysis", but each entry analyses a named real website (palettes, type, tokens). ATTRIBUTION.md offers takedown to site owners. | Not taken. Each entry is about a real brand; using them would put third party brand identity into our generation. Storelib already has its own reference library (O1). |
| `recipes/ref-*` | MIT, but each is a recipe distilled from one named real site (URLs, measured palettes, stacks). | Not taken, same reason. Only the idea of a recipe as a complete system is adopted. |
| `snippets/` | Mixed: three.js examples MIT, shadcn MIT, Magic UI MIT, Hover.css MIT, Animista FreeBSD style, Aceternity "free to use, not resell". Unclear families are excluded by Loupe itself. | Not taken. We do not run or ship third party snippets; Storelib's motion islands (P3) and chrome kit (P4) are first party. |
| Bundled fonts (Inter, JetBrains Mono, Press Start 2P) | SIL OFL 1.1 | Not relevant: we load fonts from our own type library. |
| Upstream data credited in ATTRIBUTION.md (open-design, taste-skill, impeccable, ui-ux-pro-max, designmd-supply) | Apache-2.0 / MIT, not redistributed by Loupe | Already handled in round O (O1) with their own notices where used. |

## Mechanisms, what each does

- **Library retrieval** (`app/electron/library.cjs`): parses `INDEX.md` tables plus a directory scan into a catalogue, scores entries by keyword substring hits with a kind weight (patterns 1.6, recipes 1.3, techniques 1), injects a bounded block (7 one line hints, 3 full entries, about 11,000 characters) into the builder's system prompt. A "structure guarantee" regex table forces a named composition playbook in full when the brief mentions it. "Taste priors" (a quantitative floor distilled from the reference corpus) are injected on every build.
- **Reference search** (`references.cjs`): a compact JSON index of the 1,289 analyses; keyword hits weighted by field repetition, a bigram phrase bonus, a light dark/light theme bonus; top match injected as an exemplar (summary, tokens, do and don't, agent guide).
- **Grounding query** (`grounding.cjs`): builds an English retrieval query from the art director's labelled header, the plan, the saved DESIGN.md and class names, so a non English brief still retrieves.
- **Art direction** (`artdirection.cjs`, `agents/art-director.md`): a pre pass that commits to ARCHETYPE, PALETTE, HERO, TYPE, MOTION plus a section by section composition, must diverge from the last six directions stored in a small JSON memory, prose only (code is stripped).
- **Structure lever** (`flow.cjs`): deals each page one distinct skeleton from the pattern playbooks (a shrinking pool), then a static "structure probe" flags a page that collapsed into a vertical band stack and fingerprints pages to catch re-skins.
- **Screenshot verification and review** (`agents/critic.md`, `standards/visual-quality-rubric.md`): a critic judges rendered screenshots (desktop, tablet, phone, a motion time strip) on ten 0 to 3 dimensions plus fit, with hard fails (contrast, responsive, slop) and a raised bar (craft axes must be 3); a deterministic pre gate (lint, console errors, contrast, "something changed") runs first. JSON verdict with blocking issues fed verbatim to the next builder turn; the critic must stay consistent with its last round.
- **Review and refine** (`agents/reviewer.md`, `agents/enforcer.md`, `reviewnote.cjs`): a read only QA reviewer prioritises P0 to P2; an enforcer applies exactly the P0 fixes with minimal diffs; the latest review is persisted and injected so "fix #2" resolves.
- **Agent instructions** (`agents/builder.md`): design system first (palette, type scale, spacing as CSS variables), anti slop rules (one accent, one radius family, hero discipline, eyebrow restraint, at least four layout families, real photos by search query, no em dashes, honest copy), precedence (project DESIGN.md over user over standards), override logging in DECISIONS.md.

## What we adopt (and where it lives)

- **Four structured layers** as versioned records: techniques, patterns, recipes, standards (`lib/storelib-ai/library/brain`). Unlike Loupe's markdown, every record is typed, validated and cross linked to Storelib's real things: patterns to O5 compositions and to native section types the editor can add, recipes to O2 art directions, the type library and `DesignTokens`, standards to a check (deterministic or review) and a severity.
- **Recipes as complete systems**, not mood words: tokens, type pairing, spacing scale, surfaces, motion tier, image direction, section strategy. Original recipes for business families, never a copy of a real site.
- **Structure discipline**: split discipline, numeral rail, bento spans, poster slab, pinned sequence, running band, self demonstrating hero, silhouette variety, and the band stack failure as checkable standards (`std_max-two-splits`, `std_adjacent-shapes`).
- **Quantitative taste floor** as craft values (scale ratios, tracking by size, flat first, one radius family).
- **Retrieval**: Loupe's keyword lottery is replaced by our existing BM25 plus business fit, the chosen direction, and an MMR diversity pass; deterministic and cached. Loupe's structure guarantee becomes the recipe's section strategy (always sent) instead of regex triggers.
- **Divergence**: our recipe ranking takes `avoidRecipes` (recent sites) like Loupe's direction memory; O2 already avoids recent directions.
- **Injection**: compact versioned block in the job's first turn (the system prefix stays byte identical for caching), plus structured hints both engines apply to real tokens and sections.

## What we do not adopt, and why

- **The reference corpus and the `ref-*` recipes**: analyses of named real brands; Andrew's rule is no third party site content or brand assets. O1's own references cover this.
- **Snippets and CDN code**: we never run AI or third party scripts outside the sandbox; P3 motion islands are first party.
- **Motion that ignores reduced motion**: Loupe ships motion always on by owner choice. Storelib keeps `prefers-reduced-motion` mandatory (`std_reduced-motion` is a blocker).
- **Stock photo by query and HDRI auto fetch**: P1 already has the image chain with budgets; no remote fetch from the library.
- **Claude Code driving files, Electron IPC, DECISIONS.md logging**: Storelib's editor, drafts and design contract (O2 DESIGN.md with user overrides) already cover this.
- **The critic loop itself**: O4's visual critic (JS off screenshots, measurements, bounded repair) already exists; R3 extends it. The rubric's hard fail and "stay consistent with last round" ideas are noted for R3.
- **Keyword substring scoring and regex structure triggers**: brittle; replaced by BM25, fit and MMR.
