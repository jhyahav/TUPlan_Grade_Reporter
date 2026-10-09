# TUPlan Grade Reporter

A browser extension for TU Darmstadt's TUCaN that does two things:

- **Reports grade distributions.** On a course's *Notenspiegel* (or *Grade
  statistics*, if TUCaN is set to English) it adds a button. Pressing it sends
  that cohort-level histogram to [TUPlan](https://www.tuplan.courses), where it
  joins the course's grade history.
- **Shows them back.** Beside every course link on a TUCaN page that TUPlan has
  grade data for, it draws a badge with the average; hovering it shows the
  histogram and every semester on record.

TUPlan is an unofficial, student-built project and is not affiliated with TU
Darmstadt.

Install it from [addons.mozilla.org](https://addons.mozilla.org/firefox/addon/tuplan-grade-reporter/)
or the [Chrome Web Store](https://chromewebstore.google.com/search/TUPlan%20Grade%20Reporter).

## What leaves your browser

**A report, and only when you press the button.** It contains the course number,
title and semester, the count for each grade, the average, the number of results,
and the absence counts — the table TUCaN shows every enrolled student. Not your
name, not your matriculation number, not your own grade. The extractor that reads
the page is [`apps/extension/src/extract.ts`](apps/extension/src/extract.ts), a pure
function over the page's `Document`, and the request that sends it is the single
`fetch` in [`apps/extension/src/report.ts`](apps/extension/src/report.ts).

**One download, for the badges.** On page load the extension fetches
`https://www.tuplan.courses/api/grades/digest`: every grade distribution TUPlan
holds, in one response that is identical for everybody. The request names no
course, so which courses you are looking at never leaves the browser — matching
happens locally ([`digest.ts`](apps/extension/src/digest.ts),
[`courses.ts`](apps/extension/src/courses.ts),
[`overlay.ts`](apps/extension/src/overlay.ts)). It carries no cookies, and the
browser caches it for an hour.

That is everything. There is one content script, injected only into
`https://www.tucan.tu-darmstadt.de/*`. No background script, no storage, no
`permissions` or `host_permissions`.

Privacy policy: [English](https://www.tuplan.courses/en/privacy) ·
[Deutsch](https://www.tuplan.courses/de/privacy)

## Building

Node.js 20.11 or newer, npm 10 or newer.

```sh
npm ci
npm run build            # Chrome  → apps/extension/dist/
npm run build:firefox    # Firefox → apps/extension/dist-firefox/
```

Load `apps/extension/dist` in Chrome via *chrome://extensions → Developer mode →
Load unpacked*, or `apps/extension/dist-firefox/manifest.json` in Firefox via
*about:debugging → This Firefox → Load Temporary Add-on*.

Two values are inlined at build time, from the environment or from a `.env` at the
repository root:

| Variable | Default | Store builds |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:3000` | `https://www.tuplan.courses` |
| `VITE_GRADE_REPORT_API_KEY` | empty | set |

Use the `www` form of the URL. The bare domain redirects to it, and the redirect
carries no CORS headers, so every request from an extension built against it is
blocked.

The key is not a secret — it ships inside every published copy of the extension,
and the server uses it only to turn away trivially scripted spam
([`config.ts`](apps/extension/src/config.ts)). A build without it shows badges
normally; its reports are refused.

### Reading an installed copy

The published bundle is not minified, so the code your browser runs is readable as
it stands: open `content-script.js` in the installed extension's directory. Both
inlined values appear in it as plain string literals.

## Layout

```
apps/extension/
  src/content-script.ts   entry point: the report button, and the badge overlay
  src/extract.ts          reads the grade table off the page
  src/report.ts           sends it
  src/courses.ts          finds course links on any TUCaN page
  src/digest.ts           downloads the grade digest
  src/overlay.ts          draws the badges and the hover panel
  scripts/manifest.mjs    the manifest for both browsers, generated at build time
  scripts/build.mjs       runs the build for a given browser
packages/shared-types/    types, schemas and grade maths shared with the TUPlan website
```

The server validates every report with the same schema the extension builds it
from — that is what `packages/shared-types` is. Only the modules the extension uses
are published here.

## About this repository

This is a mirror. TUPlan is developed in a private monorepo that also holds the
website, its database and the catalogue scraper; this repository is updated from it
automatically, with what is needed to build the extension. Bug reports
and questions are welcome as issues. A pull request cannot be merged here directly,
because the next sync would overwrite it.

## License

[MIT](LICENSE)
