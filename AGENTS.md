# AGENTS.md

This repository is the ICD-10-Platform app. Use this file as the compact project memory for Codex or other coding agents.

## Project Identity

- Project path: `/Users/vivian/Documents/Codex/2026-05-03/https-github-com-peterwei078-icd-10`
- GitHub repo: `https://github.com/PeterWei078/ICD-10-Platform.git`
- Entry: `index.html` → `src/main.jsx`; app code in `src/`
- App type: React 18 + Vite 8 build, Tailwind 3 (PostCSS), lucide-react; offline PWA via `src/sw.js`.
- `npm install`, then `npm run dev` / `npm run build` / `npm run preview`. Vercel builds `dist/` (see `vercel.json`).

Do not mix this repo with `Clinic-Code-Search-Platform` unless the user explicitly asks.

## User Workflow Preference

Unless the user explicitly says "do not push", "暫不推送", or "只改本機":

1. Edit the app.
2. Run `npm run validate` and `npm run build`.
3. `git add`
4. `git commit`
5. `git push origin main`

Vercel is expected to redeploy automatically if it is connected to GitHub `main`.

## Current App Features

- Interactive ICD-10-CM coding assistant for internal medicine and common clinical problems.
- Live search suggestions while typing in the clinical text box.
- Suggestion click inserts `ICD code + diagnosis name`.
- Coding analysis searches across `keywords`, `code`, and `standard`.
- Analysis supports multiple matches within the same text segment.
- ICD codes with decimal points, such as `E03.9`, are protected from being split incorrectly.
- React + Vite project (`npm run dev` / `npm run build` / `npm run preview`); Vercel builds `dist/`. App code in `src/` (`App.jsx`, `coding.js`, `sync.js`), offline Service Worker template `src/sw.js`.
- Built-in data lives in `src/data/icd10-data.js` (ES module default export `{ version, deprecatedIds, entries, commonCodes, bundles }`); `App.jsx` exposes `entries` as `INITIAL_DATABASE`.
- localStorage initialization keeps only custom/edited or non-built-in entries and takes all other built-ins fresh from `entries`, so built-in updates reach returning users.
- Negation/uncertainty/history detection, 常用快選 / 常見組合 panel, and link/QR device sync (`#rules=`). See CLAUDE.md for details.

## Data Model

Entries in `src/data/icd10-data.js` → `entries` use:

```js
{
  id: "R07.9",
  code: "R07.9",
  standard: "Chest pain, unspecified",
  keywords: ["CHEST PAIN", "胸痛"],
  type: "exact" | "broad" | "context",
  organ: "Respiratory" | "Cardiovascular" | "Renal" | "Digestive" | "Endocrine" | "Neurological" | "Surgical" | "Infectious" | "Other",
  note: ""
}
```

Keep `id` unique. Usually `id` should equal `code`, unless there is a special non-code helper record.

## Validation

After editing data, run `npm run validate` (expects no duplicate ids, no malformed entries, no missing quick-pick/bundle refs), then `npm run build`.

Expected:

- `duplicateIds: []`
- `bad: 0`

## ICD-10-CM Source Checking

Use the local official 2026 ICD-10-CM description file when checking new codes:

`/private/tmp/icd10cm-2026-apr/Code Descriptions/icd10cm_codes_2026.txt`

If this file is missing, download the current official CMS/CDC ICD-10-CM code description file before adding many new codes.

For code lookup against the local file:

```bash
node -e "const fs=require('fs'); const lines=fs.readFileSync('/private/tmp/icd10cm-2026-apr/Code Descriptions/icd10cm_codes_2026.txt','utf8').split(/\\r?\\n/); const code='R079'; console.log(lines.find(l=>l.startsWith(code))||'NOT FOUND');"
```

## Testing

```bash
npm run build && npm run preview   # http://localhost:4173 (Service Worker active)
# or: npm run dev                  # http://localhost:5173 (no Service Worker)
```

Stop the server after testing. Clean temporary browser test files such as `.playwright-mcp/` before committing.

## Important Recent Commits

- `5e0ca9f` Add live ICD search and surgical codes
- `b3808cf` Add progressive fibrotic ILD code
- `e4502a9` Add common symptom ICD codes

## Recently Added Scope

- Internal medicine common ICD-10-CM codes.
- Cardiovascular, renal, endocrine/metabolic, digestive, infectious, respiratory, hematology/other additions.
- Surgical/Orthopedic category and common orthopedic/general surgical codes.
- `J84.170` progressive fibrotic ILD with keywords: `PF-ILD`, `PPF`, `PROGRESSIVE FIBROTIC ILD`, `PROGRESSIVE PULMONARY FIBROSIS`, `慢性漸進性纖維化間質性肺病`.
- Common symptoms including chest pain, nausea, vomiting, diarrhea, dizziness, SOB, abdominal pain, cough, wheezing, hypoxemia, sore throat, heartburn, dysphagia, bloating, fever, chills, weakness, fatigue, syncope, altered mental status, urinary symptoms, rash, itching, joint pain, ear symptoms, visual changes, anosmia, and taste disturbance.
