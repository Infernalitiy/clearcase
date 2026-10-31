/* CareBridge frontend. Plain JavaScript, no build step.
 * The document lives only in this page's memory. Settings live in localStorage. */
"use strict";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const SETTINGS_KEY = "carebridge.settings";
const NOT_IN_DOC = "This document doesn't say. Ask your insurer or provider.";
const DOC_TYPE_NAMES = {
  bill: "a medical bill",
  insurance_denial: "an insurance denial letter",
  discharge: "discharge instructions from a hospital",
  other: "a document",
};
const NEED_NAMES = {
  blind_low_vision: "blind or low vision",
  deaf_hoh: "Deaf or hard of hearing",
  cognitive_learning: "cognitive or learning disability",
  fatigue_motor: "low energy or limited movement",
};

// ---------------- State ----------------
const state = {
  settings: loadSettings(),
  doc: null,
  cards: [],        // [{id, heading, fact?, segments: [text], ...}]
  segments: [],     // flat list: [{card, text}]
  page: 0,          // current card in one-at-a-time mode
  done: new Set(),  // checked-off next steps
};

const reader = {
  pos: 0,           // index into state.segments: the sentence being read
  playing: false,
  token: 0,         // bumps on every stop so stale onend callbacks are ignored
  current: null,    // keep a reference so Chrome does not garbage-collect the utterance
  wasPlaying: false,
};

// ---------------- Bridgey, the helper character ----------------
// Purely decorative (aria-hidden). States: idle, speaking, paused, listening, thinking, happy.
const MASCOT_SVG = `<svg viewBox="0 0 120 120" focusable="false">
  <g class="m-body">
    <path d="M58 17 C54 6 68 3 66 12" fill="none" stroke="#2b2b2b" stroke-width="3" stroke-linecap="round"/>
    <circle cx="60" cy="62" r="45" fill="#ffffff" stroke="#2b2b2b" stroke-width="3"/>
    <g transform="rotate(-28 41 33)">
      <rect x="28" y="27" width="27" height="11" rx="5.5" fill="#f7c59f" stroke="#2b2b2b" stroke-width="2"/>
      <rect x="37.5" y="28" width="8" height="9" fill="#fbe2cc"/>
    </g>
    <g class="m-eyes">
      <ellipse cx="44" cy="60" rx="7" ry="9" fill="#2b2b2b"/><ellipse cx="76" cy="60" rx="7" ry="9" fill="#2b2b2b"/>
      <circle cx="46.5" cy="56" r="2.6" fill="#fff"/><circle cx="78.5" cy="56" r="2.6" fill="#fff"/>
    </g>
    <ellipse class="m-cheek" cx="31" cy="76" rx="7" ry="4.5"/><ellipse class="m-cheek" cx="89" cy="76" rx="7" ry="4.5"/>
    <path class="m-closed" d="M53 80 Q60 86 67 80" fill="none" stroke="#2b2b2b" stroke-width="3" stroke-linecap="round"/>
    <ellipse class="m-open" cx="60" cy="83" rx="6.5" ry="6" fill="#8a3b3b" stroke="#2b2b2b" stroke-width="2"/>
    <path class="m-smile" d="M49 78 Q60 95 71 78 Z" fill="#8a3b3b" stroke="#2b2b2b" stroke-width="2" stroke-linejoin="round"/>
  </g>
  <g class="m-think" fill="#2b2b2b"><circle cx="100" cy="24" r="4"/><circle cx="110" cy="14" r="3"/></g>
  <g class="m-pause" fill="#2b2b2b"><rect x="98" y="8" width="5" height="15" rx="1.5"/><rect x="107" y="8" width="5" height="15" rx="1.5"/></g>
  <g class="m-listen" fill="none" stroke="#2b2b2b" stroke-width="3" stroke-linecap="round"><path d="M108 52 q5 10 0 20"/><path d="M113 46 q7 16 0 32"/></g>
</svg>`;
$$(".mascot").forEach((m) => { m.innerHTML = MASCOT_SVG; });

const mascot = {
  state: "idle", flap: null, happyTimer: null,
  set(next) {
    mascot.state = next;
    clearInterval(mascot.flap);
    mascot.flap = null;
    $$(".mascot").forEach((m) => { m.dataset.state = next; m.classList.remove("mouth-open"); });
    if (next === "speaking") {
      // The mouth opens and closes while talking. This is an expression change, so it stays on with reduced motion.
      mascot.flap = setInterval(() => $$(".mascot").forEach((m) => m.classList.toggle("mouth-open")), 150);
    } else {
      mascot.caption("");
    }
  },
  happy() {
    mascot.set("happy");
    clearTimeout(mascot.happyTimer);
    mascot.happyTimer = setTimeout(() => { if (mascot.state === "happy") mascot.set("idle"); }, 1500);
  },
  // The speech bubble works as captions for what is being read aloud.
  caption(text) {
    const b = $("#mascot-bubble");
    b.textContent = text || "";
    b.hidden = !text;
  },
};

