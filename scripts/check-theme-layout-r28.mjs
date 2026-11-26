/**
 * ===========================================================================
 *  MATERIA LAYOUT ON EVERY TEMPLATE (round 28)
 * ===========================================================================
 * Measures every template's prerendered website (public/theme-previews, run
 * scripts/build-template-previews.ts first) in headless Chromium, so each
 * class of problem the owner reported on one template is caught on any:
 *
 *   GALLERY   on a product page with one picture and with several, at 1024,
 *             1440, 1920 and 390 wide: the pictures fill the gallery column
 *             (no empty half beside one picture) and start level with the
 *             details beside them
 *   SIZES     the price at least half the title; the rating 13.5px or more
 *   ROWS      every row of product cards on product, home, FAQ and blog
 *             pages: 12px or more from the screen's edges, 8px or more
 *             between cards and between their buttons
 *   STICKY    the sticky add to cart bar at 390 and 1440: 12px or more each
 *             side, nothing past the screen, the label not cut, and still so
 *             with a long price
 *   FAQ       12px or more between a bordered FAQ item's edge and its text
 *   BLOG      pictures fill their frames; 56px or less from the heading to
 *             the pictures; 40px or less from a picture to its text
 *   FLAGS     every country flag a circle with its picture centred
 *   MENUS     the first dropdown with a panel: closes within 300ms of
 *             starting, nothing inside outlives the panel, the panel keeps a
 *             solid background while it fades; the phone menu drawer is out
 *             of view within 360ms
 *
 *   node scripts/check-theme-layout-r28.mjs [slug ...]     (all templates)
 *
 * tests/theme-layout-r28.test.ts checks the rules these measure in the files.
 */
import puppeteer from "puppeteer-core"
import { createServer } from "node:http"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { extname, join, normalize } from "node:path"

