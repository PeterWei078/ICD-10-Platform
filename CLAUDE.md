# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

An interactive ICD-10-CM coding assistant platform for internal medicine (內科醫學編碼互動式平台). It helps medical coders look up and apply ICD-10-CM codes from clinical text input.

GitHub repo: `https://github.com/PeterWei078/ICD-10-Platform.git`

## Running the App

This is a **zero-build, single-file** web application. Open `index.html` directly in any modern browser — no npm install, no server, no build step required.

For browser automation or when `file://` access is restricted:

```bash
python3 -m http.server 4173
# then open http://127.0.0.1:4173/index.html
```

Stop the server after testing. Remove `.playwright-mcp/` before committing.

## Deployment

Vercel is connected to the GitHub `main` branch and redeploys automatically on push. The default workflow after any edit is: edit → validate → `git add` → `git commit` → `git push origin main`. Only skip the push if the user says "do not push", "暫不推送", or "只改本機".

## Architecture

The entire application lives in one file: `index.html` (~1744 lines). It uses CDN-loaded libraries:
- **React 18** (UMD build via unpkg) + **Babel standalone** (for in-browser JSX transpilation)
- **Tailwind CSS** (CDN, with custom `fadeInUp` animation config)
- **Lucide icons** (via `lucide.icons` / `lucide.createElement()` — the library's `.toSvg()` method was removed in newer versions, so a custom `IconWrapper` component wraps the DOM API)

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

### Core Constants (inline in `<script type="text/babel">`)

| Constant | Line | Purpose |
|---|---|---|
| `ORGAN_CATEGORIES` | ~176 | System categories with Tailwind color classes |
| `INITIAL_DATABASE` | ~190 | ~250+ built-in ICD-10 entries |
| `DEPRECATED_BUILT_IN_IDS` | ~740 | Set of old entry IDs removed from INITIAL_DATABASE; excluded during localStorage merge to prevent stale entries from persisting |
| `IGNORE_LIST` | ~733 | Medications/non-diagnosis terms filtered before matching |
| `App` component | ~746 | Entire app state and UI |
| `liveSuggestions` | ~968 | useMemo for live search dropdown |
| `performCoding` | ~1070 | Main coding analysis function |

### State & Persistence

- `database` state initializes by **merging**: saved localStorage entries that are either `isCustom` or not in `DEPRECATED_BUILT_IN_IDS`, prepended to the full `INITIAL_DATABASE`. Deduplication by `id` (first-seen wins) ensures built-in updates reach returning users while preserving custom rules.
- A `useEffect` auto-saves `database` to `localStorage` on every change (key: `icd10_custom_db`)

### Live Search

`liveSuggestions` (`useMemo`, ~line 968) computes suggestions from the word under the cursor as the user types. Short (2–3 char) English queries use `\b`-anchored prefix matching to avoid false positives (e.g., "DM" won't match "ADM"). Clicking a suggestion inserts `ICD code + standard name` at the cursor.

### Coding Algorithm (`performCoding`, ~line 1070)

1. Protect ICD decimal codes (e.g., `E03.9`) from being split by replacing `.` with `§` before splitting, then restoring
2. Split input text on `[\n,;，、。/:().?]+`
3. Filter segments against `IGNORE_LIST` (short terms ≤4 chars use `\b` word-boundary; longer terms use `includes`)
4. For each segment, score each database entry's `code`, `standard`, and `keywords`:
   - English terms: `\b...\b` regex (case-insensitive via `.toUpperCase()`)
   - Chinese terms: `String.includes()`
   - Score = keyword length; +100 bonus if segment exactly equals keyword
5. Collect **all** matches per segment (not just highest); skip codes already used

### UI Tabs

- **`coding` tab** — paste clinical text, live suggestions while typing, click Analyze, view results with copy/code display
- **`database` tab** — view/filter/sort all rules, add/edit/delete entries, import/export JSON, smart reset

### Smart Reset

Preserves user-added rules (`isCustom: true` or `id` not in `INITIAL_DATABASE`) while restoring all built-in entries to their default state.

## Adding New ICD-10 Entries

Add entries directly to the `INITIAL_DATABASE` array in `index.html`. Rules:
- `id` must be unique and conventionally equals `code`
- English `keywords` in UPPERCASE; Chinese keywords in natural case
- `organ` must match one of the `ORGAN_CATEGORIES` `value` fields
- Verify codes against the local 2026 ICD-10-CM source (see Validation below)

If an old entry's `id` has been replaced (e.g., code updated), add the old `id` to `DEPRECATED_BUILT_IN_IDS` to prevent it from re-appearing for returning users.

## Validation

After editing `index.html`, run this parse check to catch duplicate IDs and malformed entries:

```bash
node -e "const fs=require('fs'); const s=fs.readFileSync('index.html','utf8'); const arr=Function('return '+s.match(/const INITIAL_DATABASE = (\[[\s\S]*?\n\s*\]);/)[1])(); const ids=arr.map(x=>x.id); const dup=[...new Set(ids.filter((id,i)=>ids.indexOf(id)!==i))]; const bad=arr.filter(x=>!x.id||!x.code||!x.standard||!Array.isArray(x.keywords)||!x.organ); console.log(JSON.stringify({total:arr.length, duplicateIds:dup, bad:bad.length}, null, 2));"
```

Expected: `duplicateIds: []`, `bad: 0`.

### ICD-10-CM Source Checking

Verify new codes against the official 2026 ICD-10-CM description file at:

`/private/tmp/icd10cm-2026-apr/Code Descriptions/icd10cm_codes_2026.txt`

Quick lookup (replace `R079` with the code without the decimal):

```bash
node -e "const fs=require('fs'); const lines=fs.readFileSync('/private/tmp/icd10cm-2026-apr/Code Descriptions/icd10cm_codes_2026.txt','utf8').split(/\r?\n/); const code='R079'; console.log(lines.find(l=>l.startsWith(code))||'NOT FOUND');"
```

If the file is missing, download the current CMS/CDC ICD-10-CM code descriptions before adding many new codes.

Expected console warnings (Tailwind CDN, Babel standalone, favicon 404) are acceptable and non-blocking.
