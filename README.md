# Smarticus

A private learning studio for Atticus, built with React, Express, PostgreSQL/Prisma, and OpenAI's GPT-Live voice API with a GPT-6 Astra reasoning backend.

## Learning experience

- **My day:** a daily learning path using the real schedule, with available curriculum dates when today has no lessons.
- **My subjects:** searchable, filterable subject cards that open the lesson studio.
- **Lesson studio:** a quiet, five-part journey through Understand, Explore, Practice, Words, and Reflect. Instructions appear one idea at a time; worked examples unfold through prediction, reasoning, and result. Practice shows one assigned question at a time with a question map and protected guidance.
- **Explore:** lesson-aware models for percents, ratios, fractions, light and color, light and materials, French sentences, algorithms, and test accuracy. Evidence bridges and connection maps help students explain relationships using the actual lesson. Model feedback is separate from assigned-question grading.
- **Remember and reflect:** recall-before-reveal word cards, teach-back prompts, real-world transfer, and self-assessment. Learning journals save locally without pretending that a filled field proves mastery.
- **Discovery lab:** interactive light-reflection and equivalent-fraction experiments that work without a voice connection.
- **My progress:** recent recorded skills and tutor sessions, with no simulated scores or streaks.
- **Virgil:** optional voice chat with explicit microphone controls, streamed words, a readable transcript, and recoverable session-save errors. The voice is `gpt-live-1`, a full-duplex model that listens and speaks at the same time; it delegates reasoning, lesson lookups, records, web search, vision, and drawing to `gpt-6-astra` through the Live API's Responses delegation. The browser negotiates WebRTC directly with OpenAI after the server creates the session, so the API key never reaches the client. His avatar responds to the remote audio's actual energy; it never uses the learner's microphone to simulate his speech.
- **Wake word with an instant greeting:** Virgil starts in silent standby. The moment the transcript contains "Virgil" (or a tap on Wake), the app appends speakable commentary to the Live session so he greets Atticus immediately, before any delegation happens. A clear goodbye returns him to standby.
- **Virgil can see the interface:** a `look_at_screen` tool returns a structured description of the live lesson UI (open section, selected question, the learner's draft, focused control, visible text and controls, whiteboard contents). With the optional **Share screen** button, the tool also attaches a screenshot for the vision model. Every change of learning focus is sent silently to both models as context, and a `navigate_lesson` tool lets Virgil open a section or jump to a practice question.
- **Live whiteboard:** a shared canvas in the lesson column. Astra draws through `whiteboard_draw` with text, lines and arrows, shapes, freehand paths, number lines, fraction bars, tables, highlights, and pauses; steps animate stroke by stroke while Virgil narrates. Atticus can draw back with the pen, and `whiteboard_look` sends the board image and an item list to the model. Reduced-motion preferences render steps instantly. Assigned answers stay protected: the model is instructed to draw analogous examples, not solutions.

The selected learning date and section are preserved in the URL. Practice answers stay on the current device using the existing `virgil-response` storage keys, so answers saved before the redesign remain available. Scratchpad notes stay in the current browser tab. Drafts are not submitted, graded, or synced. The lesson completion button and existing tutor tools record completion; mastery remains a separate learning record. On long voice sessions, the saved transcript keeps the most recent conversation that fits within the server's request limit.

The redesigned studio preserves the current repository’s selected-lesson synchronization, question lookup, protected guidance, and wake-word and goodbye-to-standby behavior; web search is now the Live backend's native tool. Available learning dates include checked-in curriculum that will be ingested on demand.

The interface supports keyboard navigation, phone and tablet layouts, and reduced-motion preferences. Fonts use the system stack, so the app makes no third-party font requests.

The lesson studio loads on demand. Motion for React supplies spring-based interaction and layout transitions; reduced-motion preferences disable spatial motion and the avatar's audio animation. Learning is never gated behind an animation or a timer. All lesson text remains available, including decimal values and source references.

Dependency overrides keep `pdf2json` on its compatible 3.x release without the vulnerable bundled XML parser, and `qs` on its patched 6.x release. PDF extraction is verified against the existing curriculum packet when these overrides change.

## Local development

Requirements: Node.js 22 or newer and PostgreSQL.

```bash
cp .env.example .env
npm ci
npm run db:setup
npm run dev
```

The browser app runs at `http://localhost:5173`; Vite proxies API requests to port 3000. Set `OPENAI_API_KEY` to enable live voice sessions; `REALTIME_MODEL`, `REALTIME_VOICE`, `LIVE_BACKEND_MODEL`, and `LIVE_BACKEND_REASONING` select the voice model, voice, delegated reasoning model, and its reasoning effort. Local development bypasses the access-password screen when `APP_ACCESS_PASSWORD` is empty. `db:setup` creates the configured database when needed, applies the checked-in migrations, and seeds the curriculum; it also works on Windows ARM64 where Prisma's native schema engine is unavailable.

Before committing, run the same verification used by CI:

```bash
npm run check
npm audit --omit=dev --audit-level=high
```

Browser checks run against the real app components and checked-in curriculum with isolated API fixtures, so they never contact an AI service or change student records:

```bash
npx playwright install chromium
npm run test:browser
```

On Windows with Edge installed, `PLAYWRIGHT_CHANNEL=msedge` selects Edge instead of downloaded Chromium (PowerShell: `$env:PLAYWRIGHT_CHANNEL='msedge'`). `PLAYWRIGHT_EXECUTABLE_PATH=/path/to/chrome` runs the checks against a preinstalled browser binary instead. Checks cover every curriculum day's lesson sections, model interactions, draft persistence, phone layouts, reduced motion, and avatar response to a real Web Audio MediaStream. A neutral local speech-synthesis recording exercises sentence pauses; it contains no learner audio. The avatar follows audio energy, not phoneme or word timestamps; streamed transcript text is not presented as word-aligned karaoke.

## Production deployment

Set all values in `.env.example` through the deployment platform's secret manager. Production startup intentionally fails unless these are safe and explicit:

- `OPENAI_API_KEY`
- `DATABASE_URL` using non-default credentials
- `SESSION_SECRET`, unique and at least 32 characters
- `APP_ACCESS_PASSWORD`, unique and at least 12 characters

Run `npm start`. Production startup applies checked-in migrations and seeds the initial curriculum only when the database has no student or lesson data. The application stores authenticated sessions in PostgreSQL, so restarts and multiple application instances share session state.

Serve the application behind HTTPS. Set `TRUST_PROXY=true` only when the server is behind a trusted reverse proxy that overwrites forwarded headers. Secure session cookies will not work over plain HTTP in production.

- `GET /health` is a liveness check and does not touch dependencies.
- `GET /ready` checks PostgreSQL and returns 503 when it is unavailable.
- SIGTERM and SIGINT trigger graceful HTTP and database shutdown.

Build the production container with:

```bash
docker build -t atticus-tutor .
docker run --rm -p 3000:3000 --env-file .env atticus-tutor
```

Back up PostgreSQL before deployment and treat transcripts, student records, and logs as sensitive educational data. Keep `/health` and `/ready` reachable by the platform, but do not expose the service itself without TLS.
