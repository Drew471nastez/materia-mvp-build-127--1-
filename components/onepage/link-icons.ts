/**
 * ===========================================================================
 *  THE PICTURES A LINK BUTTON CAN WEAR
 * ===========================================================================
 * ONE LIST, READ BY ALL THREE PLACES THAT DRAW IT.
 *
 * The editor's picker offered about 155 of these while the phone preview and
 * the published page each kept their own list of about 40. A creator could
 * pick a house, a clock or a cart, see it in the picker, and get a button with
 * no picture in the preview and on the live page, with nothing to say why.
 * Twitch was a stroke path filed under "filled", so it drew as a solid blob;
 * Reddit was offered with no path at all; Apple Music was one drawing in the
 * editor and another on the page.
 *
 * So the list lives here, the picker reads its categories from here, and
 * `LinkIcon` in ./brand-icons.tsx draws any name in it the same way in the
 * picker, the preview and on the page. This file is data only, with no JSX,
 * so importing it costs nothing.
 */

/**
 * LINE ICONS. A 24 unit grid, a round stroke and no fill: each entry is drawn
 * by LinkIcon as one <path>. The names are the ones already saved on buttons,
 * so nothing stored has to change.
 */
export const LINK_LINE_ICONS: Record<string, string> = {
  // Links & Navigation
  'link': 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  'external': 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3',
  'globe': 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z',
  'home': 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
  'map-pin': 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  'compass': 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z',
  'navigation': 'M3 11l19-9-9 19-2-8-8-2z',
  'send': 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
  // Social & Communication
  'mail': 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6',
  'phone': 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z',
  'message': 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  'chat': 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
  'users': 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  'user': 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  'at-sign': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94',
  'share': 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13',
  'share-2': 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98',
  // Media & Entertainment
  'music': 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  'video': 'M23 7l-7 5 7 5V7zM14 5H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z',
  'camera': 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  'image': 'M3 3h18a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21',
  'play': 'M5 3l14 9-14 9V3z',
  'pause': 'M6 4h4v16H6zM14 4h4v16h-4z',
  'mic': 'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8',
  'headphones': 'M3 18v-6a9 9 0 0 1 18 0v6M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z',
  'radio': 'M4.9 19.1C1 15.2 1 8.8 4.9 4.9M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5M19.1 4.9C23 8.8 23 15.1 19.1 19M12 12h.01',
  'tv': 'M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM17 2l-5 5-5-5',
  'film': 'M19.82 2H4.18A2.18 2.18 0 0 0 2 4.18v15.64A2.18 2.18 0 0 0 4.18 22h15.64A2.18 2.18 0 0 0 22 19.82V4.18A2.18 2.18 0 0 0 19.82 2zM7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5',
  // Shopping & Commerce
  'shopping': 'M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z M3 6h18 M16 10a4 4 0 0 1-8 0',
  'cart': 'M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6M9 22a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM20 22a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  'credit-card': 'M1 4h22a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM1 10h22',
  'dollar': 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  'tag': 'M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z M7 7h.01',
  'percent': 'M19 5L5 19M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM17.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  'gift': 'M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z',
  'package': 'M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.27 6.96L12 12.01l8.73-5.05M12 22.08V12',
  'truck': 'M1 3h15v13H1zM16 8h4l3 3v5h-7V8zM5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  // Favorites & Ratings
  'star': 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  'heart': 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z',
  'thumbs-up': 'M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3',
  'award': 'M12 15a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM8.21 13.89L7 23l5-3 5 3-1.21-9.12',
  'trophy': 'M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2z',
  // Documents & Files
  'file': 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
  'folder': 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z',
  'book': 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z',
  'bookmark': 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z',
  'clipboard': 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z',
  'edit': 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
  'pen': 'M12 19l7-7 3 3-7 7-3-3zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5zM2 2l7.586 7.586M11 11a2 2 0 1 1-4 0 2 2 0 0 1 4 0z',
  // Time & Date
  'calendar': 'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6zM16 2v4M8 2v4M3 10h18',
  'clock': 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 6v6l4 2',
  'watch': 'M12 19a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM12 9v3l1.5 1.5M16.51 17.35l-.35 3.83a2 2 0 0 1-2 1.82H9.83a2 2 0 0 1-2-1.82l-.35-3.83m.01-10.7l.35-3.83A2 2 0 0 1 9.83 1h4.35a2 2 0 0 1 2 1.82l.35 3.83',
  'hourglass': 'M5 22h14M5 2h14M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2',
  // Weather & Nature
  'sun': 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42',
  'moon': 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  'cloud': 'M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z',
  'droplet': 'M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z',
  'wind': 'M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2',
  'zap': 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  'flame': 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z',
  // Food & Drink
  'coffee': 'M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3',
  'pizza': 'M12 2L2 19.5h20L12 2zM12 15a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM7.5 16a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM16.5 16a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  'apple': 'M12 2a3 3 0 0 0-3 3c0 1 .5 2 1 3H7a5 5 0 0 0-5 5c0 4 3 9 7 9s4-2 5-2 2 2 5 2 7-5 7-9a5 5 0 0 0-5-5h-3c.5-1 1-2 1-3a3 3 0 0 0-3-3h-4z',
  // Technology
  'smartphone': 'M5 2h14a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM12 18h.01',
  'tablet': 'M5 2h14a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM12 18h.01',
  'laptop': 'M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0l1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16',
  'monitor': 'M2 3h20a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM8 21h8M12 17v4',
  'server': 'M2 2h20v8H2zM2 14h20v8H2zM6 6h.01M6 18h.01',
  'database': 'M12 2c4.97 0 9 1.79 9 4s-4.03 4-9 4-9-1.79-9-4 4.03-4 9-4zM3 6v6c0 2.21 4.03 4 9 4s9-1.79 9-4V6M3 12v6c0 2.21 4.03 4 9 4s9-1.79 9-4v-6',
  'wifi': 'M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01',
  'bluetooth': 'M6.5 6.5l11 11L12 23V1l5.5 5.5-11 11',
  'battery': 'M17 6H3a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2zM23 13v-2',
  'power': 'M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10',
  'cpu': 'M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 9h6v6H9zM9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3',
  // Arrows & Directions
  'arrow-up': 'M12 19V5M5 12l7-7 7 7',
  'arrow-down': 'M12 5v14M19 12l-7 7-7-7',
  'arrow-left': 'M19 12H5M12 19l-7-7 7-7',
  'arrow-right': 'M5 12h14M12 5l7 7-7 7',
  'refresh': 'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
  'rotate': 'M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38',
  'download': 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  'upload': 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  // Status & Alerts
  'check': 'M20 6L9 17l-5-5',
  'check-circle': 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3',
  'x-mark': 'M18 6L6 18M6 6l12 12',
  'alert-circle': 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 8v4M12 16h.01',
  'alert-triangle': 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
  'info': 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 16v-4M12 8h.01',
  'help': 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01',
  'bell': 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
  // Misc
  'settings': 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  'sliders': 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  'filter': 'M22 3H2l8 9.46V19l4 2v-8.54L22 3z',
  'search': 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
  'zoom-in': 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35M11 8v6M8 11h6',
  'zoom-out': 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35M8 11h6',
  'lock': 'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM7 11V7a5 5 0 0 1 10 0v4',
  'unlock': 'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM7 11V7a5 5 0 0 1 9.9-1',
  'key': 'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4',
  'eye': 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  'eye-off': 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22',
  'target': 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  'crosshair': 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M22 12h-4M6 12H2M12 6V2M12 22v-4',
  'anchor': 'M12 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 22V8M5 12H2a10 10 0 0 0 20 0h-3',
  'flag': 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7',
  'hash': 'M4 9h16M4 15h16M10 3L8 21M16 3l-2 18',
  'layers': 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  'box': 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12',
  'grid': 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  'layout': 'M3 3h18a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM3 9h18M9 21V9',
  'sidebar': 'M3 3h18a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 3v18',
  'terminal': 'M4 17l6-6-6-6M12 19h8',
  'code': 'M16 18l6-6-6-6M8 6l-6 6 6 6',
  'command': 'M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z',
  'tool': 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
  'wrench': 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
  'scissors': 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12',
  'paperclip': 'M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48',
  'link-2': 'M15 7h3a5 5 0 0 1 5 5 5 5 0 0 1-5 5h-3m-6 0H6a5 5 0 0 1-5-5 5 5 0 0 1 5-5h3M8 12h8',
  'umbrella': 'M23 12a11.05 11.05 0 0 0-22 0zm-5 7a3 3 0 0 1-6 0v-7',
  'feather': 'M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5zM16 8L2 22M17.5 15H9',
  'droplets': 'M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05zM12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97',
  'activity': 'M22 12h-4l-3 9L9 3l-3 9H2',
  'trending-up': 'M23 6l-9.5 9.5-5-5L1 18M17 6h6v6',
  'trending-down': 'M23 18l-9.5-9.5-5 5L1 6M17 18h6v-6',
  'bar-chart': 'M12 20V10M18 20V4M6 20v-4',
  'pie-chart': 'M21.21 15.89A10 10 0 1 1 8 2.83M22 12A10 10 0 0 0 12 2v10z',
  'maximize': 'M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3',
  'minimize': 'M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3',
  'move': 'M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20',
  'plus': 'M12 5v14M5 12h14',
  'minus': 'M5 12h14',
  'menu': 'M3 12h18M3 6h18M3 18h18',
  'more-horizontal': 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  'more-vertical': 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM12 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM12 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
}

