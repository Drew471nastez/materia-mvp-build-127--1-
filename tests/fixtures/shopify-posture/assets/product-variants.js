/*
  The product page's script, written the way a bought theme writes it for
  Shopify: it reads `{{ product | json }}` and keeps the label, the price,
  the SKU, the stock line, the gallery, the buy buttons, the address
  (?variant=) and the sticky bar's select in step with the choice. A value
  is drawn unavailable when no variant with it and the values chosen before
  it can be bought, as Shopify's own option_value.available says.
*/
(function () {
  var root = document.querySelector("product-page");
  if (!root) return;
  var product = JSON.parse(root.querySelector("[data-product-json]").textContent);
  var stock = JSON.parse(root.querySelector("[data-variant-stock]").textContent);
  var picker = root.querySelector("[data-variant-picker]");
  var form = root.querySelector("form.product-form");
  var sticky = document.querySelector("[data-sticky-atc]");
  var stickySelect = sticky && sticky.querySelector("[data-sticky-select]");

  function formatMoney(cents) {
    var format = (window.theme && window.theme.moneyFormat) || "${{amount}}";
    var amount = (Number(cents) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return format.replace(/\{\{\s*amount\s*\}\}/, amount);
  }

  function chosen() {
    return product.options.map(function (_, i) {
      var input = picker && picker.querySelector('input[name="option-' + (i + 1) + '"]:checked');
      return input ? input.value : null;
    });
  }

  function variantFor(values) {
    return product.variants.find(function (v) {
      return v.options.every(function (o, i) { return o === values[i]; });
    }) || null;
  }

  function markAvailability(values) {
    if (!picker) return;
    product.options.forEach(function (_, pos) {
      picker.querySelectorAll('input[name="option-' + (pos + 1) + '"]').forEach(function (input) {
        var open = product.variants.some(function (v) {
          if (!v.available || v.options[pos] !== input.value) return false;
          for (var j = 0; j < pos; j++) if (v.options[j] !== values[j]) return false;
          return true;
        });
        input.classList.toggle("is-unavailable", !open);
      });
    });
  }

  function render(variant, values) {
    if (picker) {
      picker.querySelectorAll("fieldset").forEach(function (fs, i) {
        var label = fs.querySelector("[data-selected-value]");
        if (label) label.textContent = values[i] || "";
      });
    }
    markAvailability(values);
    var id = form.querySelector("[data-variant-id]");
    var add = form.querySelector('[name="add"]');
    var now = form.querySelector('[name="checkout"]');
    var price = root.querySelector("[data-price]");
    var compare = root.querySelector("[data-compare-price]");
    var sku = root.querySelector("[data-product-sku]");
    var line = root.querySelector("[data-product-stock]");
    var qty = form.querySelector('[name="quantity"]');
    if (!variant) {
      id.value = "";
      add.disabled = true;
      add.textContent = "Unavailable";
      if (now) now.disabled = true;
      if (sku) sku.textContent = "";
      if (line) line.textContent = "Unavailable";
      return;
    }
    id.value = variant.id;
    add.disabled = !variant.available;
    add.textContent = variant.available ? "Add to Cart" : "Sold out";
    if (now) now.disabled = !variant.available;
    if (price) price.textContent = formatMoney(variant.price);
    if (compare) {
      var on = variant.compare_at_price && variant.compare_at_price > variant.price;
      compare.hidden = !on;
      compare.textContent = on ? formatMoney(variant.compare_at_price) : "";
    }
    if (sku) sku.textContent = variant.sku ? "SKU: " + variant.sku : "";
    if (qty) {
      var max = variant.quantity_rule && variant.quantity_rule.max;
      if (max) qty.max = max; else qty.removeAttribute("max");
    }
    if (line) {
      var s = stock[variant.id] || {};
      var lowAt = Number(line.getAttribute("data-low-at")) || 5;
      if (!variant.available) line.textContent = "Sold out";
      else if (s.management === "shopify" && s.policy === "deny" && s.quantity <= lowAt) line.textContent = "Only " + s.quantity + " left, order today to receive it by October 19";
      else line.textContent = "In stock, order today to receive it by October 19";
    }
    if (variant.featured_media) {
      root.querySelectorAll("[data-media-id]").forEach(function (el) {
        el.classList.toggle("is-active", String(el.getAttribute("data-media-id")) === String(variant.featured_media.id));
      });
      var active = root.querySelector(".product-gallery__item.is-active");
      if (active) active.parentNode.insertBefore(active, active.parentNode.firstChild);
    }
    var url = new URL(window.location.href);
    url.searchParams.set("variant", variant.id);
    window.history.replaceState({}, "", url.toString());
  }

  function syncSticky(variant) {
    if (!sticky) return;
    if (stickySelect && variant) stickySelect.value = String(variant.id);
    var button = sticky.querySelector('[name="add"]');
    if (button) button.disabled = !variant || !variant.available;
    var img = sticky.querySelector("[data-sticky-image]");
    var image = (variant && variant.featured_image && variant.featured_image.src) || product.featured_image;
    if (img && image) img.src = image;
  }

  function onChange() {
    var values = chosen();
    var variant = variantFor(values);
    render(variant, values);
    syncSticky(variant);
  }

  if (picker) picker.addEventListener("change", onChange);

  if (stickySelect) {
    stickySelect.addEventListener("change", function () {
      var variant = product.variants.find(function (v) { return String(v.id) === stickySelect.value; });
      if (!variant || !picker) return;
      variant.options.forEach(function (value, i) {
        picker.querySelectorAll('input[name="option-' + (i + 1) + '"]').forEach(function (input) {
          input.checked = input.value === value;
        });
      });
      onChange();
    });
  }

  /* Add to cart without leaving the page, as most themes do; Buy now goes to checkout. */
  form.addEventListener("submit", function (e) {
    var submitter = e.submitter;
    if (submitter && submitter.name === "checkout") return;
    e.preventDefault();
    fetch("/cart/add.js", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ items: [{ id: form.querySelector("[data-variant-id]").value, quantity: Number(form.querySelector('[name="quantity"]').value) || 1 }] }) });
  });
})();
