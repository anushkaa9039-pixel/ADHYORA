# ADHYORA — Learn your way. Rise every day.

Adaptive exam-prep tutor for **any class and any subject**. Class 10 Physics and Mathematics (CBSE) ship with author-written question banks; every other subject (English, Chemistry, History, a college course, anything you type) gets an AI-written syllabus, diagnostic test and practice questions. The interface is the approved 3D-shelf design, extended with a workspace. **No login, sign-in or email anywhere.** Each browser gets an anonymous learner id and keeps its own data.

Stack: React + TypeScript + Tailwind (Vite), a small Node API (Express locally, Vercel Functions when deployed), SQLite (built into Node 22, used in memory per request), Anthropic **or** Google Gemini API (optional).

## Run locally

```bash
npm install
cp .env.example .env        # optional: add ANTHROPIC_API_KEY or GEMINI_API_KEY
npm run dev                 # web http://localhost:5173, api :3001
# production-style: npm run build && npm start   -> http://localhost:3001
npm test                    # engine + full-workflow tests (no network needed)
```
Requires Node 22.13 or newer (`node:sqlite`). Put the key in `.env` next to `package.json`; the server reads `.env` on start, so restart after editing it. Open `http://localhost:3001/api/health` (or `/api/health` on your deployed site) to see whether the backend runs and which AI is active; it never shows the key.

## Deploy on Vercel

1. Push the folder to GitHub and import it in Vercel. `vercel.json` already sets the Vite build and the `api/` functions; Node 22 is requested by `package.json`.
2. **Project Settings -> Environment Variables:** add `ANTHROPIC_API_KEY` *or* `GEMINI_API_KEY` (no quotes, no spaces) for Production (and Preview if you use it).
3. **Redeploy.** Vercel applies new variables only to new deployments, so adding the key without redeploying changes nothing.
4. Open `https://YOUR-SITE/api/health`. You should see `{"ok":true,"ai":true,...}`. If `ai` is false the key is missing in that environment.

**Where the data lives.** Vercel has no disk that survives between requests, so the server stores nothing. The learner's data (answers, scores, syllabus, AI-written tests) is saved in the browser (localStorage) and sent with each request; the server loads it into a temporary in-memory SQLite database, does the work, and sends the changed data back. Consequences: progress is per browser and device, clearing site data erases it, and the Teacher view can only summarise the current learner (a shared class view would need a hosted database).

**Time limit.** AI calls (syllabus, a whole-subject test) can take 20 to 50 seconds. `vercel.json` allows 60 seconds per request and the AI calls give up a few seconds earlier with a clear message. A very large syllabus may need a second press of "Try again": questions that were written are kept.

**AI choice.** `ANTHROPIC_API_KEY` is used if set; otherwise `GEMINI_API_KEY`. Set `AI_PROVIDER=gemini` or `anthropic` to force one. Default models: `claude-sonnet-5-5` and `gemini-2.5-flash` (override with `ANTHROPIC_MODEL` / `GEMINI_MODEL`). Free Gemini keys have low per-minute limits; if you see "busy or over its limit", wait a minute.

## The workflow, and where it lives

| Step | Implementation |
|---|---|
| Diagnostic Test | `server/service.ts` `diagnostic`, one question per concept, 17 total |
| Concept Graph | `server/data.ts` (17 concepts, prerequisite edges) + `src/pages/Model.tsx` SVG graph |
| Learner Model | `server/engine.ts` `updateMastery`: Bayesian knowledge tracing with difficulty-dependent guess/slip, half weight for repeats, reasoning check. Runs on every answer; each answer stores before/after |
| Weakness Detection | `weakList`: mastery < 60%, ranked by how many later topics each blocks; prerequisite tracing to the root cause |
| Adaptive Questions | `chooseTarget` + `difficultyFor` (difficulty 1/2/3 from mastery), misconception follow-ups, optional AI-generated questions |
| Misconception Detection | wrong options carry misconception ids (21 in the library); with an AI key, written reasoning is also analysed |
| Spaced Revision | `schedule` / `forgetRisk`: wrong -> 30 min, right -> 1 day then growing by ease and mastery |
| Teacher Insights | `service.teacher()`: class mastery, gaps (>=40% of learners below 50%), common misconceptions. Reads aggregates only, never chat or reasoning text |

## Any subject, and your own syllabus (new)

