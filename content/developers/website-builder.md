# Using the website builder

Every part of the Storelib website builder: what each button, panel and setting is, what it changes, and where it lives. The settings on this page are drawn from the same lists the builder reads, with their defaults, so what you see here is what you see in the editor.

The builder opens from **Websites** in your dashboard. Pick a website and press **Edit website**.

## The screen

| Part | Where | What it is for |
| --- | --- | --- |
| Top bar | Across the top | Leaving, switching page, desktop or phone preview, the inspector, Ask AI, and Publish. |
| Sidebar | Left, on a computer. A sheet at the bottom, on a phone | The sections of the page, the pages of the site, and General Settings. |
| Canvas | The middle | The page, drawn by the same renderer your visitors get. Click a section to edit it. |
| Ask AI | Between the sidebar and the canvas, when open | Describe a change, or a new section, and it is made. |

A window narrower than 768px is treated as a phone: the preview is the phone preview and the sidebar becomes a sheet with three tabs, **Sections**, **Pages** and **Settings**.

## The top bar

From left to right on a computer:

| Control | What it does |
| --- | --- |
| Exit | Back to your websites. If a save is still going or a code file is unsaved, it asks first: **Stay here** or **Leave anyway**. |
| Sections, Pages, General Settings | Switch what the sidebar shows. |
| Website name and green dot | The dot means the website is published. |
| **…** menu | View code, Theme settings, Website settings, Connect Claude Code or Codex, Undo, Redo, View live site, Back to Dashboard. On a phone this is also how you reach Code, Website settings and the connections. |
| Preview, Code, Website Settings | Three ways of looking at the project. Code opens the code editor over the canvas. |
| Desktop or phone | One button that switches the canvas between the full width and a 390px phone. |
| Page switcher | Which page you are editing. See [Pages](#pages). |
| Open the live page | The page you are on, on the live site, in a new tab. |
| Undo and Redo | 30 steps. Typing in a box counts as one step. Changing page starts a fresh history. |
| Inspector | On: click a section in the canvas to select it. Off: the canvas is a plain preview you can click through. |
| Plug | **Connect Claude Code, Codex or ChatGPT.** Opens Website Settings › Connections, where they connect. |
| Ask AI | Opens and closes the AI panel. |
| Publish, or Save | See [Saving and publishing](#saving-and-publishing). |

Shortcuts: **⌘Z** or **Ctrl+Z** undoes, **⌘⇧Z**, **⌘Y** or **Ctrl+Y** redoes. In the code editor, **⌘S** or **Ctrl+S** saves.

## The sidebar

### Sections

The page's sections, top to bottom.

- **The header and footer** sit in their own boxes at the top and bottom. They are the same on every page: change them on one and every page changes. They can be hidden with the eye, but not moved, copied or deleted.
- **Every other section** has a grip to drag it up or down (press and hold on a phone, or use the arrow keys), and a **…** menu with **Duplicate**, **Hide** or **Show**, and **Delete**. Right-clicking the row opens the same menu.
- A hidden section is drawn faded in the list and is left out of the page. Delete takes effect at once; Undo brings it back.
- A thin line between two rows shows a **+** under the pointer: press it to add a section at exactly that point.
- **Add section**, at the end of the list on a computer and the start on a phone, adds a section above the footer.

### Adding a section

**Add section** opens the library: a search box, the categories down the side, and a card for each section drawn small with its real content. Sections you or Ask AI coded are under **Created by you**. Pick one and it is placed, selected and scrolled to.

The library's categories are Hero, Products, Features, Content, Social Proof, CTA, Media, About, FAQ and Marketing.

### Blocks

Some sections hold repeated items: questions in an FAQ, columns in a footer, slides in a gallery. These are blocks, listed under the section's settings. Each block can be moved up or down, duplicated, deleted, and opened to edit its own settings. **Add** adds another until the section's limit, and clicking a block in the canvas opens it in the list.

### Pages

**Pages** lists the website's pages: Home, About, Contact, Shop and Search, the pages you made, and a product page for each product. The switcher in the top bar does the same with a search box, and **Create page** asks for a title and makes a page at an address taken from it. A new page starts with the header and footer and nothing between.

Every website comes with a Refund Policy, a Privacy Policy and Terms of Service page. Edit them like any other page before you publish.

## A section's settings

Click a section, in the canvas or the list, and its settings open in the sidebar.

- **Colour scheme** comes first: pick one of the website's schemes and every colour in the section follows it. **Advanced colors** overrides single colours (background, text, heading, accent, border, and the two buttons) for this section only. **Reset to scheme** undoes that.
- **Text** picks the heading and body styles from General Settings, or **Custom** to set font, weight, size per screen, line height, letter spacing and case for this section.
- **The section's own settings** follow, in the order its file declares them, each with its help text.
- **Blocks**, if it has any.
- **Hide**, **Duplicate** and **Delete** are pinned along the bottom.

With the inspector on, a selected section also shows a small toolbar at its top right: Ask AI, Move up, Move down, Duplicate, Hide and Delete.

### Every control a section can have

A section declares its settings in its schema, and each type is drawn as one control. This is every type, drawn as the builder draws it. To write one, see [Schema](/developers/schema).

@[builder-controls]

### The header's own panel

The header has a panel of its own, in three parts.

- **Store Logo**: the logo, its height, a nudge left or right, and a separate logo and height for phones.
- **Navigation Links**: up to eight links, each with a label, where it goes, and whether it opens in a new tab. Drag to reorder. Each link can hold one level of sub-links.
- **Header Settings**: the layout on a computer (logo left, nav inline, nav centred, or logo centred) and on a phone; the colour scheme; how menu links react to the pointer; width and spacing; sticky and transparent behaviour; a bottom border and shadow; which icons show (search, account, wishlist, cart); and an optional button with its own text and link.

## General Settings

The settings that belong to the whole website. Open them with the gear in the top bar, or **Settings** on a phone.

### Colors

Every section picks one **colour scheme**. Change a scheme here and every section using it changes with it. A website starts with five:

@[builder-schemes]

Pick a scheme to edit it: its name, whether new sections start on it, and its twenty-one colours in five groups (surface, text, primary button, secondary button, inputs). Each button has a colour on hover, worked out from the button until you set one. If a pair of colours is hard to read, it says so and by how much. A scheme can also lay a gradient over its background. **Add scheme** makes another; a scheme you made can be deleted, and the sections on it move to another.

**Page colors**, under Colors, are the colours of the page itself, behind and between sections:

@[theme-settings:colors]

### Branding

The store's name, logo and its height, an optional smaller logo for phones, the favicon and a tagline. The logo is kept in step with the header's Store Logo: change it in either place.

@[theme-settings:branding]

### Typography

Three fonts, and nine text styles every section uses unless it sets its own.

@[theme-settings:typography]

The text styles, with their defaults. Each can be changed: font, weight, a size for desktop, tablet and phone, line height, letter spacing and case. A dot marks a style you changed, and **Reset style** puts it back.

@[builder-type-styles]

### Buttons

@[theme-settings:buttons]

### Layout

@[theme-settings:layout]

### Animations

@[theme-settings:animations]

### Announcement bar

@[theme-settings:announcement]

### Social links

@[theme-settings:social]

### Shipping

@[theme-settings:cart]

### SEO

@[theme-settings:seo]

### Cookie and privacy

@[theme-settings:cookies]

## The canvas

The canvas is your page, drawn the way a visitor sees it.

**With the inspector on**, a section shows a faint ring under the pointer and a solid one when selected. Clicking selects a section, or a block inside it. Clicking into a form field lets you type in it rather than selecting the section. Hovering the gap between two sections shows **Add a section here**.

**With the inspector off**, the canvas is a plain preview: links inside the website open that page in the builder.

Either way, the builder never leaves itself:

- A link to a page of the website opens that page in the builder. A link to a page that does not exist yet offers **Create this page**.
- Links to other websites, email links and phone links do nothing.
- Forms do not submit, and nothing can be bought. A sign-up box in the canvas does not subscribe anyone.

A section that fails to draw says so in its place, with the error and **Try again**. The rest of the page is unaffected.

## Ask AI

Ask AI has two modes.

- **Change this page**: describe a change and it is made with the same sections, blocks and settings the panels use. It is one step of Undo, and nothing is saved until the builder saves. Select a section first and it can be limited to that one.
- **Code a section**: describe a section the library does not have. It is written as a section file, compiled, and only kept if it compiles; a file that does not compile is sent back to be fixed, up to three times. While it is being written, the panel says what it is doing (Starting, Thinking, Writing the section, Checking it, Fixing a detail), the spot it will fill shows code being typed, and the finished section takes its place. If it still cannot get it right, it says so in plain words with **Try again**, never with the compiler's report.

Both modes answer rather than guess. A greeting, a question, or a request too unclear to act on gets a short reply saying what it understood and what to ask for, and nothing on the page changes.

You can attach up to four pictures (PNG, JPEG, WebP or GIF) of something you want built. Pressing Enter while it is working queues the next request.

## The code editor

**Code**, in the top bar, opens every file of the website's theme: the section files, the templates, the settings, the styles and the scripts. The list marks files you changed in blue and unsaved ones in amber.

- **Save** (or ⌘S) compiles a section file first. If it does not compile, nothing is saved, and each error is listed with its line; press one to jump to it, or **Solve with AI**.
- A save is a draft: the live website changes when you publish.
- **History** lists every save of a file; open any of them to bring it back.
- **Revert** puts a theme file back to how the theme shipped it. Your own files can be renamed, duplicated and deleted; the editor warns first if a page uses the section.
- Unsaved edits are kept in the browser, and offered back when you return.

The language section files are written in is the [Storelib Builder Framework](/developers/sections).

## Website settings

**Website Settings**, in the top bar, is a page of its own, with eight subjects about the website down the left and Connections under its own heading, Code. On a phone they are a list, and each opens with its own Back. The tabs above the live website's cover on the Website page (Pages, Domain, SEO, Publishing, Settings) open the matching one.

Every website has its own settings. Anything marked below as part of the draft is saved with the website's other changes, can be undone, and reaches visitors when you publish.

| Page | What is there |
| --- | --- |
| General | The website's name, which only you see. Its address, set by your username. Whether it is live. Its favicon and its language (both part of the draft); the language sets the page's `lang` and the share card's locale. |
| Domains | The Storelib address, and a custom domain if one is connected, with its status: waiting for DNS, securing, or connected. The `www.` address is the main one and the bare domain redirects to it. HTTPS is set up for both. A domain is added right here. Until it is connected, the three DNS records to set are listed, each with a copy button, and **Check DNS** looks them up. A site has one domain. Adding another asks first, then the old one sends its visitors to the new one for 30 days. Removing a domain is in Settings › Domains. |
| SEO & Social | A preview of the search result. Site title, meta description, social image, share card size, and whether search engines may list the website (all part of the draft). |

**How a published website is found.** Every published website answers for itself, at its Storelib address and on a connected domain:

- `/sitemap.xml` lists every published page and product, when each product last changed, and every picture on them, so pictures are indexed along with pages.
- `/robots.txt` lets crawlers in and names that sitemap. It keeps previews, the basket and search results out.
- Every page names its **canonical** address, which is the connected domain when there is one, so the two addresses count as one page.
- The home page carries structured data naming the website and its owner. A product page carries the product with its price, which is what lets a search result show the price and picture.
- With search engines switched off, pages say `noindex` and the sitemap is not offered. Crawlers are still let in, so they read the `noindex` and drop the pages.
| Pages & Navigation | Every page with **Edit**, which opens it in the builder, and **Add page**. **Search** opens the page's own search result: its title, its description, and **Show in search engines**. Off gives the page `noindex` and leaves it out of the sitemap. These are stored in the theme settings as `page_seo`, keyed by page, so they are saved with the draft and go live on publish. The home page's search result is the site's own, in SEO & Social. **Edit menu** selects the header, where the menu is. |
| Commerce | How many published products the website can show, and **Manage products**. Checkout is Storelib's, paid by card or Google Pay through Stripe, in US dollars. **Payments settings** is where payouts go. |
| Policies | The refund, privacy and terms pages, each with **Edit**. The cookie banner, its message and its two buttons (part of the draft). |
| Publishing | Live or draft, the published address, when it was last published, **Publish**, and **Take offline**, which asks first and deletes nothing. |
| Backups & Versions | A backup is kept every time you publish and every time Ask AI finishes. **Back up now** makes one; **Restore** puts one back (after saving the current draft as a backup first). The newest 30 are kept. **Duplicate** makes a draft copy, if the library has room. |
| Connections | Under Code, apart from the website's own settings. **Connect Claude Code, Codex or ChatGPT**: directly with a token and one line in a terminal, or through a GitHub repository. Whatever they write is a draft until you publish, and they never change a built-in section. **Edit code**, and the developer docs. See [Building with AI agents](/developers/ai) and [Rules before you ship](/developers/rules). |

A creator keeps up to three websites: one live and two drafts. Add theme, Duplicate and Import all refuse a fourth, on the server.

## Saving and publishing

- Every change is saved as a **draft** a moment after you make it. There is no save button to remember while editing.
- The live website does not change until you **Publish**. On a website that is live, the button in the top bar says Publish, with a bright dot when the draft is ahead of the live site.
- The Publish panel shows the website's address, when it was last published, and **Preview**, which makes a private link that shows the draft to anyone you send it to.
- Publishing makes every page's draft, the theme settings and the saved code files live at once, and keeps a backup.
- A website that has never been published has a **Save** button instead, since there is nothing live to update yet.
