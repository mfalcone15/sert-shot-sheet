const $ = (id) => document.getElementById(id);
const view = $("view");
let records = [], crew = [], sequence = 0, current = null, db = null;
const DATA_IMG = /^data:image\/(?:jpeg|jpg|png);base64,[a-z0-9+/=\r\n]+$/i;
const OUTCOMES = [
  ["outcomeFunction", "outcomeFunctionNotes", "Charge functioned as designed", "No"],
  ["outcomeBreach", "outcomeBreachNotes", "Positive breach", "No"],
  ["outcomeFragInside", "outcomeFragInsideNotes", "Hazardous frag inside target", "Yes"],
  ["outcomeFragOutside", "outcomeFragOutsideNotes", "Hazardous frag outside target", "Yes"],
];

function el(tag, text, parent) {
  const n = document.createElement(tag);
  if (text != null) n.textContent = text;
  if (parent) parent.append(n);
  return n;
}
function btn(text, fn, parent, cls) {
  const b = el("button", text, parent);
  b.type = "button";
  if (cls) b.className = cls;
  b.onclick = fn;
  return b;
}
function note(t) { $("notice").textContent = t || ""; }
function localDate() {
  const d = new Date();
  return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function uid() { return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2); }
function blankLine() { return { id: uid(), type: "", amount: "", grains: "" }; }
function numberHeading(r) { return r.type === "Operational" ? "Incident number" : "Shot number"; }

function emptyReport(number) {
  return {
    id: uid(), status: "Draft", type: "Training", operationType: "", number: number, date: localDate(), time: "",
    location: "", weather: "", humidity: "", temperature: "", primary: "", assistant: "", targetDescription: "",
    chargeType: "", chargeName: "", adhesionMethod: "", primingMethod: "", explosives: [blankLine()],
    reFactor: "1.66", kFactor: "18", roomLength: "", roomWidth: "", roomHeight: "",
    resultGrains: "", resultLbs: "", resultTnt: "", resultMsd: "", resultVolume: "", resultPsi: "", legacyResults: false,
    documentedResults: "", outcomeFunction: "", outcomeFunctionNotes: "", outcomeBreach: "", outcomeBreachNotes: "",
    outcomeFragInside: "", outcomeFragInsideNotes: "", outcomeFragOutside: "", outcomeFragOutsideNotes: "",
    photos: "Not recorded", video: "Not recorded", comments: "", images: [], attachments: [],
  };
}
function applyFigures(r) {
  const work = Charge.buildWork(r);
  if (!work.figures) {
    if (r.legacyResults) return r;
    r.resultGrains = r.resultLbs = r.resultTnt = r.resultMsd = r.resultVolume = r.resultPsi = "";
    return r;
  }
  r.legacyResults = false;
  r.resultGrains = Charge.formatGrains(work.figures.totalGrains);
  r.resultLbs = work.figures.lbs.toFixed(4);
  r.resultTnt = work.figures.lbsTnt == null ? "" : work.figures.lbsTnt.toFixed(4);
  r.resultMsd = work.figures.msdFt == null ? "" : work.figures.msdFt.toFixed(1);
  r.resultVolume = work.figures.volumeCuFt == null ? "" : Charge.formatVolume(work.figures.volumeCuFt);
  r.resultPsi = work.figures.psi == null ? "" : work.figures.psi.toFixed(2);
  return r;
}
function normalize(raw) {
  if (!raw || typeof raw.id !== "string" || !["Draft", "Completed"].includes(raw.status)) return null;
  const base = emptyReport(raw.number || "R-00000");
  const lines = Array.isArray(raw.explosives) ? raw.explosives.filter((line) => line && typeof line === "object").map((line) => ({
    id: typeof line.id === "string" ? line.id : uid(),
    type: String(line.type || ""),
    amount: String(line.amount || ""),
    grains: String(line.grains || ""),
  })) : [];
  const images = Array.isArray(raw.images) ? raw.images.filter((p) => p && DATA_IMG.test(p.data) && typeof p.caption === "string") : [];
  const attachments = Array.isArray(raw.attachments) ? raw.attachments.filter((a) => a && typeof a.name === "string" && DATA_IMG.test(a.data)) : [];
  const r = Object.assign(base, raw, {
    id: raw.id,
    status: raw.status,
    type: raw.type === "Operational" ? "Operational" : "Training",
    explosives: lines.length ? lines : [blankLine()],
    reFactor: raw.reFactor || "1.66",
    kFactor: raw.kFactor || "18",
    images: images,
    attachments: attachments,
    photos: raw.photos || "Not recorded",
    video: raw.video || "Not recorded",
    legacyResults: false,
  });
  const work = Charge.buildWork(r);
  const hasLegacy = [r.resultGrains, r.resultLbs, r.resultTnt, r.resultMsd, r.resultPsi].some((v) => String(v || "").trim());
  if (!work.figures && hasLegacy) { r.legacyResults = true; return r; }
  return applyFigures(r);
}