// ---------------- Settings ----------------
function loadSettings() {
  const defaults = { needs: [], textSize: "normal", contrast: false, dyslexia: false, autoRead: false, caregiver: false, rate: "1", voice: "female", showMascot: true, saved: false };
  try {
    const s = Object.assign(defaults, JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"));
    if (s.voice === "natural") s.voice = "eleven:mommy";
    if (!["female", "male"].includes(s.voice) && !/^eleven:/.test(s.voice)) s.voice = s.voice === "calm" ? "male" : "female"; // older saved styles
    return s;
  } catch (e) {
    return defaults;
  }
}

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); } catch (e) { /* private mode */ }
}

const has = (need) => state.settings.needs.includes(need);
const audioOn = () => !has("deaf_hoh") || has("blind_low_vision");
const oneAtATime = () => has("cognitive_learning");
const simpleWords = () => has("cognitive_learning");

function applySettings() {
  const s = state.settings;
  const root = document.documentElement;
  root.dataset.textSize = s.textSize;
  root.classList.toggle("high-contrast", s.contrast);
  root.classList.toggle("dyslexia", s.dyslexia);
  root.classList.toggle("big-targets", has("fatigue_motor") || has("blind_low_vision"));
  root.classList.toggle("no-mascot", !s.showMascot);
  root.dataset.voice = s.voice;
  $("#profile-summary-text").textContent = s.needs.length
    ? s.needs.map((n) => NEED_NAMES[n]).join(", ")
    : "no needs chosen yet";
}

function fillSettingsForm() {
  const f = $("#settings-form");
  const s = state.settings;
  $$("#settings-form input[name=needs]").forEach((cb) => { cb.checked = s.needs.includes(cb.value); });
  $$("#settings-form input[name=textSize]").forEach((r) => { r.checked = r.value === s.textSize; });
  f.contrast.checked = s.contrast;
  f.dyslexia.checked = s.dyslexia;
  f.autoRead.checked = s.autoRead;
  f.caregiver.checked = s.caregiver;
  f.rate.value = s.rate;
  f.voice.value = s.voice;
  f.showMascot.checked = s.showMascot;
  updateAudioSettings();
}

$("#settings-form").addEventListener("change", (e) => {
  // When someone first says they are blind or low vision, suggest helpful defaults.
  if (e.target.name === "needs" && e.target.value === "blind_low_vision" && e.target.checked) {
    const f = $("#settings-form");
    f.contrast.checked = true;
    f.autoRead.checked = true;
    $$("#settings-form input[name=textSize]").forEach((r) => { r.checked = r.value === "large"; });
  }
});

// Audio settings only make sense when audio is on (same rule as audioOn()).
function updateAudioSettings() {
  const checked = (v) => $(`#settings-form input[name=needs][value=${v}]`).checked;
  $("#audio-settings").hidden = checked("deaf_hoh") && !checked("blind_low_vision");
}
$("#settings-form").addEventListener("change", updateAudioSettings);

const VOICE_NOTE = "These are your device's built-in voices. For the most natural voices, open CareBridge in Microsoft Edge.";
$("#preview-voice").addEventListener("click", () => {
  const f = $("#settings-form");
  stopAllSpeech();
  if (f.voice.value.startsWith("eleven:") && natural.available) {
    $("#voice-note").textContent = "Using: a natural ElevenLabs voice. The text being read is sent to ElevenLabs to make the audio.";
    natural.play("Hi, I'm here to help you read your papers.", () => true, () => {}, () => {
      $("#voice-note").textContent = "The natural voice isn't working right now. Check the ElevenLabs key and voice ID.";
    }, f.rate.value, f.voice.value.slice(7));
    return;
  }
  if (!("speechSynthesis" in window)) return announce("Read aloud isn't available in this browser.");
  const u = makeUtterance("Hi, I'm here to help you read your papers.", f.voice.value, f.rate.value);
  $("#voice-note").textContent = `Using: ${u.voice ? u.voice.name : "your device's default voice"}. ` + VOICE_NOTE;
  speechSynthesis.speak(u);
});

$("#settings-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  state.settings = {
    needs: $$("#settings-form input[name=needs]:checked").map((cb) => cb.value),
    textSize: (f.querySelector("input[name=textSize]:checked") || {}).value || "normal",
    contrast: f.contrast.checked,
    dyslexia: f.dyslexia.checked,
    autoRead: f.autoRead.checked,
    caregiver: f.caregiver.checked,
    rate: f.rate.value,
    voice: f.voice.value,
    showMascot: f.showMascot.checked,
    saved: true,
  };
  saveSettings();
  applySettings();
  announce("Settings saved.");
  if (state.doc) showResult(state.doc, { keepPosition: true });
  else showScreen("home");
});

// ---------------- Screens & announcements ----------------
function showScreen(name) {
  $$(".screen").forEach((s) => { s.hidden = s.id !== `screen-${name}`; });
  $("#ask-fab").hidden = name !== "result";
  const heading = $(`#screen-${name} h1`);
  if (heading) heading.focus();
}

let announceTimer;
function announce(text) {
  const el = $("#announcer");
  el.textContent = "";
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => { el.textContent = text; }, 60);
}

$("#open-settings").addEventListener("click", () => { reader.stop(); fillSettingsForm(); showScreen("settings"); });
$("#change-profile").addEventListener("click", () => { fillSettingsForm(); showScreen("settings"); });
$("#brand-link").addEventListener("click", (e) => { e.preventDefault(); goHome(); });
$("#restart-btn").addEventListener("click", goHome);
$("#print-btn").addEventListener("click", () => { reader.stop(); window.print(); });

