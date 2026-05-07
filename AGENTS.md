# AGENTS.md

This repository is the ICD-10-Platform app. Use this file as the compact project memory for Codex or other coding agents.

## Project Identity

- Project path: `/Users/vivian/Documents/Codex/2026-05-03/https-github-com-peterwei078-icd-10`
- GitHub repo: `https://github.com/PeterWei078/ICD-10-Platform.git`
- Main file: `index.html`
- App type: zero-build, single-file static React app.
- Runtime: React 18 UMD, Babel standalone, Tailwind CDN, Lucide icons.
- No npm install, no build command, no server required for normal use.

Do not mix this repo with `Clinic-Code-Search-Platform` unless the user explicitly asks.

## User Workflow Preference

Unless the user explicitly says "do not push", "暫不推送", or "只改本機":

1. Edit the app.
2. Run basic validation.
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
- localStorage initialization merges old browser data with the latest built-in `INITIAL_DATABASE`, so newly added built-in codes appear even for returning users.

## Data Model

Entries in `INITIAL_DATABASE` use:

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

After editing `index.html`, run a quick parse check:

```bash
node -e "const fs=require('fs'); const s=fs.readFileSync('index.html','utf8'); const arr=Function('return '+s.match(/const INITIAL_DATABASE = (\\[[\\s\\S]*?\\n\\s*\\]);/)[1])(); const ids=arr.map(x=>x.id); const dup=[...new Set(ids.filter((id,i)=>ids.indexOf(id)!==i))]; const bad=arr.filter(x=>!x.id||!x.code||!x.standard||!Array.isArray(x.keywords)||!x.organ); console.log(JSON.stringify({total:arr.length, duplicateIds:dup, bad:bad.length}, null, 2));"
```

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

The app can run directly as `file://.../index.html`. If browser automation cannot open `file://`, run:

```bash
python3 -m http.server 4173
```

Then test:

`http://127.0.0.1:4173/index.html`

Stop the server after testing. Clean temporary browser test files such as `.playwright-mcp/` before committing.

Expected console warnings from Tailwind CDN and Babel standalone are acceptable for this zero-build app. A favicon 404 is non-blocking.

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
