/**
 * ===========================================================================
 *  THE PROGRAM THAT RUNS INSIDE THE SANDBOX
 * ===========================================================================
 * Source, not a module, because it is written into an `<iframe srcdoc>` and
 * so has to survive being a string. It is the only code in the sandbox, and
 * everything it does is described in ./protocol.ts.
 *
 * What it gives a section's script is a REAL, ORDINARY DOM: a copy of that
 * section's own markup, in a document of its own. That is why a slider
 * written the way anybody writes a slider works here, with querySelector,
 * classList, addEventListener and CSS transitions, and why this file is not
 * a browser emulator.
 *
 * It watches that copy with a MutationObserver and reports what changed.
 * The page decides what to do about it; see acceptPatch.
 *
 * WHAT IT DELIBERATELY DOES NOT DO:
 *   - it never reports a node being added or removed, because the page's
 *     copy is React's and React owns that tree. A script that needs a new
 *     element writes it in the template and shows it;
 *   - it never sends `innerHTML`, only text;
 *   - it cannot see the visitor's page, cookies or storage, because the
 *     frame's origin is opaque. That is the sandbox, not this file.
 */
import { EVENTS_FORWARDED, SANDBOX_LIMITS } from "./protocol"

export const GUEST_SOURCE = `
"use strict";
(function () {
  var FORWARD = ${JSON.stringify(EVENTS_FORWARDED)};
  var MAX_BATCH = ${SANDBOX_LIMITS.patchesPerBatch};
  var MAX_PER_SECOND = ${SANDBOX_LIMITS.patchesPerSecond};
  var running = Object.create(null);

  function post(msg) { parent.postMessage(msg, "*"); }

  /**
   * ANIMATION FRAMES THAT ARRIVE. This frame is 0 by 0 and never drawn, and
   * a browser is free not to run requestAnimationFrame for a frame it does
   * not draw. A carousel stepping itself with rAF would simply stop. So
   * inside the sandbox rAF is a 60-a-second timer, which is what a script
   * that asks for it is really asking for.
   */
  window.requestAnimationFrame = function (cb) {
    return setTimeout(function () { cb(performance.now()); }, 16);
  };
  window.cancelAnimationFrame = function (h) { clearTimeout(h); };

  /**
   * WHICH ELEMENT IS WHICH, BY IDENTITY, NOT BY ATTRIBUTE.
   *
   * The number was read back off each element's data-sb attribute, which the
   * script can rewrite. A script that set data-sb="0" on a paragraph then
   * had every later change to that paragraph applied to the section's root
   * instead. The page refuses that write, but the copy had already been
   * misled. A WeakMap from element to number cannot be reached from the
   * script at all.
   */
  var numbers = new WeakMap();

  /** Every element, in document order: the same walk the page does. */
  function index(rootEl) {
    var list = [rootEl].concat(Array.prototype.slice.call(rootEl.querySelectorAll("*")));
    for (var i = 0; i < list.length; i++) numbers.set(list[i], i);
    return list;
  }

  function indexOf(el) {
    if (!el || typeof el !== "object") return -1;
    var n = numbers.get(el);
    return typeof n === "number" ? n : -1;
  }

  function makeSection(id, html) {
    /**
     * THE ROOT IS THE WRAPPER, on both sides. The page draws a section's
     * markup inside one <div> and numbers from that <div>; this numbered
     * from the first element inside its own, so every index was one off
     * and every change landed on the wrong element. A template may also
     * have more than one top-level element, and the wrapper holds all of
     * them.
     */
    var rootEl = document.createElement("div");
    rootEl.innerHTML = html;
    document.body.appendChild(rootEl);
    var nodes = index(rootEl);

    var queue = [];
    var flushing = false;
    var spent = 0;
    var windowStart = Date.now();
    var stopped = false;

    function push(patch) {
      if (stopped) return;
      var now = Date.now();
      if (now - windowStart > 1000) { windowStart = now; spent = 0; }
      if (++spent > MAX_PER_SECOND) {
        stopped = true;
        post({ k: "error", id: id, message: "This section's script changed the page too many times and was stopped." });
        return;
      }
      queue.push(patch);
      if (flushing) return;
      flushing = true;
      /**
       * A TIMER, NOT requestAnimationFrame.
       *
       * rAF was the obvious choice and it is the wrong one here: this frame
       * is 0 by 0 and invisible, and a browser does not have to run
       * animation frames for a frame it is not drawing. Under a headless
       * run it never fired at all, so nothing a section's script did ever
       * reached the page. A timeout still gathers a burst of changes into
       * one message, which is what the batching was for.
       */
      setTimeout(function () {
        flushing = false;
        var batch = queue.splice(0, MAX_BATCH);
        queue.length = 0;
        if (batch.length) post({ k: "patch", id: id, patches: batch });
      }, 0);
    }

    /**
     * The style attribute is read property by property rather than sent
     * whole, so the page checks each value on its own.
     */
    var lastStyle = new WeakMap();
    function reportStyle(el) {
      var i = indexOf(el);
      if (i < 0) return;
      var style = el.style;
      var seen = lastStyle.get(el) || {};
      var next = {};
      for (var k = 0; k < style.length; k++) {
        var name = style.item(k);
        next[name] = style.getPropertyValue(name);
      }
      for (var name2 in next) {
        if (seen[name2] !== next[name2]) push({ k: "style", i: i, n: name2, v: next[name2] });
      }
      for (var gone in seen) {
        if (!(gone in next)) push({ k: "style", i: i, n: gone, v: "" });
      }
      lastStyle.set(el, next);
    }

    /**
     * Text is reported for an element that holds only text. Setting
     * textContent does not edit a text node, it REPLACES it, which arrives
     * as a childList change and not a characterData one, so both are
     * watched. An element that holds other elements is structure, and
     * structure is React's on the page: see the header of this file.
     */
    function reportText(el) {
      var i = indexOf(el);
      if (i < 0 || el.firstElementChild) return;
      push({ k: "text", i: i, v: el.textContent == null ? "" : el.textContent });
    }

    var observer = new MutationObserver(function (records) {
      for (var r = 0; r < records.length; r++) {
        var rec = records[r];
        if (rec.type === "attributes") {
          var el = rec.target;
          var i = indexOf(el);
          if (i < 0) continue;
          if (rec.attributeName === "style") { reportStyle(el); continue; }
          push({ k: "attr", i: i, n: rec.attributeName, v: el.getAttribute(rec.attributeName) });
        } else if (rec.type === "characterData") {
          reportText(rec.target.parentElement);
        } else if (rec.type === "childList") {
          reportText(rec.target);
        }
      }
    });
    observer.observe(rootEl, { attributes: true, characterData: true, childList: true, subtree: true });

    return { id: id, rootEl: rootEl, nodes: nodes, push: push };
  }

  /**
   * The one thing the page does that the copy cannot: it is the copy that
   * is scrolled, so scrolling is asked for rather than observed.
   */
  /*
    storelib.database: the site's own Supabase, for a section that declared
    "database" on a site that connected one (lib/website-builder/own-database.ts).
    Only that project, only its REST and RPC, only with its public key: the
    script cannot name a host, and fetch itself is not a name it is given.
  */
  var NAME = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
  function databaseFor(db) {
    function call(path, init) {
      return fetch(db.url + path, init).then(function (res) {
        return res.text().then(function (text) {
          var body = null;
          try { body = text ? JSON.parse(text) : null; } catch (e) { body = text; }
          if (!res.ok) {
            var msg = body && typeof body === "object" && body.message ? body.message : "The database answered " + res.status;
            throw new Error(String(msg));
          }
          return body;
        });
      });
    }
    function headers(extra) {
      var h = { apikey: db.key, Authorization: "Bearer " + db.key, "Content-Type": "application/json", Accept: "application/json" };
      for (var k in extra) h[k] = extra[k];
      return h;
    }
    function query(q) {
      if (q === undefined || q === null || q === "") return "";
      q = String(q);
      if (q.length > 1000 || /[#\\s]/.test(q)) throw new Error("A query is the part after ? in a Supabase REST address, such as select=name,score&order=score.desc&limit=10.");
      return "?" + q.replace(/^\\?/, "");
    }
    function name(n, what) {
      if (!NAME.test(String(n))) throw new Error("That is not a " + what + " name.");
      return String(n);
    }
    return Object.freeze({
      select: function (table, q) {
        return call("/rest/v1/" + name(table, "table") + query(q), { method: "GET", headers: headers({}) });
      },
      insert: function (table, row) {
        return call("/rest/v1/" + name(table, "table"), { method: "POST", headers: headers({ Prefer: "return=representation" }), body: JSON.stringify(row) });
      },
      rpc: function (fn, args) {
        return call("/rest/v1/rpc/" + name(fn, "function"), { method: "POST", headers: headers({}), body: JSON.stringify(args || {}) });
      },
    });
  }

  function storelibFor(section, capabilities, inEditor, database) {
    var api = {
      capabilities: capabilities.slice(),
      inEditor: inEditor,
      scrollTo: function (el, options) {
        var i = indexOf(el);
        if (i < 0) return;
        options = options || {};
        section.push({ k: "scroll", i: i, left: options.left, top: options.top, smooth: options.behavior === "smooth" });
      },
    };
    /* Present only when declared. The page checks the declaration again
       before it acts: a message is not a permission. */
    if (capabilities.indexOf("navigation") !== -1) {
      api.navigate = function (path) { post({ k: "navigate", id: section.id, path: String(path) }); };
    }
    if (capabilities.indexOf("database") !== -1 && database && typeof database.url === "string" && typeof database.key === "string") {
      api.database = databaseFor(database);
    }
    return Object.freeze(api);
  }

  function run(msg) {
    var section;
    try {
      section = makeSection(msg.id, msg.html);
    } catch (e) {
      post({ k: "error", id: msg.id, message: "The section could not be prepared: " + (e && e.message) });
      return;
    }
    running[msg.id] = section;

    /* Every event the page forwards is dispatched on the copy, so the
       script's own listeners run the way they would on a real page. */
    post({ k: "listen", id: msg.id, types: FORWARD });

    var fn;
    try {
      /* The bundle is "(function (root, settings, blocks, theme, page, storelib) { ... })",
         built by checkScript. indirect eval so it cannot see this scope. */
      fn = (0, eval)(msg.bundle);
    } catch (e) {
      post({ k: "error", id: msg.id, message: "The script could not be read: " + (e && e.message) });
      return;
    }
    try {
      fn(section.rootEl, msg.settings, msg.blocks, msg.theme, msg.page, storelibFor(section, msg.capabilities || [], !!msg.inEditor, msg.database || null));
    } catch (e) {
      post({ k: "error", id: msg.id, message: (e && e.message) || "The script stopped with an error." });
    }
  }

  function deliver(msg) {
    var section = running[msg.id];
    if (!section) return;
    var el = section.nodes[msg.i];
    if (!el) return;
    var detail = msg.detail || {};
    var type = msg.type;
    var event;
    if (type === "click" || type === "dblclick") {
      event = new MouseEvent(type, { bubbles: true, cancelable: true });
    } else if (type === "keydown" || type === "keyup") {
      event = new KeyboardEvent(type, { bubbles: true, cancelable: true, key: String(detail.key || "") });
    } else {
      event = new Event(type, { bubbles: true, cancelable: true });
    }
    /* An input's value belongs to the copy too, or a handler reading
       event.target.value gets whatever the copy last held. */
    if (typeof detail.value === "string" && "value" in el) {
      try { el.value = detail.value; } catch (e) {}
    }
    if (typeof detail.checked === "boolean" && "checked" in el) {
      try { el.checked = detail.checked; } catch (e) {}
    }
    if (typeof detail.open === "boolean" && "open" in el) {
      try { el.open = detail.open; } catch (e) {}
    }
    try { el.dispatchEvent(event); } catch (e) {}
  }

  addEventListener("message", function (e) {
    var msg = e.data;
    if (!msg || typeof msg !== "object") return;
    if (msg.k === "run") run(msg);
    else if (msg.k === "event") deliver(msg);
    else if (msg.k === "stop") delete running[msg.id];
  });

  addEventListener("error", function (e) {
    post({ k: "error", id: "", message: (e && e.message) || "A section's script stopped with an error." });
  });

  post({ k: "ready" });
})();
`