function snapshot() { return { records: records, crew: crew, sequence: sequence }; }
function persist() {
  try { localStorage.setItem("dss-test-v1", JSON.stringify(snapshot())); } catch (e) { note("This device is low on storage. Export a backup."); }
  if (!db) return;
  try {
    const tx = db.transaction("state", "readwrite");
    tx.objectStore("state").put(snapshot(), "main");
    tx.onerror = () => note("Storage write failed. Export a backup.");
  } catch (e) { note("Storage write failed. Export a backup."); }
}
function autoSave() {
  if (!current || current.status === "Completed") return;
  current.status = "Draft";
  applyFigures(current);
  records = records.filter((r) => r.id !== current.id).concat([current]);
  persist();
}
function nextNumber() {
  let n;
  do { n = "R-" + String(++sequence).padStart(5, "0"); } while (records.some((r) => r.number === n));
  return n;
}
function clone(r) { return JSON.parse(JSON.stringify(r)); }

function section(title, lede) {
  const s = el("section", null, view);
  el("h2", title, s);
  if (lede) { const p = el("p", lede, s); p.className = "lede"; }
  return s;
}
function labeled(title, parent, hint) {
  const l = el("label", null, parent);
  el("span", title, l).className = "lbl";
  if (hint) { const h = el("small", hint, l); h.className = "hint"; h.style.display = "block"; }
  return l;
}
function textInput(parent, value, oninput, opts) {
  const i = el(opts && opts.area ? "textarea" : "input", null, parent);
  if (!opts || !opts.area) i.type = (opts && opts.type) || "text";
  if (opts && opts.mode) i.inputMode = opts.mode;
  if (opts && opts.placeholder) i.placeholder = opts.placeholder;
  if (opts && opts.list) i.setAttribute("list", opts.list);
  if (opts && opts.id) i.id = opts.id;
  i.value = value || "";
  i.oninput = () => oninput(i.value);
  return i;
}
function selectInput(parent, value, options, oninput, includeBlank) {
  const s = el("select", null, parent);
  const opts = includeBlank ? [["", "Select"]].concat(options.map((v) => [v, v])) : options.map((v) => [v, v]);
  opts.forEach((pair) => { const o = el("option", pair[1], s); o.value = pair[0]; });
  s.value = value || "";
  s.onchange = () => oninput(s.value);
  return s;
}

function identityPairs(r) {
  const rows = [["Report type", r.type || "—"]];
  if (r.type === "Operational") rows.push(["Operation type", r.operationType || "—"]);
  rows.push(
    [numberHeading(r), r.number || "—"],
    ["Date", r.date || "—"],
    ["Time", r.time || "—"],
    ["Location", r.location || "—"],
    ["Weather", r.weather || "—"],
    ["Humidity", r.humidity || "—"],
    ["Temperature (°F)", r.temperature || "—"],
    ["Primary breacher", r.primary || "—"],
    ["Assistant breacher", r.assistant || "—"],
    ["Target description", r.targetDescription || "—"],
    ["Charge type", r.chargeType || "—"],
    ["Charge name", r.chargeName || "—"],
    ["Method of adhesion", r.adhesionMethod || "—"],
    ["Priming method", r.primingMethod || "—"],
  );
  return rows;
}
function outcomeFields(r) {
  const rows = [];
  OUTCOMES.forEach((o) => {
    rows.push([o[2], r[o[0]] || "—"]);
    if (r[o[0]] === o[3]) rows.push([o[2] + " — comments", r[o[1]] || "—"]);
  });
  rows.push(["Photographs taken", r.photos || "—"], ["Video taken", r.video || "—"]);
  if (String(r.documentedResults || "").trim()) rows.push(["Additional calculation notes", r.documentedResults]);
  if (String(r.comments || "").trim()) rows.push(["Administrative comments", r.comments]);
  return rows;
}
function reportFields(r) { return identityPairs(r); }

function renderWork(host, r) {
  host.replaceChildren();
  const work = Charge.buildWork(r);
  const total = el("div", null, host);
  total.className = "row";
  el("strong", "Total grains", total);
  el("span", work.figures ? Charge.formatGrains(work.figures.totalGrains) : "—", total).className = "big nums";
  work.steps.forEach((step) => {
    const row = el("div", null, host);
    row.className = "step";
    const head = el("div", null, row);
    head.className = "row";
    el("strong", step.title, head);
    el("span", step.result, head).className = "big nums";
    el("p", step.formula, row).className = "muted";
    if (step.expression) el("p", step.expression, row).className = "expr nums";
    if (step.note) el("p", step.note, row).className = "err";
  });
  const banner = el("p", work.figures ? Charge.statusCopy(work.figures.status) : (r.legacyResults ? "Previously recorded results stay until a grain weight is entered." : "Enter a grain weight to run the worksheet."), host);
  const status = work.figures ? work.figures.status : "none";
  banner.className = "banner " + (status === "none" ? "" : status);
  banner.setAttribute("role", "status");
}