/**
 * BRAND MARKS. Drawn from Simple Icons by ./brand-icons.tsx, never from a path
 * kept here, so a logo is the logo and not somebody's tracing of it. These are
 * solid glyphs, which is what the old "filled" list was trying to say about
 * them. `apple-music` and `twitter` keep the names buttons were saved with.
 */
export const LINK_BRAND_ICONS = [
  "instagram",
  "twitter",
  "youtube",
  "tiktok",
  "spotify",
  "facebook",
  "linkedin",
  "twitch",
  "discord",
  "telegram",
  "whatsapp",
  "pinterest",
  "snapchat",
  "reddit",
  "threads",
  "github",
  "apple-music",
  "notion",
  "vimeo",
  /* Round 11: the shops, tip jars, newsletters, players and forms a page links to. */
  "amazon",
  "etsy",
  "kofi",
  "buymeacoffee",
  "paypal",
  "cashapp",
  "venmo",
  "bluesky",
  "substack",
  "patreon",
  "kick",
  "soundcloud",
  "bandcamp",
  "apple-podcasts",
  "gumroad",
  "calendly",
  "loom",
  "typeform",
  "google-forms",
  "google-calendar",
  "mixcloud",
  "canva",
] as const

export type LinkBrandIcon = (typeof LINK_BRAND_ICONS)[number]

