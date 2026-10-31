# CareBridge

**CareBridge turns any medical paper into the format each disabled patient can actually use.**

Take a photo of a hospital bill, an insurance denial, or discharge instructions. CareBridge reads it, pulls out what matters (what you owe, deadlines, medicines, what to do next, who to contact) and presents it in the way that works for *you*: read aloud, text only, one simple step at a time, or a low-effort checklist. At any moment you can stop it and ask a question, and it answers only from your document, showing the exact line it used.

> This tool helps you understand paperwork. It is not medical or legal advice. Confirm important details with your provider or insurer.

---

## The problem

Medical paperwork assumes the reader can see small print, process dense jargon, make phone calls during business hours, and has plenty of energy to spare. Many disabled patients cannot do one or more of those things, yet they often deal with *more* medical paperwork than anyone else. A bill or a denial letter that one person reads in two minutes can be a wall for someone who is blind, Deaf, has a learning disability, or is exhausted by chronic illness.

General-purpose chatbots can summarize a document, but they don't remember how you need information delivered. They also don't show you where an answer came from, and you can't easily stop them halfway through an explanation.

## What it does

Pick one or more needs on first launch (saved on your device only). The same document is then shown differently:

| Need | What changes |
|---|---|
| **Blind / low vision** (`blind_low_vision`) | Audio-first: starts reading aloud automatically, one sentence at a time, with the current sentence highlighted. Choose a **warm female (mom-like), female or male voice**. Large, high-contrast text by default. Semantic HTML and live regions so screen readers work out of the box. |
| **Deaf / hard of hearing** (`deaf_hoh`) | Text only, no audio dependence. Instead of "call this number", every contact has **Write a message for me**, which drafts an email asking for a written reply (with an accommodation request), plus Copy and Open-in-email buttons. Phone numbers mention relay services (711). |
| **Cognitive / learning** (`cognitive_learning`) | Very short, simple sentences. **One card at a time** with big Next/Back buttons. A **Make it even simpler** button on every card. Optional dyslexia-friendly font and spacing. |
| **Fatigue / motor** (`fatigue_motor`) | The "what to do" **checklist comes first**, with big tap-to-check buttons. **One-tap questions** ("What do I need to do?", "Say it simpler", "Write a message for me") so nothing needs typing. Larger touch targets everywhere. |

Needs can be combined (e.g. low vision + cognitive gives read-aloud *and* one card at a time).

### Interrupt and ask (the key feature)
A large **I'm confused / Ask** button is always visible, also on the **Q** key. Pressing it:
1. stops the audio immediately and remembers the exact sentence;
2. lets you ask by **typing**, **voice**, or **one tap** ("What does this mean?", "Say it simpler", "Say that again", "What do I need to do?");
3. shows the answer **and the exact quote from your document** it came from, and reads it aloud (except for Deaf/HoH users);
4. a big **Continue** button resumes reading from the same sentence.

### Built for trust
- **Show original** on every card reveals the exact text copied from the document.
- Amounts, dates, deadlines and medicines are always marked **"Double-check this with a person"**.
- The server checks that every quoted answer actually appears in the document; if not, the UI says so.
- If the document doesn't answer a question, CareBridge says: *"This document doesn't say. Ask your insurer or provider."* It does not guess.
- Medical decisions (e.g. "should I stop this medicine?") are referred to a doctor or pharmacist.
- If the photo is unreadable it says *"I couldn't read this clearly, please try a clearer photo."*
- If the document is about urgent symptoms, *"If this is an emergency, call 911"* is shown, and read first.
- Document text is treated as data, never as instructions (prompt-injection resistant prompts).

### Also included
- **Voice choice:** *Warm female (mom-like)*, *Female* or *Male*, with a Preview button. CareBridge picks the best matching voice already on your device. The warm voice is a female voice that is slightly higher and slower. If there's no matching voice, it uses the default voice with a higher or lower pitch. Voices sound different on different computers and browsers, and they are not real or cloned voices.
- **Bridgey, the helper character:** an original mascot in the top right who "does the talking". Its mouth moves while reading, and it shows when it's paused, listening or thinking. Its speech bubble shows the sentence being read, like live captions. Bridgey is decorative (screen readers skip it), stops moving when reduced motion is on, and can be switched off in settings.
- **iOS-style interface:** frosted-glass cards, switches and a segmented control. The colours are adjusted to meet WCAG AA contrast, and the glass turns off in high-contrast mode and when the device asks for reduced transparency.
- PDF upload (first 3 pages, including scanned PDFs), JPG and PNG.
- Caregiver mode: answers address the person helping the patient.
- Print a large-print copy, including all original quotes.
- Text size, high contrast, dyslexia font, and reading speed settings.

## How to run

Requires Python 3.10+.

```bash
pip install -r requirements.txt
python backend/app.py
```

Open **http://localhost:5000**.

