# 2026–27 Curriculum Source of Truth

This directory is the canonical academic source for Atticus Tutor / Virgil.

## Structure
- `daily/YYYY-MM-DD.json` — authoritative assigned lessons for a school day. These files may contain protected answers for server-side grading/support.
- `reference/00-master/` — school-wide curriculum, teacher behavior, history, and retrieval rules.
- `reference/01-subjects/` — full Grade 6 course sequence plus current teaching guidance/rubrics.
- `reference/02-feedback/` — teacher-reviewed, student-safe feedback that should influence future lessons.
- `reference/vector-manifest.json` — metadata controlling reference-file vector ingestion.

## Ingestion
Run:

```bash
npm run ingest:curriculum
```

The ingestion pipeline:
1. validates daily JSON against the lesson schema;
2. upserts lesson/assignment structure into Postgres;
3. creates a student-safe copy for vector ingestion with protected answer fields removed;
4. ingests reference Markdown with file attributes from the manifest;
5. uses checksums to skip unchanged files;
6. replaces stale vector attachments when a source file changes.

## Academic priority
Current daily lesson > current teacher feedback/mastery > subject syllabus/reference > historical academic baseline.

## Answer integrity
Never manually upload the raw `daily/*.json` files to a student-searchable vector store. They contain protected answer data for server-side use. Let the ingestion code create the sanitized vector copy.

## Daily teacher workflow
After work is reviewed:
1. create/update subject feedback in `reference/02-feedback/` when the observation is likely to matter beyond one moment;
2. update structured mastery/feedback state through the database/seed or tutor tools as appropriate;
3. create the next day's validated JSON;
4. run curriculum ingestion;
5. the Realtime session builder automatically retrieves matching subject context for the current lesson.

## Pacing rule
Grade 6 by default. Mastery first, acceleration second.
