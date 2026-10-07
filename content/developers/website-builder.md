# Using the website builder

Every part of the Storelib website builder: what each button, panel and setting is, what it changes, and where it lives. The settings on this page are drawn from the same lists the builder reads, with their defaults, so what you see here is what you see in the editor.

The builder opens from **Websites** in your dashboard. Pick a website and press **Edit website**. It edits one website at a time, and everything you change is a draft until you publish.

## The screen

| Part | Where | What it is for |
| --- | --- | --- |
| Top bar | Across the top | Leaving, the website's menu, Preview, Code or Website Settings, the page you are on, desktop or phone, undo, the inspector, connections, Ask AI, and Publish. |
| Sidebar | Left, on a computer. A sheet at the bottom, on a phone | Three tabs: **Sections** of the page, the site's **Pages**, and the **Theme** settings. A selected section's settings open here. |
| Canvas | The middle | The page, drawn by the same renderer your visitors get. Click a section to edit it. |
| Ask AI | Between the sidebar and the canvas, when open | Describe a change, or a new section, and it is made. |

A window narrower than 768px is treated as a phone: the canvas shows the phone layout, the sidebar becomes a sheet you drag up from the bottom with the same three tabs, and the menu holds what the bar has no room for. On a computer the sidebar can be dragged wider, from 240 to 560px, and a double click on its edge puts it back.

## The top bar

From left to right, on a computer:

| Control | What it does |
| --- | --- |
| Exit, the arrow | Back to your websites. If a save is still going or a code file is unsaved, it asks first: **Stay here** or **Leave anyway**. |
| The website's name | A green dot beside it means it is the live website. |
| **…** | View code, Theme settings, Website settings, Connect Claude Code or Codex, Undo, Redo, View live site, and Back to Dashboard. On a phone it also opens the connection. |
| Preview, Code, Website Settings | How you are looking at the website: the canvas, the [code editor](#the-code-editor), or [Website settings](#website-settings). On a phone these are in the **…** menu. |
| Desktop or phone | One button that switches the canvas between the full width and a 390px phone. |
| Page switcher | Which page you are editing. See [Pages](#pages). |
| Open the live page | The page you are on, on the live site, in a new tab. |
| Undo and Redo | See [Undo and redo](#undo-and-redo). On a phone they sit beside the menu. |
| Inspector | On: click a section in the canvas to select it. Off: the canvas is a plain preview you can click through. |
| Connection | The mark of what is connected, Claude, OpenAI or GitHub, with a green dot while it is live. It opens Website settings on Connections, and a change a connected agent makes is announced under it. |
| Ask AI | Opens and closes the AI panel. A dot on it means it is still working with the panel closed. |
| Publish, or Save | **Publish** on the live website, with a bright dot when the draft is ahead of it; it opens the [Publish panel](#publishing). **Save** on a website that is not live, which saves the draft. |

## Sections, Pages and Theme

The three tabs at the top of the sidebar, and at the top of the sheet on a phone.

### Sections

The page's sections, in three groups, the way a shop's theme editor shows them:

- **Header** holds the site's header and nothing else, with **Add section** under it, which adds at the top of the page.
- **Page** holds the page's own sections, top to bottom, with **Add section** at the end, which adds at the bottom. A thin line between two rows shows a **+** under the pointer: press it to add a section at exactly that point.
- **Footer** holds the site's footer.

Each row is one line: a grip to drag it (press and hold on a phone, or the arrow keys), its name, and under the pointer **Hide**, **Delete** and a **…** menu with **Duplicate**, **Move up**, **Move down**, **Hide** or **Show**, and **Delete**. A right click on the row opens the same menu. The header and footer have an icon in place of the grip and only the eye: they are the same on every page, so they can be hidden but not moved, copied or deleted, and nothing can be dropped into their groups. A hidden section is faded in the list, always shows its eye, and is left out of the page. Delete takes effect at once; Undo brings it back. See [The header and footer](/developers/header-and-footer).

### Adding a section

**Add section** opens the library: a search box, the categories down the side, and one card per row, each section drawn with its real content. A section with several presets has a card for each. Sections you or Ask AI coded are under **Created**. Pick one and it is placed, selected and scrolled to; on a phone its settings come up with it.

The library's categories are Hero, Products, Features, Content, Social Proof, CTA, Media, About, FAQ and Marketing. A section is only in the library when its file declares a preset; see [Presets](/developers/blocks#presets). A preset may file its card under another category with `category`.

### Pages

**Pages** lists the website's pages: Home, the product page, About, Contact, Shop and Search, the pages you made, and a product page for each of your products. The page switcher in the top bar does the same with a search box, a **Yours** group for the pages you made, a **Products** group, and **Create page**, which asks for a name and makes a page at an address taken from it. A new page starts with the header and footer and nothing between. A page you made can be deleted from the switcher; that takes it off the live site at once.

Every website comes with a Refund Policy, a Privacy Policy and Terms of Service page. Edit them like any other page before you publish. Keys, addresses and each page's search settings are in [Pages and page settings](/developers/pages).

## A section's settings

Click a section, in the canvas or the list, and its settings open in the sidebar.

- **Colour scheme** comes first: pick one of the website's schemes and every colour in the section follows it. **Advanced colors** overrides single colours (background, text, heading, accent, border, and each button's fill, text, hover fill and hover text) for this section only. A hover colour says Auto until you pick one. **Reset all to scheme** undoes that.
- **The section's own colours**, when its file declares any (stars, a timeline's dot, the scrim over a photo), are rows among its settings. Each says Scheme, Default or Auto until you pick a colour for this section alone, and the arrow beside it puts it back. See [Styling](/developers/styling#colours-of-the-sections-own).
- **Text** picks the heading style and the body style from the theme's text styles, or **Custom** to set font, weight, a desktop and a phone size, line height, letter spacing and case for this section.
- **The section's own settings** follow, in the order its file declares them, each with its help text. A setting marked responsive has a Desktop, Tablet, Phone switch above it.
- **Blocks**, if it has any. Each block has a grip to drag it up or down with a mouse or a finger, or with the arrow keys. It can also be duplicated, deleted, and opened to edit its own settings. **Add** adds another, until the section's `limit` for that kind of block or its `max_blocks`. Clicking a block in the canvas opens it in the list.
- **Hide**, **Duplicate** and **Delete** are pinned along the bottom.

A section's file decides which of these it offers; see [Schema](/developers/schema#top-level). With the inspector on, a selected section also shows a small toolbar at its top right: Ask AI, Move up, Move down, Duplicate, Hide and Delete.

### Every control a section can have

A section declares its settings in its schema, and each type is drawn as one control. This is every type, drawn as the builder draws it. To write one, see [Schema](/developers/schema).

@[builder-controls]

### The header's own panel

The header has a panel of its own, in three parts.

- **Store Logo**: the logo, its height, a nudge left or right, a separate logo for phones if you want one, and the logo's height on phones, which applies to whichever logo the phone shows.
- **Navigation Links**: up to eight links, each with a label, where it goes, and whether it opens in a new tab. Drag to reorder. Each link can hold one level of sub-links. Once the site has menus of its own, **Links** at the top can show one of them instead; the links here are kept for when you switch back. The same links and menus are in Website settings › Navigation.
- **Header Settings**: the layout on a computer (logo left, nav inline, nav centred, or logo centred) and on a phone; **Menu on phones**, which slides in from the left or the right or covers the screen; the colour scheme; how menu links react to the pointer; width and spacing; sticky behaviour (always, or only when scrolling up); a transparent header, on every page or on the home page only; a bottom border and shadow; which icons show (search, account, wishlist, cart); and an optional button with its own text and link.

The header and the sections in the Header group, such as an announcement bar, are the same on every page.

## Theme settings

The settings that belong to the whole website, under the **Theme** tab of the sidebar, where the panel is called General Settings. **Theme settings** in the **…** menu opens it too. How they are stored is in [Themes](/developers/themes#theme-settings).

The panel has nine groups. Every setting in them changes something a visitor sees, on the live site and in the canvas alike. Settings that used to be here and now live elsewhere are listed at the end.

### Logo and brand

The store's name, logo and its height, an optional smaller logo for phones, the favicon and a tagline. The logo is kept in step with the header's Store Logo: change it in either place.

**Brand information**, under it, is a headline, a description and a picture about the shop. Any text setting can show them with **Insert shop data**, and a section reads them as `theme.brand`.

@[theme-settings:branding]

### Colors

Every section picks one **colour scheme**. Change a scheme here and every section using it changes with it. A website starts with five:

@[builder-schemes]

Pick a scheme to edit it: its name, whether new sections start on it, and its twenty-one colours in five groups (surface, text, primary button, secondary button, inputs). Each button has a colour on hover, worked out from the button until you set one. If a pair of colours is hard to read, it says so and by how much. A scheme can also lay a gradient over its background. **Add scheme** makes another; a scheme you made can be deleted, and the sections on it move to another.

**Page colors**, under Colors, are the colours of the page itself, behind and around sections: its background, its text, and the primary colour of the parts that are not a section (the cart notice's button, the free shipping bar, the cookie banner's accent). How a section picks its scheme, and how one section can change a colour for itself, is in [Styling](/developers/styling#colour-schemes).

@[theme-settings:colors]

### Typography

Three fonts, and nine text styles every section uses unless it sets its own.

@[theme-settings:typography]

The text styles, with their defaults. Each can be changed: font, weight, a size for desktop and one for phones, line height, letter spacing and case. The phone size applies when the section is 767px wide or less, so the canvas's phone preview shows it. A dot marks a style you changed, and **Reset style** puts it back.

@[builder-type-styles]

### Buttons and inputs

Every button a section draws (its style, shape, corner radius, shadow and what it does under the pointer), then **Variant pills**, the buttons a product's options are picked with, and **Text boxes**: every text box, dropdown and text area a section draws, such as search, sign in, newsletter and contact.

@[theme-settings:buttons]

### Layout

The page's frame: how wide the content gets, the space at its sides, the space between sections, and **Spacing scale**, which multiplies every section's own top and bottom padding. Then the corners and shadows of what sits in a section:

- **Cards**: the corner radius every section's cards and boxes use, a shadow and an outline for the boxes a section marks as cards (a feature card, a plan).
- **Images and video**: corners, outline and shadow of pictures and videos in sections.
- **Dropdowns and pop-ups**: menus that drop down from the header, and boxes that open over the page.
- **Breadcrumbs**: Home > Shop > the product, Home > Search, a bar under the header on every page except the home page, on the colours of the section under it. Six separators, a Plain or Pill style, and Home as a word or an icon. A page that already shows breadcrumbs (a Breadcrumbs section, or the product section's Breadcrumbs block) keeps its own and gets no second bar. In the editor, clicking the bar opens this group.

@[theme-settings:layout]

Card shadow, card border, the image outline and shadow, and the dropdown settings change a page only once a value is chosen: a site that never opens them looks as it always did.

### Product cards

- **Product cards**: a product in a grid, a featured collection, the 404 page's suggestions. **Standard** puts the corners, outline and shadow on the picture; **Card** puts them round the whole card, on a faint fill of its own text colour, with the words inset.
- **Collection cards**: the same choices, for a collection in a Collection list.
- **Badges**: the Sale label on a product with a price to compare against, and the Sold out label on one whose stock has run out.
- **Show currency codes**: prices read $48.00 USD rather than $48.00.

@[theme-settings:product_cards]

The card and badge settings change a page only once a value is chosen.

### Cart and checkout

What Add to cart does (open the cart drawer, go to the cart page, or show a short notice), and the free shipping bar, which counts down from the threshold as the cart fills.

@[theme-settings:cart]

### Social links

One address per platform. The footer draws an icon for each one that is filled in, in the platform's own mark, in the footer's text colour, each named for its platform for screen readers; empty ones are left out. **Show icons in header** puts the same row in the header. Type an address the way you would in a browser: `instagram.com/name` is given its `https://`, and Email takes an address, which becomes a link that opens the visitor's mail app. A footer can also hold its own Instagram, X, Facebook, TikTok and YouTube links, which win over these for that footer.

@[theme-settings:social]

### Animations

@[theme-settings:animations]

### Custom CSS

Your own CSS for every page of the site, as Shopify's Custom CSS. A rule is kept inside the page: `.card__title { … }` styles the cards on your site and cannot reach the builder. `html`, `body` and `:root` mean the page itself. Left out, and listed under the box: `@import`, `@font-face`, the `<` character, backslash escapes, `expression()`, and any `url()` that is not https or one of your own paths. A media query that asks only about width becomes the same container query, so the phone preview shows your phone rules.

@[theme-settings:custom_css]

### Menus

Named lists of links that a section can show: a footer column, a second navigation, a list of courses. A link can have links under it. The header's own links are always there as **Main menu**, so a section that shows the main menu shows the header's navigation without it being typed twice.

Menus belong to the store, not to one theme, the way Shopify's Navigation does. Every theme shows the same menus, and a change goes live on all of them as soon as it is made. They are edited in **Navigation**, which opens from the Pages list and from **Edit menu** under any menu setting. A theme's settings keep a copy under `menus` for stores where store menus are not switched on yet; where they are, the store's menus are used instead.

@[theme-settings:menus]

### Settings that moved

- **SEO**: the site title, description, share image, share card size and whether search engines may list the site are in Website settings › **SEO & Social**.
- **Cookie and privacy**: the cookie banner is in Website settings › **Policies**.
- **Announcement bar**: the bar is a section now, **Announcement bar**, added in the Header group, with its own messages and colours. A site that still has the old bar switched on sees **Old announcement bar** in this panel, holding only the switch, until it is turned off.
- **Favicon** is also in Website settings › **General**. Both edit the same setting.

The old announcement bar's switch, as that site sees it:

@[theme-settings:announcement]

Values saved under the old settings are kept, and the live site keeps reading them where it did. See [Themes](/developers/themes#settings-taken-out-of-the-panel).

## The canvas

The canvas is your page, drawn the way a visitor sees it, by the same renderer.

**With the inspector on**, a section shows a faint ring under the pointer and a solid one when selected. Clicking selects a section, or a block inside it. Clicking into a form field lets you type in it rather than selecting the section. Hovering the gap between two sections shows **Add a section here**.

**With the inspector off**, the canvas is a plain preview: links inside the website open that page in the builder.

Either way, the builder never leaves itself:

- A link to a page of the website opens that page in the builder. A link to a page that does not exist yet offers **Create this page**.
- Links to other websites, email links and phone links do nothing.
- Forms do not submit, and nothing can be bought. A sign-up box in the canvas does not subscribe anyone.

The phone preview is 390px wide, the width of the most common phones. A section's layout answers to its own width, so the phone preview draws the phone layout exactly as a phone would.

A section that fails to draw says so in its place, in red, naming the file and the line, with the rest of the page unaffected. On the live site the same section is left out. See [Publishing and checks](/developers/publishing#when-a-visitor-opens-a-page).

## Undo and redo

**⌘Z** or **Ctrl+Z** undoes, and **⌘⇧Z**, **⌘Y** or **Ctrl+Y** redoes, as do the two arrows in the top bar.

- The last 30 changes can be undone: moving, hiding, duplicating and deleting sections and blocks, settings, theme settings and what Ask AI changed on the page.
- A run of typing in one box is one step.
- Changing page starts a fresh history, so Undo never reaches into a page you are not looking at.
- Undo does not reach a section file saved in the code editor, which has its own [History](#the-code-editor), or a page you deleted.

## Saving and publishing

- **The draft saves itself**, a second and a half after your last change: the theme settings, then the page you are on, then the header and footer copied onto every page. There is no save button to remember while editing. A save that fails says so.
- **The live website does not change until you publish.** Visitors see the published version and nothing else.
- On a website that is not live, the top bar's button is **Save**. It is published from Website settings › Publishing or from its menu in the library.

### Publishing

On the live website, **Publish** opens the Publish panel: the website's address, who can see it, when it was last published, **Preview**, and **Publish changes**. Publishing puts every page's draft, the theme settings and the saved section files live at once, and keeps a backup. Every step is in [Publishing and checks](/developers/publishing#what-publish-does).

**Preview** makes a private link that shows the drafts to anyone you send it to, and the panel then shows the link with a copy button and **Turn off**. See [Preview links](/developers/sharing-themes#preview-links).

### Backups

Website settings › **Backups & Versions** lists the website's backups. One is kept every time you publish, every time Ask AI finishes a task, and before a connected agent changes a page. **Back up now** makes one; **Restore** puts one back as the draft, after backing up the draft it replaces. The newest 30 are kept. A backup holds the theme settings and every page; section files keep their own history in the code editor.

## Ask AI

Ask AI has two modes.

- **Change this page**: describe a change and it is made with the same sections, blocks and settings the panels use. It is one step of Undo, and nothing is saved until the builder saves. Select a section first and it can be limited to that one.
- **Code a section**: describe a section the library does not have. It is written as a section file, compiled, and only kept if it compiles and passes the same checks as any agent's file; a file that fails is sent back to be fixed, up to three times. While it is being written, the panel says what it is doing (Starting, Thinking, Writing the section, Checking it, Fixing a detail), the spot it will fill shows code being typed, and the finished section takes its place. If it still cannot get it right, it says so in plain words with **Try again**, never with the compiler's report.

Both modes answer rather than guess. A greeting, a question, or a request too unclear to act on gets a short reply saying what it understood and what to ask for, and nothing on the page changes.

You can attach up to four pictures (PNG, JPEG, WebP or GIF) of something you want built. Pressing Enter while it is working queues the next request.

## The code editor

**Code**, in the top bar, opens the website's files in a tree: the section files, the templates, the settings, the snippets and the styles. The list marks files you changed in blue and unsaved ones in amber.

- **Save** (or ⌘S) compiles a section file first. If it does not compile, nothing is saved, and each error is listed with its line; press one to jump to it, or **Solve with AI**.
- A save is a draft: the live website changes when you publish.
- **New file** under `sections/` saves a starter section that already compiles, with a colour scheme, a heading, text and spacing, and a preset, so it is in Add Section at once.
- **History** lists every save of a file, the newest 50; open any of them to bring it back.
- **Revert** puts a theme file back to how the theme shipped it. Your own files can be renamed, duplicated and deleted; the editor warns first if a page uses the section.
- Unsaved edits are kept in the browser, and offered back when you return.

Only `sections/*.storelib` changes what the site draws. The other files in the tree are views of the theme's data, and saving an edit to one changes nothing on the site; see [Themes](/developers/themes#what-the-site-reads-and-what-it-does-not). The language section files are written in is the [Storelib Builder Framework](/developers/sections).

## Website settings

**Website Settings**, in the top bar, is a page of its own, with nine subjects about the website down the left and Connections under its own heading, Code. On a phone they are a list, and each opens with its own Back. On the Websites page, **Settings** beside the live website opens it, and a draft's own is in that draft's **More** menu.

Every website has its own settings. Anything marked below as part of the draft is saved with the website's other changes, can be undone, and reaches visitors when you publish.

| Page | What is there |
| --- | --- |
| General | The website's name, which only you see. Its address, set by your username. Whether it is live. Its favicon and its language (both part of the draft); the language sets the page's `lang` and the share card's locale. |
| Domains | The Storelib address, which starts as your username and can be given its own name with **Change address** (your username stays as it is, and the old address keeps working), and a custom domain if one is connected, with its status: waiting for DNS, securing, or connected. The `www.` address is the main one and the bare domain redirects to it. HTTPS is set up for both. A domain is added right here. Until it is connected, the three DNS records to set are listed, each with a copy button, and **Check DNS** looks them up. A site has one domain. Adding another asks first, then the old one sends its visitors to the new one for 30 days. Removing a domain is in Settings › Domains. |
| SEO & Social | A preview of the search result. Site title, meta description, social image, share card size, and whether search engines may list the website (all part of the draft). |
| Pages | Every page with **Edit**, which opens it in the builder, and **Add page**. **Search** opens the page's own search result: its title, its description, and **Show in search engines**. Off gives the page `noindex` and leaves it out of the sitemap. These are stored in the theme settings as `page_seo`, keyed by page, so they are saved with the draft and go live on publish. The home page's search result is the site's own, in SEO & Social. |
| Navigation | The header's links, edited in place: add, rename, point anywhere with the link picker, drag to reorder, and one level of sub-links. **Links come from** switches the header to one of the site's menus. The footer's two menu columns. **Menus**, the named lists of links a header, a footer column or any section can show, are the store's: shared by every theme and live as soon as they change. Which menu the header and footer show is theirs, so that part is in the draft, saved with Undo, and live on publish. |
| Commerce | How many published products the website can show, and **Manage products**. Checkout is Storelib's, paid by card or Google Pay through Stripe, in US dollars. **Payments settings** is where payouts go. |
| Policies | The refund, privacy and terms pages, each with **Edit**. The cookie banner: **Show the cookie banner** (off means no banner, and nothing optional is stored for visitors), its message and its two buttons, which start with the site's default words, and **Use my own colours**. All part of the draft, and the same settings as the builder's Cookie & privacy. |
| Publishing | Live or draft, the published address, when it was last published, **Publish**, and **Take offline**, which asks first and deletes nothing. |
| Backups & Versions | See [Backups](#backups). **Duplicate** makes a draft copy of the website, if the library has room. |
| Connections | Under Code, apart from the website's own settings. **Connect Claude Code, Codex or ChatGPT**: directly with a token and one line in a terminal, or through a GitHub repository. Whatever they write is a draft until you publish, and they never change a built-in section. **Edit code**, and the developer docs. See [Building with AI agents](/developers/ai) and [Rules before you ship](/developers/rules). |

**How a published website is found.** Every published website answers for itself, at its Storelib address and on a connected domain:

- `/sitemap.xml` lists every published page and product, when each product last changed, and every picture on them, so pictures are indexed along with pages.
- `/robots.txt` lets crawlers in and names that sitemap. It keeps previews, the basket and search results out.
- Every page names its **canonical** address, which is the connected domain when there is one, so the two addresses count as one page.
- The home page carries structured data naming the website and its owner. A product page carries the product with its price, which is what lets a search result show the price and picture.
- With search engines switched off, pages say `noindex` and the sitemap is not offered. Crawlers are still let in, so they read the `noindex` and drop the pages.

A creator keeps up to five websites: one live and four drafts. Add theme, Duplicate and Import all refuse a sixth, on the server, and the Websites page shows which websites are taking the room with **Remove** beside each draft. See [Themes](/developers/themes#the-website-library).