/* Injected into each page as window.__m: product(), rows(), sticky(), faq(), blog(), flags(). */
const MEASURE = `// Measurement functions injected into a page. window.__m.product(), .rows(), .sticky(), .faq(), .blog(), .flags()
window.__m = (() => {
  const R = (e) => e.getBoundingClientRect();
  const vis = (e) => { const r = R(e); if (r.width < 2 || r.height < 2) return false; const cs = getComputedStyle(e); return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05; };
  const fs = (e) => e ? parseFloat(getComputedStyle(e).fontSize) : null;
  const round = (n) => Math.round(n * 10) / 10;

  function product() {
    const media = document.querySelector('.product-detail__media');
    const info = document.querySelector('.product-detail__information');
    if (!media || !info) return { none: true };
    const mr = R(media), ir = R(info);
    const mcs = getComputedStyle(media);
    const innerL = mr.left + parseFloat(mcs.paddingLeft), innerR = mr.right - parseFloat(mcs.paddingRight);
    const gal = media.querySelector('media-gallery') || media;
    const imgs = [...gal.querySelectorAll('img, video, model-viewer, .placeholder-svg, svg.placeholder')].filter((i) => vis(i) && R(i).width > 60 && !i.closest('.thumbnail, .swiper-thumbs, [class*=thumb]'));
    let fill = null, leftGap = null, mainW = null, mainH = null, frameW = null, galTop = null;
    if (imgs.length) {
      const top = Math.min(...imgs.map((i) => R(i).top));
      const row = imgs.filter((i) => Math.abs(R(i).top - top) < 8 && R(i).right > innerL + 2 && R(i).left < innerR - 2);
      // what the eye sees: the pictures' frames (the link around an image), clipped to the column
      const frames = row.map((i) => { const f = i.closest('a, .media-gallery__image, .swiper-slide, [style*="--aspect-ratio"]') || i; return R(f); });
      const L = Math.max(innerL, Math.min(...frames.map((f) => f.left))), Rr = Math.min(innerR, Math.max(...frames.map((f) => f.right)));
      frameW = Rr - L;
      fill = round((Rr - L) / (innerR - innerL));
      leftGap = Math.round(L - innerL);
      mainW = Math.round(R(row[0]).width); mainH = Math.round(R(row[0]).height);
      galTop = Math.round(top);
    }
    const sideBySide = mr.right <= ir.left + 4 || ir.right <= mr.left + 4;
    const title = info.querySelector('.product-detail__title, h1');
    const priceBox = info.querySelector('.product-detail__price') || info.querySelector('[class*=price]');
    const priceEl = priceBox && ([...priceBox.querySelectorAll('*')].filter((e) => vis(e) && !e.closest('s, del, .compare-price, .price-item--compare, .visually-hidden') && [...e.childNodes].some((n) => n.nodeType === 3 && /\\d/.test(n.textContent))).sort((a, b) => fs(b) - fs(a))[0] || priceBox);
    const ratingBox = [...info.querySelectorAll('.product-detail__review, .product__review, [class*=rating], [class*=review], .jdgm-preview-badge, .spr-badge')].find((e) => vis(e) && R(e).height < 80 && /\\d/.test(e.textContent));
    let ratingText = null, starH = null;
    if (ratingBox) {
      const t = [...ratingBox.querySelectorAll('*')].concat([ratingBox]).filter((e) => vis(e) && [...e.childNodes].some((n) => n.nodeType === 3 && /\\d/.test(n.textContent)));
      ratingText = t.length ? Math.min(...t.map(fs)) : null;
      const stars = [...ratingBox.querySelectorAll('svg, .star, [class*=star]')].filter(vis);
      starH = stars.length ? round(Math.max(...stars.map((s) => R(s).height))) : (/[★☆]/.test(ratingBox.textContent) ? ratingText : null);
    }
    const bodyP = info.querySelector('.product_description p, .product__description p, p');
    const body = fs(document.body);
    return {
      w: innerWidth, sideBySide, colW: Math.round(innerR - innerL), frameW: frameW && Math.round(frameW), fill, leftGap, mainW, mainH,
      topDelta: sideBySide && galTop != null ? Math.round(Math.min(R(gal).top, galTop) - ir.top) : null,
      infoTop: Math.round(ir.top), galTop,
      title: fs(title), price: fs(priceEl), priceText: priceEl && priceEl.textContent.trim().slice(0, 20),
      rating: ratingText, star: starH, body, para: fs(bodyP),
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  }

  function rows() {
    const out = [];
    document.querySelectorAll('.shopify-section, [id^=shopify-section]').forEach((sec) => {
      if (sec.parentElement && sec.parentElement.closest('[id^=shopify-section]')) return;
      if (sec.closest('header, footer, sticky-add-cart, .drawer, [role=dialog]')) return;
      const items = [...sec.querySelectorAll('.product-item')].filter((i) => vis(i) && !i.closest('sticky-add-cart, .drawer, [role=dialog], .submenu'));
      if (items.length < 2) return;
      const rs = items.map(R);
      const top = Math.min(...rs.map((r) => r.top));
      const row = items.filter((i, k) => Math.abs(rs[k].top - top) < 6).sort((a, b) => R(a).left - R(b).left);
      if (row.length < 2) return;
      const rr = row.map(R);
      const onScreen = rr.filter((r) => r.right > 0 && r.left < innerWidth);
      const btn = (i) => [...i.querySelectorAll('[class*=pc-atc], .product__add-cart, button[name=add], .product-item__button-submit, button-quickview, .product-item__select-options')].find(vis);
      const b0 = btn(row[0]), b1 = btn(row[1]);
      const gaps = rr.slice(1).map((r, k) => Math.round(r.left - rr[k].right));
      out.push({
        sec: (sec.id || '').replace('shopify-section-', '').slice(0, 40),
        n: row.length,
        left: Math.round(onScreen.length ? Math.min(...onScreen.map((r) => r.left)) : rr[0].left),
        right: Math.round(innerWidth - Math.max(...onScreen.map((r) => Math.min(r.right, innerWidth + 1000)))),
        lastRightRaw: Math.round(innerWidth - rr[rr.length - 1].right),
        gap: Math.min(...gaps),
        btnInsetL: b0 ? Math.round(R(b0).left - rr[0].left) : null,
        btnInsetR: b0 ? Math.round(rr[0].right - R(b0).right) : null,
        btnGap: b0 && b1 ? Math.round(R(b1).left - R(b0).right) : null,
        btnW: b0 ? Math.round(R(b0).width) : null, cardW: Math.round(rr[0].width),
        scroller: !!row[0].closest('.swiper, .grid_scroll, [data-free-scroll], .overflow-x-auto'),
      });
    });
    return out;
  }

  function sticky() {
    const s = document.querySelector('sticky-add-cart');
    if (!s || !vis(s)) return { none: true };
    const sr = R(s);
    const parts = [...s.querySelectorAll('button, select, .mt-select, img, .product-item__information, [class*=price], input')].filter(vis);
    if (!parts.length) return { bar: [sr.left, sr.width] };
    const L = Math.min(...parts.map((p) => R(p).left)), Rr = Math.max(...parts.map((p) => R(p).right));
    const btn = [...s.querySelectorAll('button[name=add], .product-form__submit, button[type=submit]')].find(vis);
    let labelCut = null;
    if (btn) { const l = btn.querySelector('.btn-label') || btn; const inline = getComputedStyle(l).display === 'inline'; labelCut = btn.scrollWidth > btn.clientWidth + 1 || (!inline && l.scrollWidth > l.clientWidth + 1); }
    return { w: innerWidth, barL: Math.round(sr.left), barW: Math.round(sr.width), padL: Math.round(L - sr.left), padR: Math.round(sr.right - Rr), labelCut, overflow: document.documentElement.scrollWidth - innerWidth };
  }

  const visibleBorder = (cs, side) => parseFloat(cs['border' + side + 'Width']) > 0 && cs['border' + side + 'Style'] !== 'none' && !/rgba\\(\\d+, \\d+, \\d+, 0\\)|transparent/.test(cs['border' + side + 'Color']);
  function faq() {
    const out = [];
    const roots = [...document.querySelectorAll('[id^=shopify-section]')].filter((s) => /faq|accordion|collaps|question/i.test(s.id + ' ' + s.className + ' ' + (s.firstElementChild && s.firstElementChild.className)) || s.querySelector('[data-faq-root], details, collapsible-block, .accordion'));
    roots.forEach((sec) => {
      if (sec.closest('header, footer')) return;
      if (sec.querySelector('.product-detail__information') && !/faq/i.test(sec.id)) return; // product info accordions measured on their own pages
      let worst = null;
      sec.querySelectorAll('*').forEach((e) => {
        if (!vis(e)) return;
        const cs = getComputedStyle(e);
        const boxed = visibleBorder(cs, 'Left') && visibleBorder(cs, 'Right');
        const filled = !boxed && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== getComputedStyle(sec).backgroundColor && e.querySelector('button, summary, [aria-expanded]') && R(e).width < innerWidth - 4;
        if (!boxed && !filled) return;
        const er = R(e);
        if (er.height > 2000) return;
        const inL = er.left + (boxed ? parseFloat(cs.borderLeftWidth) : 0), inR = er.right - (boxed ? parseFloat(cs.borderRightWidth) : 0);
        const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
        let n, minL = 1e9, minR = 1e9, minT = 1e9;
        while ((n = walker.nextNode())) {
          if (!n.textContent.trim() || !vis(n.parentElement)) continue;
          if (n.parentElement.closest('[aria-hidden=true]') && !/\\w/.test(n.textContent)) continue;
          const rg = document.createRange(); rg.selectNodeContents(n);
          for (const r of rg.getClientRects()) { if (r.width < 1) continue; minL = Math.min(minL, r.left - inL); minR = Math.min(minR, inR - r.right); minT = Math.min(minT, r.top - er.top); }
        }
        if (minL === 1e9) return;
        const m = Math.min(minL, minR);
        if (!worst || m < worst.inset) worst = { inset: Math.round(m), insetL: Math.round(minL), insetR: Math.round(minR), insetT: Math.round(minT), el: e.tagName + '.' + String(e.className).slice(0, 40), boxed };
      });
      out.push({ sec: sec.id.replace('shopify-section-', '').slice(0, 40), worst });
    });
    return out;
  }

  function blog() {
    const out = [];
    document.querySelectorAll('[id^=shopify-section]').forEach((sec) => {
      const cards = [...sec.querySelectorAll('.blog-posts-item, .mb-card, .article-card, [class*=article-card], .blog-featured-item, [class*=blog-card]')].filter(vis);
      if (!cards.length) return;
      const c = cards[0];
      const frame = c.querySelector('.blog-posts-image a, .mb-card__media, [style*="--aspect-ratio"], .article-card__image');
      const img = frame && frame.querySelector('img');
      const head = sec.querySelector('.section__header h2, .section__header, h2, h1');
      const title = c.querySelector('.blog-posts-info, .mb-card__body, .blog-posts-title, h3, h2');
      const fr = frame && R(frame), ir = img && vis(img) && R(img);
      out.push({
        sec: sec.id.replace('shopify-section-', '').slice(0, 30),
        headToImg: head && fr ? Math.round(fr.top - R(head).bottom) : null,
        imgFill: fr && ir ? round(ir.height / fr.height) : null,
        imgToTitle: fr && title ? Math.round(R(title).top - (ir ? Math.max(ir.bottom, fr.bottom) : fr.bottom)) : null,
        visibleImgToTitle: ir && title ? Math.round(R(title).top - Math.min(ir.bottom, fr.bottom)) : null,
      });
    });
    return out;
  }

  function flags() {
    return [...document.querySelectorAll('.localization-flags')].filter(vis).map((f) => {
      const fr = R(f), img = f.querySelector('img'), cs = getComputedStyle(f);
      const ir = img && R(img);
      const holder = f.closest('header, footer, [id*=announcement], [id*=top_bar], [id*=top-bar], .drawer, nav, .mobile-navigation-bar');
      return { where: holder ? (holder.id || holder.tagName + '.' + String(holder.className).slice(0, 20)) : '?', w: round(fr.width), h: round(fr.height), radius: cs.borderRadius, imgW: ir && round(ir.width), imgH: ir && round(ir.height), dx: ir && round(ir.left + ir.width / 2 - (fr.left + fr.width / 2)), dy: ir && round(ir.top + ir.height / 2 - (fr.top + fr.height / 2)),
        /* the emoji flag picture (32 by 24, the flag's own area 13.3 units tall without its wavy edge): how much of the circle's height that area covers */
        emojiCover: img && /^data:image\\/svg/.test(img.getAttribute('src') || '') ? round((ir.height * 13.3 / 24) / fr.height) : null };
    });
  }
  return { product, rows, sticky, faq, blog, flags };
})();
`