// Printed copies show every card and every "Show original" quote.
let openedForPrint = [];
window.addEventListener("beforeprint", () => {
  openedForPrint = $$("details.original:not([open])");
  openedForPrint.forEach((d) => { d.open = true; });
});
window.addEventListener("afterprint", () => { openedForPrint.forEach((d) => { d.open = false; }); });

function goHome() {
  reader.stop();
  mascot.set("idle");
  state.doc = null;
  $("#upload-form").reset();
  showScreen("home");
}

// ---------------- API ----------------
async function api(url, options = {}, timeoutMs = 120000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, Object.assign({ signal: ctrl.signal }, options));
    let data = null;
    try { data = await resp.json(); } catch (e) { /* non-JSON */ }
    if (!resp.ok) {
      const err = new Error((data && data.error) || "Something went wrong. Please try again.");
      err.code = data && data.code;
      throw err;
    }
    return data;
  } catch (e) {
    if (e.name === "AbortError") throw new Error("This is taking too long. Please try again.");
    if (e instanceof TypeError) throw new Error("Can't reach CareBridge. Check your connection and try again.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------- Upload & samples ----------------
$("#upload-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const file = $("#file").files[0];
  const errEl = $("#upload-error");
  errEl.hidden = true;
  if (!file) return showUploadError("Please choose a photo or PDF of your document first.");
  if (!/^(image\/(jpeg|png)|application\/pdf)$/.test(file.type)) return showUploadError("Please choose a JPG, PNG or PDF file.");
  if (file.size > 10 * 1024 * 1024) return showUploadError("That image is too big. Please use one under 10 MB.");
  const body = new FormData();
  body.append("file", file);
  await loadDocument(() => api("/api/analyze", { method: "POST", body }));
});

$$("[data-sample]").forEach((btn) =>
  btn.addEventListener("click", () => loadDocument(() => api(`/api/sample/${btn.dataset.sample}`))));

function showUploadError(msg) {
  showScreen("home");
  const errEl = $("#upload-error");
  errEl.textContent = msg;
  errEl.hidden = false;
  $("#file").focus();
}

async function loadDocument(fetcher) {
  reader.stop();
  mascot.set("thinking");
  showScreen("loading");
  $("#main").setAttribute("aria-busy", "true");
  announce("Reading your document. Please wait.");
  try {
    const doc = await fetcher();
    showResult(doc);
  } catch (e) {
    mascot.set("idle");
    showUploadError(e.message);
  } finally {
    $("#main").removeAttribute("aria-busy");
  }
}

// ---------------- Building cards ----------------
function sentences(text) {
  return String(text || "")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function factText(f) {
  return simpleWords() ? (f.simpleOverride || f.simple_text || f.plain_text) : f.plain_text;
}

function buildCards(doc) {
  const cards = [];
  const intro = `This is ${DOC_TYPE_NAMES[doc.document_type] || "a document"}` +
    (state.settings.caregiver ? " for the person you're helping." : ".");
  const introMore = simpleWords()
    ? "I will go through it one small part at a time."
    : `There are ${doc.facts.length} important parts. You can stop me and ask a question at any time.`;
  cards.push({ id: "intro", heading: doc.title, segments: [intro, introMore], kind: "intro" });

  const steps = { id: "steps", heading: simpleWords() ? "What to do" : "What to do next", kind: "steps",
    items: doc.next_steps, segments: doc.next_steps.slice() };
  const facts = doc.facts.map((f) => ({
    id: f.id, fact: f, heading: f.label, kind: f.kind,
    segments: [f.value ? `${f.label}: ${f.value}.` : `${f.label}.`].concat(sentences(factText(f))),
  }));

  // Low energy: the checklist comes first, so the most useful thing costs the least effort.
  if (has("fatigue_motor") && steps.items.length) cards.push(steps, ...facts);
  else cards.push(...facts, ...(steps.items.length ? [steps] : []));

  if (doc.contacts.length) {
    cards.push({ id: "contacts", heading: "Who to contact", kind: "contacts", contacts: doc.contacts,
      segments: doc.contacts.map((c) => [c.name, c.phone && `phone ${c.phone}`, c.email && `email ${c.email}`]
        .filter(Boolean).join(", ") + ".") });
  }
  return cards;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c != null) node.append(c);
  return node;
}

// Each spoken sentence is a <span data-seg="n"> so we can highlight where we are.
function seg(text, n) { return el("span", { class: "seg", "data-seg": n, text: text + " " }); }

function renderCard(card, idx, segStart) {
  let n = segStart;
  const body = [];
  const headingId = `card-h-${idx}`;
  const h = el("h2", { id: headingId, tabindex: "-1" }, card.fact ? seg(card.fact.label, segStart) : card.heading);

  if (card.kind === "intro") {
    body.push(el("p", {}, card.segments.map((s) => seg(s, n++))));
  } else if (card.fact) {
    const f = card.fact;
    n++; // heading + value share the first segment
    if (f.value) body.push(el("p", { class: "value seg", "data-seg": segStart }, f.value));
    if (f.needs_verification) body.push(el("p", { class: "badge" }, "Check this one carefully"));
    body.push(el("p", { class: "plain" }, card.segments.slice(1).map((s) => seg(s, n++))));
    body.push(renderOriginal(f));
    const actions = el("div", { class: "row card-actions" });
    if (simpleWords()) {
      actions.append(el("button", { type: "button", class: "btn btn-secondary", onclick: () => makeSimpler(card, idx) },
        "Make it even simpler"));
    }
    if (actions.children.length) body.push(actions);
  } else if (card.kind === "steps") {
    const list = el("ul", { class: "checklist" });
    card.items.forEach((item, i) => {
      const key = `${i}`;
      const done = state.done.has(key);
      const btn = el("button", { type: "button", class: "check" + (done ? " done" : ""), "aria-pressed": String(done),
        onclick: () => {
          const now = !state.done.has(key);
          now ? state.done.add(key) : state.done.delete(key);
          btn.classList.toggle("done", now);
          btn.setAttribute("aria-pressed", String(now));
          announce(now ? "Marked done." : "Marked not done.");
        } },
        el("span", { class: "box", "aria-hidden": "true" }), seg(item, n++));
      list.append(el("li", {}, btn));
    });
    body.push(list);
  } else if (card.kind === "contacts") {
    const list = el("ul", { class: "contacts" });
    card.contacts.forEach((c) => {
      const lines = [el("strong", {}, seg(card.segments[n - segStart], n++))];
      const row = el("div", { class: "row" });
      if (c.phone && !has("deaf_hoh")) row.append(el("a", { class: "btn btn-secondary", href: `tel:${c.phone.replace(/[^\d+]/g, "")}` }, `Call ${c.phone}`));
      if (c.phone && has("deaf_hoh")) lines.push(el("p", { class: "hint" }, `Phone ${c.phone}: you can use a relay service (dial 711 in the US), or write instead.`));
      if (c.email) row.append(el("a", { class: "btn btn-secondary", href: `mailto:${c.email}` }, `Email ${c.email}`));
      row.append(el("button", { type: "button", class: "btn btn-secondary", onclick: () => draftMessage(c) },
        "Write a message for me"));
      list.append(el("li", {}, lines, row));
    });
    body.push(list);
  }
  return { node: el("article", { class: `card kind-${card.kind}`, "data-card": idx, "aria-labelledby": headingId }, h, body), next: n };
}

function renderOriginal(f) {
  if (!f.original_text) return null;
  return el("details", { class: "original" },
    el("summary", {}, "Show original"),
    el("blockquote", {}, f.original_text),
    f.needs_verification ? el("p", { class: "verify" }, "Double-check this with a person.") : null);
}

function renderBanners(doc) {
  const box = $("#banners");
  box.replaceChildren();
  if (doc.is_emergency_related) {
    box.append(el("div", { class: "banner emergency", role: "note" },
      el("strong", {}, "If this is an emergency, call 911.")));
  }
  if (doc.confidence === "low") {
    box.append(el("div", { class: "banner warn", role: "note" },
      el("p", {}, "I couldn't read this clearly, please try a clearer photo."),
      el("button", { type: "button", class: "btn btn-secondary", onclick: goHome }, "Try another photo")));
  } else if (doc.confidence === "medium") {
    box.append(el("div", { class: "banner warn", role: "note" },
      el("p", {}, "Some parts were hard to read. Use \"Show original\" and double-check important details.")));
  }
}

function showResult(doc, opts = {}) {
  const keepFact = opts.keepPosition && state.segments[reader.pos] ? state.cards[state.segments[reader.pos].card].id : null;
  reader.stop();
  state.doc = doc;
  if (!opts.keepPosition) state.done.clear();
  state.cards = buildCards(doc);

  // Emergency line is the very first thing read aloud.
  if (doc.is_emergency_related) state.cards[0].segments.unshift("If this is an emergency, call 911.");

  state.segments = [];
  state.cards.forEach((card, ci) => card.segments.forEach((text) => state.segments.push({ card: ci, text })));

  renderBanners(doc);
  $("#doc-title").textContent = doc.title;
  const verifyCount = doc.facts.filter((f) => f.needs_verification).length;
  $("#doc-meta").textContent = `${doc.facts.length} key parts` + (verifyCount ? `, ${verifyCount} to double-check` : "");
  renderCards();

  $("#read-btn").hidden = !audioOn();
  $("#quick-questions").hidden = !has("fatigue_motor");
  if (has("fatigue_motor")) renderQuickQuestions();

  reader.pos = 0;
  state.page = 0;
  if (keepFact) {
    const ci = state.cards.findIndex((c) => c.id === keepFact);
    if (ci >= 0) { state.page = ci; reader.pos = firstSegOf(ci); }
  }
  showScreen("result");
  goToPage(state.page, false);
  updateReadUi();
  announce(`Document ready: ${doc.title}.` + (audioOn() ? " Press Read aloud to listen. Press Q at any time to ask a question." : " Press Q at any time to ask a question."));
  if (!opts.keepPosition) mascot.happy();
  if (audioOn() && state.settings.autoRead && !opts.keepPosition) setTimeout(() => reader.play(), 900);
}

function renderCards() {
  const box = $("#cards");
  box.replaceChildren();
  let n = 0;
  state.cards.forEach((card, idx) => {
    const r = renderCard(card, idx, n);
    n = r.next;
    box.append(r.node);
  });
  box.classList.toggle("one-at-a-time", oneAtATime());
  $("#pager").hidden = !oneAtATime();
}

function renderQuickQuestions() {
  const row = $("#quick-row");
  row.replaceChildren();
  ["What do I need to do?", "What does this mean?", "Say it simpler", "Write a message for me"].forEach((q) =>
    row.append(el("button", { type: "button", class: "btn btn-secondary btn-big", onclick: () => {
      if (q === "Write a message for me") return draftMessage(state.doc.contacts[0] || null);
      openAsk(q);
    } }, q)));
}

// ---------------- One card at a time ----------------
function firstSegOf(ci) { return Math.max(0, state.segments.findIndex((s) => s.card === ci)); }

function goToPage(i, focus = true) {
  i = Math.max(0, Math.min(state.cards.length - 1, i));
  state.page = i;
  if (oneAtATime()) {
    $$("#cards .card").forEach((c) => { c.hidden = Number(c.dataset.card) !== i; });
    $("#pager-pos").textContent = `Card ${i + 1} of ${state.cards.length}`;
    $("#prev-btn").disabled = i === 0;
    $("#next-btn").disabled = i === state.cards.length - 1;
    if (focus) $(`#card-h-${i}`).focus();
  }
}

function userMoveTo(i) {
  const wasPlaying = reader.playing;
  reader.stop();
  goToPage(i);
  reader.pos = firstSegOf(state.page);
  updateReadUi();
  if (wasPlaying) reader.play();
}

$("#prev-btn").addEventListener("click", () => userMoveTo(state.page - 1));
$("#next-btn").addEventListener("click", () => userMoveTo(state.page + 1));

// ---------------- Voice styles ----------------
// Female or male, chosen from the device's own voices. Names are tried in order, most natural first:
// Edge's neural "Online (Natural)" voices, then Google's online voices, then Apple's, then older local voices.
// If the device has no matching voice, the default voice is used with a higher or lower pitch.
const VOICE_STYLES = {
  female: { names: [/(Aria|Jenny|Ava|Emma|Michelle|Libby|Sonia|Natasha|Clara).*Natural/i, /Google US English/i,
    /Google UK English Female/i, /^(Samantha|Karen|Moira|Tessa|Fiona|Victoria|Allison|Susan)\b/i, /Microsoft Zira/i,
    /\bFemale\b/i], fallbackPitch: 1.15 },
  male: { names: [/(Guy|Andrew|Brian|Christopher|Eric|Roger|Davis|Ryan|Thomas|William).*Natural/i, /Google UK English Male/i,
    /^(Daniel|Alex|Aaron|Tom)\b/i, /Microsoft (David|Mark)/i, /\bMale\b/i], fallbackPitch: 0.8 },
};
let onlineVoicesFailed = false; // set if an online voice errors (e.g. offline); then only local voices are used
// Keep novelty voices (e.g. macOS "Zarvox", "Bad News") out of a medical app.
const NOVELTY_VOICES = /Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Deranged|Good News|Hysterical|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox/i;
let voices = [];
function loadVoices() { voices = "speechSynthesis" in window ? speechSynthesis.getVoices() || [] : []; }
if ("speechSynthesis" in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }

function pickVoice(styleKey) {
  const style = VOICE_STYLES[styleKey] || VOICE_STYLES.female;
  if (!voices.length) loadVoices();
  const usable = voices.filter((v) => !NOVELTY_VOICES.test(v.name) && (!onlineVoicesFailed || v.localService));
  const english = usable.filter((v) => /^en[-_]US/i.test(v.lang)).concat(usable.filter((v) => /^en/i.test(v.lang) && !/^en[-_]US/i.test(v.lang)));
  for (const re of style.names) {
    const v = english.find((x) => re.test(x.name));
    if (v) return v;
  }
  return null; // no match: use the device default voice with the fallback pitch
}

function makeUtterance(text, styleKey = state.settings.voice, speed = state.settings.rate) {
  if (styleKey === "eleven:male") styleKey = "male"; // natural voice fallback keeps the same gender
  const style = VOICE_STYLES[styleKey] || VOICE_STYLES.female;
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice(styleKey);
  if (v) { u.voice = v; u.lang = v.lang; u.pitch = 1; } else { u.lang = "en-US"; u.pitch = style.fallbackPitch; }
  u.rate = Math.min(2, Math.max(0.5, Number(speed) || 1));
  return u;
}

// ---------------- Natural voice (optional, ElevenLabs through our server) ----------------
// One short audio clip per sentence, so stop/resume tracking works exactly like the browser voice.
const natural = {
  available: false,
  failed: false,
  audio: new Audio(),
  cache: new Map(), // "voice|sentence" -> Promise<blob URL>, kept in this tab's memory only
  voice() { return state.settings.voice.slice(7); }, // "eleven:male" -> "male"
  url(text, voice = natural.voice()) {
    const key = `${voice}|${text}`;
    if (!natural.cache.has(key)) {
      const p = fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, voice }) })
        .then(async (r) => {
          if (!r.ok) throw new Error(((await r.json().catch(() => ({}))).error) || "tts failed");
          return URL.createObjectURL(await r.blob());
        });
      p.catch(() => natural.cache.delete(key));
      natural.cache.set(key, p);
    }
    return natural.cache.get(key);
  },
  prefetch(text) { if (text) natural.url(text).catch(() => {}); },
  async play(text, isCurrent, onend, onerror, speed = state.settings.rate, voice = natural.voice()) {
    try {
      const src = await natural.url(text, voice);
      if (!isCurrent()) return;
      const a = natural.audio;
      a.onended = onend;
      a.onerror = () => { if (isCurrent()) onerror(); };
      a.src = src;
      a.playbackRate = Number(speed) || 1;
      await a.play();
    } catch (e) {
      if (isCurrent()) onerror(e);
    }
  },
  stop() {
    const a = natural.audio;
    a.onended = null;
    a.onerror = null;
    a.pause();
  },
  fail() {
    natural.failed = true;
    announce("The natural voice isn't working right now, so I'm using the device voice.");
  },
};
const useNatural = () => natural.available && !natural.failed && state.settings.voice.startsWith("eleven:");

