/* Buscador de la web: funciona sin servidor con los datos de asistente-datos.js */
(function () {
  "use strict";
  var PRE = (document.currentScript && document.currentScript.getAttribute("data-pre")) || "";
  var loading = null;
  function load() {
    if (window.CC_DATA) return Promise.resolve(window.CC_DATA);
    if (loading) return loading;
    loading = new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = PRE + "asistente-datos.js";
      s.onload = function () { res(window.CC_DATA); }; s.onerror = rej; document.head.appendChild(s);
    });
    return loading;
  }
  function norm(s) { return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  var STOP = { de: 1, la: 1, el: 1, los: 1, las: 1, un: 1, una: 1, y: 1, o: 1, en: 1, para: 1, por: 1, con: 1, que: 1, como: 1, mi: 1, me: 1, del: 1, al: 1, es: 1, se: 1, lo: 1, a: 1 };
  function toks(s) { return norm(s).split(/[^a-z0-9%\/]+/).filter(function (t) { return t && !STOP[t]; }); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var INDEX = null;
  function build(d) {
    var by = {};
    d.arts.forEach(function (a) { by[a.u] = { a: a, title: toks(a.t), body: toks(a.d + " " + a.c), secs: [] }; });
    d.chunks.forEach(function (c) { var u = c.u.split("#")[0]; if (by[u] && c.s !== "En resumen") by[u].secs.push({ s: c.s, u: c.u, k: toks(c.s), x: toks(c.x.slice(0, 600)) }); });
    INDEX = Object.keys(by).map(function (k) { return by[k]; });
  }
  function hit(t, list) {
    for (var i = 0; i < list.length; i++) { var w = list[i]; if (w === t) return 1; if (t.length >= 3 && w.indexOf(t) === 0) return 0.75; if (t.length >= 5 && w.length >= 5 && w.slice(0, 5) === t.slice(0, 5)) return 0.6; }
    return 0;
  }
  function search(q) {
    var qt = toks(q); if (!qt.length || !INDEX) return [];
    var out = [];
    INDEX.forEach(function (e) {
      var sc = 0, best = null, bs = 0, all = true;
      qt.forEach(function (t) {
        var h = hit(t, e.title) * 5 + hit(t, e.body) * 2;
        e.secs.forEach(function (s) { var v = hit(t, s.k) * 2 + hit(t, s.x) * 0.5; if (v) { s._v = (s._v || 0) + v; } h += v * 0.4; });
        if (!h) all = false; sc += h;
      });
      e.secs.forEach(function (s) { if ((s._v || 0) > bs) { bs = s._v; best = s; } s._v = 0; });
      if (sc > 0) out.push({ e: e, sc: sc * (all ? 1.6 : 1), sec: bs >= 2 ? best : null });
    });
    return out.sort(function (a, b) { return b.sc - a.sc; }).slice(0, 6);
  }
  function hl(text, q) {
    var qt = toks(q).filter(function (t) { return t.length > 2; }); var s = esc(text);
    if (!qt.length) return s;
    var n = norm(text), marks = [];
    qt.forEach(function (t) { var i = n.indexOf(t); if (i >= 0) marks.push([i, i + t.length]); });
    if (!marks.length) return s;
    marks.sort(function (a, b) { return b[0] - a[0]; });
    var r = text;
    marks.forEach(function (m) { r = r.slice(0, m[0]) + "\u0001" + r.slice(m[0], m[1]) + "\u0002" + r.slice(m[1]); });
    return esc(r).replace(/\u0001/g, "<mark>").replace(/\u0002/g, "</mark>");
  }
  function render(box, q) {
    var r = search(q);
    if (!q.trim()) { box.hidden = true; box.innerHTML = ""; return; }
    if (!r.length) { box.innerHTML = '<p class="sr-empty">Sin resultados para «' + esc(q) + '». Prueba con otras palabras o pregunta al asistente.</p>' + (window.CC_ASK ? '<button type="button" class="sr-ask">Preguntar al asistente</button>' : ""); box.hidden = false; return; }
    box.innerHTML = '<ul role="listbox">' + r.map(function (x, i) {
      var a = x.e.a;
      return '<li role="option" id="sr-' + i + '"><a href="' + PRE + (x.sec ? x.sec.u : a.u) + '"><small>' + esc(a.c) + "</small><strong>" + hl(a.t, q) + "</strong>" +
        (x.sec ? '<span>Sección: ' + hl(x.sec.s, q) + "</span>" : '<span>' + esc(a.d) + "</span>") + "</a></li>";
    }).join("") + "</ul>";
    box.hidden = false;
  }
  function wire(input, box) {
    var sel = -1;
    function items() { return box.querySelectorAll("li a"); }
    function mark() { var it = items(); for (var i = 0; i < it.length; i++) it[i].classList.toggle("on", i === sel); }
    input.setAttribute("role", "combobox"); input.setAttribute("aria-autocomplete", "list"); input.setAttribute("aria-expanded", "false");
    input.addEventListener("focus", function () { load().then(function (d) { if (!INDEX) build(d); if (input.value) render(box, input.value); }); });
    input.addEventListener("input", function () { load().then(function (d) { if (!INDEX) build(d); sel = -1; render(box, input.value); input.setAttribute("aria-expanded", String(!box.hidden)); }); });
    input.addEventListener("keydown", function (e) {
      var it = items();
      if (e.key === "ArrowDown" && it.length) { e.preventDefault(); sel = (sel + 1) % it.length; mark(); }
      else if (e.key === "ArrowUp" && it.length) { e.preventDefault(); sel = (sel - 1 + it.length) % it.length; mark(); }
      else if (e.key === "Enter") { e.preventDefault(); var t = it[sel >= 0 ? sel : 0]; if (t) location.href = t.href; }
      else if (e.key === "Escape") { box.hidden = true; }
    });
    box.addEventListener("click", function (e) { if (e.target.closest(".sr-ask") && window.CC_ASK) { window.CC_ASK(input.value); box.hidden = true; closeModal(); } });
    document.addEventListener("click", function (e) { if (!box.contains(e.target) && e.target !== input) box.hidden = true; });
    var f = input.closest("form"); if (f) f.addEventListener("submit", function (e) { e.preventDefault(); });
  }
  /* buscador de la portada */
  document.querySelectorAll("[data-search]").forEach(function (inp) { var b = inp.parentNode.querySelector(".sr-results"); if (b) wire(inp, b); });
  /* buscador global (modal) */
  var modal = document.createElement("div"); modal.className = "sr-modal"; modal.hidden = true;
  modal.innerHTML = '<div class="sr-back" data-close></div><div class="sr-dialog" role="dialog" aria-modal="true" aria-label="Buscar en la web"><form class="sr-form" role="search"><label class="sr" for="q-modal">Buscar</label>' +
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
    '<input id="q-modal" type="search" placeholder="Busca una guía o un concepto…" autocomplete="off"><button type="button" class="sr-x" data-close aria-label="Cerrar">Esc</button></form>' +
    '<div class="sr-results sr-in-modal" hidden></div><p class="sr-hint">Sugerencias: <a href="' + PRE + 'articulos/tin-y-tae.html">TAE</a> · <a href="' + PRE + 'articulos/euribor-explicado.html">Euríbor</a> · <a href="' + PRE + 'articulos/fondo-de-emergencia.html">Fondo de emergencia</a> · <a href="' + PRE + 'articulos/entender-tu-nomina.html">Nómina</a></p></div>';
  document.body.appendChild(modal);
  var mi = modal.querySelector("input"), mb = modal.querySelector(".sr-results"), last = null;
  wire(mi, mb);
  function openModal() { last = document.activeElement; modal.hidden = false; document.documentElement.classList.add("sr-lock"); setTimeout(function () { mi.focus(); }, 10); }
  function closeModal() { if (modal.hidden) return; modal.hidden = true; document.documentElement.classList.remove("sr-lock"); if (last && last.focus) last.focus(); }
  modal.addEventListener("click", function (e) { if (e.target.closest("[data-close]")) closeModal(); });
  modal.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });
  document.querySelectorAll("[data-open-search]").forEach(function (b) { b.addEventListener("click", openModal); });
  document.addEventListener("keydown", function (e) {
    var tag = (e.target.tagName || "").toLowerCase();
    if (e.key === "/" && tag !== "input" && tag !== "textarea" && modal.hidden) { e.preventDefault(); openModal(); }
  });
})();
