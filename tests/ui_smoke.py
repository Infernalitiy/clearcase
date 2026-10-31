"""Headless UI smoke test (uses sample documents, no API key needed for most checks).

  python -m playwright install chromium
  python tests/ui_smoke.py [base_url]
"""
import sys

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5000"

# Fake speech engine: each utterance "speaks" for 200 ms, cancel() stops it.
FAKE_SPEECH = """
window.__spoken = [];
const synth = { _t: null, _q: [],
  speak(u) { window.__spoken.push(u.text); this._q.push(u); if (!this._t) this._next(); },
  _next() { const u = this._q.shift(); if (!u) { this._t = null; return; }
    this._t = setTimeout(() => { this._t = null; u.onend && u.onend({}); this._next(); }, 200); },
  cancel() { clearTimeout(this._t); this._t = null; this._q = []; },
  getVoices() { return []; }, pause() {}, resume() {} };
Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
if (!window.SpeechSynthesisUtterance) window.SpeechSynthesisUtterance = function (t) { this.text = t; };
"""

failures = []


def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        failures.append(msg)


def set_profile(page, needs, voice=None):
    page.goto(BASE)
    page.evaluate("localStorage.clear()")
    page.reload()
    check(page.is_visible("#screen-settings"), "first visit shows the needs screen")
    for n in needs:
        page.check(f"input[name=needs][value={n}]")
    if voice:
        page.select_option("#voice", voice)
    page.click("#settings-form button[type=submit]")
    check(page.is_visible("#screen-home"), f"saved profile {needs} and reached home")


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context()
    ctx.add_init_script(FAKE_SPEECH)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))

    # --- Blind / low vision: auto read, interrupt with Q, resume on same sentence
    set_profile(page, ["blind_low_vision"], voice="male")
    check(page.evaluate("[...document.querySelectorAll('#voice option')].map(o => o.value).filter(v => !v.startsWith('eleven:')).join()") == "female,male", "device voice choices are Female and Male")
    check(page.evaluate("JSON.parse(localStorage.getItem('carebridge.settings')).voice") == "male", "voice choice is saved")
    check(page.evaluate("makeUtterance('hi').pitch") < 1, "male voice without a male device voice uses a lower pitch")
    check(page.evaluate("document.documentElement.classList.contains('high-contrast')"), "blind profile turns on high contrast")
    page.click("[data-sample=bill]")
    page.wait_for_selector("#screen-result:not([hidden])")
    check("Hospital" in page.inner_text("#doc-title") or len(page.inner_text("#doc-title")) > 3, "result title shown")
    page.wait_for_timeout(2200)  # auto-read starts after 900 ms; let a few sentences go
    pos_before = page.evaluate("reader.pos")
    check(page.evaluate("reader.playing") and pos_before > 0, f"auto read-aloud is running (sentence {pos_before})")
    check(page.get_attribute("#mascot", "data-state") == "speaking", "Bridgey is speaking while reading")
    check(page.is_visible("#mascot-bubble") and len(page.inner_text("#mascot-bubble")) > 3, "caption bubble shows the sentence")
    page.keyboard.press("q")
    check(page.get_attribute("#mascot", "data-state") == "paused", "Bridgey is paused after Q")
    check(not page.is_visible("#mascot-bubble"), "caption bubble hides when paused")
    check(page.evaluate("document.querySelector('#ask-dialog').open"), "Q opens the ask dialog")
    check(not page.evaluate("reader.playing"), "Q stops reading")
    spoken_count = page.evaluate("__spoken.length")
    page.wait_for_timeout(600)
    check(page.evaluate("__spoken.length") == spoken_count, "nothing more is spoken after Q")
    page.click("#ask-dialog [data-q='Say that again']")
    page.wait_for_selector("#answer-box:not([hidden])")
    check(len(page.inner_text("#answer-text")) > 5, "'Say that again' shows an answer")
    expected = page.evaluate("state.segments[reader.pos].text")
    page.click("#continue-btn")
    page.wait_for_timeout(100)
    check(not page.evaluate("document.querySelector('#ask-dialog').open"), "Continue closes the dialog")
    check(page.evaluate("reader.playing"), "Continue resumes reading")
    check(page.evaluate("__spoken[__spoken.length - 1]") == expected, f"resumed on the same sentence: {expected[:50]!r}")
    page.click("#stop-btn")
    check(page.inner_text("#read-btn") == "Continue reading", "Stop shows 'Continue reading'")
    page.keyboard.press("q")
    page.keyboard.press("Escape")
    check(not page.evaluate("document.querySelector('#ask-dialog').open"), "Escape closes the dialog")
    check(page.locator("details.original").count() > 0, "cards have Show original")
    page.locator("details.original summary").first.click()
    check("$482.17" in page.inner_text("#cards") , "amount $482.17 visible")
    check(page.locator(".verify").first.is_visible(), "'Double-check this with a person' shown")

    # --- Discharge: emergency banner first
    page.click("#restart-btn")
    page.click("[data-sample=discharge]")
    page.wait_for_selector("#screen-result:not([hidden])")
    check("call 911" in page.inner_text("#banners"), "emergency banner shown for discharge")
    check(page.evaluate("state.segments[0].text").startswith("If this is an emergency"), "emergency line is read first")

    # --- Cognitive: one card at a time
    set_profile(page, ["cognitive_learning"])
    page.click("[data-sample=denial]")
    page.wait_for_selector("#screen-result:not([hidden])")
    visible = page.evaluate("[...document.querySelectorAll('#cards .card')].filter(c => !c.hidden).length")
    check(visible == 1, "cognitive profile shows one card at a time")
    check(page.is_visible("#pager"), "Next/Back pager visible")
    page.click("#next-btn")
    check("Card 2 of" in page.inner_text("#pager-pos"), "Next moves to card 2")
    check(page.locator("text=Make it even simpler").first.is_visible(), "'Make it even simpler' button shown")

    # --- Deaf / HoH: no audio, write instead of call
    page.goto(BASE)
    page.evaluate("localStorage.clear()")
    page.reload()
    page.check("input[name=needs][value=deaf_hoh]")
    check(not page.is_visible("#voice"), "voice controls hidden for Deaf/HoH")
    set_profile(page, ["deaf_hoh"])
    page.click("[data-sample=bill]")
    page.wait_for_selector("#screen-result:not([hidden])")
    check(not page.is_visible("#read-btn"), "deaf profile hides Read aloud")
    check(page.locator("text=Write a message for me").count() > 0, "deaf profile offers 'Write a message for me'")
    check(page.locator("a[href^='tel:']").count() == 0, "deaf profile shows no call buttons")

    # --- Fatigue: checklist first, one-tap questions
    set_profile(page, ["fatigue_motor"])
    page.click("[data-sample=bill]")
    page.wait_for_selector("#screen-result:not([hidden])")
    check(page.is_visible("#quick-questions"), "fatigue profile shows one-tap questions")
    check(page.evaluate("state.cards[1].kind") == "steps", "fatigue profile puts the checklist first")
    page.locator(".check").first.click()
    check(page.locator(".check").first.get_attribute("aria-pressed") == "true", "checklist item toggles")

    # --- Keyboard only: Tab reaches the sample buttons and Enter loads a document
    page.click("#restart-btn")
    page.evaluate("document.activeElement.blur()")
    for _ in range(40):
        page.keyboard.press("Tab")
        if page.evaluate("document.activeElement.dataset.sample") == "bill":
            break
    check(page.evaluate("document.activeElement.dataset.sample") == "bill", "Tab reaches the sample buttons")
    page.keyboard.press("Enter")
    page.wait_for_selector("#screen-result:not([hidden])")
    check(True, "Enter on a sample button opens the document")

    # --- Natural voice (ElevenLabs) with a fake server: short WAV clips, no credits used
    import io, wave
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(8000); w.writeframes(b"\0\0" * 2400)  # 0.3 s
    clip = buf.getvalue()
    tts_texts, tts_mode = [], {"fail": False}

    def fake_tts(route):
        tts_texts.append(route.request.post_data_json["text"])
        if tts_mode["fail"]:
            route.fulfill(status=502, json={"error": "fake failure", "code": "tts_error"})
        else:
            route.fulfill(status=200, body=clip, headers={"Content-Type": "audio/wav"})
    page.route("**/api/config", lambda r: r.fulfill(json={"natural_voice": True, "natural_voices": [
        {"key": "mommy", "label": "Mommy (natural voice)"}, {"key": "male", "label": "Male (natural voice)"}]}))
    page.route("**/api/tts", fake_tts)
    page.goto(BASE)
    page.evaluate("localStorage.clear()")
    page.reload()
    page.wait_for_selector("#voice option[value='eleven:mommy']", state="attached")
    check(page.locator("#voice option[value='eleven:male']").count() == 1, "Mommy and Male natural voices offered")
    page.uncheck("input[name=autoRead]")
    page.select_option("#voice", "eleven:mommy")
    page.click("#settings-form button[type=submit]")
    page.click("[data-sample=bill]")
    page.wait_for_selector("#screen-result:not([hidden])")
    page.click("#read-btn")
    page.wait_for_timeout(1500)
    pos = page.evaluate("reader.pos")
    check(pos > 0 and len(tts_texts) > pos, f"natural voice reads sentence by sentence (sentence {pos}, {len(tts_texts)} clips)")
    page.keyboard.press("q")
    check(page.evaluate("natural.audio.paused") and not page.evaluate("reader.playing"), "Q stops the natural voice")
    pos_q = page.evaluate("reader.pos")
    page.keyboard.press("Escape")
    page.click("#read-btn")
    page.wait_for_timeout(100)
    check(page.evaluate("reader.pos") == pos_q and page.evaluate("reader.playing"), "natural voice resumes on the same sentence")
    tts_mode["fail"] = True
    page.evaluate("natural.cache.clear()")
    page.click("#stop-btn")
    page.click("#read-btn")
    page.wait_for_timeout(800)
    check(page.evaluate("natural.failed") and page.evaluate("reader.playing"), "if ElevenLabs fails, reading continues with the device voice")
    errors[:] = [e for e in errors if "status of 502" not in e]  # the 502s above were faked on purpose
    page.unroute("**/api/config")
    page.unroute("**/api/tts")
    page.click("#stop-btn")

    if "--ai" in sys.argv:  # these need the Bedrock key on the server
        page.keyboard.press("q")
        page.click("#ask-dialog [data-q='What does this mean?']")
        page.wait_for_function("document.querySelector('#answer-text').textContent !== 'Thinking...'", timeout=60000)
        check(len(page.inner_text("#answer-text")) > 10, "AI answer: " + page.inner_text("#answer-text")[:80])
        check(page.is_visible("#answer-quote"), "source quote shown: " + page.inner_text("#answer-quote")[:60])
        page.click("#continue-btn")
        page.locator("text=Write a message for me").first.click()
        page.wait_for_function("!/^Writing/.test(document.querySelector('#answer-text').textContent)", timeout=60000)
        check("Copy message" in page.inner_text("#answer-actions"), "drafted message with Copy button")
        page.keyboard.press("Escape")
        page.click("#restart-btn")
        page.set_input_files("#file", "samples/denial.png")
        page.click("#analyze-btn")
        page.wait_for_selector("#screen-result:not([hidden])", timeout=90000)
        check(page.locator("#cards .card").count() > 3, "real upload produces cards")
        from PIL import Image, ImageFilter
        Image.open("samples/bill.png").resize((160, 200)).filter(ImageFilter.GaussianBlur(4)).save("tests/blurry.png")
        page.click("#restart-btn")
        page.set_input_files("#file", "tests/blurry.png")
        page.click("#analyze-btn")
        page.wait_for_selector("#screen-result:not([hidden])", timeout=90000)
        check("couldn't read this clearly" in page.inner_text("#banners"), "blurry photo shows the low-confidence message")

    page.screenshot(path="tests/screenshot.png", full_page=True)
    check(not errors, f"no JavaScript errors {errors}")
    browser.close()

print(f"\n{len(failures)} failure(s)" if failures else "\nALL PASSED")
sys.exit(1 if failures else 0)