function home() {
  view.replaceChildren();
  const s = section("Report dashboard", "Training and operational breacher reports, stored on this device.");
  const done = records.filter((r) => r.status === "Completed").length;
  el("p", done + " completed · " + (records.length - done) + (records.length - done === 1 ? " draft" : " drafts"), s);
  btn("Create report", () => edit(), s, "primary");
  el("p", "Administrative test build. Use fictitious information. Storage on this device is not encrypted.", s).className = "lede";
  const f = section("Charge worksheet", "These formulas run inside each report as soon as a grain weight is entered.");
  const ul = el("ul", null, f);
  ul.className = "formulas";
  Charge.FORMULA_LINES.forEach((line) => el("li", line, ul));
  const recent = records.slice().reverse().slice(0, 4);
  if (recent.length) {
    const box = section("Recent");
    recent.forEach((r) => {
      const row = el("div", null, box);
      row.className = "record";
      el("strong", (r.type === "Operational" ? "Incident " : "Shot ") + (r.number || "Unassigned") + " · " + r.status, row);
      el("p", [r.date || "No date", r.location, r.resultPsi ? r.resultPsi + " PSI" : ""].filter(Boolean).join(" · "), row);
      btn(r.status === "Completed" ? "View" : "Open", () => openReport(r), row, "ghost");
    });
  }
  mark("home");
}

function mark(name) {
  document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("active", b.dataset.view === name && name !== "edit"));
}

function openReport(r) {
  if (r.status === "Completed") printReport(r);
  else edit(r);
}

