
  (function () {
    var root = document.querySelector('#shopify-section-more [data-xp-shop]');
    if (!root || root.__shop) return; root.__shop = true;
    var qv = root.querySelector('[data-xp-qv]'), ok = root.querySelector('[data-xp-ok]');
    var fmt = root.getAttribute('data-money') || ('$' + '{' + '{amount}' + '}');
    var words = { added: "[product] is in your cart.", sold: "That one is sold out.", err: "That did not work. Try again.", addedTitle: "Added to cart", errTitle: "Not added" };
    function money(c) { var a = (Number(c) || 0) / 100; return fmt.replace(/\{\{\s*(\w+)\s*\}\}/, function (_, k) { return /no_decimals/.test(k) ? String(Math.round(a)) : /comma/.test(k) ? a.toFixed(2).replace('.', ',') : a.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }); }
    var opener = null;
    function show(d) { opener = document.activeElement; if (d.showModal) { if (!d.open) d.showModal(); } else d.setAttribute('open', ''); }
    function hide(d) { if (d.close && d.open) d.close(); else d.removeAttribute('open'); }
    [qv, ok].forEach(function (d) {
      d.addEventListener('click', function (e) { if (e.target === d) hide(d); });
      d.addEventListener('close', function () { if (opener && opener.focus && !qv.open && !ok.open) opener.focus({ preventScroll: true }); });
    });
    root.querySelectorAll('[data-xp-dismiss]').forEach(function (b) { b.addEventListener('click', function () { hide(b.closest('dialog')); }); });
    var current = null;
    function chosen() { return [].map.call(qv.querySelectorAll('[data-xp-qv-opts] fieldset'), function (f) { var c = f.querySelector('input:checked'); return c ? c.value : undefined; }); }
    function pick() {
      if (!current) return null;
      var sel = chosen();
      return current.variants.find(function (v) { return !v.options || !v.options.length || v.options.every(function (o, i) { return sel[i] === undefined || o === sel[i]; }); }) || current.variants[0];
    }
    function paint() {
      var v = pick(); if (!v) return;
      var p = qv.querySelector('[data-xp-qv-price]'); p.textContent = money(v.price);
      if (v.compare > v.price) { var s = document.createElement('s'); s.textContent = money(v.compare); p.appendChild(s); }
      var img = qv.querySelector('[data-xp-qv-img]'); var src = v.image || current.image; if (src && img.getAttribute('src') !== src) img.src = src;
      qv.querySelector('[data-xp-qv-add]').disabled = !v.available;
      qv.querySelector('[data-xp-qv-msg]').textContent = v.available ? '' : words.sold;
    }
    function open(data) {
      current = data;
      qv.querySelector('[data-xp-qv-bar]').textContent = data.title;
      qv.querySelector('[data-xp-qv-title]').textContent = data.title;
      var img = qv.querySelector('[data-xp-qv-img]'); if (data.image) { img.src = data.image; img.alt = data.title; img.hidden = false; } else img.hidden = true;
      qv.querySelector('[data-xp-qv-link]').href = data.url;
      qv.querySelector('[data-xp-qv-qty]').value = 1;
      var box = qv.querySelector('[data-xp-qv-opts]'); box.innerHTML = '';
      var names = (data.options || []).filter(function (o) { return o && o !== 'Title'; });
      var first = data.variants.find(function (v) { return v.available; }) || data.variants[0];
      names.forEach(function (name, i) {
        var vals = []; data.variants.forEach(function (v) { var x = v.options && v.options[i]; if (x && vals.indexOf(x) < 0) vals.push(x); });
        if (vals.length < 2 && data.variants.length < 2) return;
        var fs = document.createElement('fieldset'); fs.className = 'xpd__opts xpd__opt';
        var lg = document.createElement('legend'); lg.textContent = name; fs.appendChild(lg);
        var wrap = document.createElement('div'); wrap.className = 'xpd__vals';
        vals.forEach(function (x, j) {
          var lab = document.createElement('label'), inp = document.createElement('input'), sp = document.createElement('span');
          inp.type = 'radio'; inp.name = 'XpOpt-more-' + i; inp.value = x; inp.checked = first && first.options ? first.options[i] === x : j === 0;
          var any = data.variants.some(function (v) { return v.available && v.options && v.options[i] === x; }); if (!any) inp.classList.add('is-out');
          sp.textContent = x; inp.addEventListener('change', paint); lab.appendChild(inp); lab.appendChild(sp); wrap.appendChild(lab);
        });
        fs.appendChild(wrap); box.appendChild(fs);
      });
      box.hidden = !box.children.length;
      paint(); show(qv);
    }
    function add(v, qty, data, btn) {
      if (btn) btn.disabled = true;
      return fetch('/cart/add.js', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ items: [{ id: v.id, quantity: qty }] }) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(r.status); e.say = j && (j.description || j.message); throw e; } return j; }); })
        .then(function () {
          hide(qv);
          var name = data.title + (v.title && v.title !== 'Default Title' ? ' (' + v.title + ')' : '');
          ok.classList.remove('is-error');
          ok.querySelector('[data-xp-ok-title]').textContent = words.addedTitle;
          ok.querySelector('[data-xp-ok-bar]').textContent = words.addedTitle;
          ok.querySelector('[data-xp-ok-text]').textContent = words.added.replace('[product]', name);
          var oi = ok.querySelector('[data-xp-ok-img]'); var src = v.image || data.image; if (src) { oi.src = src; oi.parentNode.hidden = false; } else oi.parentNode.hidden = true;
          show(ok); var c = ok.querySelector('[data-xp-ok-cart]'); if (c) c.focus();
          document.dispatchEvent(new CustomEvent('xp:cart')); document.dispatchEvent(new CustomEvent('cart:refresh', { detail: { source: 'xpshop-shop' } }));
        })
        .catch(function (e) {
          var say = (e && e.say) || words.err;
          if (qv.open) { qv.querySelector('[data-xp-qv-msg]').textContent = say; return; }
          ok.classList.add('is-error');
          ok.querySelector('[data-xp-ok-title]').textContent = words.errTitle;
          ok.querySelector('[data-xp-ok-bar]').textContent = words.errTitle;
          ok.querySelector('[data-xp-ok-text]').textContent = say;
          show(ok);
        })
        .then(function () { if (btn) btn.disabled = false; });
    }
    root.querySelectorAll('.xps__card').forEach(function (li) {
      var json = li.querySelector('[data-xp-product]'); if (!json) return;
      var data; try { data = JSON.parse(json.textContent); } catch (e) { return; }
      var q = li.querySelector('[data-xp-quick]'), a = li.querySelector('[data-xp-add]');
      if (q) q.addEventListener('click', function () { open(data); });
      if (a) a.addEventListener('click', function () {
        if (a.hasAttribute('data-one')) { var v = data.variants[0]; if (v && v.available) add(v, 1, data, a); }
        else open(data);
      });
    });
    qv.querySelector('[data-xp-qv-add]').addEventListener('click', function (e) {
      var v = pick(); if (!v || !v.available) return;
      var n = Math.max(1, Math.min(99, parseInt(qv.querySelector('[data-xp-qv-qty]').value, 10) || 1));
      add(v, n, current, e.currentTarget);
    });
  })();
