// ==========================================================================
// CONFIGURAZIONE
// ==========================================================================

// Link CSV pubblicato del Google Sheet collegato al Form "Guida la Spesa"
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR6CZuwcz5yV9JmezGn7FSARpyVuBFdcLy9wz9kNuV3atrPUv2gVOF_QsvjbfYcRVNJDhxUP6YEHwcT/pub?gid=38068885&single=true&output=csv";

// Le 27 categorie, nell'ordine in cui appaiono in home
const CATEGORIES = [
  "Frutta", "Verdura", "Cereali da colazione", "Cereali in chicco", "Pane",
  "Derivati del pane", "Biscotti", "Latte e bevande vegetali", "Latticini e formaggi",
  "Carne bianca", "Carne rossa", "Affettati e insaccati", "Pesce magro", "Pesce grasso",
  "Pesce conservato", "Uova", "Legumi", "Soia e derivati", "Altre proteine vegetali",
  "Dolci", "Snack", "Condimenti", "Oli e grassi", "Spezie", "Bevande", "Surgelati", "Conserve"
];

// Testo mostrato quando una categoria non ha ancora prodotti
const EMPTY_CATEGORY_TEXT = "Non ci sono ancora prodotti in questa categoria.";

// ==========================================================================
// STATO
// ==========================================================================

let PRODUCTS = [];
let LOAD_ERROR = null;

const view = document.getElementById("view");
const backBtn = document.getElementById("backBtn");
const brandText = document.getElementById("brandText");

// ==========================================================================
// UTILITA'
// ==========================================================================

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function slugify(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function parseNumber(str) {
  if (str === undefined || str === null) return 0;
  const cleaned = String(str).trim().replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function roundVal(n) {
  return Math.round(n * 10) / 10;
}

// Converte un link di condivisione Google Drive in un link immagine mostrabile
function driveImageUrl(rawUrl) {
  if (!rawUrl) return null;
  const match = String(rawUrl).match(/[-\w]{25,}/);
  if (!match) return rawUrl;
  return `https://drive.google.com/thumbnail?id=${match[0]}&sz=w400`;
}

// Parser CSV semplice, con supporto per campi tra virgolette (contenenti virgole)
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* ignora */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim() !== ""));
}

function rowsToProducts(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map(h => h.trim());
  const idx = (name) => headers.indexOf(name);

  const iCategoria = idx("Categoria");
  const iNome = idx("Nome prodotto");
  const iMarca = idx("Marca");
  const iPorzione = idx("Porzione di riferimento (g)");
  const iImmagine = idx("Immagine prodotto");
  const iKcal = idx("Kcal per 100g");
  const iGrassi = idx("Grassi per 100g");
  const iSaturi = idx("Di cui grassi saturi per 100g");
  const iCarbo = idx("Carboidrati per 100g");
  const iZuccheri = idx("Di cui zuccheri per 100g");
  const iProteine = idx("Proteine per 100g");
  const iFibre = idx("Fibre per 100g");
  const iSale = idx("Sale per 100g");
  const iIngredienti = idx("Ingredienti");
  const iPunteggio = idx("Punteggio");
  const iDescrizione = idx("Descrizione / consiglio nutrizionale");

  return rows.slice(1).map((r) => {
    const nome = (r[iNome] || "").trim();
    const categoria = (r[iCategoria] || "").trim();
    return {
      categoria,
      nome,
      marca: (r[iMarca] || "").trim(),
      porzione: parseNumber(r[iPorzione]),
      immagine: driveImageUrl((r[iImmagine] || "").trim()),
      kcal: parseNumber(r[iKcal]),
      grassi: parseNumber(r[iGrassi]),
      saturi: parseNumber(r[iSaturi]),
      carbo: parseNumber(r[iCarbo]),
      zuccheri: parseNumber(r[iZuccheri]),
      proteine: parseNumber(r[iProteine]),
      fibre: parseNumber(r[iFibre]),
      sale: parseNumber(r[iSale]),
      ingredienti: (r[iIngredienti] || "").trim(),
      punteggio: parseNumber(r[iPunteggio]),
      descrizione: (r[iDescrizione] || "").trim(),
      slug: `${slugify(categoria)}-${slugify(nome)}`
    };
  }).filter(p => p.nome);
}