const root = process.cwd()
const PREVIEWS = join(root, "public")
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".webp": "image/webp", ".woff2": "font/woff2", ".woff": "font/woff", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json", ".gif": "image/gif", ".mp3": "audio/mpeg", ".mp4": "video/mp4" }
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "")
  const file = join(PREVIEWS, path)
  if (!file.startsWith(PREVIEWS) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); return res.end() }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" })
  res.end(readFileSync(file))
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const BASE = `http://127.0.0.1:${server.address().port}/theme-previews`

const shared = readFileSync(join(root, "lib/themes/marketplace-shared.ts"), "utf8")
const ALL = [...shared.matchAll(/\{ slug: ([^,]+), template: "([^"]+)"/g)].map((m) => (m[1] === "DEFAULT_LISTING_SLUG" ? "storelib-default" : m[1].replace(/"/g, "")))
const args = process.argv.slice(2)
const slugs = args.length ? args : ALL
const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })

const failures = []
let checks = 0
function expect(label, ok, detail) { checks++; if (!ok) failures.push(`${label} ${JSON.stringify(detail ?? "")}`) }

async function open(url, width, height = 900) {
  const page = await browser.newPage()
  await page.setViewport({ width, height })
  await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 }).catch(() => {})
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)) } window.scrollTo(0, 0) })
  await new Promise((r) => setTimeout(r, 700))
  await page.addScriptTag({ content: MEASURE })
  return page
}
const m = (page, fn) => page.evaluate((f) => window.__m[f](), fn)
function rowsOk(where, rows) {
  for (const row of rows ?? []) {
    expect(`${where} ${row.sec}: a product row keeps 12px from the screen's edges`, row.left >= 12 && (row.scroller || row.lastRightRaw >= 12 || row.right >= 12), row)
    expect(`${where} ${row.sec}: cards keep a gap of 8px or more`, row.gap >= 8, row)
    if (row.btnGap != null) expect(`${where} ${row.sec}: card buttons are not glued together`, row.btnGap >= 8, row)
  }
}

