/**
 * ===========================================================================
 *  SHOPIFY'S OWN HELPER SCRIPTS, WRITTEN BY STORELIB
 * ===========================================================================
 * Themes written before Online Store 2.0 (Debut, Brooklyn, Minimal, Supply,
 * Venture, Timber, and most paid themes from those years) load a few scripts
 * that Shopify serves itself, by name, through `shopify_asset_url`:
 *
 *   option_selection.js   Shopify.OptionSelectors: turns the product's one
 *                         <select> of variants into a dropdown per option
 *                         (Size, Colour), keeps the variant id in step and
 *                         calls the theme back; Shopify.Product, Shopify.Image
 *   api.jquery.js         the cart over Ajax for jQuery themes: addItem,
 *                         addItemFromForm, getCart, changeItem, removeItem,
 *                         updateCartNote and the rest, against /cart/*.js
 *   shopify_common.js     Shopify.queryParams, postLink, bind,
 *                         CountryProvinceSelector (the address forms)
 *   customer_area.js      Shopify.CustomerAddress (the account's addresses)
 *
 * Nothing is loaded from Shopify. Each is Storelib's own, with the same names
 * and the same behaviour the themes rely on, against Storelib's cart (lib/
 * storelib-theme/compat/site.ts answers /cart.js, /cart/add.js, change.js,
 * update.js, clear.js and /products/<handle>.js as Shopify does). A theme that
 * ships its own copy of one in its assets keeps its own.
 *
 * Plain ES5, as the originals: they run in every visitor's browser.
 */

const MONEY = `
Shopify.money_format = Shopify.money_format || "\${{amount}}";
Shopify.formatMoney = function (cents, format) {
  if (typeof cents === "string") cents = cents.replace(".", "");
  var value = "", re = /\\{\\{\\s*(\\w+)\\s*\\}\\}/, f = format || Shopify.money_format;
  function def(o, d) { return typeof o === "undefined" ? d : o; }
  function delim(n, precision, thousands, decimal) {
    precision = def(precision, 2); thousands = def(thousands, ","); decimal = def(decimal, ".");
    if (isNaN(n) || n == null) return 0;
    n = (n / 100.0).toFixed(precision);
    var parts = n.split("."), dollars = parts[0].replace(/(\\d)(?=(\\d\\d\\d)+(?!\\d))/g, "$1" + thousands), c = parts[1] ? decimal + parts[1] : "";
    return dollars + c;
  }
  var m = f.match(re);
  switch (m ? m[1] : "amount") {
    case "amount": value = delim(cents, 2); break;
    case "amount_no_decimals": value = delim(cents, 0); break;
    case "amount_with_comma_separator": value = delim(cents, 2, ".", ","); break;
    case "amount_no_decimals_with_comma_separator": value = delim(cents, 0, ".", ","); break;
    case "amount_with_apostrophe_separator": value = delim(cents, 2, "'", "."); break;
    case "amount_no_decimals_with_space_separator": value = delim(cents, 0, " ", ""); break;
    case "amount_with_space_separator": value = delim(cents, 2, " ", ","); break;
    default: value = delim(cents, 2);
  }
  return f.replace(re, value);
};`

