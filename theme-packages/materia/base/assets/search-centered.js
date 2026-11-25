/* Materia Themes. Search type "Centered popup" (Theme settings > Search).
   Opening, closing, Esc, backdrop click, focus and scroll lock are handled by
   BlsSearchShopify in theme.js; this file fills the panel:
   - empty field: Recently viewed (the theme's materia__recently-viewed-products
     list of product ids) and Products (the collection chosen in settings),
   - typing: predictive results from /search/suggest (debounced 200ms).
   All cards are rendered by sections/search-centered-results.liquid. */
(function () {
  if (window.__searchCentered) return;
  window.__searchCentered = true;
  var KEY = "materia__recently-viewed-products";

  function boot() {
    var root = document.querySelector("#search-form [data-search-centered]");
    if (!root) return;
    var panel = document.getElementById("search-form");
    var input = root.querySelector('input[type="search"]');
    var body = root.querySelector(".search-centered__body");
    var empty = root.querySelector("[data-sc-empty]");
    var results = root.querySelector("[data-sc-results]");
    var recent = root.querySelector("[data-sc-recent]");
    var recentGrid = root.querySelector("[data-sc-recent-grid]");
    var featuredGrid = root.querySelector("[data-sc-featured-grid]");
    var featuredBlock = root.querySelector("[data-sc-featured]");
    var section = root.dataset.section;
    var limit = parseInt(root.dataset.limit, 10) || 8;
    var cache = new Map();
    var featuredLoaded = false;
    var recentKey = null;
    var controller = null;
    var timer = 0;

    function sectionHTML(text) {
      var doc = new DOMParser().parseFromString(text, "text/html");
      var el = doc.getElementById("shopify-section-" + section);
      return el ? el.innerHTML : "";
    }
    function get(url, signal) {
      return fetch(url, signal ? { signal: signal } : undefined).then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.text();
      }).then(sectionHTML);
    }
    function readRecent() {
      try {
        var list = JSON.parse(localStorage.getItem(KEY) || "[]");
        return Array.isArray(list) ? list.map(String).filter(function (x) { return /^\d+$/.test(x); }) : [];
      } catch (e) { return []; }
    }

    function loadFeatured() {
      if (featuredLoaded) return;
      featuredLoaded = true;
      var url = (root.dataset.rootUrl || "/").replace(/\/?$/, "/") + "?section_id=" + section;
      get(url).then(function (html) {
        featuredGrid.innerHTML = html;
        if (!featuredGrid.querySelector(".sc-card")) featuredBlock.hidden = true;
      }).catch(function () { featuredLoaded = false; });
    }

    function loadRecent() {
      if (!recent) return;
      var ids = readRecent().slice(0, limit);
      var key = ids.join(",");
      if (key === recentKey) return;
      recentKey = key;
      if (!ids.length) { recent.hidden = true; recentGrid.innerHTML = ""; return; }
      var q = ids.map(function (id) { return "id:" + id; }).join(" OR ");
      var url = root.dataset.searchUrl + "?q=" + encodeURIComponent(q) + "&type=product&section_id=" + section;
      get(url).then(function (html) {
        if (recentKey !== key) return;
        recentGrid.innerHTML = html;
        var grid = recentGrid.querySelector(".sc-grid");
        if (grid) {
          // Search returns them by relevance: put them back in viewed order.
          ids.forEach(function (id) {
            var card = grid.querySelector('[data-product-id="' + id + '"]');
            if (card) grid.appendChild(card);
          });
        }
        recent.hidden = !recentGrid.querySelector(".sc-card");
      }).catch(function () { recentKey = null; });
    }

    // Loading: a spinner in the field (root.is-loading) and the body keeps
    // its height until the new results are in, so nothing jumps meanwhile.
    function setLoading(on) {
      root.classList.toggle("is-loading", on);
      body.classList.toggle("is-loading", on);
      if (on) { if (!body.style.minHeight) body.style.minHeight = body.offsetHeight + "px"; }
      else body.style.minHeight = "";
    }
    function showEmpty() {
      if (controller) controller.abort();
      controller = null;
      setLoading(false);
      results.hidden = true;
      results.innerHTML = "";
      empty.hidden = false;
    }
    function showResults(html) {
      results.innerHTML = html;
      results.hidden = false;
      empty.hidden = true;
      setLoading(false);
    }

    function search() {
      var term = input.value.trim();
      if (!term) { showEmpty(); return; }
      var key = term.replace(/\s+/g, " ").toLowerCase();
      if (cache.has(key)) { if (controller) controller.abort(); showResults(cache.get(key)); return; }
      if (controller) controller.abort();
      controller = typeof AbortController === "function" ? new AbortController() : null;
      var mine = controller;
      setLoading(true);
      var url = root.dataset.suggestUrl + "?q=" + encodeURIComponent(term) +
        "&resources[type]=product,collection,page,query" +
        "&resources[limit]=" + limit + "&resources[limit_scope]=each" +
        "&resources[options][prefix]=last&resources[options][unavailable_products]=last" +
        "&section_id=" + section;
      get(url, mine && mine.signal).then(function (html) {
        if (mine !== controller) return;
        controller = null;
        cache.set(key, html);
        if (cache.size > 30) cache.delete(cache.keys().next().value);
        if (input.value.trim().replace(/\s+/g, " ").toLowerCase() !== key) return;
        showResults(html);
      }).catch(function (e) {
        if (e && e.name === "AbortError") return;
        setLoading(false);
      });
    }

    input.addEventListener("input", function () {
      clearTimeout(timer);
      if (!input.value.trim()) { showEmpty(); return; }
      timer = setTimeout(search, 200);
    });

    // Keyboard: Arrow down from the field goes into the results, the arrows
    // move between them (Up from the first goes back to the field), Enter
    // opens the focused link (the browser's own behaviour for links).
    function items() {
      return [].slice.call(body.querySelectorAll("a[href], button:not([disabled])")).filter(function (el) {
        return el.offsetParent !== null;
      });
    }
    root.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      var list = items();
      if (!list.length) return;
      var i = list.indexOf(document.activeElement);
      if (e.target === input) {
        if (e.key !== "ArrowDown") return;
        e.preventDefault();
        list[0].focus();
        return;
      }
      if (i < 0) return;
      e.preventDefault();
      if (e.key === "ArrowDown") { if (i < list.length - 1) list[i + 1].focus(); }
      else if (i === 0) input.focus();
      else list[i - 1].focus();
    });

    root.addEventListener("click", function (e) {
      var chip = e.target.closest("[data-sc-term]");
      if (chip) {
        e.preventDefault();
        input.value = chip.getAttribute("data-sc-term");
        input.focus({ preventScroll: true });
        clearTimeout(timer);
        search();
        return;
      }
      if (!e.target.closest("[data-sc-clear]")) return;
      e.preventDefault();
      try { localStorage.removeItem(KEY); } catch (err) {}
      recentKey = "";
      recentGrid.innerHTML = "";
      recent.hidden = true;
      input.focus({ preventScroll: true });
    });

    function onOpen() {
      loadFeatured();
      loadRecent();
      if (input.value.trim() && results.hidden) search();
    }
    new MutationObserver(function () {
      if (panel.classList.contains("open")) onOpen();
    }).observe(panel, { attributes: true, attributeFilter: ["class"] });
    if (panel.classList.contains("open")) onOpen();
    // Warm the empty state while the browser is idle, so it is ready on open.
    (window.requestIdleCallback || function (fn) { return setTimeout(fn, 1500); })(function () {
      loadFeatured();
      loadRecent();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
