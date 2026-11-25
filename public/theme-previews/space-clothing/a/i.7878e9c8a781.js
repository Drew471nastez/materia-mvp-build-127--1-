
(() => {
  if (window.__materiaLiveImages) return;
  const editor = !!window.SlTheme?.designMode || document.documentElement.classList.contains('shopify-design-mode');
  if (!editor) return;
  window.__materiaLiveImages = true;
  document.documentElement.classList.add('shopify-design-mode', 'mt-editor');
  const imagesIn = node => node.tagName === 'IMG' ? [node] : (node.firstElementChild ? [...node.getElementsByTagName('img')] : []);
  const galleriesIn = node => {
    if (node.tagName === 'MEDIA-GALLERY') return [node];
    return node.querySelectorAll ? [...node.querySelectorAll('media-gallery')] : [];
  };
  const slideToken = slide => {
    const img = slide.querySelector('img');
    if (img) return img.getAttribute('src') || '';
    const video = slide.querySelector('video');
    if (video) return video.getAttribute('src') || video.getAttribute('poster') || 'video';
    const frame = slide.querySelector('iframe');
    if (frame) return frame.getAttribute('src') || 'frame';
    return slide.getAttribute('data-media-id') || 'slide';
  };
  const stableClass = el => (el && typeof el.className === 'string' ? el.className : '').replace(/\b(?:swiper-[\w-]+|mt-sticky-tall|mt-media-loading|mp-is-sticky)\b/g, '').replace(/\s+/g, ' ').trim();
  const gallerySig = gallery => {
    const holder = gallery.querySelector('slide-with-thumbs');
    const main = gallery.querySelector('.swiper-wrapper-preview > .swiper-wrapper');
    const slides = main ? [...main.children].filter(s => s.classList.contains('swiper-slide') && !s.classList.contains('swiper-slide-duplicate')) : [];
    const pictures = slides.length ? slides.map(slideToken) : [...gallery.querySelectorAll('img')].map(img => img.getAttribute('src') || '');
    const attrs = holder ? ['data-thumb-direction', 'data-desktop', 'data-mobile', 'data-direction', 'data-spacing', 'data-loop'].map(name => holder.getAttribute(name) || '').join('|') : '';
    return [
      gallery.getAttribute('data-mt-product-id') || '',
      gallery.getAttribute('data-mt-gallery-config') || '',
      gallery.getAttribute('data-mt-gallery-media') || '',
      gallery.getAttribute('data-layout') || '',
      gallery.hasAttribute('data-square') ? '1' : '0',
      gallery.hasAttribute('data-mt-lightbox') ? '1' : '0',
      gallery.getAttribute('data-mt-video') || '',
      stableClass(gallery),
      stableClass(holder),
      attrs,
      gallery.querySelector('zoom-action')?.getAttribute('data-type') || '',
      pictures.join('\n')
    ].join('\u0001');
  };
  const keep = (fresh, old) => {
    // The new element's attributes win (classes, sizes, alt); only the decoded picture is reused.
    for (const {name} of [...old.attributes]) if (!fresh.hasAttribute(name)) old.removeAttribute(name);
    for (const {name, value} of [...fresh.attributes]) if (old.getAttribute(name) !== value) old.setAttribute(name, value);
    old.classList.remove('bls-loading-image');
    fresh.replaceWith(old);
    old.closest('motion-element')?.classList.remove('bls-loading-image');
  };
  const observer = new MutationObserver(records => {
    const removedGalleries = [];
    const addedGalleries = [];
    let pool = null;
    for (const record of records) {
      for (const node of record.removedNodes) {
        if (node.nodeType !== 1 || node.isConnected) continue;
        for (const gallery of galleriesIn(node)) if (!gallery.isConnected) removedGalleries.push(gallery);
        for (const img of imagesIn(node)) {
          if (!img.complete || !img.naturalWidth || img.closest('[data-no-image-carry], media-gallery')) continue;
          pool ||= new Map();
          if (!pool.has(img.src)) pool.set(img.src, img);
        }
      }
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        for (const gallery of galleriesIn(node)) if (gallery.isConnected) addedGalleries.push(gallery);
      }
    }
    if (!removedGalleries.length && !pool) return;
    // Our own swaps must not be seen as another re-render.
    observer.disconnect();
    const used = new Set();
    for (const fresh of addedGalleries) {
      if (!fresh.isConnected) continue;
      const sig = gallerySig(fresh);
      const old = removedGalleries.find(gallery => !used.has(gallery) && gallerySig(gallery) === sig);
      if (!old) continue;
      used.add(old);
      old._mtHeld = true;
      for (const token of fresh.classList) old.classList.add(token);
      for (const {name, value} of fresh.attributes) {
        if (name === 'class') continue;
        if (old.getAttribute(name) !== value) old.setAttribute(name, value);
      }
      fresh.replaceWith(old);
    }
    if (pool) for (const record of records) for (const node of record.addedNodes) {
      if (node.nodeType !== 1 || !node.isConnected) continue;
      for (const img of imagesIn(node)) {
        if (!img.isConnected || img.closest('media-gallery')) continue;
        const old = pool.get(img.src);
        if (!old || old === img || old.getAttribute('srcset') !== img.getAttribute('srcset')) continue;
        if (old.closest('media-gallery')) continue;
        pool.delete(img.src);
        keep(img, old);
      }
    }
    observer.takeRecords();
    observer.observe(document.documentElement, {childList: true, subtree: true});
  });
  observer.observe(document.documentElement, {childList: true, subtree: true});
})();