const BRAND_SET = new Set<string>(LINK_BRAND_ICONS)

export function isLinkBrandIcon(key: string): key is LinkBrandIcon {
  return BRAND_SET.has(key)
}

/** Other spellings a saved button may carry. */
const LINK_ICON_ALIASES: Record<string, string> = {
  applemusic: "apple-music",
  apple_music: "apple-music",
  x: "twitter",
  applepodcasts: "apple-podcasts",
  googleforms: "google-forms",
  googlecalendar: "google-calendar",
  "ko-fi": "kofi",
}

/** The name LinkIcon draws for a saved icon, or null when there is nothing to draw. */
export function linkIconKey(name: string | null | undefined): string | null {
  if (!name) return null
  const key = LINK_ICON_ALIASES[name] ?? name
  return Object.prototype.hasOwnProperty.call(LINK_LINE_ICONS, key) || BRAND_SET.has(key) ? key : null
}

const BRAND_LABELS: Record<LinkBrandIcon, string> = {
  instagram: "Instagram",
  twitter: "X",
  youtube: "YouTube",
  tiktok: "TikTok",
  spotify: "Spotify",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  twitch: "Twitch",
  discord: "Discord",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  pinterest: "Pinterest",
  snapchat: "Snapchat",
  reddit: "Reddit",
  threads: "Threads",
  github: "GitHub",
  "apple-music": "Apple Music",
  notion: "Notion",
  vimeo: "Vimeo",
  amazon: "Amazon",
  etsy: "Etsy",
  kofi: "Ko-fi",
  buymeacoffee: "Buy Me a Coffee",
  paypal: "PayPal",
  cashapp: "Cash App",
  venmo: "Venmo",
  bluesky: "Bluesky",
  substack: "Substack",
  patreon: "Patreon",
  kick: "Kick",
  soundcloud: "SoundCloud",
  bandcamp: "Bandcamp",
  "apple-podcasts": "Apple Podcasts",
  gumroad: "Gumroad",
  calendly: "Calendly",
  loom: "Loom",
  typeform: "Typeform",
  "google-forms": "Google Forms",
  "google-calendar": "Google Calendar",
  mixcloud: "Mixcloud",
  canva: "Canva",
}