function stopAllSpeech() {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  natural.stop();
}

fetch("/api/config").then((r) => r.json()).then((cfg) => {
  if (!cfg.natural_voice || !(cfg.natural_voices || []).length) return;
  natural.available = true;
  $("#voice").prepend(...cfg.natural_voices.map((v) => el("option", { value: `eleven:${v.key}` }, v.label)));
  if ($(`#voice option[value="${state.settings.voice}"]`)) $("#voice").value = state.settings.voice;
}).catch(() => {});

// ---------------- Read aloud ----------------
// We speak ONE sentence per utterance and track the position ourselves,
// because speechSynthesis.pause()/resume() is unreliable across browsers.
reader.play = function () {
  if ((!("speechSynthesis" in window) && !useNatural()) || !audioOn() || !state.segments.length) return;
  if (reader.pos >= state.segments.length) reader.pos = 0;
  reader.playing = true;
  updateReadUi();
  announce("Reading document.");
  reader.speakCurrent();
};

reader.speakCurrent = function () {
  const my = ++reader.token;
  const s = state.segments[reader.pos];
  highlight(reader.pos);
  mascot.set("speaking");
  mascot.caption(s.text);
  if (oneAtATime() && s.card !== state.page) goToPage(s.card, false);
  const finished = () => {
    if (my !== reader.token || !reader.playing) return;
    reader.pos++;
    if (reader.pos >= state.segments.length) {
      reader.playing = false;
      reader.pos = 0;
      highlight(-1);
      mascot.set("idle");
      updateReadUi();
      announce("Finished reading.");
      return;
    }
    updateReadUi();
    reader.speakCurrent();
  };
  if (useNatural()) {
    natural.play(s.text, () => my === reader.token && reader.playing, finished, () => {
      natural.fail();
      reader.speakCurrent(); // same sentence, now with the device voice
    });
    const next = state.segments[reader.pos + 1];
    if (next) natural.prefetch(next.text); // so the next sentence starts without a gap
    return;
  }
  const u = makeUtterance(s.text);
  u.onend = finished;
  u.onerror = (e) => {
    if (my !== reader.token || e.error === "interrupted" || e.error === "canceled") return;
    if (u.voice && !u.voice.localService && !onlineVoicesFailed) {
      onlineVoicesFailed = true; // the natural online voice failed: retry the same sentence with a local voice
      reader.speakCurrent();
      return;
    }
    reader.playing = false;
    mascot.set("idle");
    updateReadUi();
    announce("Read aloud stopped because of a browser problem.");
  };
  reader.current = u;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
};