| What | How it works |
|---|---|
| Pick any class + subject | `src/Pick.tsx`. Subject chips cover classes 1-12, UG and PG, or type your own. Anything without a built-in bank becomes an AI course (`POST /api/course`) |
| AI syllabus | `generateSyllabus` in `server/ai.ts`: units, topics and prerequisite links (invalid or forward links are dropped so the graph is always acyclic) |
| AI diagnostic | `prepareDiagnostic` in `server/service.ts`: one question per topic, written in parallel batches, each wrong option tagged with its misconception and a fix. Stored per learner, started in the background as soon as the course is created |
| AI practice | Fresh question for the weakest topic at the right difficulty, told to avoid the last few questions |
| Give / trim the syllabus | New **Syllabus** page. Untick topics your board removed (works for built-in subjects too): they leave the test, scores, weakness list, practice and study plan. Or paste / load text: with an AI key it is organised by AI using only your topics; without one it is parsed line by line. Topics with the same name keep their scores |
| Built-in subject + your syllabus | Paste a syllabus on the Syllabus page or at the picker: it creates your own editable course for that subject and leaves the built-in one untouched |

Misconceptions written by the AI are stored in the `dmisc` table, so they show up in the Mistakes page and the teacher view like the built-in ones.

## Honest status

**Latest change (Vercel and AI errors).** The Express + on-disk SQLite design could not run on Vercel (no long-running server, read-only disk), so every `/api` call failed and nothing but a blank page showed. The server is now stateless (`server/handler.ts`, `server/store.ts`, `api/rpc.ts`), AI failures show their real reason on screen (missing key, rejected key, wrong model, quota, timeout), Gemini is supported next to Anthropic, and the "Status of this build" box under How It Works is removed. `npm test` runs 29 tests, including `server/handler.test.ts`, which drives the stateless flow and both AI providers against a mocked AI API. **Not verified here:** `npm install`, `npm run typecheck`, `npm run build`, a real Vercel deploy, and real calls to the Anthropic or Gemini APIs (no network in the build environment). Run `npm install && npm run typecheck && npm run build` once, then click through.

**Latest change (any subject).** See the section above. `npm test` runs 22 tests, including `server/courses.test.ts`, which drives the whole AI flow against a mocked AI API (syllabus, diagnostic, misconception tracking, practice, trimming, own syllabus, reset, no-key behaviour). That test uses a mock: I have not run it against the real Anthropic API. The React pages (picker, Syllabus page, workspace wiring) were written and read through but **not built or clicked through**, because `npm install` was blocked in the build environment. Run `npm install && npm run typecheck && npm run build` first and click through once.

**Latest change (multi-subject).** Each subject has its own concepts, questions, misconceptions, diagnostic, mastery, revision, roadmap and PYQs (`server/data.ts`, `SUBJECTS`). The subject picker and Reset buttons are in the workspace. `npm test` passes 11 tests on the server, including subject isolation and reset.
Not verified: `npm install`, `npm run typecheck`, `npm run build` and any browser click-through (no toolchain or network was available). (Superseded: progress is now stored in the browser, see Deploy on Vercel.) Not yet built: PDF/photo syllabus reading (paste or load text instead), the guided journey (profile -> subject -> syllabus -> diagnostic -> results -> map), progress-aware shelf actions. The Teacher view for an AI course only shows learners of that course (each learner's AI course is private to them).

Built and tested (`npm test`, 10 tests): the whole adaptive loop above, validation, roadmap (daily budget respected, unavailable dates), PYQ entry.

**Not tested in the build environment** (no package install was possible there): `npm install`, the Vite/React build, the Express routes and the Anthropic calls. They were written carefully and cross-checked, but run `npm run typecheck` and click through once.

Not built: PDF/photo syllabus upload and OCR, mock exams, formula tracker, Exam Rescue Mode, phone push notifications (alerts are in-app, plus browser notifications while the page is open), generated images (Study Buddy can draw SVG diagrams), authentication and real role-based access.

Notes:
- The question bank is 51 author-written questions (3 per concept). Without an AI key, practice repeats them at half weight; with a key it generates fresh ones, labelled as AI-generated.
- No past papers are bundled. PYQs are only what the learner enters, labelled "PYQ (entered by you)".
- Without login, the Teacher view is not access-protected. Put it behind your host's access control before real use.
- No mastery data is seeded: a new learner starts empty. The class dashboard shows only real learners.
- Study Buddy chat history lives in the browser only.
