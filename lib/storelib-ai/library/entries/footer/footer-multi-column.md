---
id: footer-multi-column
title: Multi column footer
category: footer
summary: Grouped link columns for sites with many pages; grouping, headings, collapsing to accordions on phones.
intents: [design-footer, build-section]
tags: [footer, multi-column, sitemap, links, columns]
components: [footer]
phases: [plan, build]
priority: 3
related: [footer-minimal, component-accordion]
version: 1
---
**When**: shops and sites with more than about 10 pages worth linking.

**Groups**: 2 to 4 columns with clear headings (Shop, Help, About). Each group 3 to 7 links from real menus (use a footer link_list, not typed links).

**Phones**: either keep groups stacked (fine when short) or collapse each group into a disclosure (`<details>` works without JS). Keep the newsletter and socials always visible.

**Headings**: real headings (`h2` with a visually small style) so screen reader users can jump between groups.

**Avoid**: a fake sitemap of pages that do not exist; columns of a single link.
