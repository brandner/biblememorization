# Bible Memorization

A lightweight, serverless web app for memorizing scripture using a guided 7-day method and long-term spaced repetition — built with Vanilla TypeScript, Vite, and Cloudflare Pages.

---

## Features

- **Guided 7-Day Practice** — Each day surfaces a named method (Familiarization, Partial Recall, Advanced Recall, Full Recall) with step-by-step prompts to walk through.
- **Spaced Repetition Reviews** — After completing a verse, the app schedules reviews at progressively longer intervals (daily → weekly → monthly) based on the Ebbinghaus forgetting curve.
- **ESV & WEB Translations** — Fetches verses from the ESV API with automatic fallback to the WEB translation. Preference is saved in your profile.
- **Cloud Sync via UID** — Progress is stored in Cloudflare KV and tied to a unique user ID, so it syncs across devices when you share your UID.
- **User Profiles** — Set a display name, pick a translation preference, and copy your sync ID. Includes a hard-reset "Danger Zone."
- **Progress View** — See your active verse alongside a ledger of every verse you've memorized.
- **No accounts, no tracking** — Completely anonymous by design.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla TypeScript + Vite |
| Hosting | Cloudflare Pages |
| API / Backend | Cloudflare Pages Functions |
| Storage | Cloudflare KV |
| Bible Text | ESV API → WEB fallback (api.bible) |
| Tests | Vitest |

---

## Getting Started

### Prerequisites
- Node.js 18+
- A [Cloudflare account](https://dash.cloudflare.com) with Pages and KV set up
- An [ESV API key](https://api.esv.org/) (optional — WEB translation works without one)

### Install

```bash
npm install
```

### Local Dev

```bash
npm run dev
```

Runs Vite on `http://localhost:5173`. Note: the ESV API requires a key — create a `.dev.vars` file for local use:

```
ESV_API_KEY=your_key_here
```

> `.dev.vars` is git-ignored and should **never** be committed.

### Preview (with Cloudflare Functions)

```bash
npm run preview
```

Builds the app and runs it through `wrangler pages dev` to simulate the full Cloudflare environment locally.

### Tests

```bash
npx vitest run
```

---

## Deployment

This app is designed to deploy on **Cloudflare Pages**.

1. Push to GitHub.
2. Connect the repo in the Cloudflare Pages dashboard.
3. Set build command: `npm run build` and output directory: `dist`.
4. Add your `ESV_API_KEY` as an environment variable (secret) in the Pages dashboard.
5. Bind your KV namespace (`USER_DATA`) in the Pages settings.

See [`docs/cloudflare_deployment_steps.md`](docs/cloudflare_deployment_steps.md) for the full step-by-step.

---

## Project Structure

```
├── functions/
│   └── api/
│       ├── bible.ts      # Verse fetch (ESV → WEB fallback)
│       └── data.ts       # KV read/write for user state
├── src/
│   ├── main.ts           # App logic & view rendering
│   ├── style.css         # All styles
│   └── utils/
│       ├── memorization.ts  # 7-day cycle, spaced repetition logic
│       └── storage.ts       # AppState / VerseState types
├── test/
│   └── memorization.test.ts
├── index.html            # Single-page shell with all views
└── wrangler.toml         # Cloudflare Pages config
```

---

## The Method

The 7-day practice cycle is grounded in spaced repetition and active recall research. See [`docs/background.md`](docs/background.md) for the full methodology and recommended passages.

Long-term retention follows the schedule:
- **< 30 days** since memorization → review daily
- **30–365 days** → review weekly
- **> 1 year** → review monthly

---

## Roadmap

- **Voice Verification** — Use Cloudflare Workers AI (`@cf/openai/whisper`) to transcribe the user speaking a verse and score it against the target text. See [`docs/roadmap.md`](docs/roadmap.md).

---

## Scripture Copyright

Scripture quotations marked **ESV** are from the ESV® Bible (The Holy Bible, English Standard Version®), copyright © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved.

Scripture quotations marked **WEB** are from the World English Bible, which is in the public domain.

This app retrieves verse text at runtime via the [ESV API](https://api.esv.org/) and the [API.Bible](https://scripture.api.bible/) service. No scripture text is bundled or redistributed with this software.

---

## License

Personal project — not licensed for redistribution.