function edit(existing) {
  if (existing && existing.status === "Completed") { printReport(existing); return; }
  current = existing ? clone(existing) : emptyReport(nextNumber());
  if (!existing) { records.push(current); persist(); }
  view.replaceChildren();
  mark("edit");
  const idn = section("Report");
  labeled("Report type", idn);
  selectInput(idn.lastChild, current.type, ["Training", "Operational"], (v) => { current.type = v; autoSave(); edit(current); }, false);
  if (current.type === "Operational") {
    labeled("Operation type", idn, "Warrant service, barricade, hostage rescue, or other.");
    textInput(idn.lastChild, current.operationType, (v) => { current.operationType = v; autoSave(); }, { area: true });
  }
  labeled(numberHeading(current), idn);
  textInput(idn.lastChild, current.number, (v) => { current.number = v; autoSave(); });
  const when = el("div", null, idn);
  when.className = "grid-2";
  labeled("Date", when);
  textInput(when.lastChild, current.date, (v) => { current.date = v; autoSave(); }, { type: "date" });
  labeled("Time", when);
  textInput(when.lastChild, current.time, (v) => { current.time = v; autoSave(); }, { type: "time" });
  labeled("Location", idn);
  textInput(idn.lastChild, current.location, (v) => { current.location = v; autoSave(); }, { id: "location" });

  const cond = section("Conditions");
  const cg = el("div", null, cond);
  cg.className = "grid-2";
  labeled("Weather", cg);
  selectInput(cg.lastChild, current.weather, ["Dry", "Rainy"], (v) => { current.weather = v; autoSave(); }, true);
  labeled("Humidity", cg);
  selectInput(cg.lastChild, current.humidity, ["Low", "Medium", "High"], (v) => { current.humidity = v; autoSave(); }, true);
  labeled("Temperature (°F)", cond);
  textInput(cond.lastChild, current.temperature, (v) => { current.temperature = v; autoSave(); }, { mode: "decimal" });

  const people = section("Personnel");
  labeled("Primary breacher", people);
  textInput(people.lastChild, current.primary, (v) => { current.primary = v; autoSave(); }, { list: "crew-names", id: "primary" });
  labeled("Assistant breacher", people);
  textInput(people.lastChild, current.assistant, (v) => { current.assistant = v; autoSave(); }, { list: "crew-names" });
  const dl = el("datalist", null, people);
  dl.id = "crew-names";
  crew.forEach((n) => { const o = el("option", null, dl); o.value = n; });

  const target = section("Target and charge");
  labeled("Target description", target, "Door type, construction, residence type.");
  textInput(target.lastChild, current.targetDescription, (v) => { current.targetDescription = v; autoSave(); }, { area: true });
  const tg = el("div", null, target);
  tg.className = "grid-2";
  labeled("Charge type", tg);
  selectInput(tg.lastChild, current.chargeType, ["Pushing", "Blasting", "Cutting"], (v) => { current.chargeType = v; autoSave(); }, true);
  labeled("Charge name", tg);
  textInput(tg.lastChild, current.chargeName, (v) => { current.chargeName = v; autoSave(); });
  labeled("Method of adhesion", target);
  textInput(target.lastChild, current.adhesionMethod, (v) => { current.adhesionMethod = v; autoSave(); });
  labeled("Priming method", target);
  selectInput(target.lastChild, current.primingMethod, ["Single", "Double"], (v) => { current.primingMethod = v; autoSave(); }, true);

  const sheet = section("Charge worksheet", "Runs the shot-sheet formulas on this device. Administrative test aid only — not an approved safety determination. Amount is a note and is not multiplied. Room size is in feet.");
  const formulas = el("ul", null, sheet);
  formulas.className = "formulas";
  Charge.FORMULA_LINES.forEach((line) => el("li", line, formulas));
  const linesHost = el("div", null, sheet);
  const factors = el("div", null, sheet);
  factors.className = "grid-2";
  labeled("R.E. factor", factors, "Sheet default 1.66");
  textInput(factors.lastChild, current.reFactor, (v) => { current.reFactor = v; autoSave(); renderWork(results, current); }, { mode: "decimal", id: "re" });
  labeled("K factor", factors, "Sheet default 18");
  textInput(factors.lastChild, current.kFactor, (v) => { current.kFactor = v; autoSave(); renderWork(results, current); }, { mode: "decimal", id: "k" });
  const dims = el("div", null, sheet);
  dims.className = "grid-3";
  [["roomLength", "Length (ft)", "length"], ["roomWidth", "Width (ft)", "width"], ["roomHeight", "Height (ft)", "height"]].forEach((spec) => {
    labeled(spec[1], dims);
    textInput(dims.lastChild, current[spec[0]], (v) => { current[spec[0]] = v; autoSave(); renderWork(results, current); }, { mode: "decimal", id: spec[2] });
  });
  const results = el("div", null, sheet);
  function drawLines() {
    linesHost.replaceChildren();
    current.explosives.forEach((line, index) => {
      const card = el("div", null, linesHost);
      card.className = "card";
      const head = el("div", null, card);
      head.className = "row";
      el("strong", "Explosive " + (index + 1), head);
      btn(current.explosives.length === 1 ? "Clear" : "Remove", () => {
        current.explosives = current.explosives.filter((item) => item !== line);
        if (!current.explosives.length) current.explosives = [blankLine()];
        autoSave();
        drawLines();
        renderWork(results, current);
      }, head, "ghost");
      labeled("Type", card);
      textInput(card.lastChild, line.type, (v) => { line.type = v; autoSave(); }, { placeholder: "Detasheet, C-4, det cord" });
      const pair = el("div", null, card);
      pair.className = "grid-2";
      labeled("Amount", pair);
      textInput(pair.lastChild, line.amount, (v) => { line.amount = v; autoSave(); }, { placeholder: "2 strips" });
      labeled("Grains", pair);
      const grains = textInput(pair.lastChild, line.grains, (v) => {
        line.grains = v;
        const err = grainError(v);
        grains.setAttribute("aria-invalid", err ? "true" : "false");
        let msg = card.querySelector(".err");
        if (err) { if (!msg) msg = el("p", err, card); msg.className = "err"; msg.textContent = err; }
        else if (msg) msg.remove();
        autoSave();
        renderWork(results, current);
      }, { mode: "decimal", placeholder: "0" });
      if (index === 0) grains.id = "grains";
    });
    btn("Add explosive", () => {
      if (current.explosives.length >= 12) { note("Maximum 12 explosive lines."); return; }
      current.explosives.push(blankLine());
      autoSave();
      drawLines();
    }, linesHost, "ghost").style.marginTop = "10px";
  }
  drawLines();
  renderWork(results, current);

  const outcomes = section("Results");
  OUTCOMES.forEach((o) => {
    labeled(o[2], outcomes);
    selectInput(outcomes.lastChild, current[o[0]], ["Yes", "No"], (v) => { current[o[0]] = v; autoSave(); edit(current); }, true);
    if (current[o[0]] === o[3]) {
      labeled(o[2] + " — comments", outcomes);
      textInput(outcomes.lastChild, current[o[1]], (v) => { current[o[1]] = v; autoSave(); }, { area: true });
    }
  });
  const mediaFlags = el("div", null, outcomes);
  mediaFlags.className = "grid-2";
  labeled("Photographs taken", mediaFlags);
  selectInput(mediaFlags.lastChild, current.photos, ["Not recorded", "Yes", "No"], (v) => { current.photos = v || "Not recorded"; autoSave(); }, false);
  labeled("Video taken", mediaFlags);
  selectInput(mediaFlags.lastChild, current.video, ["Not recorded", "Yes", "No"], (v) => { current.video = v || "Not recorded"; autoSave(); }, false);
  labeled("Additional calculation notes", outcomes);
  textInput(outcomes.lastChild, current.documentedResults, (v) => { current.documentedResults = v; autoSave(); }, { area: true });
  labeled("Administrative comments", outcomes);
  textInput(outcomes.lastChild, current.comments, (v) => { current.comments = v; autoSave(); }, { area: true });

  const photos = section("Photographs and records");
  photoEditor(photos);
  attachmentEditor(photos);

  const finish = section("Finish");
  const actions = el("div", null, finish);
  actions.className = "actions";
  btn("Check fields", () => {
    const gaps = missing(current);
    const work = Charge.buildWork(current);
    note(gaps.length ? "Still needed: " + gaps.join(", ") + "." : "Required fields are present. " + (work.figures ? Charge.statusCopy(work.figures.status) : "No grain weight entered."));
  }, actions, "ghost");
  btn("Save draft", () => { autoSave(); note(current ? "Draft saved on this device." : ""); }, actions, "gold");
  btn("Preview", () => printReport(current), actions, "ghost");
  btn("Lock report", () => {
    const gaps = missing(current);
    if (gaps.length) { note("Still needed: " + gaps.join(", ") + "."); return; }
    const work = Charge.buildWork(current);
    const extra = work.figures ? Charge.statusCopy(work.figures.status) : "No grain weight is entered.";
    if (!confirm("Lock this report? It stays on this device and can still be printed or exported. " + extra)) return;
    current.status = "Completed";
    records = records.filter((r) => r.id !== current.id).concat([current]);
    persist();
    note("Report locked on this device.");
    printReport(current);
  }, actions, "primary");
}

