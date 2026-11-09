---
id: component-navigation-menus
title: Navigation menus and dropdowns
category: component
summary: Dropdown and mega menu behaviour: disclosure pattern, hover intent, keyboard, and reading the menu from the Storelib link list.
intents: [build-component, build-section]
tags: [menu, dropdown, mega-menu, submenu, navigation]
components: [navigation, menu, dropdown]
capabilities: []
phases: [build, review]
priority: 4
related: [header-mobile-menu, header-minimal]
version: 1
---
**Pattern**: site navigation submenus use the disclosure pattern (a button with `aria-expanded` that shows a list of links), not the ARIA `menu` role, which is for application menus.

```html
<li class="has-sub">
  <button aria-expanded="false" aria-controls="sub-{{ forloop.index }}">Shop</button>
  <ul id="sub-{{ forloop.index }}" hidden>{% for child in link.links %}<li><a href="{{ child.url | url }}">{{ child.title }}</a></li>{% endfor %}</ul>
</li>
```

**Behaviour**: click or Enter toggles; Escape closes and returns focus; clicking outside closes. On hover devices, open on hover with a 100 to 150ms intent delay and keep a hover bridge so the menu does not close when the pointer crosses the gap.

**Mega menu**: only when there are many categories; group by real collections; include images only if they help choosing.

**Storelib**: menus come from a link_list (`settings.menu.links`, children in `link.links`), never typed in markup.
