# Smarticus

A private learning studio for Atticus, built with React, Express, PostgreSQL/Prisma, and the OpenAI Realtime API.

## Learning experience

- **My day:** a daily learning path using the real schedule, with available curriculum dates when today has no lessons.
- **My subjects:** searchable, filterable subject cards that open the lesson studio.
- **Lesson studio:** a quiet, five-part journey through Understand, Explore, Practice, Words, and Reflect. Instructions appear one idea at a time; worked examples unfold through prediction, reasoning, and result. Practice shows one assigned question at a time with a question map and protected guidance.
- **Explore:** lesson-aware models for percents, ratios, fractions, light and color, light and materials, French sentences, algorithms, and test accuracy. Evidence bridges and connection maps help students explain relationships using the actual lesson. Model feedback is separate from assigned-question grading.
- **Remember and reflect:** recall-before-reveal word cards, teach-back prompts, real-world transfer, and self-assessment. Learning journals save locally without pretending that a filled field proves mastery.
- **Discovery lab:** interactive light-reflection and equivalent-fraction experiments that work without a voice connection.
- **My progress:** recent recorded skills and tutor sessions, with no simulated scores or streaks.
- **Virgil:** optional voice chat with explicit microphone controls, streamed words, a readable transcript, and recoverable session-save errors. His avatar responds to the remote audio's actual energy and pauses; it never uses the learner's microphone to simulate his speech. WebRTC playback events keep the speaking state active until output drains. The tutor receives the selected question or live model context, and an explicit discussion action can share the learner's current draft or observation. The voice SDK loads only when voice setup is opened.

The selected learning date and section are preserved in the URL. Practice answers stay on the current device using the existing `virgil-response` storage keys, so answers saved before the redesign remain available. Scratchpad notes stay in the current browser tab. Drafts are not submitted, graded, or synced. The lesson completion button and existing tutor tools record completion; mastery remains a separate learning record. On long voice sessions, the saved transcript keeps the most recent conversation that fits within the server's request limit.

The redesigned studio preserves the current repository’s selected-lesson synchronization, question lookup and web-search tools, protected guidance, and confidence-aware wake-word and goodbye-to-standby behavior. Available learning dates include checked-in curriculum that will be ingested on demand.

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

The browser app runs at `http://localhost:5173`; Vite proxies API requests to port 3000. Set `OPENAI_API_KEY` to enable live voice sessions. Local development bypasses the access-password screen when `APP_ACCESS_PASSWORD` is empty. `db:setup` creates the configured database when needed, applies the checked-in migrations, and seeds the curriculum; it also works on Windows ARM64 where Prisma's native schema engine is unavailable.

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

On Windows with Edge installed, `PLAYWRIGHT_CHANNEL=msedge` selects Edge instead of downloaded Chromium (PowerShell: `$env:PLAYWRIGHT_CHANNEL='msedge'`). Checks cover every curriculum day's lesson sections, model interactions, draft persistence, phone layouts, reduced motion, and avatar response to a real Web Audio MediaStream. A neutral local speech-synthesis recording exercises sentence pauses; it contains no learner audio. The avatar follows audio energy, not phoneme or word timestamps; streamed transcript text is not presented as word-aligned karaoke.

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