const OPTION_SELECTION = `(function () {
var Shopify = window.Shopify = window.Shopify || {};
Shopify.isDefined = function (o) { return typeof o !== "undefined"; };
Shopify.arrayIncludes = function (a, v) { for (var i = 0; i < a.length; i++) if (a[i] == v) return true; return false; };
Shopify.uniq = function (a) { var out = []; for (var i = 0; i < a.length; i++) if (!Shopify.arrayIncludes(out, a[i])) out.push(a[i]); return out; };
${MONEY}
Shopify.Product = function (json) { if (Shopify.isDefined(json)) this.update(json); };
Shopify.Product.prototype.update = function (json) { for (var k in json) this[k] = json[k]; };
Shopify.Product.prototype.optionNames = function () {
  var o = this.options || [];
  return o.map ? o.map(function (x) { return typeof x === "string" ? x : x && x.name; }) : [];
};
Shopify.Product.prototype.optionValues = function (index) {
  var vs = this.variants || [], out = [];
  for (var i = 0; i < vs.length; i++) { var v = vs[i].options ? vs[i].options[index] : vs[i]["option" + (index + 1)]; if (v != null) out.push(v); }
  return Shopify.uniq(out);
};
Shopify.Product.prototype.getVariant = function (selected) {
  var vs = this.variants || [];
  for (var i = 0; i < vs.length; i++) {
    var opts = vs[i].options || [vs[i].option1, vs[i].option2, vs[i].option3], ok = true;
    for (var j = 0; j < selected.length; j++) if (opts[j] != selected[j]) { ok = false; break; }
    if (ok) return vs[i];
  }
  return null;
};
Shopify.Product.prototype.getVariantById = function (id) {
  var vs = this.variants || [];
  for (var i = 0; i < vs.length; i++) if (String(vs[i].id) === String(id)) return vs[i];
  return null;
};
Shopify.Image = {
  preload: function (images, size) { for (var i = 0; i < images.length; i++) { var img = new Image(); img.src = this.getSizedImageUrl(images[i], size); } },
  removeProtocol: function (path) { return String(path).replace(/http(s)?:/, ""); },
  getSizedImageUrl: function (src, size) {
    if (!src || size == null) return src;
    if (size === "master") return this.removeProtocol(src);
    var px = parseInt(String(size), 10) || { pico: 16, icon: 32, thumb: 50, small: 100, compact: 160, medium: 240, large: 480, grande: 600, original: 2048 }[size];
    if (!px) return src;
    return src + (String(src).indexOf("?") >= 0 ? "&" : "?") + "width=" + px;
  },
  imageSize: function (src) { var m = String(src).match(/[?&]width=(\\d+)/); return m ? m[1] : null; },
  switchImage: function (src, imgObject, el) { var img = typeof el === "string" ? document.querySelector(el) : el; if (img && src) img.src = src; }
};
Shopify.OptionSelectors = function (existingSelectorId, options) {
  this.selectorDivClass = "selector-wrapper";
  this.selectorClass = "single-option-selector";
  this.variantIdFieldIdSuffix = "-variant-id";
  this.variantIdField = null;
  this.historyState = null;
  this.selectors = [];
  this.domIdPrefix = existingSelectorId;
  this.product = new Shopify.Product(options.product);
  this.onVariantSelected = Shopify.isDefined(options.onVariantSelected) ? options.onVariantSelected : function () {};
  this.replaceSelector(existingSelectorId);
  this.initDropdown();
  if (options.enableHistoryState) this.historyState = new Shopify.OptionSelectors.HistoryState(this);
  return true;
};
Shopify.OptionSelectors.prototype.initDropdown = function () {
  var opts = { initialLoad: true };
  if (!this.selectVariantFromParams(opts)) {
    var selected = this.variantIdField.querySelector("option[selected]") || this.variantIdField.options[this.variantIdField.selectedIndex] || this.variantIdField.options[0];
    if (selected) this.selectVariant(selected.value, opts);
    else this.updateSelectors(0, opts);
  }
};
Shopify.OptionSelectors.prototype.selectVariantFromParams = function (opts) {
  var m = /[?&]variant=(\\d+)/.exec(location.search);
  if (!m || !this.product.getVariantById(m[1])) return false;
  this.selectVariant(m[1], opts);
  return true;
};
Shopify.OptionSelectors.prototype.replaceSelector = function (domId) {
  var old = document.getElementById(domId);
  if (!old) return;
  var parent = old.parentNode, built = this.buildSelectors();
  for (var i = 0; i < built.length; i++) parent.insertBefore(built[i], old);
  old.style.display = "none";
  this.variantIdField = old;
};
Shopify.OptionSelectors.prototype.selectVariant = function (variantId, opts) {
  var v = this.product.getVariantById(variantId);
  if (v == null) { this.updateSelectors(0, opts); return; }
  var vals = v.options || [v.option1, v.option2, v.option3];
  for (var i = 0; i < this.selectors.length; i++) {
    var el = this.selectors[i].element, want = vals[i];
    if (want != null) for (var j = 0; j < el.options.length; j++) if (el.options[j].value == want) { el.selectedIndex = j; break; }
  }
  this.updateSelectors(0, opts);
};
Shopify.OptionSelectors.prototype.buildSelectors = function () {
  var names = this.product.optionNames(), out = [];
  for (var i = 0; i < names.length; i++) {
    var sel = new Shopify.SingleOptionSelector(this, i, names[i], this.product.optionValues(i));
    sel.element.disabled = false;
    this.selectors.push(sel);
    var div = document.createElement("div");
    div.setAttribute("class", this.selectorDivClass);
    if (names.length > 1) {
      var label = document.createElement("label");
      label.htmlFor = sel.element.id;
      label.textContent = names[i];
      div.appendChild(label);
    }
    div.appendChild(sel.element);
    out.push(div);
  }
  return out;
};
Shopify.OptionSelectors.prototype.selectedValues = function () {
  var out = [];
  for (var i = 0; i < this.selectors.length; i++) out.push(this.selectors[i].element.value);
  return out;
};
Shopify.OptionSelectors.prototype.updateSelectors = function (index, opts) {
  var variant = this.product.getVariant(this.selectedValues());
  if (this.variantIdField) {
    if (variant) {
      this.variantIdField.disabled = false;
      this.variantIdField.value = variant.id;
      for (var i = 0; i < this.variantIdField.options.length; i++) this.variantIdField.options[i].selected = String(this.variantIdField.options[i].value) === String(variant.id);
    } else this.variantIdField.disabled = true;
  }
  this.onVariantSelected(variant, this, opts || {});
  if (this.historyState != null) this.historyState.onVariantChange(variant, this, opts || {});
};
Shopify.OptionSelectors.HistoryState = function (os) { if (this.browserSupports()) this.register(os); };
Shopify.OptionSelectors.HistoryState.prototype.register = function (os) {
  window.addEventListener("popstate", function () { os.selectVariantFromParams({ popStateCall: true }); });
};
Shopify.OptionSelectors.HistoryState.prototype.onVariantChange = function (variant, os, data) {
  if (!this.browserSupports() || !variant || data.initialLoad || data.popStateCall) return;
  var url = new URL(location.href);
  url.searchParams.set("variant", variant.id);
  history.replaceState({ path: url.toString() }, "", url.toString());
};
Shopify.OptionSelectors.HistoryState.prototype.browserSupports = function () { return !!(window.history && history.replaceState); };
Shopify.SingleOptionSelector = function (multi, index, name, values) {
  this.multiSelector = multi; this.values = values; this.index = index; this.name = name;
  this.element = document.createElement("select");
  for (var i = 0; i < values.length; i++) { var o = document.createElement("option"); o.value = values[i]; o.textContent = values[i]; this.element.appendChild(o); }
  this.element.setAttribute("class", multi.selectorClass);
  this.element.setAttribute("data-option", "option" + (index + 1));
  this.element.id = multi.domIdPrefix + "-option-" + index;
  this.element.onchange = function (event, opts) { multi.updateSelectors(index, opts || {}); };
  return true;
};
})();`