reader.stop = function () {
  reader.token++;
  reader.playing = false;
  stopAllSpeech();
  updateReadUi();
};

function highlight(pos) {
  $$(".seg.speaking").forEach((s) => s.classList.remove("speaking"));
  $$(".card.reading").forEach((c) => c.classList.remove("reading"));
  if (pos < 0) return;
  const s = state.segments[pos];
  $$(`.seg[data-seg="${pos}"]`).forEach((n) => n.classList.add("speaking"));
  const card = $(`.card[data-card="${s.card}"]`);
  if (card) {
    card.classList.add("reading");
    if (!oneAtATime()) card.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }
}

function prefersReducedMotion() { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }

function updateReadUi() {
  const read = $("#read-btn");
  if (!read) return;
  const total = state.segments.length;
  $("#stop-btn").hidden = !reader.playing;
  read.hidden = !audioOn() || reader.playing;
  read.textContent = reader.pos > 0 ? "Continue reading" : "Read aloud";
  $("#read-pos").textContent = audioOn() && total ? `Sentence ${Math.min(reader.pos + 1, total)} of ${total}` : "";
}

$("#read-btn").addEventListener("click", () => reader.play());
$("#stop-btn").addEventListener("click", () => {
  reader.stop();
  mascot.set("paused");
  announce("Paused.");
  $("#read-btn").focus();
});

