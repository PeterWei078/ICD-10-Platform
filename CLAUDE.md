# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

An interactive ICD-10-CM coding assistant platform for internal medicine (內科醫學編碼互動式平台). It helps medical coders look up and apply ICD-10-CM codes from clinical text input.

GitHub repo: `https://github.com/PeterWei078/ICD-10-Platform.git`

## Running the App

React + Vite project (Node ≥ 20.19). `index.html` can **not** be opened via `file://` any more.

```bash
npm install          # first time
npm run dev          # dev server with HMR (no Service Worker in dev)
npm run build        # production build → dist/ (also emits dist/sw.js)
npm run preview      # serve dist/ at http://localhost:4173 (Service Worker active)
npm run validate     # data checks (see Validation)
```

Stop servers after testing. Remove `.playwright-mcp/` before committing. `node_modules/` and `dist/` are git-ignored.

## Deployment

Vercel is connected to the GitHub `main` branch and redeploys automatically on push. `vercel.json` pins the build: `npm ci` → `npm run build` → serve `dist/`, with `Cache-Control: no-cache` on `/sw.js` and immutable caching on `/assets/*`. The default workflow after any edit is: edit → `npm run validate` + `npm run build` → `git add` → `git commit` → `git push origin main`. Only skip the push if the user says "do not push", "暫不推送", or "只改本機".

## Architecture

```
index.html              Vite entry (meta / manifest / icons, loads src/main.jsx)
src/main.jsx            React root + Service Worker registration (production only)
src/App.jsx             App component: state, UI, live search, sync panel, quick-pick
src/coding.js           Coding engine: IGNORE_LIST, qualifier detection, analyzeText()
src/sync.js             Rule sync encode/decode (#rules=) + QR SVG
src/data/icd10-data.js  Built-in data (ES module, default export) — bump `version` on change
src/sw.js               Service Worker template (filled in at build time)
src/index.css           Tailwind directives + scrollbar styles
public/                 manifest.json, icons/ (copied to dist as-is)
scripts/validate-data.js  Data validation (npm run validate)
vite.config.js          Vite + React plugin + `icd10-service-worker` plugin (emits dist/sw.js)
```

Dependencies are pinned exactly in `package.json` (never use `latest`): React 18.3.1, lucide-react 1.60.0, qrcode-generator 1.4.4, Vite 8.3.5, @vitejs/plugin-react 6.1.2, Tailwind CSS 3.4.17 (PostCSS build, purged — keep class names as full literal strings so the content scan finds them).

### Offline / Service Worker

`vite.config.js` → `serviceWorkerPlugin` runs at build time: it lists every emitted file plus everything in `public/`, injects that list and a new `BUILD_ID` into `src/sw.js`, and emits `dist/sw.js`. The SW precaches all of it on install (`skipWaiting` + `clients.claim`), deletes older `icd10-*` caches on activate, serves navigations **network-first** (3 s timeout → cached `/index.html`) and other same-origin GETs **cache-first**. Every deploy changes `BUILD_ID`, so clients pick up the new version on next launch while online. The header shows 「離線模式」 when `navigator.onLine` is false.

### Key Data Structures

Every database entry has this shape:
```js
{
  id: "E10.9",            // unique — used as React key and edit target
  code: "E10.9",          // ICD-10-CM code
  standard: "...",         // English standard diagnosis name
  keywords: ["T1DM", "第一型糖尿病", ...], // matching terms — English in UPPERCASE, Chinese natural case
  type: "exact"|"broad"|"context",
  organ: "Endocrine"|"Cardiovascular"|..., // must match an ORGAN_CATEGORIES value
  note: "",               // optional coding guidance
  isCustom: true          // present only on user-added rules
}
```

`type` meanings:
- `exact` — code is specific and complete as-is
- `broad` — unspecified code; note usually suggests a more precise alternative
- `context` — requires additional codes (e.g., underlying disease must be coded first)

### Core Constants

In `src/data/icd10-data.js`:

| Field | Purpose |
|---|---|
| `entries` | Built-in ICD-10 entries (exposed in app as `INITIAL_DATABASE`) |
| `deprecatedIds` | Old built-in ids removed from `entries` (app: `DEPRECATED_BUILT_IN_IDS`); excluded during localStorage merge |
| `commonCodes` | 常用快選 groups `{ group: <organ value>, items: [{ code, label }] }` (app: `COMMON_CODE_GROUPS`) |
| `bundles` | 常見組合 `{ id, name, codes: [...], note }` (app: `CODE_BUNDLES`) |

Every code referenced by `commonCodes` / `bundles` must exist in `entries` (the validation command checks this).

`src/App.jsx`: `ORGAN_CATEGORIES`, `App` (`liveSuggestions`, `performCoding` → `analyzeText`, `addCodesToResults`, `startLinkImport`). `src/coding.js`: `IGNORE_LIST`, `QUALIFIER_TRIGGERS` / `detectQualifier`, `analyzeText`. `src/sync.js`: `encodeRulesPayload`, `decodeRulesPayload`, `makeQrSvg`. Search by name — line numbers drift.

### State & Persistence

