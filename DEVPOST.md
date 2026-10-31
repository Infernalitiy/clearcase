# CareBridge: Devpost draft

**Tagline:** CareBridge turns any medical paper into the format each disabled patient can actually use.

## Inspiration

Medical paperwork is written for a very specific reader: someone who can see small print, decode jargon like "adverse benefit determination," make phone calls during business hours, and has the energy to do all of it. Disabled patients often handle more of this paperwork than anyone, and the format itself can lock them out. A blind patient can't read a bill. A Deaf patient is told to "call this number." Someone with a learning disability faces a wall of dense text. Someone with chronic fatigue may not have the energy to work through a three-page denial letter.

We realized the *information* in the document isn't the problem. The *format* is. So we built a tool that keeps the information and changes the format for each person.

## What it does

You take a photo of one medical document (a bill, an insurance denial, discharge instructions) or upload a PDF. CareBridge extracts what matters (what you owe, deadlines, medicines, what to do next, who to contact) and presents it based on the needs you chose:

- **Blind / low vision:** reads aloud automatically, one sentence at a time, with large high-contrast text and full screen reader support.
- **Deaf / hard of hearing:** text only. Instead of "call this number," it drafts a message asking for a written reply, including an accommodation request.
- **Cognitive / learning disabilities:** one short, simple card at a time with Next/Back, a "Make it even simpler" button, and a dyslexia-friendly font option.
- **Fatigue / motor:** a big-button checklist of what to do, first, plus one-tap questions so nothing needs typing.

**Voice choice and Bridgey.** Users can pick a warm female (mom-like), female or male voice from the voices already on their device. Bridgey, our original helper character, "does the talking" in the corner. Its speech bubble shows each sentence as it's read, like live captions, which helps anyone who is hard of hearing or wants to read along.

**The key feature is interrupt-and-ask.** A big "I'm confused / Ask" button (or the Q key) stops the read-aloud instantly and remembers the exact sentence. You ask by typing, by voice, or with one tap ("What does this mean?", "Say it simpler"). You get an answer **with the exact quote from your document**, and a Continue button picks up on the same sentence.

**Built for trust:** every card has "Show original" with the exact source text. Amounts, dates and medicines are flagged "Double-check this with a person." If the document doesn't say, CareBridge says so instead of guessing. Medicine decisions go to a doctor or pharmacist. Emergency-related documents show "If this is an emergency, call 911" first.

**Why not just use a general chatbot?** CareBridge remembers your accessibility profile, gives consistent accessible output every time, shows the source text so you can verify it, lets you interrupt mid-explanation and resume, and works with screen readers out of the box.

## How we built it

- **Backend:** Python + Flask. Claude (vision) via the **Amazon Bedrock Converse API**. The analysis step returns a strict JSON schema, which we validate field by field and retry once if invalid. Images are rotated, downscaled and processed fully in memory; nothing is stored. PDFs are rendered to page images with pypdfium2, so scanned PDFs work too.
- **Grounded answers:** the ask endpoint answers only from the document, returns a source quote, and the server checks that the quote really appears in the document before the UI shows it as verified.
- **Prompt-injection resistance:** document text is wrapped and explicitly treated as data, never instructions.
- **Frontend:** plain HTML, CSS and JavaScript with no framework and no build step. Semantic HTML, a native `<dialog>`, ARIA live regions ("Reading document", "Paused", "Answer ready"), visible focus, reduced-motion support and 48–64px touch targets.
- **Voice choice:** a preferred list of device voices for each option, matched by name (English first, novelty voices excluded), with pitch and speed tuning and a pitch fallback when the device has no match. There is no cloud TTS: everything runs in the browser.
- **Bridgey:** an inline SVG character whose state (speaking, paused, listening, thinking, happy) is driven by the same reader and Ask code. It is marked decorative so screen readers aren't distracted, and it respects reduced motion.
- **iOS-style UI:** frosted glass with solid fallbacks, real checkboxes styled as switches, and real radio buttons styled as a segmented control. We darkened Apple's system blue and green to pass WCAG AA.
- **Read-aloud engine:** browser speech synthesis, one sentence per utterance, with our own position tracking, because `speechSynthesis.pause()`/`resume()` are unreliable across browsers.
- **Samples:** we generated three fictional documents with Pillow, ran the real analysis on them, and automatically verified that every quoted line appears on the page. The cached results let the demo run with no API key.
- **Testing:** a Playwright smoke test drives every profile, the interrupt/resume flow, and keyboard-only navigation.

## Challenges we ran into

- **Stopping speech instantly and resuming in the same place.** Browser pause/resume is unreliable, and Chrome can silently stop long utterances. We split everything into single sentences, track the position ourselves, and use a token so late "finished" events from cancelled speech are ignored.
- **Making AI output trustworthy for high-stakes paperwork.** A wrong amount or dose is worse than no answer. We force exact quotes, flag amounts/dates/medicines for human checking, verify quotes on the server, and have a fixed "This document doesn't say" response.
- **Designing for combined needs.** People often have more than one disability. Profiles had to stack (e.g. read-aloud *and* one card at a time) without conflicting.
- **Reliable structured output.** We validate every field and retry once with the exact validation error.

## Accomplishments that we're proud of

- Interrupt-and-ask really does stop on the spot and resume on the same sentence.
- One document, four very different experiences, all from the same grounded data.
- Every answer shows its source, so users can verify instead of just trusting the AI.
- Deaf users get a drafted written message instead of a phone number.
- Sample mode works with no API key, so anyone can try it.

## What we learned

- Accessibility isn't one mode. What helps one person (auto-play audio) can get in the way of another (a Deaf user, or a screen reader user who wants control), so the profile has to drive everything.
- Grounding and showing sources matter as much as summarizing, especially for money and medicine.
- Simple, standard web tech (semantic HTML, native dialog, live regions) gets you very far with assistive technology.

## What's next for CareBridge

- **Usability testing with disabled people.** We have not done this yet, and it is our most important next step. Each profile needs to be tested by people who have that disability, ideally with disability organisations.
- Full testing with NVDA, JAWS, VoiceOver and TalkBack, and a WCAG 2.2 AA audit.
- More languages, and sign language video explanations.
- On-device history to track bills and appeal deadlines over time.
- Appeal letter and payment-plan request templates.
- Optional premium neural voices from a TTS API, after a privacy review, since it would send document text to another service.

## Built with

Python · Flask · Amazon Bedrock · Claude · Pillow · pypdfium2 · HTML · CSS · JavaScript · Web Speech API · Playwright