// ---------------- Interrupt and ask ----------------
const dialog = $("#ask-dialog");

function currentCard() {
  const s = state.segments[reader.pos];
  const ci = oneAtATime() ? state.page : (s ? s.card : 0);
  return state.cards[ci];
}

function openAsk(prefill) {
  if (!state.doc) return;
  reader.wasPlaying = reader.playing;
  reader.stop();               // stop audio immediately, keep the position
  stopListening();
  mascot.set("paused");
  const card = currentCard();
  $("#ask-context").textContent = card && card.fact ? `About: ${card.fact.label}` : "About: the whole document";
  $("#question").value = "";
  $("#answer-box").hidden = true;
  $("#continue-btn").textContent = reader.wasPlaying ? "Continue reading" : "Continue";
  if (!dialog.open) dialog.showModal();
  announce("Paused. Ask your question.");
  if (prefill) ask(prefill);
  else $("#question").focus();
}

function closeAsk(resume) {
  stopListening();
  onceToken++;
  stopAllSpeech();
  mascot.set(reader.wasPlaying ? "paused" : "idle");
  if (dialog.open) dialog.close();
  if (resume && reader.wasPlaying) {
    reader.play();             // picks up on the same sentence
  } else {
    announce("Paused. Press Continue reading or Read aloud to go on.");
    const focusTarget = oneAtATime() ? $(`#card-h-${state.page}`) : ($("#read-btn").hidden ? $("#ask-fab") : $("#read-btn"));
    if (focusTarget) focusTarget.focus();
  }
}