const API_JQUERY = `(function ($) {
var Shopify = window.Shopify = window.Shopify || {};
if (!Shopify.formatMoney) {
${MONEY}
}
Shopify.onError = function (xhr) {
  var data = {};
  try { data = JSON.parse(xhr.responseText); } catch (e) {}
  alert((data.message || "Something went wrong") + (data.description && data.description !== data.message ? ": " + data.description : ""));
};
Shopify.onCartUpdate = Shopify.onCartUpdate || function (cart) {};
Shopify.onCartShippingRatesUpdate = Shopify.onCartShippingRatesUpdate || function (rates, address) {};
Shopify.onItemAdded = Shopify.onItemAdded || function (item) {};
Shopify.onProduct = Shopify.onProduct || function (product) {};
Shopify.resizeImage = function (src, size) { return (Shopify.Image && Shopify.Image.getSizedImageUrl) ? Shopify.Image.getSizedImageUrl(src, size) : src; };
function post(url, data, done) {
  $.ajax({ type: "POST", url: url, data: data, dataType: "json", success: done, error: function (xhr) { Shopify.onError(xhr); } });
}
Shopify.addItem = function (id, quantity, callback) {
  post("/cart/add.js", "quantity=" + (quantity || 1) + "&id=" + id, function (item) { (callback || Shopify.onItemAdded)(item); });
};
Shopify.addItemFromForm = function (formId, callback, errorCallback) {
  var form = typeof formId === "string" ? $("#" + formId) : $(formId);
  $.ajax({ type: "POST", url: "/cart/add.js", data: form.serialize(), dataType: "json",
    success: function (item) { (callback || Shopify.onItemAdded)(item, form); },
    error: function (xhr) { (errorCallback || Shopify.onError)(xhr); } });
};
Shopify.getCart = function (callback) { $.getJSON("/cart.js", function (cart) { (callback || Shopify.onCartUpdate)(cart); }); };
Shopify.getProduct = function (handle, callback) { $.getJSON("/products/" + handle + ".js", function (p) { (callback || Shopify.onProduct)(p); }); };
Shopify.changeItem = function (id, quantity, callback) { post("/cart/change.js", "quantity=" + quantity + "&id=" + id, function (cart) { (callback || Shopify.onCartUpdate)(cart); }); };
Shopify.removeItem = function (id, callback) { Shopify.changeItem(id, 0, callback); };
Shopify.clear = function (callback) { post("/cart/clear.js", "", function (cart) { (callback || Shopify.onCartUpdate)(cart); }); };
Shopify.updateCartFromForm = function (formId, callback) {
  var form = typeof formId === "string" ? $("#" + formId) : $(formId);
  post("/cart/update.js", form.serialize(), function (cart) { (callback || Shopify.onCartUpdate)(cart); });
};
Shopify.updateCartAttributes = function (attributes, callback) {
  var data = "";
  if ($.isArray(attributes)) $.each(attributes, function (i, a) { data += "attributes[" + encodeURIComponent(a.key) + "]=" + encodeURIComponent(a.value) + "&"; });
  else if (attributes && typeof attributes === "object") $.each(attributes, function (k, v) { data += "attributes[" + encodeURIComponent(k) + "]=" + encodeURIComponent(v) + "&"; });
  post("/cart/update.js", data, function (cart) { (callback || Shopify.onCartUpdate)(cart); });
};
Shopify.updateCartNote = function (note, callback) { post("/cart/update.js", "note=" + encodeURIComponent(note), function (cart) { (callback || Shopify.onCartUpdate)(cart); }); };
Shopify.getCartShippingRatesForDestination = function (address, callback) {
  (callback || Shopify.onCartShippingRatesUpdate)([], address);
};
})(window.jQuery || window.$);`