**Sample mode works with no API key.** Click *Try a sample document* to load one of three fictional documents (a hospital bill, an insurance denial, discharge instructions). Their analysis is cached in `samples/*.json`.

**Uploading your own document and asking questions need an Amazon Bedrock API key.** Copy `.env.example` to `.env` and set:

```
AWS_BEARER_TOKEN_BEDROCK=your-bedrock-api-key
# optional: BEDROCK_MODEL_ID=us.anthropic.claude-sonnet-5-5
```

The app uses Claude via the Amazon Bedrock Converse API in `us-east-1`. Without a key, a few answers still work offline ("Say that again", "Say it simpler", "What do I need to do?" come from the cached document).

Optional: `PORT=5050 python backend/app.py` to use another port, `python backend/test_bedrock.py` to check your Bedrock access.

## How it works

```
frontend/ (plain HTML, CSS, JS, no build step)
   │  POST /api/analyze  (image or PDF)          ─┐
   │  GET  /api/sample/<bill|denial|discharge>     │  backend/app.py (Flask)
   │  POST /api/ask      (question + document)    ─┘        │
   │                                                Claude on Amazon Bedrock (Converse API)
```

- **`/api/analyze`** fixes photo rotation, downscales the image, sends it to Claude with a strict JSON schema, validates the result (types, allowed values, required fields), and **retries once** with the validation error if the JSON is invalid. Images are processed in memory and never saved.
- **`/api/ask`** sends the question, the extracted document, the focused card and the user's needs. The answer style depends on the needs (very short for cognitive, spoken-style for blind, written-contact only for Deaf/HoH).
- **Read-aloud** uses the browser's speech synthesis, one short sentence per utterance. The app tracks the position itself instead of relying on `pause()`/`resume()`, which are unreliable across browsers. That is what makes "stop instantly, resume on the same sentence" work.
- **Voice input** uses the Web Speech API where available (Chrome, Edge). Audio is always stopped before the microphone listens, and typing is always available.

Files:

| Path | Purpose |
|---|---|
| `backend/app.py` | Flask server, Bedrock calls, validation |
| `backend/test_bedrock.py` | Checks Bedrock access (text + image) |
| `backend/make_samples.py` | Draws the fictional sample PNGs and regenerates their JSON, verifying every quote appears on the page |
| `frontend/` | The whole UI |
| `samples/` | Fictional documents and cached analyses |
| `tests/ui_smoke.py` | Headless browser test of every profile, interrupt/resume, and keyboard flow |

Run the UI test (needs `pip install playwright && python -m playwright install chromium`):

```bash
python tests/ui_smoke.py http://localhost:5000        # sample-mode checks
python tests/ui_smoke.py http://localhost:5000 --ai   # plus real upload and questions (needs key)
```

## Privacy and safety

- Documents are sent to the AI service (Amazon Bedrock) to be read. **CareBridge stores nothing**: no database, no files written, no document contents logged. The extracted document lives only in your browser tab.
- Settings are stored in your browser's `localStorage` only.
- The API key is read from the environment and is never logged or sent to the browser.

## Honest limitations

- **We have not yet tested CareBridge with disabled users.** Every design choice here is based on published accessibility guidance and our own reasoning, not on user research. That is the most important next step.
- AI can misread documents, especially blurry photos or handwriting. That's why every card has *Show original* and key facts are flagged for double-checking, but errors are still possible.
- Tested in Chromium. Speech voices and voice input vary by browser and OS. On a device with only one English voice, which ignores pitch, the voice choices may sound alike. Voice input does not work in Firefox. We have not done full testing with NVDA, JAWS or VoiceOver yet.
- English only.
- The dyslexia font uses OpenDyslexic if it's installed on your device, and falls back to a rounded font with wider spacing otherwise.
- PDFs: only the first 3 pages are read.
- This is a hackathon prototype on Flask's development server, with no authentication or rate limiting. Don't deploy it publicly as-is.

## Next steps

1. **Usability testing with disabled people**, with each profile tested by people who have that disability, ideally with disability organisations. Then change the design based on what they tell us.
2. Full screen reader testing (NVDA, JAWS, VoiceOver, TalkBack) and a formal WCAG 2.2 AA audit.
3. More languages, and sign language video explanations for Deaf users who prefer ASL.
4. Multi-document history (kept on the device) to track bills and appeal deadlines over time.
5. Appeal letter and payment-plan request templates built from the document.
6. Optional premium neural voices from a TTS API (for example Voicemaker), after a privacy review, because it would mean sending document text to another service.
7. Production hardening: rate limiting, a production WSGI server, and a privacy review.

## Built with

Python, Flask, Pillow, pypdfium2, Amazon Bedrock (Converse API), Claude, HTML, CSS, JavaScript, Web Speech API (speech synthesis and recognition), Playwright (testing).

All sample documents are fictional. Names, numbers and organisations are made up.