// ==========================================================================
// CARICAMENTO DATI
// ==========================================================================

async function loadProducts() {
  const res = await fetch(SHEET_CSV_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("Impossibile leggere il foglio prodotti.");
  const text = await res.text();
  const rows = parseCSV(text);
  return rowsToProducts(rows);
}

// ==========================================================================
// ROUTING
// ==========================================================================

function currentRoute() {
  const hash = window.location.hash.replace(/^#\/?/, "");
  if (!hash) return { name: "home" };
  const parts = hash.split("/");
  if (parts[0] === "categoria" && parts[1]) return { name: "categoria", categoria: decodeURIComponent(parts[1]) };
  if (parts[0] === "prodotto" && parts[1]) return { name: "prodotto", slug: decodeURIComponent(parts[1]) };
  if (parts[0] === "cerca") return { name: "cerca", q: decodeURIComponent(parts[1] || "") };
  if (parts[0] === "confronto" && parts[1] && parts[2]) return { name: "confronto", slug1: decodeURIComponent(parts[1]), slug2: decodeURIComponent(parts[2]) };
  if (parts[0] === "confronto" && parts[1]) return { name: "confronto-scegli", slug1: decodeURIComponent(parts[1]) };
  return { name: "home" };
}

function goTo(hash) { window.location.hash = hash; }

window.addEventListener("hashchange", render);

// ==========================================================================
// RENDER
// ==========================================================================

function render() {
  if (LOAD_ERROR) { renderError(); return; }
  const route = currentRoute();
  backBtn.hidden = route.name === "home";
  if (route.name === "categoria") renderCategoria(route.categoria);
  else if (route.name === "prodotto") renderProdotto(route.slug);
  else if (route.name === "cerca") renderCerca(route.q);
  else if (route.name === "confronto-scegli") renderConfrontoScegli(route.slug1);
  else if (route.name === "confronto") renderConfronto(route.slug1, route.slug2);
  else renderHome();
  window.scrollTo(0, 0);
}

function renderLoading() {
  view.innerHTML = `
    <div class="loader">
      <div class="spinner"></div>
      <p>Carico i prodotti...</p>
    </div>`;
}

function renderError() {
  view.innerHTML = `
    <div class="error-box">
      Non riesco a caricare i prodotti in questo momento. Controlla la connessione e riprova tra poco.
    </div>`;
}

function renderHome() {
  const html = `
    <p class="eyebrow">Cosa cerchi oggi?</p>
    <h2 class="headline">Guida alla spesa</h2>
    <div class="search-box">
      <svg class="search-icon" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="M21 21l-4.3-4.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      <input id="searchInput" type="text" placeholder="Cerca un alimento, es. yogurt" autocomplete="off">
    </div>
    <h3 class="section-title">Categorie</h3>
    <div class="category-select">
      <select id="categorySelect">
        <option value="" selected disabled>Scegli una categoria</option>
        ${CATEGORIES.map(cat => {
          const count = PRODUCTS.filter(p => p.categoria === cat).length;
          return `<option value="${escapeHtml(cat)}">${escapeHtml(cat)} (${count})</option>`;
        }).join("")}
      </select>
      <svg class="select-icon" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>`;
  view.innerHTML = html;
  brandText.textContent = "Guida alla spesa";

  const input = document.getElementById("searchInput");
  input.addEventListener("input", () => {
    const q = input.value.trim();
    if (q.length >= 2) goTo(`#/cerca/${encodeURIComponent(q)}`);
  });

  const select = document.getElementById("categorySelect");
  select.addEventListener("change", () => {
    if (select.value) goTo(`#/categoria/${encodeURIComponent(select.value)}`);
  });
}

function productRowHtml(p) {
  const thumb = p.immagine
    ? `<div class="product-thumb" style="background-image:url('${escapeHtml(p.immagine)}')"></div>`
    : `<div class="product-thumb"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="9" r="1.5"/><path d="M21 15l-5-5-9 9"/></svg></div>`;
  return `
    <button class="product-row" data-slug="${escapeHtml(p.slug)}">
      ${thumb}
      <div class="product-info">
        <p class="product-name">${escapeHtml(p.nome)}</p>
        <p class="product-brand">${escapeHtml(p.marca)}</p>
      </div>
      <svg class="chevron" width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>`;
}

function attachProductRowEvents() {
  view.querySelectorAll(".product-row").forEach(btn => {
    btn.addEventListener("click", () => goTo(`#/prodotto/${encodeURIComponent(btn.dataset.slug)}`));
  });
}

function renderCategoria(categoria) {
  const items = PRODUCTS.filter(p => p.categoria === categoria);
  brandText.textContent = categoria;
  if (!items.length) {
    view.innerHTML = `<div class="empty"><p>${escapeHtml(EMPTY_CATEGORY_TEXT)}</p></div>`;
    return;
  }
  view.innerHTML = `<div class="product-list">${items.map(productRowHtml).join("")}</div>`;
  attachProductRowEvents();
}

function renderCerca(q) {
  brandText.textContent = "Guida alla spesa";
  const qLower = q.trim().toLowerCase();
  const items = PRODUCTS.filter(p => p.nome.toLowerCase().includes(qLower));
  const header = `
    <div class="search-box">
      <svg class="search-icon" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="M21 21l-4.3-4.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      <input id="searchInput" type="text" placeholder="Cerca un alimento, es. yogurt" autocomplete="off" value="${escapeHtml(q)}">
    </div>`;
  if (!items.length) {
    view.innerHTML = `${header}<div class="empty"><p>Nessun alimento trovato per "${escapeHtml(q)}".</p></div>`;
  } else {
    view.innerHTML = `${header}<div class="product-list">${items.map(productRowHtml).join("")}</div>`;
    attachProductRowEvents();
  }
  const input = document.getElementById("searchInput");
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  input.addEventListener("input", () => {
    const val = input.value.trim();
    if (val.length >= 2) window.location.hash = `#/cerca/${encodeURIComponent(val)}`;
    else if (val.length === 0) goTo("#/");
  });
}

function nutriValues(p, factor) {
  return {
    kcal: roundVal(p.kcal * factor),
    grassi: roundVal(p.grassi * factor),
    saturi: roundVal(p.saturi * factor),
    carbo: roundVal(p.carbo * factor),
    zuccheri: roundVal(p.zuccheri * factor),
    proteine: roundVal(p.proteine * factor),
    fibre: roundVal(p.fibre * factor),
    sale: roundVal(p.sale * factor)
  };
}

function nutriGridHtml(v) {
  return `
    <div class="nutri-grid">
      <div class="nutri-item"><span class="nutri-label">Kcal</span><span class="nutri-value">${v.kcal}</span></div>
      <div class="nutri-item"><span class="nutri-label">Di cui zuccheri</span><span class="nutri-value">${v.zuccheri} g</span></div>
      <div class="nutri-item"><span class="nutri-label">Grassi</span><span class="nutri-value">${v.grassi} g</span></div>
      <div class="nutri-item"><span class="nutri-label">Proteine</span><span class="nutri-value">${v.proteine} g</span></div>
      <div class="nutri-item"><span class="nutri-label">Di cui saturi</span><span class="nutri-value">${v.saturi} g</span></div>
      <div class="nutri-item"><span class="nutri-label">Fibre</span><span class="nutri-value">${v.fibre} g</span></div>
      <div class="nutri-item"><span class="nutri-label">Carboidrati</span><span class="nutri-value">${v.carbo} g</span></div>
      <div class="nutri-item"><span class="nutri-label">Sale</span><span class="nutri-value">${v.sale} g</span></div>
    </div>`;
}

function renderProdotto(slug) {
  const p = PRODUCTS.find(x => x.slug === slug);
  if (!p) {
    view.innerHTML = `<div class="empty"><p>Prodotto non trovato.</p></div>`;
    return;
  }
  brandText.textContent = p.nome;

  const photo = p.immagine
    ? `<div class="detail-photo" style="background-image:url('${escapeHtml(p.immagine)}')"></div>`
    : `<div class="detail-photo"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="9" r="1.5"/><path d="M21 15l-5-5-9 9"/></svg></div>`;

  const punteggio = Math.max(0, Math.min(10, p.punteggio));

  view.innerHTML = `
    <span class="category-badge">${escapeHtml(p.categoria)}</span>
    <div class="detail-card">
      <div class="detail-head">
        ${photo}
        <div class="detail-head-info">
          <span class="detail-cat">${escapeHtml(p.categoria)}</span>
          <h2 class="detail-name">${escapeHtml(p.nome)}</h2>
          ${p.marca ? `<span class="detail-brand">${escapeHtml(p.marca)}</span>` : ""}
        </div>
        ${scoreRingHtml(punteggio)}
      </div>

      <div class="unit-toggle">
        <button id="btn100" class="active">100 g</button>
        <button id="btnPorz" ${p.porzione ? "" : "disabled"}>Porzione${p.porzione ? ` ${p.porzione} g` : ""}</button>
      </div>

      <div id="nutriWrap">${nutriGridHtml(nutriValues(p, 1))}</div>

      ${p.ingredienti ? `
      <div class="detail-block">
        <h2>Ingredienti</h2>
        <p>${escapeHtml(p.ingredienti)}</p>
      </div>` : ""}

      ${p.descrizione ? `
      <div class="detail-block">
        <h2>Consiglio nutrizionale</h2>
        <p>${escapeHtml(p.descrizione)}</p>
      </div>` : ""}

      <button class="compare-btn" id="compareBtn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M8 3L4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Confronta con un altro alimento
      </button>
    </div>`;

  document.getElementById("compareBtn").addEventListener("click", () => goTo(`#/confronto/${encodeURIComponent(p.slug)}`));

  const btn100 = document.getElementById("btn100");
  const btnPorz = document.getElementById("btnPorz");
  const nutriWrap = document.getElementById("nutriWrap");

  btn100.addEventListener("click", () => {
    btn100.classList.add("active");
    btnPorz.classList.remove("active");
    nutriWrap.innerHTML = nutriGridHtml(nutriValues(p, 1));
  });
  btnPorz.addEventListener("click", () => {
    if (!p.porzione) return;
    btnPorz.classList.add("active");
    btn100.classList.remove("active");
    nutriWrap.innerHTML = nutriGridHtml(nutriValues(p, p.porzione / 100));
  });
}

function scoreRingHtml(punteggio, size) {
  const p = Math.max(0, Math.min(10, punteggio));
  const deg = Math.round((p / 10) * 360);
  const cls = size === "small" ? "compare-score" : "score-ring";
  return `
    <div class="${cls}" style="background: conic-gradient(var(--accent) 0deg ${deg}deg, var(--paper-dim) ${deg}deg 360deg);">
      <div class="score-inner">${p}</div>
    </div>`;
}

function renderConfrontoScegli(slug1) {
  const p1 = PRODUCTS.find(x => x.slug === slug1);
  if (!p1) { view.innerHTML = `<div class="empty"><p>Prodotto non trovato.</p></div>`; return; }
  brandText.textContent = "Confronta";
  view.innerHTML = `
    <div class="compare-pick-current">Stai confrontando <strong>${escapeHtml(p1.nome)}</strong>. Cerca il secondo alimento.</div>
    <div class="search-box">
      <svg class="search-icon" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="M21 21l-4.3-4.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      <input id="compareSearchInput" type="text" placeholder="Cerca un alimento da confrontare" autocomplete="off">
    </div>
    <div id="compareResults"></div>`;

  const input = document.getElementById("compareSearchInput");
  const results = document.getElementById("compareResults");
  input.focus();
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) { results.innerHTML = ""; return; }
    const items = PRODUCTS.filter(p => p.slug !== p1.slug && p.nome.toLowerCase().includes(q));
    results.innerHTML = items.length
      ? `<div class="product-list">${items.map(productRowHtml).join("")}</div>`
      : `<div class="empty"><p>Nessun alimento trovato.</p></div>`;
    results.querySelectorAll(".product-row").forEach(btn => {
      btn.addEventListener("click", () => goTo(`#/confronto/${encodeURIComponent(p1.slug)}/${encodeURIComponent(btn.dataset.slug)}`));
    });
  });
}