const COMMON = `(function () {
var Shopify = window.Shopify = window.Shopify || {};
Shopify.bind = function (fn, scope) { return function () { return fn.apply(scope, arguments); }; };
Shopify.setSelectorByValue = function (selector, value) {
  for (var i = 0; i < selector.options.length; i++) { var o = selector.options[i]; if (value == o.value || value == o.innerHTML) { selector.selectedIndex = i; return i; } }
};
Shopify.addListener = function (target, name, cb) { target.addEventListener ? target.addEventListener(name, cb, false) : target.attachEvent("on" + name, cb); };
Shopify.postLink = function (path, options) {
  options = options || {};
  var form = document.createElement("form");
  form.setAttribute("method", options.method || "post");
  form.setAttribute("action", path);
  var params = options.parameters || {};
  for (var k in params) { var f = document.createElement("input"); f.type = "hidden"; f.name = k; f.value = params[k]; form.appendChild(f); }
  document.body.appendChild(form);
  form.submit();
  document.body.removeChild(form);
};
Shopify.queryParams = {};
(function () {
  var q = location.search.slice(1);
  if (!q) return;
  q.split("&").forEach(function (pair) {
    if (!pair) return;
    var kv = pair.split("=");
    Shopify.queryParams[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || "").replace(/\\+/g, " "));
  });
})();
Shopify.CountryProvinceSelector = function (countryId, provinceId, options) {
  this.countryEl = document.getElementById(countryId);
  this.provinceEl = document.getElementById(provinceId);
  this.provinceContainer = document.getElementById((options && options.hideElement) || provinceId);
  if (!this.countryEl || !this.provinceEl) return;
  Shopify.addListener(this.countryEl, "change", Shopify.bind(this.countryHandler, this));
  this.initCountry();
  this.initProvince();
};
Shopify.CountryProvinceSelector.prototype = {
  initCountry: function () { var v = this.countryEl.getAttribute("data-default"); if (v) Shopify.setSelectorByValue(this.countryEl, v); this.countryHandler(); },
  initProvince: function () { var v = this.provinceEl.getAttribute("data-default"); if (v && this.provinceEl.options.length > 0) Shopify.setSelectorByValue(this.provinceEl, v); },
  countryHandler: function () {
    var opt = this.countryEl.options[this.countryEl.selectedIndex];
    var raw = opt ? opt.getAttribute("data-provinces") : null, provinces = [];
    try { provinces = JSON.parse(raw || "[]"); } catch (e) { provinces = []; }
    while (this.provinceEl.options.length) this.provinceEl.remove(0);
    for (var i = 0; i < provinces.length; i++) { var o = document.createElement("option"); o.value = provinces[i][0]; o.innerHTML = provinces[i][1]; this.provinceEl.appendChild(o); }
    if (this.provinceContainer) this.provinceContainer.style.display = provinces.length ? "" : "none";
  }
};
})();`