$("#ask-fab").addEventListener("click", () => openAsk());
$("#continue-btn").addEventListener("click", () => closeAsk(true));
dialog.addEventListener("cancel", (e) => { e.preventDefault(); closeAsk(false); }); // Escape
$$("#ask-dialog [data-q]").forEach((b) => b.addEventListener("click", () => ask(b.dataset.q)));
$("#ask-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = $("#question").value.trim();
  if (!q) { $("#mic-status").textContent = "Please type or say a question first."; $("#question").focus(); return; }
  ask(q);
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "q" && e.key !== "Q") return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
  if ($("#screen-result").hidden || dialog.open) return;
  e.preventDefault();
  openAsk();
});

function cardPlainText(card) {
  return card.segments.join(" ");
}

// Answers we can give instantly, without the AI.
function localAnswer(q, card) {
  if (q === "Say that again") {
    const s = state.segments[reader.pos];
    return { answer: card.fact ? cardPlainText(card) : (s ? s.text : cardPlainText(card)),
      source_quote: card.fact ? card.fact.original_text : "", answerable: true, quote_verified: true };
  }
  if (q === "Say it simpler" && card.fact && !simpleWords() && card.fact.simple_text) {
    return { answer: card.fact.simple_text, source_quote: card.fact.original_text, answerable: true, quote_verified: true };
  }
  return null;
}

// Fallback when the AI service is not available (e.g. sample mode without a key).
function offlineAnswer(q, card) {
  if (/need to do/i.test(q) && state.doc.next_steps.length) {
    return { answer: state.doc.next_steps.join(" "), source_quote: "", answerable: true, offline: true };
  }
  return { answer: "Asking new questions needs the AI service, which isn't set up here. Here is what the document says: " +
      cardPlainText(card), source_quote: card.fact ? card.fact.original_text : "", answerable: true, quote_verified: true, offline: true };
}

let askToken = 0;
async function ask(question) {
  const card = currentCard();
  const my = ++askToken;
  $("#question").value = question;
  showAnswer({ answer: "Thinking...", source_quote: "" }, true);
  let result = localAnswer(question, card);
  if (!result) {
    mascot.set("thinking");
    try {
      result = await api("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question === "Say it simpler" ? "Say this part again in the simplest possible words." : question,
          fact_id: card && card.fact ? card.fact.id : "",
          document: state.doc,
          needs: state.settings.needs,
          caregiver: state.settings.caregiver,
        }),
      }, 60000);
    } catch (e) {
      result = e.code === "no_api_key" ? offlineAnswer(question, card)
        : { answer: e.message, source_quote: "", answerable: false, error: true };
    }
  }
  if (my !== askToken || !dialog.open) return;
  showAnswer(result);
}

function showAnswer(r, pending = false, extraActions = []) {
  const box = $("#answer-box");
  box.hidden = false;
  $("#answer-text").textContent = r.answer;
  const hasQuote = !!r.source_quote;
  $("#answer-source").hidden = !hasQuote;
  if (hasQuote) {
    $("#answer-quote").textContent = r.source_quote;
    $("#answer-quote-note").textContent = r.quote_verified === false
      ? "I couldn't find these exact words in the document. Double-check this with a person."
      : "";
  }
  const actions = $("#answer-actions");
  actions.replaceChildren(...extraActions);
  if (pending) return;
  if (r.error) mascot.set("idle"); else mascot.happy();
  announce("Answer ready. " + r.answer);
  box.focus();
  if (audioOn() && !r.error) speakOnce(r.answer);
}

// Speak an answer sentence by sentence (short utterances are more reliable in Chrome).
let onceToken = 0;
function speakOnce(text) {
  stopAllSpeech();
  const my = ++onceToken;
  const parts = sentences(text);
  mascot.set("speaking");
  mascot.caption(parts[0] || "");
  if (useNatural()) {
    natural.play(text, () => my === onceToken, () => { if (my === onceToken && !reader.playing) mascot.set("idle"); },
      () => { natural.fail(); speakOnce(text); });
    return;
  }
  if (!("speechSynthesis" in window)) return;
  parts.forEach((s, i) => {
    const u = makeUtterance(s);
    u.onstart = () => { if (my === onceToken) mascot.caption(s); };
    if (i === parts.length - 1) u.onend = () => { if (my === onceToken && !reader.playing) mascot.set("idle"); };
    speechSynthesis.speak(u);
  });
}

