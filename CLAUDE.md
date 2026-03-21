# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

An interactive ICD-10-CM coding assistant platform for internal medicine (內科醫學編碼互動式平台). It helps medical coders look up and apply ICD-10-CM codes from clinical text input.

## Running the App

This is a **zero-build, single-file** web application. Open `index.html` directly in any modern browser — no npm install, no server, no build step required.

## Architecture

The entire application lives in one file: `index.html`. It uses CDN-loaded libraries:
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
  keywords: ["T1DM", "第一型糖尿病", ...], // matching terms (English or Chinese)
  type: "exact"|"broad"|"context",
  organ: "Endocrine"|"Cardiovascular"|..., // one of ORGAN_CATEGORIES values
  note: "",               // optional coding guidance
  isCustom: true          // present only on user-added rules
}
```

`type` meanings:
- `exact` — code is specific and complete as-is
- `broad` — unspecified code; note usually suggests a more precise alternative
- `context` — requires additional codes (e.g., underlying disease must be coded first)

### Core Constants (inline in `<script type="text/babel">`)

| Constant | Location | Purpose |
|---|---|---|
| `INITIAL_DATABASE` | ~line 189 | ~250 built-in ICD-10 entries |
| `IGNORE_LIST` | ~line 441 | Medications/non-diagnosis terms filtered before matching |
| `ORGAN_CATEGORIES` | ~line 176 | System categories with Tailwind color classes |

### State & Persistence

- `database` state initializes from `localStorage.getItem('icd10_custom_db')`, falling back to `INITIAL_DATABASE`
- A `useEffect` auto-saves `database` to `localStorage` on every change (key: `icd10_custom_db`)
- Deduplication by `id` is enforced on load and during import/reset

### Coding Algorithm (`performCoding`, ~line 673)

1. Split input text on `[\n,;，、。/:().?]+`
2. Filter segments against `IGNORE_LIST` (short terms ≤4 chars use `\b` word-boundary; longer terms use `includes`)
3. For each segment, score each database entry's keywords:
   - English keywords: `\b...\b` regex (case-insensitive via `.toUpperCase()`)
   - Chinese keywords: `String.includes()`
   - Score = keyword length; +100 bonus if segment exactly equals keyword
4. Take the highest-scored match per segment; skip if that code was already used

### UI Tabs

- **`coding` tab** — paste clinical text, click analyze, view results with copy/code display
- **`database` tab** — view/filter/sort all rules, add/edit/delete entries, import/export JSON, smart reset

### Smart Reset

Preserves user-added rules (`isCustom: true` or `id` not in `INITIAL_DATABASE`) while restoring all built-in entries to their default state.

## Adding New ICD-10 Entries

Add entries directly to the `INITIAL_DATABASE` array in `index.html`. Each entry needs a unique `id` (conventionally the ICD code itself), matching `keywords` in UPPERCASE for English terms and natural case for Chinese terms, and an `organ` value matching one of the `ORGAN_CATEGORIES` `value` fields.