export function linkIconLabel(key: string): string {
  if (isLinkBrandIcon(key)) return BRAND_LABELS[key]
  return key.charAt(0).toUpperCase() + key.slice(1).replace(/-/g, " ")
}

/** Every icon the picker offers, line icons first, in the order they are listed. */
export const LINK_ICONS: ReadonlyArray<{ id: string; name: string }> = [
  ...Object.keys(LINK_LINE_ICONS),
  ...LINK_BRAND_ICONS,
].map((id) => ({ id, name: linkIconLabel(id) }))

export const LINK_ICON_CATEGORIES: ReadonlyArray<{ id: string; label: string; icons: readonly string[] }> = [
  { id: 'all', label: 'All', icons: LINK_ICONS.map((icon) => icon.id) },
  { id: 'platforms', label: 'Platforms', icons: LINK_BRAND_ICONS },
  { id: 'links', label: 'Links', icons: ['link', 'external', 'globe', 'home', 'map-pin', 'compass', 'navigation', 'send'] },
  { id: 'social', label: 'Contact', icons: ['mail', 'phone', 'message', 'chat', 'users', 'user', 'at-sign', 'share', 'share-2'] },
  { id: 'media', label: 'Media', icons: ['music', 'video', 'camera', 'image', 'play', 'pause', 'mic', 'headphones', 'radio', 'tv', 'film'] },
  { id: 'shopping', label: 'Shopping', icons: ['shopping', 'cart', 'credit-card', 'dollar', 'tag', 'percent', 'gift', 'package', 'truck'] },
  { id: 'favorites', label: 'Favorites', icons: ['star', 'heart', 'thumbs-up', 'award', 'trophy'] },
  { id: 'files', label: 'Files', icons: ['file', 'folder', 'book', 'bookmark', 'clipboard', 'edit', 'pen'] },
  { id: 'time', label: 'Time', icons: ['calendar', 'clock', 'watch', 'hourglass'] },
  { id: 'weather', label: 'Weather', icons: ['sun', 'moon', 'cloud', 'droplet', 'wind', 'zap', 'flame'] },
  { id: 'tech', label: 'Tech', icons: ['smartphone', 'tablet', 'laptop', 'monitor', 'server', 'database', 'wifi', 'bluetooth', 'battery', 'power', 'cpu'] },
  { id: 'arrows', label: 'Arrows', icons: ['arrow-up', 'arrow-down', 'arrow-left', 'arrow-right', 'refresh', 'rotate', 'download', 'upload'] },
  { id: 'status', label: 'Status', icons: ['check', 'check-circle', 'x-mark', 'alert-circle', 'alert-triangle', 'info', 'help', 'bell'] },
]

/**
 * A BUTTON WITH NO ICON CHOSEN STILL GETS ITS PLATFORM'S MARK.
 *
 * Moved from the preview and the page, which each kept a copy. It used to ask
 * whether the address merely contained "t.me", so an Instagram link to
 * @robert.meyer was drawn with Telegram's plane; it now reads the host.
 */
function hostOf(url: string): string {
  try {
    const full = /^[a-z][a-z\d+.-]*:/i.test(url) ? url : `https://${url}`
    return new URL(full).hostname.toLowerCase().replace(/^www\./, "")
  } catch {
    return ""
  }
}

const URL_MARKS: ReadonlyArray<[LinkBrandIcon, readonly string[]]> = [
  ["whatsapp", ["wa.me", "whatsapp.com"]],
  ["telegram", ["t.me", "telegram.me", "telegram.org"]],
  ["vimeo", ["vimeo.com"]],
  ["threads", ["threads.net", "threads.com"]],
  ["notion", ["notion.so", "notion.site"]],
  ["canva", ["canva.com", "canva.site"]],
]

export function linkIconFromUrl(url: string | null | undefined): LinkBrandIcon | null {
  const host = url ? hostOf(url.trim()) : ""
  if (!host) return null
  for (const [mark, domains] of URL_MARKS) {
    if (domains.some((d) => host === d || host.endsWith(`.${d}`))) return mark
  }
  return null
}

/** What a link button draws: the icon the creator chose, else its platform's mark, else nothing. */
export function resolveLinkIcon(icon: string | null | undefined, url: string | null | undefined): string | null {
  return linkIconKey(icon) ?? linkIconFromUrl(url)
}