for (const slug of slugs) {
  const dir = join(PREVIEWS, "theme-previews", slug)
  if (!existsSync(dir)) { expect(`${slug}: a preview exists`, false); continue }
  const products = existsSync(join(dir, "products")) ? readdirSync(join(dir, "products")).filter((f) => f.endsWith(".html")).sort() : []
  const pictures = (f) => (readFileSync(join(dir, "products", f), "utf8").match(/class="media-gallery__image/g) ?? []).length
  // the product with the fewest pictures (one picture is where the gallery went wrong), and the first one
  const picks = [...new Set([products.map((f) => [pictures(f), f]).filter((x) => x[0] > 0).sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1))[0]?.[1], products[0]].filter(Boolean))]
  for (const prod of picks) {
    for (const width of [1024, 1440, 1920, 390]) {
      const page = await open(`${BASE}/${slug}/products/${prod}`, width)
      const p = await m(page, "product")
      const at = `${slug} ${prod} @${width}`
      if (!p.none) {
        if (p.fill != null) expect(`${at}: the gallery fills its column`, p.fill >= 0.95 && p.leftGap <= 4, p)
        if (p.topDelta != null) expect(`${at}: the gallery starts level with the details`, Math.abs(p.topDelta) <= 4, p)
        if (p.price && p.title) expect(`${at}: the price is at least half the title`, p.price / p.title >= 0.5, p)
        if (p.rating) expect(`${at}: the rating reads at 13.5px or more`, p.rating >= 13.5, p)
        expect(`${at}: nothing wider than the screen`, p.overflow <= 0, p)
      }
      rowsOk(at, await m(page, "rows"))
      if (width === 390 || width === 1440) {
        await page.evaluate(() => window.scrollTo(0, 1500))
        await new Promise((r) => setTimeout(r, 900))
        const s = await m(page, "sticky")
        if (!s.none && s.padL != null) expect(`${at}: the sticky add to cart bar fits with 12px each side`, s.padL >= 12 && s.padR >= 12 && !s.overflow && !s.labelCut, s)
        if (!s.none && s.padL != null && width === 390) {
          // a long price
          await page.evaluate(() => document.querySelectorAll("sticky-add-cart .mt-sticky-price").forEach((e) => { e.textContent = "$1,249.00" }))
          const l = await m(page, "sticky")
          expect(`${at}: the bar still fits with a long price`, l.padL >= 12 && l.padR >= 12 && !l.overflow, l)
        }
      }
      await page.close()
    }
  }
  const pages = existsSync(join(dir, "pages")) ? readdirSync(join(dir, "pages")).filter((f) => /faq|question|help/i.test(f)).map((f) => `pages/${f}`) : []
  const blogs = existsSync(join(dir, "blogs")) ? readdirSync(join(dir, "blogs")).filter((f) => f.endsWith(".html")).map((f) => `blogs/${f}`) : []
  for (const path of ["index.html", ...pages, ...blogs]) {
    for (const width of [1440, 390]) {
      const page = await open(`${BASE}/${slug}/${path}`, width)
      const at = `${slug} /${path} @${width}`
      rowsOk(at, await m(page, "rows"))
      for (const f of await m(page, "faq")) if (f.worst?.boxed) expect(`${at} ${f.sec}: 12px or more inside a bordered FAQ`, f.worst.inset >= 12, f.worst)
      for (const b of await m(page, "blog")) {
        if (b.imgFill != null) expect(`${at} ${b.sec}: blog pictures fill their frames`, b.imgFill >= 0.98, b)
        if (b.headToImg != null && b.headToImg >= 0) expect(`${at} ${b.sec}: 56px or less from the heading to the pictures`, b.headToImg <= 56, b)
        if (b.imgToTitle != null) expect(`${at} ${b.sec}: 40px or less from a picture to its text`, b.imgToTitle <= 40, b)
      }
      for (const f of await m(page, "flags")) {
        expect(`${at} flag in ${f.where}: a circle`, Math.abs(f.w - f.h) < 0.5 && f.radius === "50%", f)
        if (f.dx != null) expect(`${at} flag in ${f.where}: the picture is centred on it`, Math.abs(f.dx) <= 0.5 && Math.abs(f.dy) <= 1.6, f)
        if (f.emojiCover != null) expect(`${at} flag in ${f.where}: the flag itself fills the circle (no slivers of background)`, f.emojiCover >= 0.98, f)
      }
      await page.close()
    }
  }
  // Menus: a dropdown opens and closes with its contents as one piece, in about 220ms after the pointer's intent delay.
  {
    const page = await open(`${BASE}/${slug}/index.html`, 1440)
    const parents = await page.$$(".navigation.horizontal .menu-parent")
    for (const item of parents) {
      if (!(await item.evaluate((e) => !!e.querySelector(":scope > .submenu")))) continue
      const box = await item.boundingBox()
      if (!box?.width) continue
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await new Promise((r) => setTimeout(r, 700))
      await page.mouse.move(box.x + box.width / 2, 890)
      const trace = await page.evaluate(() => new Promise((done) => {
        const sub = [...document.querySelectorAll(".navigation.horizontal .menu-parent > .submenu")].find((s) => getComputedStyle(s).visibility === "visible")
        if (!sub) return done(null)
        const eff = (e) => { let o = 1; for (let x = e; x && x !== document.body; x = x.parentElement) { const cs = getComputedStyle(x); o *= +cs.opacity; if (cs.visibility === "hidden") return 0 } return o }
        const kids = [...sub.querySelectorAll("a, img, h3, h4, p, span")].filter((e) => e.getBoundingClientRect().width > 0).slice(0, 40)
        const out = []; const t0 = performance.now()
        const bg = () => getComputedStyle(sub).backgroundColor
        const f = () => { const t = performance.now() - t0; out.push([t, eff(sub), kids.length ? Math.max(...kids.map(eff)) : 0, bg()]); if (t < 900) requestAnimationFrame(f); else done(out) }
        f()
      }))
      if (!trace) continue
      const startT = trace.find((x) => x[1] < 0.99)?.[0] ?? 0
      const endT = trace.find((x) => x[1] < 0.02)?.[0] ?? 900
      expect(`${slug} menu: a dropdown closes within 300ms of starting`, endT - startT <= 300, { startT, endT })
      expect(`${slug} menu: nothing inside is still showing after the panel has gone`, trace.every((x) => x[2] <= x[1] + 0.02), trace.filter((x) => x[2] > x[1] + 0.02).slice(0, 3))
      expect(`${slug} menu: the panel keeps a solid background while it fades`, trace.filter((x) => x[1] > 0.05).every((x) => !/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(x[3])), trace.slice(0, 4))
      break
    }
    await page.close()
  }
  // The phone menu drawer slides out with its contents in about 300ms.
  {
    const page = await open(`${BASE}/${slug}/index.html`, 390, 844)
    const has = await page.evaluate(() => { const t = [...document.querySelectorAll('.nav-toggle, [data-action="toggle-nav"]')].find((x) => x.getClientRects().length); if (t) t.click(); return !!t && !!document.querySelector(".navigation.mobile") })
    if (has) {
      await new Promise((r) => setTimeout(r, 700))
      const trace = await page.evaluate(() => new Promise((done) => {
        const nav = document.querySelector(".navigation.mobile")
        const t0 = performance.now(); const out = []
        const c = nav.querySelector("close-menu"); if (c) c.click(); else document.querySelector('[data-action="toggle-nav"]').click()
        const f = () => { const t = performance.now() - t0; out.push([t, nav.getBoundingClientRect().right]); if (t < 900) requestAnimationFrame(f); else done(out) }
        f()
      }))
      const gone = trace.find((x) => x[1] <= 1)?.[0]
      expect(`${slug} phone menu: the drawer is out of view within 360ms`, gone != null && gone <= 360, { gone })
    }
    await page.close()
  }
  process.stdout.write(`${slug} `)
}
await browser.close()
server.close()
console.log(`\n${checks - failures.length} of ${checks} measurements passed`)
for (const f of failures) console.log(`  FAIL ${f}`)
process.exit(failures.length ? 1 : 0)