function grainError(raw) {
  const t = String(raw || "").trim();
  if (!t) return "";
  const n = Charge.parseNum(t);
  if (n == null) return "Enter a number.";
  if (n <= 0) return "Grain weight must be greater than zero.";
  return "";
}
function missing(r) {
  const items = [];
  if (!String(r.number || "").trim()) items.push(numberHeading(r).toLowerCase());
  if (!String(r.date || "").trim()) items.push("date");
  if (!String(r.location || "").trim()) items.push("location");
  if (!String(r.primary || "").trim()) items.push("primary breacher");
  return items;
}

async function compress(file) {
  const url = URL.createObjectURL(file);
  try {
    const draw = (source, width, height) => {
      const scale = Math.min(1, 1200 / Math.max(width, height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(width * scale));
      c.height = Math.max(1, Math.round(height * scale));
      const ctx = c.getContext("2d");
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(source, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", 0.65);
    };
    try {
      const im = new Image();
      im.src = url;
      await im.decode();
      return draw(im, im.width, im.height);
    } catch (err) {
      if (typeof createImageBitmap !== "function") throw err;
      const bitmap = await createImageBitmap(file);
      try { return draw(bitmap, bitmap.width, bitmap.height); }
      finally { if (bitmap.close) bitmap.close(); }
    }
  } finally { URL.revokeObjectURL(url); }
}
function enlarge(src, title) {
  const d = el("dialog", null, document.body);
  el("p", title, d);
  const bar = el("div", null, d);
  bar.className = "actions";
  const scroll = el("div", null, d);
  scroll.style.cssText = "overflow:auto;max-height:65vh;background:#fbf8f1";
  const img = el("img", null, scroll);
  img.src = src;
  img.alt = title;
  img.style.width = "100%";
  let zoom = 1;
  btn("Zoom out", () => { zoom = Math.max(1, zoom - 0.5); img.style.width = (zoom * 100) + "%"; }, bar, "ghost");
  btn("Zoom in", () => { zoom = Math.min(4, zoom + 0.5); img.style.width = (zoom * 100) + "%"; }, bar, "ghost");
  btn("Close", () => d.close(), bar, "primary");
  d.onclose = () => d.remove();
  d.showModal();
}
function photoEditor(s) {
  const r = current;
  r.images = r.images || [];
  el("h3", "Photograph attachments", s);
  el("p", "Photos appear on separate pages at the end of the printable report. Images are compressed and stored with this report.", s).className = "lede";
  const controls = el("div", null, s);
  controls.className = "photo-controls";
  const count = el("p", "", s);
  count.className = "photo-count";
  const status = el("p", "", s);
  status.className = "photo-status";
  status.setAttribute("role", "status");
  const list = el("div", null, s);
  const pickers = [];
  let busy = false;
  function refresh() {
    count.textContent = r.images.length + " / 12 photographs attached";
    pickers.forEach(p => { p.disabled = busy || r.images.length >= 12; });
  }
  function draw() {
    list.replaceChildren();
    r.images.forEach((img, i) => {
      const box = el("div", null, list);
      box.className = "card photo-card";
      el("strong", "Photograph " + (i + 1), box);
      const preview = btn("", () => enlarge(img.data, "Photo " + (i + 1)), box, "photo-preview");
      preview.setAttribute("aria-label", "Enlarge photograph " + (i + 1));
      const pic = el("img", null, preview);
      pic.className = "preview";
      pic.src = img.data;
      pic.alt = "Photo " + (i + 1);
      textInput(labeled("Caption", box), img.caption, v => { img.caption = v; autoSave(); }, { area: true, placeholder: "Describe this photograph" });
      const bar = el("div", null, box);
      bar.className = "actions photo-actions";
      btn("Enlarge", () => enlarge(img.data, "Photo " + (i + 1)), bar, "ghost");
      const up = btn("Move up", () => { if (i === 0) return; [r.images[i-1], r.images[i]] = [r.images[i], r.images[i-1]]; autoSave(); draw(); }, bar, "ghost");
      up.disabled = i === 0;
      const down = btn("Move down", () => { if (i === r.images.length-1) return; [r.images[i+1], r.images[i]] = [r.images[i], r.images[i+1]]; autoSave(); draw(); }, bar, "ghost");
      down.disabled = i === r.images.length-1;
      btn("Remove", () => { if (!confirm("Remove this photograph?")) return; r.images.splice(i, 1); autoSave(); draw(); }, bar, "danger");
    });
    refresh();
  }
  [["Take photo", true], ["Photo library", false]].forEach(([title, camera]) => {
    const input = el("input", null, controls);
    input.type = "file";
    input.accept = "image/*";
    input.hidden = true;
    input.className = "photo-picker";
    if (camera) input.setAttribute("capture", "environment");
    else input.multiple = true;
    const button = btn(title, () => input.click(), controls, "primary");
    pickers.push(button);
    input.onchange = async () => {
      const picked = Array.from(input.files || []);
      input.value = "";
      if (!picked.length || busy) return;
      busy = true;
      refresh();
      let attached = 0, failed = 0, skipped = 0;
      try {
        for (let i = 0; i < picked.length; i++) {
          if (current !== r || r.status === "Completed") break;
          if (r.images.length >= 12) { skipped = picked.length - i; break; }
          status.textContent = "Processing photograph " + (i + 1) + " of " + picked.length + "…";
          try {
            const data = await compress(picked[i]);
            if (current !== r || r.status === "Completed") break;
            if (!DATA_IMG.test(data)) throw new Error("Invalid image");
            r.images.push({data, caption: ""});
            autoSave();
            attached++;
          } catch (err) { failed++; }
        }
      } finally {
        busy = false;
        draw();
        status.textContent = attached + " attached." + (failed ? " " + failed + " could not be read. Try JPEG or PNG." : "") + (skipped ? " " + skipped + " skipped (12-photo limit)." : "");
      }
    };
  });
  draw();
}
function attachmentEditor(s) {
  const r = current;
  r.attachments = r.attachments || [];
  el("h3", "Supporting records", s);
  el("p", "Attach JPEG or PNG images for this report. They are stored with the report and included after the photographs. They are not used in the calculation.", s).className = "lede";
  const list = el("div", null, s);
  function draw() {
    list.replaceChildren();
    r.attachments.forEach((a, i) => {
      const box = el("div", null, list);
      box.className = "card";
      el("strong", a.name || "Supporting image " + (i + 1), box);
      const pic = el("img", null, box);
      pic.className = "preview";
      pic.src = a.data;
      pic.alt = a.name || "Supporting image";
      pic.onclick = () => enlarge(a.data, a.name || "Supporting image");
      btn("Remove", () => { r.attachments.splice(i, 1); autoSave(); draw(); }, box, "danger");
    });
  }
  const label = el("label", "Choose supporting record images (JPEG or PNG)", s);
  label.className = "filebtn";
  const input = el("input", null, label);
  input.type = "file";
  input.accept = "image/jpeg,image/png,image/*";
  input.multiple = true;
  input.onchange = async () => {
    const picked = Array.from(input.files || []);
    input.disabled = true;
    let attached = 0;
    try {
      for (const file of picked) {
        if (r.attachments.length >= 12) { note("Maximum 12 supporting images per report."); break; }
        try {
          const data = await compress(file);
          if (current !== r) return;
          r.attachments.push({ name: file.name || "Supporting image", data: data });
          autoSave();
          draw();
          attached += 1;
        } catch (err) {
          note("Could not attach that image. Try a JPEG or PNG.");
        }
      }
      if (attached) note(attached === 1 ? "Supporting image attached." : attached + " supporting images attached.");
    } finally {
      input.value = "";
      input.disabled = false;
    }
  };
  draw();
}function library() {
  view.replaceChildren();
  mark("library");
  const s = section("Report library");
  const q = textInput(s, "", () => draw(), { placeholder: "Search reports" });
  const filters = {};
  const grid = el("div", null, s);
  grid.className = "grid-2";
  [["date", "Date", "date"], ["number", "Report number", "text"], ["location", "Location", "text"], ["person", "Personnel", "text"]].forEach((spec) => {
    labeled(spec[1], grid);
    filters[spec[0]] = textInput(grid.lastChild, "", () => draw(), { type: spec[2] });
  });
  const list = el("div", null, s);
  function hay(r) {
    return [r.type, r.number, r.date, r.location, r.primary, r.assistant, r.chargeName, r.resultPsi, r.resultMsd, r.comments].concat((r.explosives || []).flatMap((e) => [e.type, e.amount, e.grains])).join(" ").toLowerCase();
  }
  function draw() {
    list.replaceChildren();
    const shown = records.slice().reverse().filter((r) => {
      if (q.value && !hay(r).includes(q.value.toLowerCase())) return false;
      if (filters.date.value && !(r.date || "").includes(filters.date.value)) return false;
      if (filters.number.value && !(r.number || "").toLowerCase().includes(filters.number.value.toLowerCase())) return false;
      if (filters.location.value && !(r.location || "").toLowerCase().includes(filters.location.value.toLowerCase())) return false;
      if (filters.person.value && !((r.primary || "") + " " + (r.assistant || "")).toLowerCase().includes(filters.person.value.toLowerCase())) return false;
      return true;
    });
    shown.forEach((r) => {
      const row = el("div", null, list);
      row.className = "record";
      el("strong", (r.type === "Operational" ? "Incident " : "Shot ") + (r.number || "Unassigned") + " · " + r.status, row);
      el("p", [r.date || "No date", r.location, r.resultMsd ? "MSD " + r.resultMsd + " ft" : "", r.resultPsi ? r.resultPsi + " PSI" : "", (r.images || []).length ? r.images.length + " photo" + (r.images.length === 1 ? "" : "s") : ""].filter(Boolean).join(" · "), row);
      const bar = el("div", null, row);
      bar.className = "actions";
      btn(r.status === "Completed" ? "View locked report" : "Open", () => openReport(r), bar, "primary");
      btn("Print view", () => printReport(r), bar, "ghost");
      btn("Duplicate", () => duplicate(r), bar, "ghost");
      if (r.status !== "Completed") btn("Delete", () => { if (confirm("Delete this draft from this device?")) { records = records.filter((x) => x.id !== r.id); persist(); draw(); } }, bar, "danger");
    });
    if (!shown.length) el("p", "No matching reports.", list).className = "lede";
  }
  draw();
}
function duplicate(r) {
  const n = clone(r);
  n.id = uid();
  n.number = nextNumber();
  n.date = localDate();
  n.status = "Draft";
  n.images = [];
  n.attachments = [];
  n.comments = "";
  n.documentedResults = "";
  OUTCOMES.forEach((o) => { n[o[0]] = ""; n[o[1]] = ""; });
  n.photos = "Not recorded";
  n.video = "Not recorded";
  applyFigures(n);
  records.push(n);
  persist();
  note("Duplicate kept the charge worksheet and cleared outcomes, notes, and photos.");
  edit(n);
}

function personnel() {
  view.replaceChildren();
  mark("crew");
  const s = section("Personnel roster", "Names offered while you fill in the primary and assistant breacher.");
  const row = el("div", null, s);
  row.className = "actions";
  const input = textInput(row, "", () => {}, { placeholder: "Name" });
  input.style.flex = "1";
  btn("Add person", () => {
    const n = input.value.trim();
    if (!n || crew.includes(n)) { note(n ? "That name is already on the roster." : "Enter a name."); return; }
    crew.push(n);
    persist();
    note("");
    personnel();
  }, row, "primary");
  crew.forEach((name) => {
    const p = el("div", null, s);
    p.className = "record row";
    el("strong", name, p);
    const bar = el("div", null, p);
    bar.className = "actions";
    btn("Edit", () => {
      const v = prompt("Edit roster name", name);
      if (v && v.trim() && !crew.includes(v.trim())) { crew = crew.map((x) => x === name ? v.trim() : x); persist(); personnel(); }
    }, bar, "ghost");
    btn("Remove", () => { crew = crew.filter((x) => x !== name); persist(); personnel(); }, bar, "danger");
  });
  if (!crew.length) el("p", "No names yet.", s).className = "lede";
}

function backup() {
  view.replaceChildren();
  mark("backup");
  const s = section("Backup and recovery", "Backups contain unencrypted reports, personnel, and photos. Restore replaces every report currently on this device.");
  btn("Export backup", () => {
    const blob = new Blob([JSON.stringify({ version: 5, records: records, crew: crew, sequence: sequence })], { type: "application/json" });
    const a = el("a");
    a.href = URL.createObjectURL(blob);
    a.download = "shot-sheet-backup-" + localDate() + ".json";
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }, s, "primary");
  labeled("Restore backup file", s);
  const input = el("input", null, s.lastChild);
  input.type = "file";
  input.accept = ".json,application/json";
  input.onchange = async () => {
    const picked = input.files && input.files[0];
    input.value = "";
    if (!picked) return;
    try {
      const data = JSON.parse(await picked.text());
      if (!Array.isArray(data.records) || !Array.isArray(data.crew)) throw new Error("invalid");
      const next = data.records.map(normalize);
      if (next.some((r) => !r)) throw new Error("invalid");
      const ids = new Set();
      next.forEach((r) => { if (ids.has(r.id)) throw new Error("invalid"); ids.add(r.id); });
      if (!confirm("Replace all reports on this device with " + picked.name + "?")) return;
      records = next;
      crew = data.crew.map((n) => String(n).trim()).filter(Boolean);
      sequence = Math.max(sequence, Number(data.sequence) || 0);
      current = null;
      persist();
      note("Backup restored on this device.");
      home();
    } catch (e) { note("That backup could not be read. Existing reports were not changed."); }
  };
}

function printReport(r) {
  const p = $("print");
  p.replaceChildren();
  const tools = el("div", null, p);
  tools.className = "actions no-print";
  btn("Back", () => { document.body.classList.remove("previewing"); p.replaceChildren(); if (r.status === "Completed") library(); else edit(r); }, tools, "ghost");
  btn("Print", () => window.print(), tools, "gold");
  const pdfBtn = btn("Generate PDF", async () => {
    pdfBtn.disabled = true;
    pdfBtn.textContent = "Generating…";
    try {
      const blob = await makeReportPDF(r);
      const name = "shot-sheet-" + String(r.number || "report").replace(/[^a-zA-Z0-9_-]/g, "_") + ".pdf";
      const file = new File([blob], name, { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const panel = el("div", null, tools);
      panel.className = "card";
      el("p", "PDF ready.", panel);
      if (navigator.canShare && navigator.canShare({ files: [file] })) btn("Share PDF", () => navigator.share({ files: [file] }).catch(() => {}), panel, "gold");
      const a = el("a", "Download PDF", panel);
      a.href = url;
      a.download = name;
      a.className = "filebtn";
      a.style.marginTop = "8px";
    } catch (e) { alert("PDF generation failed. Check the photographs and try again."); }
    finally { pdfBtn.disabled = false; pdfBtn.textContent = "Generate PDF"; }
  }, tools, "primary");
  btn("Duplicate", () => { document.body.classList.remove("previewing"); duplicate(r); }, tools, "ghost");
  el("h2", "Pennsylvania State Police breacher’s report", p);
  if (r.status === "Completed") el("p", "Locked report", p);
  identityPairs(r).forEach((pair) => block(p, pair[0], pair[1]));
  el("h2", "Charge worksheet", p);
  const used = (r.explosives || []).filter((line) => line.type || line.amount || line.grains);
  if (!used.length) el("p", "No explosive lines recorded.", p);
  used.forEach((line) => el("p", (line.type || "Explosive") + (line.amount ? " · " + line.amount : "") + " — " + (line.grains || "—") + " gr", p));
  const host = el("div", null, p);
  renderWork(host, r);
  el("h2", "Results", p);
  outcomeFields(r).forEach((pair) => block(p, pair[0], pair[1]));
  el("p", "Worksheet formulas only. Not an approved safety determination.", p).className = "muted";
  if (!(r.images || []).length) el("p", "No photographs attached.", p);
  (r.images || []).forEach((img, i) => {
    const page = el("div", null, p);
    page.className = "photo-page";
    el("h2", "Photograph " + (i + 1) + " — " + (r.number || "Unassigned"), page);
    const pic = el("img", null, page);
    pic.src = img.data;
    el("p", img.caption || "No caption", page);
  });
  (r.attachments || []).forEach((a) => {
    const page = el("div", null, p);
    page.className = "photo-page";
    el("h2", "Supporting document: " + a.name, page);
    const pic = el("img", null, page);
    pic.src = a.data;
  });
  document.body.classList.add("previewing");
  window.scrollTo(0, 0);
}
function block(parent, label, value) {
  const d = el("div", null, parent);
  d.className = "block";
  el("b", label, d);
  el("div", value || "—", d);
}

document.querySelectorAll("nav button").forEach((b) => {
  b.onclick = () => {
    note("");
    document.body.classList.remove("previewing");
    $("print").replaceChildren();
    if (b.dataset.view === "edit") edit();
    else ({ home: home, library: library, crew: personnel, backup: backup })[b.dataset.view]();
  };
});

async function initialize() {
  try {
    const saved = JSON.parse(localStorage.getItem("dss-test-v1") || "null");
    if (saved && Array.isArray(saved.records)) {
      records = saved.records.map(normalize).filter(Boolean);
      crew = Array.isArray(saved.crew) ? saved.crew.filter((n) => typeof n === "string") : [];
      sequence = Number(saved.sequence) || 0;
    }
  } catch (e) {}
  try {
    db = await new Promise((resolve, reject) => {
      const q = indexedDB.open("dss-v04", 1);
      q.onupgradeneeded = () => { if (!q.result.objectStoreNames.contains("state")) q.result.createObjectStore("state"); };
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    });
    const stored = await new Promise((resolve, reject) => {
      const q = db.transaction("state").objectStore("state").get("main");
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    });
    if (stored && Array.isArray(stored.records)) {
      records = stored.records.map(normalize).filter(Boolean);
      crew = Array.isArray(stored.crew) ? stored.crew.filter((n) => typeof n === "string") : [];
      sequence = Number(stored.sequence) || 0;
    } else persist();
  } catch (e) {
    db = null;
  }
  home();
}
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("./sw.js").catch(() => {});
initialize();