const CUSTOMER_AREA = `(function () {
var Shopify = window.Shopify = window.Shopify || {};
Shopify.CustomerAddress = {
  toggleForm: function (id) { var el = document.getElementById("EditAddress_" + id) || document.getElementById("edit_address_" + id); if (el) el.style.display = el.style.display === "none" ? "" : "none"; return false; },
  toggleNewForm: function () { var el = document.getElementById("AddAddress") || document.getElementById("add_address"); if (el) el.style.display = el.style.display === "none" ? "" : "none"; return false; },
  destroy: function (id, confirmMessage) { if (confirm(confirmMessage || "Are you sure you wish to delete this address?")) Shopify.postLink && Shopify.postLink("/account/addresses/" + id, { parameters: { _method: "delete" } }); }
};
})();`

/** The scripts, by the names themes ask for them by. */
const ASSETS: Record<string, string> = {
  "option_selection.js": OPTION_SELECTION,
  "api.jquery.js": API_JQUERY,
  "shopify_common.js": COMMON,
  "customer_area.js": CUSTOMER_AREA,
}

/**
 * The names they are served under: a visitor reading the page's source sees
 * Storelib's addresses, never a platform's name (`shopify_common.js` is
 * served as `common.js`).
 */
const SERVED: Record<string, string> = {
  "option_selection.js": "option-selection.js",
  "api.jquery.js": "cart-api.js",
  "shopify_common.js": "common.js",
  "customer_area.js": "customer-area.js",
}
const BY_SERVED = Object.fromEntries(Object.entries(SERVED).map(([k, v]) => [v, k]))

/** A helper script by the name a theme asks for it by, or by the name it is served under; null for anything else. */
export function shopifyGlobalAsset(name: string): string | null {
  const key = String(name).replace(/^\/+/, "").split("?")[0]
  return ASSETS[key] ?? ASSETS[BY_SERVED[key] ?? ""] ?? null
}

/**
 * Where a theme asking for one of Shopify's helper scripts gets it: Storelib's
 * own address, so the site's script policy (its own origin only) lets it run.
 * Null for a name that is not one of them.
 */
export function shopifyGlobalAssetUrl(name: string): string | null {
  const key = String(name).replace(/^\/+/, "").split("?")[0]
  return ASSETS[key] ? `/api/site-theme/helpers/${encodeURIComponent(SERVED[key] ?? key)}` : null
}

/** The names, for tests and diagnostics. */
export const SHOPIFY_GLOBAL_ASSETS = Object.keys(ASSETS)

/** The names they are served under (app/api/site-theme/helpers). */
export const SERVED_GLOBAL_ASSETS = Object.values(SERVED)