// ---------------- "Make it even simpler" ----------------
async function makeSimpler(card, idx) {
  reader.stop();
  const f = card.fact;
  const status = $(`.card[data-card="${idx}"] .plain`);
  status.textContent = "Making it simpler...";
  mascot.set("thinking");
  announce("Making it simpler.");
  try {
    const r = await api("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "Explain this part in even simpler words. One or two very short sentences. Use words a child knows.",
        fact_id: f.id, document: state.doc, needs: state.settings.needs, caregiver: state.settings.caregiver }),
    }, 60000);
    if (r.answerable) f.simpleOverride = r.answer;
  } catch (e) {
    announce(e.code === "no_api_key" ? "This needs the AI service, which isn't set up here." : e.message);
  }
  showResult(state.doc, { keepPosition: true });
  goToPage(idx);
  reader.pos = firstSegOf(idx);
  updateReadUi();
  if (f.simpleOverride) mascot.happy(); else mascot.set("idle");
  announce(f.simpleOverride ? "Here it is in simpler words." : "Couldn't make it simpler right now.");
  if (audioOn() && f.simpleOverride) speakOnce(f.simpleOverride);
}

// ---------------- Draft a message (instead of calling) ----------------
async function draftMessage(contact) {
  openAsk();
  const to = contact ? `${contact.name}${contact.email ? " (" + contact.email + ")" : ""}` : "the office on this document";
  const q = `Write a short, polite message I can send to ${to} about this document, asking what I need to know or do. ` +
    (has("deaf_hoh") ? "Say that I am Deaf or hard of hearing and ask them to reply in writing (email or patient portal) instead of by phone. " : "") +
    (state.settings.needs.length ? "Include a short request for any accommodations I may need. " : "") +
    "Include my account, claim or member number if the document shows one. Put the message itself in the answer.";
  $("#ask-context").textContent = `Writing a message to ${to}`;
  const my = ++askToken;
  showAnswer({ answer: "Writing your message...", source_quote: "" }, true);
  mascot.set("thinking");
  let r;
  try {
    r = await api("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q, fact_id: "", document: state.doc, needs: state.settings.needs, caregiver: state.settings.caregiver }) }, 60000);
  } catch (e) {
    r = { answer: e.code === "no_api_key" ? "Writing messages needs the AI service, which isn't set up here." : e.message,
      source_quote: "", answerable: false, error: true };
  }
  if (my !== askToken || !dialog.open) return;
  const extra = [];
  if (!r.error && r.answerable) {
    extra.push(el("button", { type: "button", class: "btn btn-secondary", onclick: async (ev) => {
      try { await navigator.clipboard.writeText(r.answer); ev.target.textContent = "Copied"; announce("Message copied."); }
      catch (err) { announce("Couldn't copy. Select the text and copy it yourself."); }
    } }, "Copy message"));
    if (contact && contact.email) {
      extra.push(el("a", { class: "btn btn-secondary",
        href: `mailto:${contact.email}?subject=${encodeURIComponent("Question about my " + state.doc.title)}&body=${encodeURIComponent(r.answer)}` },
        "Open in email"));
    }
  }
  showAnswer(r, false, extra);
}

// ---------------- Voice input (optional) ----------------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recog = null;

if (!SR) {
  $("#mic-btn").disabled = true;
  $("#mic-btn").textContent = "Voice not available";
  $("#mic-status").textContent = "Voice input isn't available in this browser. Please type your question.";
}

$("#mic-btn").addEventListener("click", () => {
  if (recog) return stopListening();
  stopAllSpeech(); // never listen while talking
  recog = new SR();
  recog.lang = "en-US";
  recog.interimResults = false;
  recog.maxAlternatives = 1;
  recog.onresult = (e) => {
    const text = e.results[0][0].transcript;
    $("#question").value = text;
    $("#mic-status").textContent = `I heard: "${text}"`;
    ask(text);
  };
  recog.onerror = (e) => {
    $("#mic-status").textContent = e.error === "not-allowed"
      ? "Microphone permission was blocked. Please type your question instead."
      : "I couldn't hear that. Please try again or type your question.";
  };
  recog.onend = () => { recog = null; setMic(false); };
  try {
    recog.start();
    setMic(true);
    $("#mic-status").textContent = "Listening... speak now.";
  } catch (e) {
    recog = null;
    $("#mic-status").textContent = "Couldn't start the microphone. Please type your question.";
  }
});

function setMic(on) {
  if (on) mascot.set("listening");
  else if (mascot.state === "listening") mascot.set("idle");
  $("#mic-btn").setAttribute("aria-pressed", String(on));
  $("#mic-btn").textContent = on ? "Stop listening" : "Speak my question";
}

function stopListening() {
  if (recog) { try { recog.abort(); } catch (e) { /* ignore */ } recog = null; setMic(false); }
}

// ---------------- Start ----------------
applySettings();
if (state.settings.saved) showScreen("home");
else { fillSettingsForm(); showScreen("settings"); }
