---
id: footer-minimal
title: Minimal footer
category: footer
summary: One or two lines: brand, essential links, legal and socials; spacing and what must always be there.
intents: [design-footer, build-section]
tags: [footer, minimal, simple, legal]
components: [footer]
phases: [plan, build]
priority: 4
related: [footer-multi-column, header-minimal]
version: 1
---
**Contents**: brand name, 3 to 6 essential links (contact, policies, terms), social links if they exist, copyright with the current year computed, not typed.

**Layout**: one row on desktop (brand left, links right), stacked on phones with 12 to 16px between rows. Padding 32 to 48px top and bottom.

**Type**: 13 to 14px, muted colour that still passes 4.5:1.

**Always**: links to the legal pages the store has (privacy, terms, refund, shipping when selling). Do not invent company numbers or addresses.

```html
<footer class="site-footer">
  <p>&copy; <span data-year></span> Studio Name</p>
  <nav aria-label="Footer"><a href="/policies/privacy">Privacy</a> <a href="/policies/terms">Terms</a></nav>
</footer>
```