function compareRowHtml(label, aVal, bVal, unit, highlightLower) {
  let aClass = "compare-val";
  let bClass = "compare-val right";
  if (highlightLower && aVal !== bVal) {
    if (aVal < bVal) aClass += " better";
    else bClass += " better";
  }
  return `
    <div class="compare-row">
      <span class="${aClass}">${aVal}${unit}</span>
      <span class="compare-label">${label}</span>
      <span class="${bClass}">${bVal}${unit}</span>
    </div>`;
}

function renderConfronto(slug1, slug2) {
  const p1 = PRODUCTS.find(x => x.slug === slug1);
  const p2 = PRODUCTS.find(x => x.slug === slug2);
  if (!p1 || !p2) { view.innerHTML = `<div class="empty"><p>Prodotto non trovato.</p></div>`; return; }
  brandText.textContent = "Confronto";

  const photo = (p) => p.immagine
    ? `<div class="compare-photo" style="background-image:url('${escapeHtml(p.immagine)}')"></div>`
    : `<div class="compare-photo"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="9" r="1.5"/><path d="M21 15l-5-5-9 9"/></svg></div>`;

  const head = (p) => `
    <div class="compare-head">
      ${photo(p)}
      <span class="compare-name">${escapeHtml(p.nome)}</span>
      ${p.marca ? `<span class="compare-brand">${escapeHtml(p.marca)}</span>` : ""}
      ${scoreRingHtml(p.punteggio, "small")}
    </div>`;

  view.innerHTML = `
    <div class="compare-heads">${head(p1)}${head(p2)}</div>
    <div class="compare-table">
      ${compareRowHtml("Kcal", p1.kcal, p2.kcal, "", false)}
      ${compareRowHtml("Grassi", p1.grassi, p2.grassi, " g", false)}
      ${compareRowHtml("di cui saturi", p1.saturi, p2.saturi, " g", true)}
      ${compareRowHtml("Carboidrati", p1.carbo, p2.carbo, " g", false)}
      ${compareRowHtml("di cui zuccheri", p1.zuccheri, p2.zuccheri, " g", true)}
      ${compareRowHtml("Proteine", p1.proteine, p2.proteine, " g", false)}
      ${compareRowHtml("Fibre", p1.fibre, p2.fibre, " g", false)}
      ${compareRowHtml("Sale", p1.sale, p2.sale, " g", true)}
    </div>`;
}



backBtn.addEventListener("click", () => {
  const route = currentRoute();
  if (route.name === "prodotto") {
    const p = PRODUCTS.find(x => x.slug === route.slug);
    goTo(p ? `#/categoria/${encodeURIComponent(p.categoria)}` : "#/");
  } else if (route.name === "confronto-scegli") {
    goTo(`#/prodotto/${encodeURIComponent(route.slug1)}`);
  } else if (route.name === "confronto") {
    goTo(`#/prodotto/${encodeURIComponent(route.slug1)}`);
  } else {
    goTo("#/");
  }
});

// ==========================================================================
// AVVIO
// ==========================================================================

renderLoading();
loadProducts()
  .then(products => { PRODUCTS = products; render(); })
  .catch(err => { LOAD_ERROR = err; render(); });

// Registrazione service worker (funzionamento offline)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