- `database` state initializes by **merging**: saved localStorage entries that are either `isCustom` (user-added or user-edited) or not a current built-in id and not in `DEPRECATED_BUILT_IN_IDS`, prepended to the full `INITIAL_DATABASE`. Unedited built-ins are always taken fresh from `INITIAL_DATABASE`. Deduplication by `id` (first-seen wins) ensures built-in updates reach returning users while preserving custom rules.
- A `useEffect` auto-saves `database` to `localStorage` on every change (key: `icd10_custom_db`). Quick-pick panel open state: `icd10_quickpick_open`

### Device Sync (同步)

User rules (`isCustom` or id not built-in) are JSON-encoded, compressed with `CompressionStream('deflate-raw')`, base64url'd and put in the URL hash: `#rules=z.<data>` (`j.` = uncompressed fallback). The hash never reaches the server. Opening such a URL (or pasting it into the sync panel's 「貼上同步連結」 field) asks to **merge** — imported ids replace existing ones, nothing else is deleted. QR is only rendered for links ≤1200 chars. iOS home-screen apps have storage separate from Safari, hence the paste field.

### Live Search

`liveSuggestions` (`useMemo`) computes suggestions from the segment under the cursor (`getActiveSearchInfo`). Short (2–3 char) English queries use `\b`-anchored prefix matching to avoid false positives (e.g., "DM" won't match "ADM"). Chinese queries are supported; inside a run-on Chinese sentence (e.g. 「病人有糖尿病」) a contained keyword matches and only that part is replaced. A leading qualifier (`r/o`, `s/p`, `No`, `疑似`, `否認`…) is excluded from the query and kept on insertion. Clicking a suggestion inserts `ICD code + standard name`.

### Coding Algorithm (`analyzeText` in `src/coding.js`)

1. Protect ICD decimal codes (`E03.9` → `§`) and slash abbreviations (`R/O`, `S/P`, `H/O`, `W/O` → `¤`) before splitting, then restore
2. Split input text on `[\n,;，、。/:().?]+`
3. **Mask** `IGNORE_LIST` terms (word-boundary) with same-length `#` — the segment is no longer dropped, so "DM on insulin" still codes DM. Keywords that themselves contain an ignore term (e.g. `INSULIN USE`) match against the unmasked text
4. For each segment, score each database entry's `code`, `standard`, and `keywords`:
   - English terms: `\b...\b` regex (case-insensitive via `.toUpperCase()`)
   - Chinese terms: `String.indexOf()`
   - Score = keyword length; +100 bonus if segment exactly equals keyword
5. `detectQualifier` (NegEx-lite, `QUALIFIER_TRIGGERS`) tags each match `negated` / `uncertain` / `history` based on the nearest trigger before it (or after it for 病史/術後), stopped by `QUALIFIER_TERMINATORS` (but/但). Triggers inside the matched keyword itself are ignored. Status Z codes (`Z79`, `Z8x`, `Z9x`) are never tagged `history`
6. Collect **all** matches per segment; dedupe by code with priority confirmed > uncertain/history > negated
7. UI shows confirmed results (copied), a 「需確認」 section (uncertain/history, not copied) and a collapsed 「已略過：否定語意」 list; each flagged item has 「改為確定」

### UI Tabs

- **`coding` tab** — paste clinical text, live suggestions while typing, click Analyze, view results (copy / remove single result); 常用快選 + 常見組合 panel below the input adds codes directly to results
- **`database` tab** — search (code/name/keyword/note) + organ filter, sort all rules, add/edit/delete entries, 同步 (link/QR), import/export JSON, smart reset

### Smart Reset

Preserves user-added rules (`isCustom: true` or `id` not in `INITIAL_DATABASE`) while restoring all built-in entries to their default state.

## Adding New ICD-10 Entries

Add entries to the `entries` array in `src/data/icd10-data.js` (and bump `version`). Rules:
- `id` must be unique and conventionally equals `code`
- English `keywords` in UPPERCASE; Chinese keywords in natural case
- `organ` must match one of the `ORGAN_CATEGORIES` `value` fields
- Verify codes against the local 2026 ICD-10-CM source (see Validation below)

If an old entry's `id` has been replaced (e.g., code updated), add the old `id` to `deprecatedIds` to prevent it from re-appearing for returning users.

## Validation

After editing data, run (exits non-zero on duplicate ids, malformed entries, or quick-pick/bundle codes missing from `entries`):

```bash
npm run validate
```

Then `npm run build` to make sure the app still compiles.

Expected: `duplicateIds: []`, `bad: []`, `missingRefs: []`.

### ICD-10-CM Source Checking

Verify new codes against the official 2026 ICD-10-CM description file at:

`/private/tmp/icd10cm-2026-apr/Code Descriptions/icd10cm_codes_2026.txt`

Quick lookup (replace `R079` with the code without the decimal):

```bash
node -e "const fs=require('fs'); const lines=fs.readFileSync('/private/tmp/icd10cm-2026-apr/Code Descriptions/icd10cm_codes_2026.txt','utf8').split(/\r?\n/); const code='R079'; console.log(lines.find(l=>l.startsWith(code))||'NOT FOUND');"
```

If the file is missing, download the current CMS/CDC ICD-10-CM code descriptions before adding many new codes.

The ICD-10 Codes MCP tool (`validate_code` / `lookup_code`) is an alternative when the local file is missing.
