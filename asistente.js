/* Asistente de Cuentas en Calma
   - Funciona sin servidor: busca en todas las guías de la web y responde con el fragmento más útil.
   - Si existe api/chat.php con una clave de IA configurada, responde con IA usando esas mismas guías. */
(function () {
  "use strict";
  var PRE = (document.currentScript && document.currentScript.getAttribute("data-pre")) || "";
  var DATA = null, AI = false, busy = false, history = [], opened = false;

  /* ---------- texto ---------- */
  var STOP = "a al algo algun alguna algunas alguno algunos ante antes como con contra cual cuales cuando de del desde donde dos el ella ellas ellos en entre era es esa esas ese eso esos esta estas este esto estos fue ha hay la las le les lo los mas me mi mis mucho muy no nos o os otra otro para pero poco por porque puedo puede que quien se sea ser si sin sobre son su sus tambien te tener tengo tiene tu tus un una uno unos y ya yo hacer hago debo deberia quiero saber explica explicame dime".split(" ");
  var STOPSET = {}; STOP.forEach(function (w) { STOPSET[w] = 1; });
  var SYN = { hipoteca: "euribor hipoteca", luz: "luz factura potencia", movil: "movil fibra tarifa", ahorrar: "ahorro ahorrar", ahorro: "ahorro ahorrar",
    deuda: "deuda deudas", prestamo: "prestamo deuda tae", tarjeta: "tarjeta credito debito", renta: "renta declaracion irpf hacienda",
    hacienda: "renta irpf", invertir: "inversion invertir fondos", inversion: "inversion invertir fondos", bolsa: "fondos inversion indexados",
    estafa: "estafa fraude", fraude: "estafa fraude", sms: "smishing estafa", sueldo: "sueldo nomina", nomina: "nomina sueldo", paro: "desempleo",
    coche: "coche gasolina seguro", seguro: "seguro seguros", navidad: "navidad regalos", cole: "colegio libros", ninos: "ninos paga hijos", hijos: "hijos ninos", hijo: "hijos ninos",
    pareja: "pareja cuenta comun", inflacion: "inflacion ipc precios", interes: "interes", emergencia: "emergencia colchon fondo" };
  function norm(s) { return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9%€\s]/g, " "); }
  function stem(w) {
    w = w.replace(/(ar|er|ir)(lo|la|los|las|le|les|me|te|se)$/, "$1");
    if (w.length > 6) w = w.replace(/(aciones|iciones|amente|mente|ciones|cion|ando|iendo|ados|idos|ado|ido)$/, "");
    if (w.length > 4) w = w.replace(/(es|s)$/, "");
    if (w.length > 5) w = w.replace(/(ar|er|ir|a|o)$/, "");
    return w;
  }
  function toks(s, expand) {
    var out = [];
    norm(s).split(/\s+/).forEach(function (w) {
      if (!w || STOPSET[w] || w.length < 2) return;
      if (expand && SYN[w]) SYN[w].split(" ").forEach(function (x) { out.push(stem(x)); });
      out.push(stem(w));
    });
    return out;
  }

  /* ---------- índice: primero el artículo, luego la sección ---------- */
  var IDX = null;
  function buildIndex() {
    var arts = {}, order = [];
    DATA.chunks.forEach(function (c, i) {
      var base = c.u.split("#")[0];
      if (!arts[base]) { arts[base] = { t: c.t, chunks: [], words: [] }; order.push(base); }
      arts[base].chunks.push(i);
      arts[base].words = arts[base].words.concat(toks(c.s), toks(c.x));
    });
    var docs = order.map(function (b) {
      var a = arts[b], tt = toks(a.t), all = a.words.concat(tt, tt, tt, tt), tf = {};
      all.forEach(function (w) { tf[w] = (tf[w] || 0) + 1; });
      var tset = {}; tt.forEach(function (w) { tset[w] = 1; });
      return { base: b, tf: tf, len: all.length, chunks: a.chunks, tset: tset };
    });
    var df = {}, avg = 0;
    docs.forEach(function (d) { avg += d.len; for (var w in d.tf) df[w] = (df[w] || 0) + 1; });
    var secs = DATA.chunks.map(function (c) {
      var st = {}, sx = {};
      toks(c.s).forEach(function (w) { st[w] = 1; });
      toks(c.x).forEach(function (w) { sx[w] = (sx[w] || 0) + 1; });
      return { st: st, sx: sx };
    });
    IDX = { docs: docs, df: df, avg: avg / docs.length, N: docs.length, secs: secs };
  }
  function qtoks(q) { return toks(q, true).filter(function (w, i, arr) { return arr.indexOf(w) === i; }); }
  function search(q) {
    var qt = qtoks(q), res = [];
    if (!qt.length) return res;
    IDX.docs.forEach(function (d, i) {
      var sc = 0;
      qt.forEach(function (w) {
        var f = d.tf[w]; if (!f) return;
        var idf = Math.log(1 + (IDX.N - IDX.df[w] + 0.5) / (IDX.df[w] + 0.5));
        sc += idf * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * d.len / IDX.avg));
        if (d.tset[w]) sc += 1.6 * idf;
      });
      if (sc > 0) res.push({ d: d, s: sc });
    });
    res.sort(function (a, b) { return b.s - a.s; });
    return res;
  }
  function bestSection(doc, q) {
    var qt = qtoks(q), best = null, bs = -1, defq = /^\s*(que|cual) (es|son|significa)/.test(norm(q).replace(/^\s+/, ""));
    doc.chunks.forEach(function (ci, k) {
      var S = IDX.secs[ci], sc = 0;
      qt.forEach(function (w) {
        var idf = Math.log(1 + IDX.N / ((IDX.df[w] || 0) + 1));
        if (S.st[w]) sc += (doc.tset[w] ? 0.8 : 3) * idf;
        if (S.sx[w]) sc += idf * Math.min(1.5, Math.log(1 + S.sx[w]));
      });
      if (DATA.chunks[ci].s === "En resumen") sc += 0.8;
      sc -= k * (defq ? 0.6 : 0.05);
      if (sc > bs) { bs = sc; best = ci; }
    });
    return best;
  }
  function bestSentences(text, q, n) {
    var qt = toks(q, true), qs = {}; qt.forEach(function (w) { qs[w] = 1; });
    var sents = text.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡0-9])/).filter(function (x) { return x.trim().length > 2; });
    if (!sents.length) sents = [text];
    var scored = sents.map(function (s, i) { var sc = 0; toks(s).forEach(function (w) { if (qs[w]) sc++; }); return { s: s.trim(), sc: sc, i: i }; });
    var top = scored.slice().sort(function (a, b) { return b.sc - a.sc || a.i - b.i; }).slice(0, n);
    top.sort(function (a, b) { return a.i - b.i; });
    var out = top.map(function (x) { return x.s; }).join(" ");
    return out.length > 420 ? out.slice(0, 410).replace(/\s\S*$/, "") + "…" : out;
  }

  /* ---------- respuestas sobre la web ---------- */
  function link(u, t) { return '<a href="' + PRE + u + '">' + esc(t) + "</a>"; }
  function intents(q) {
    var n = norm(q);
    if (/^(hola|buenas|hey|buenos dias|buenas tardes|buenas noches)\b/.test(n) && n.length < 30)
      return "¡Hola! Soy el asistente de " + esc(DATA.site) + ". Pregúntame lo que quieras sobre ahorro, presupuesto, deudas, bancos o inversión, o sobre cómo usar la web.";
    if (/\b(gracias|genial|perfecto|vale)\b/.test(n) && n.length < 25) return "¡De nada! Si tienes otra duda, aquí estoy.";
    if (/calculad|simulad|calcular/.test(n))
      return "Tenemos tres calculadoras gratuitas: " + link("calculadoras.html#c-503020", "Reparto 50/30/20") + ", " + link("calculadoras.html#c-emergencia", "Fondo de emergencia") + " e " + link("calculadoras.html#c-interes", "Interés compuesto") + ". Los cálculos se hacen en tu navegador y no guardamos ningún dato.";
    if (/contact|email|correo|escribir|hablar con/.test(n))
      return "Puedes escribirnos desde la página de " + link("contacto.html", "Contacto") + " o al correo " + esc(DATA.email) + ". No damos asesoramiento financiero personalizado por correo.";
    if (/quien (esta|escribe|sois|eres)|sobre (vosotros|nosotros)|autor/.test(n))
      return "Toda la información sobre quién escribe y cómo trabajamos está en " + link("sobre-nosotros.html", "Sobre nosotros") + ".";
    if (/cookie|privacidad|mis datos|datos personales|rgpd/.test(n))
      return "Lo tienes explicado en la " + link("politica-de-privacidad.html", "Política de privacidad") + " y la " + link("politica-de-cookies.html", "Política de cookies") + ". Las preguntas que me haces no se guardan en la web.";
    if (/anuncio|publicidad|adsense/.test(n))
      return "La web es gratuita y se financia con anuncios de Google AdSense, siempre marcados como «Publicidad». No influyen en el contenido. Más detalles en " + link("sobre-nosotros.html", "Sobre nosotros") + ".";
    if (/aviso legal|legal/.test(n)) return "Aquí tienes el " + link("aviso-legal.html", "Aviso legal") + ".";
    if (/(que|cuales) (temas|categorias|secciones)|categorias|secciones|que hay en (la|esta) web|de que (va|trata)|como funciona (la|esta) web|ayuda/.test(n))
      return "La web tiene " + DATA.arts.length + " guías organizadas en 6 temas: " + DATA.cats.map(function (c) { return link(c.u, c.c); }).join(", ") + ". Además hay " + link("calculadoras.html", "calculadoras") + ". Puedes preguntarme por cualquier tema y te llevo a la guía adecuada.";
    if (/(todas|lista|ver) (las )?(guias|articulos)/.test(n))
      return "Estas son todas las guías: <ul>" + DATA.arts.map(function (a) { return "<li>" + link(a.u, a.t) + "</li>"; }).join("") + "</ul>";
    return null;
  }

  function localAnswer(q) {
    var it = intents(q); if (it) return it;
    var r = search(q);
    if (!r.length || r[0].s < 1.5) {
      return "No he encontrado una guía que responda exactamente a eso. Prueba con otras palabras o explora los temas: " +
        DATA.cats.map(function (c) { return link(c.u, c.c); }).join(", ") + ".";
    }
    var top = DATA.chunks[bestSection(r[0].d, q)];
    var html = "Según nuestra guía <strong>" + esc(top.t) + "</strong>" + (top.s && top.s !== "En resumen" ? " (" + esc(top.s) + ")" : "") + ":<br>" +
      esc(bestSentences(top.x, q, 3)) + '<br><a class="cc-more" href="' + PRE + top.u + '">Leer la explicación completa →</a>';
    var more = [];
    for (var k = 1; k < r.length && more.length < 2; k++) {
      if (r[k].s > r[0].s * 0.4) { var c0 = DATA.chunks[r[k].d.chunks[0]]; more.push(link(c0.u.split("#")[0], c0.t)); }
    }
    if (more.length) html += '<div class="cc-also">También te puede interesar: ' + more.join(" · ") + "</div>";
    if (/\b(debo|deberia|me conviene|que hago|recomiendas|recomienda|mejor banco|mejor fondo|en que invierto)\b/.test(norm(q)))
      html += '<div class="cc-also">Recuerda: te doy información general, no asesoramiento personalizado.</div>';
    return html;
  }

  /* ---------- IA (opcional) ---------- */
  function aiAnswer(q) {
    return fetch(PRE + "api/chat.php", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: q, history: history.slice(-6) }) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok) throw new Error((j && j.error) || "sin respuesta");
        var html = fmt(j.answer);
        if (j.links && j.links.length) html += '<div class="cc-also">Guías relacionadas: ' + j.links.map(function (l) { return link(l.u, l.t); }).join(" · ") + "</div>";
        history.push({ role: "user", content: q }, { role: "assistant", content: j.answer });
        return html;
      });
  }

  /* ---------- interfaz ---------- */
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmt(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>"); }
  var root = document.createElement("div"); root.className = "cc-bot";
  root.innerHTML =
    '<button class="cc-fab" type="button" aria-expanded="false" aria-controls="cc-panel"><span class="cc-fab-ic" aria-hidden="true"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/></svg></span><span class="cc-fab-txt">¿Dudas? Pregúntame</span></button>' +
    '<section class="cc-panel" id="cc-panel" role="dialog" aria-modal="false" aria-label="Asistente de dudas" hidden>' +
      '<header class="cc-head"><span class="cc-av" aria-hidden="true"></span><div><strong>Asistente</strong><small class="cc-mode">Buscando en ' + "las guías…</small></div>" +
      '<button class="cc-x" type="button" aria-label="Cerrar asistente">×</button></header>' +
      '<div class="cc-log" aria-live="polite"></div>' +
      '<div class="cc-chips"></div>' +
      '<form class="cc-form"><label class="cc-sr" for="cc-in">Escribe tu pregunta</label><input id="cc-in" type="text" maxlength="400" autocomplete="off" placeholder="Escribe tu pregunta…"><button type="submit" aria-label="Enviar"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></form>' +
      '<p class="cc-legal">Información general, no asesoramiento financiero. No escribas datos personales.</p>' +
    "</section>";
  document.body.appendChild(root);
  var fab = root.querySelector(".cc-fab"), panel = root.querySelector(".cc-panel"), log = root.querySelector(".cc-log"),
      form = root.querySelector(".cc-form"), input = root.querySelector("#cc-in"), chips = root.querySelector(".cc-chips"), mode = root.querySelector(".cc-mode");

  function add(html, who) {
    var d = document.createElement("div"); d.className = "cc-msg " + (who || "bot"); d.innerHTML = html; log.appendChild(d);
    log.scrollTop = log.scrollHeight; return d;
  }
  var SUG = ["¿Cómo empiezo a ahorrar?", "¿Qué es la TAE?", "¿Cómo salgo de deudas?", "¿Qué calculadoras hay?", "¿Cómo bajo la factura de la luz?"];
  function setChips() {
    chips.innerHTML = SUG.map(function (s) { return '<button type="button" class="cc-chip">' + esc(s) + "</button>"; }).join("");
  }
  function loadData(cb) {
    if (DATA) return cb();
    var s = document.createElement("script"); s.src = PRE + "asistente-datos.js";
    s.onload = function () { DATA = window.CC_DATA; buildIndex(); cb(); };
    s.onerror = function () { add("No he podido cargar las guías. Recarga la página e inténtalo de nuevo."); };
    document.head.appendChild(s);
  }
  function checkAI() {
    if (location.protocol === "file:") { mode.textContent = "Búsqueda inteligente en las guías"; return; }
    fetch(PRE + "api/chat.php?ping=1").then(function (r) { return r.json(); }).then(function (j) {
      AI = !!(j && j.ok); mode.textContent = AI ? "Con IA · responde usando nuestras guías" : "Búsqueda inteligente en las guías";
    }).catch(function () { mode.textContent = "Búsqueda inteligente en las guías"; });
  }
  function open() {
    panel.hidden = false; fab.setAttribute("aria-expanded", "true"); root.classList.add("is-open");
    if (!opened) {
      opened = true;
      add("¡Hola! Soy el asistente de la web. Pregúntame sobre ahorro, presupuesto, deudas, bancos, inversión o sobre cómo usar la web y te llevo a la guía adecuada.");
      setChips(); loadData(function () {}); checkAI();
    }
    setTimeout(function () { input.focus(); }, 50);
  }
  function close() { panel.hidden = true; fab.setAttribute("aria-expanded", "false"); root.classList.remove("is-open"); fab.focus(); }
  function ask(q) {
    q = (q || "").trim(); if (!q || busy) return;
    add(esc(q), "me"); input.value = ""; busy = true; chips.innerHTML = "";
    var typing = add('<span class="cc-dots"><i></i><i></i><i></i></span>', "bot typing");
    loadData(function () {
      var done = function (html) { typing.remove(); add(html); busy = false; };
      if (AI) aiAnswer(q).then(done).catch(function () { done(localAnswer(q)); });
      else setTimeout(function () { done(localAnswer(q)); }, 350);
    });
  }
  fab.addEventListener("click", function () { panel.hidden ? open() : close(); });
  root.querySelector(".cc-x").addEventListener("click", close);
  form.addEventListener("submit", function (e) { e.preventDefault(); ask(input.value); });
  chips.addEventListener("click", function (e) { var b = e.target.closest(".cc-chip"); if (b) ask(b.textContent); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !panel.hidden) close(); });
  window.CC_ASK = function (q) { open(); ask(q); };
})();
