
  (function () {
    var root = document.querySelector('#shopify-section-more [data-r98-shop]');
    if (!root || root.__shop) return; root.__shop = true;
    var qv = root.querySelector('[data-r98-qv]'), ok = root.querySelector('[data-r98-ok]');
    var fmt = root.getAttribute('data-money') || ('$' + '{' + '{amount}' + '}');
    var words = { added: "[product] is in your cart.", sold: "That one is sold out.", err: "That did not work. Try again.", addedTitle: "Added to cart", errTitle: "Not added" };
    function money(c) { var a = (Number(c) || 0) / 100; return fmt.replace(/\{\{\s*(\w+)\s*\}\}/, function (_, k) { return /no_decimals/.test(k) ? String(Math.round(a)) : /comma/.test(k) ? a.toFixed(2).replace('.', ',') : a.toFixed(2); }); }
    function show(d) { if (d.showModal) { if (!d.open) d.showModal(); } else d.setAttribute('open', ''); }
    function hide(d) { if (d.close && d.open) d.close(); else d.removeAttribute('open'); }
    root.querySelectorAll('[data-r98-dismiss]').forEach(function (b) { b.addEventListener('click', function () { hide(b.closest('dialog')); }); });
    [qv, ok].forEach(function (d) { d.addEventListener('click', function (e) { if (e.target === d) hide(d); }); });
    var current = null;
    function pick() {
      if (!current) return null;
      var sel = [].map.call(qv.querySelectorAll('[data-r98-qv-opts] select'), function (s) { return s.value; });
      return current.variants.find(function (v) { return !v.options || !v.options.length || v.options.every(function (o, i) { return sel[i] === undefined || o === sel[i]; }); }) || current.variants[0];
    }
    function paint() {
      var v = pick(); if (!v) return;
      var p = qv.querySelector('[data-r98-qv-price]');
      p.textContent = money(v.price);
      if (v.compare > v.price) { var s = document.createElement('s'); s.textContent = money(v.compare); p.appendChild(s); }
      var add = qv.querySelector('[data-r98-qv-add]'); add.disabled = !v.available;
      qv.querySelector('[data-r98-qv-msg]').textContent = v.available ? '' : words.sold;
    }
    function open(data) {
      current = data;
      qv.querySelector('[data-r98-qv-bar]').textContent = data.title;
      qv.querySelector('[data-r98-qv-title]').textContent = data.title;
      var img = qv.querySelector('[data-r98-qv-img]'); if (data.image) { img.src = data.image; img.alt = data.title; img.hidden = false; } else img.hidden = true;
      qv.querySelector('[data-r98-qv-link]').href = data.url;
      qv.querySelector('[data-r98-qv-qty]').value = 1;
      var box = qv.querySelector('[data-r98-qv-opts]'); box.innerHTML = '';
      var names = (data.options || []).filter(function (o) { return o && o !== 'Title'; });
      names.forEach(function (name, i) {
        var vals = []; data.variants.forEach(function (v) { var x = v.options && v.options[i]; if (x && vals.indexOf(x) < 0) vals.push(x); });
        if (vals.length < 2 && names.length === 1 && data.variants.length < 2) return;
        var id = 'R98Opt-more-' + i, wrap = document.createElement('div'), lab = document.createElement('label'), sel = document.createElement('select');
        lab.htmlFor = id; lab.textContent = name; sel.id = id;
        vals.forEach(function (x) { var o = document.createElement('option'); o.value = o.textContent = x; sel.appendChild(o); });
        var first = data.variants.find(function (v) { return v.available; }); if (first && first.options) sel.value = first.options[i];
        sel.addEventListener('change', paint); wrap.appendChild(lab); wrap.appendChild(sel); box.appendChild(wrap);
      });
      box.hidden = !box.children.length;
      paint(); show(qv);
    }
    function add(v, qty, title, btn) {
      if (btn) btn.disabled = true;
      return fetch('/cart/add.js', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ items: [{ id: v.id, quantity: qty }] }) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(r.status); e.say = j && (j.description || j.message); throw e; } return j; }); })
        .then(function () {
          hide(qv);
          var name = title + (v.title && v.title !== 'Default Title' ? ' (' + v.title + ')' : '');
          ok.classList.remove('is-error');
          ok.querySelector('[data-r98-ok-title]').textContent = words.addedTitle;
          ok.querySelector('[data-r98-ok-text]').textContent = words.added.replace('[product]', name);
          show(ok);
          document.dispatchEvent(new CustomEvent('r98:cart')); document.dispatchEvent(new CustomEvent('cart:refresh', { detail: { source: 'retro-shop' } }));
        })
        .catch(function (e) {
          var say = (e && e.say) || words.err;
          if (qv.open) { qv.querySelector('[data-r98-qv-msg]').textContent = say; return; }
          ok.classList.add('is-error');
          ok.querySelector('[data-r98-ok-title]').textContent = words.errTitle;
          ok.querySelector('[data-r98-ok-text]').textContent = say;
          show(ok);
        })
        .then(function () { if (btn) btn.disabled = false; });
    }
    root.querySelectorAll('.r98-file').forEach(function (li) {
      var json = li.querySelector('[data-r98-product]'); if (!json) return;
      var data; try { data = JSON.parse(json.textContent); } catch (e) { return; }
      var q = li.querySelector('[data-r98-quick]'), a = li.querySelector('[data-r98-add]');
      if (q) q.addEventListener('click', function () { open(data); });
      if (a) a.addEventListener('click', function () {
        if (a.hasAttribute('data-one')) { var v = data.variants[0]; if (v && v.available) add(v, 1, data.title, a); }
        else open(data);
      });
    });
    qv.querySelector('[data-r98-qv-add]').addEventListener('click', function (e) {
      var v = pick(); if (!v || !v.available) return;
      var n = Math.max(1, Math.min(99, parseInt(qv.querySelector('[data-r98-qv-qty]').value, 10) || 1));
      add(v, n, current.title, e.currentTarget);
    });
  })();
