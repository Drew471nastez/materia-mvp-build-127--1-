---
id: responsive-images
title: Responsive images and media
category: responsive
summary: srcset and sizes, art direction with picture, aspect ratio boxes, lazy loading, and formats for fast pages.
intents: [build-section, performance, images]
tags: [images, srcset, sizes, picture, lazy-loading, aspect-ratio, art-direction]
components: [image, gallery, hero]
phases: [build, repair]
priority: 4
related: [component-gallery, debug-layout-shift]
version: 1
---
```html
<img src="photo-800.jpg" srcset="photo-480.jpg 480w, photo-800.jpg 800w, photo-1400.jpg 1400w, photo-2000.jpg 2000w" sizes="(min-width: 1200px) 50vw, 100vw" width="1400" height="1750" alt="Coach adjusting a client's deadlift setup" loading="lazy" decoding="async">
```

- **sizes** must reflect the rendered width, or the browser downloads the wrong file.
- **Art direction**: `<picture>` with a portrait source for phones when the landscape crop would lose the subject.
- **Ratios**: `aspect-ratio` on the container plus `object-fit: cover` and a sensible `object-position` (faces in frame).
- **Priority**: the hero image `loading="eager" fetchpriority="high"`; everything below the fold lazy.
- **Formats**: AVIF or WebP with JPEG fallback where the pipeline supports it; Storelib's asset filter handles sizing for uploaded images.
- **Alt text**: describe what matters in context; empty `alt=""` for decorative images.
