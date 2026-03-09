# Elementa-Ø Token Pipeline — Claude Code Briefing

> Read this file before doing anything. It contains full project context, architectural decisions, what was built, and critical implementation learnings.

---

## What this project is

A self-owned design token pipeline that replaces Supernova as the delivery mechanism between Figma and code. The pipeline reads variables directly from the **Elementa-Ø Figma file**, transforms them into platform-appropriate formats, and keeps design and code in sync automatically.

**Figma file key:** `PSxdDGDYTiOVfr7zXMXSRg`
**GitHub repo:** https://github.com/jpswart-bashdesign/elementa-tokens-pipeline
**Notion project plan:** https://www.notion.so/bashdotcom/Elementa-Token-Pipeline-Project-Plan-30a361a31546814c9752cf8354dadaa1
**Notion artefacts table:** https://www.notion.so/bashdotcom/2a8361a3154680f4bc7af14c1ed4cccf

---

## Phase 1 status: ✅ Complete

All Phase 1 items are done and pushed to GitHub:

- [x] `node scripts/extract.js` runs without errors, writes all token files
- [x] Three tiers: primitive → semantic → component
- [x] `npm run build` generates `dist/web/variables.css` + `dist/flutter/em_tokens.dart`
- [x] CSS uses `[data-theme]` selectors for Light/Dark mode
- [x] Dart uses enum-keyed `Map<EmThemeMode, Color>` structure
- [x] Full `npm run sync` completes in under 2 minutes
- [x] README written
- [x] GitHub Actions workflow created (`.github/workflows/sync-tokens.yml`)

---

## Architecture (as built)

```
Figma Variables API  (GET /v1/files/:file_key/variables/local)
      ↓
scripts/extract.js
      ↓
tokens/
  primitive.json         ← em-global (colour ramps — raw hex values)
  semantic.light.json    ← em-theme Light mode (aliases to primitives)
  semantic.dark.json     ← em-theme Dark mode (wrapped in { dark: ... } namespace)
  component.json         ← em-button-*, em-grid, em-type-*, Org Styles
      ↓
style-dictionary.config.js  (usesDtcg: true)
      ↓
├── dist/web/
│   ├── variables.css          CSS custom properties with :root + [data-theme="dark"]
│   └── tailwind.config.js     Tailwind token config (Phase 2 wiring TBD)
└── dist/flutter/
    └── em_tokens.dart         Dart token constants (enum-keyed)
```

---

## Actual repo structure

```
elementa-token-pipeline/
├── CLAUDE.md                          ← this file
├── README.md
├── package.json
├── style-dictionary.config.js
├── .env                               ← FIGMA_TOKEN (gitignored)
├── .gitignore                         ← node_modules/, .env, .DS_Store, dist/debug/
│
├── .claude/
│   └── launch.json                    ← pipeline commands for agents/devs
│
├── .github/
│   └── workflows/
│       └── sync-tokens.yml            ← manual workflow_dispatch sync job
│
├── scripts/
│   └── extract.js                     ← Figma Variables API extraction
│
├── formats/
│   └── dart-enum.js                   ← custom Style Dictionary formatter for Dart
│
├── tokens/                            ← W3C DTCG source files (committed to repo)
│   ├── primitive.json                 ← em-global (266 tokens)
│   ├── semantic.light.json            ← em-theme Light (163 tokens)
│   ├── semantic.dark.json             ← em-theme Dark (163 tokens, wrapped in dark namespace)
│   └── component.json                 ← all component collections (239 tokens)
│
└── dist/                              ← generated outputs (committed to repo)
    ├── web/
    │   ├── variables.css
    │   └── tailwind.config.js
    └── flutter/
        └── em_tokens.dart
```

---

## Commands

```bash
npm run extract    # Pull from Figma API → writes tokens/*.json
npm run build      # Transform tokens → dist/ (no Figma call)
npm run sync       # Both: extract + build (the day-to-day command)
```

**Important:** `style-dictionary build` must be called with `--config style-dictionary.config.js`.
SD v4 defaults to `./config.json`, not `style-dictionary.config.js`. The package.json build script includes this flag — don't remove it.

---

## Environment

```bash
# .env (never commit this)
FIGMA_TOKEN=your_figma_personal_access_token
```

For CI: add `FIGMA_TOKEN` as a repository secret in GitHub settings.

Required Node version: 18+

---

## Figma variable structure

The file has **515 variables across 16 collections**. After deduplication (local vs. published library stubs), 13 collections are processed:

| Collection | Tier | Modes | Token count |
|---|---|---|---|
| `em-global` | primitive | Value | 266 |
| `em-theme` | semantic | Light, Dark | 163 each |
| `Org Styles` | component | Light, Dark | 6 |
| `em-type-typeScale` | component | Base, Small, Medium, Large | 38 |
| `em-type-fontFamily` | component | Primary, Secondary, Code, Wireframe | 10 |
| `em-type-lineHeight` | component | Comfortable, Compact | 1 |
| `em-grid` | component | grid-xsm → grid-2xl | 3 |
| `em-button-size` | component | Large → 2x Small | 5 |
| `em-button-radius` | component | Small, Medium, Large, Full | 1 |
| `em-button-colours` | component | Accent, Black, White, Grey Secondary, Grey Tertiary, Disabled | 3 |

**Skipped collections** (unknown/external, not in local Figma response): `Base`, `Size`, `primitive-style`

### Naming conventions in Figma
- Primitives: `/` as separator — `colour/brand/bash/500`
- Semantic: role-based — `background/primary`, `text/secondary`, `border/error/primary`
- Typography: `em-fontSize/16`, `em-lineHeight/body/20`, `em-fontWeight/600`
- Grid: `min-width`, `max-width`, `min-height` per breakpoint mode

---

## Critical architectural decisions

### 1. Preserve alias chains — do NOT resolve to hex at extraction time

Semantic tokens must reference primitives as W3C aliases, not resolved hex.

```json
// ❌ Wrong
"background/primary": { "$value": "#FFFFFF" }

// ✅ Correct
"background/primary": {
  "$type": "color",
  "$value": "{colour.neutral.white.1000}"
}
```

Primitives (`em-global`) → raw hex. Semantics (`em-theme`) → aliases only.

### 2. W3C DTCG format — and `usesDtcg: true` in Style Dictionary

All token files use W3C DTCG format (`$value`, `$type`):

```json
{
  "colour": {
    "brand": {
      "bash": {
        "500": { "$type": "color", "$value": "#7474EE" }
      }
    }
  }
}
```

**Critical:** Style Dictionary v4 requires `usesDtcg: true` in `style-dictionary.config.js` to read `$value`/`$type` fields. Without it, all token values resolve to `undefined`. With it, resolved values are accessed as `token.$value` (not `token.value`) inside custom format functions.

### 3. Dark mode namespace trick — two semantic files

`semantic.dark.json` wraps all dark tokens in a `dark` namespace to prevent path collisions when both files are read by SD:

```json
// semantic.light.json
{ "background": { "primary": { "$type": "color", "$value": "{colour.neutral.white.1000}" } } }

// semantic.dark.json — note the wrapping
{ "dark": { "background": { "primary": { "$type": "color", "$value": "{colour.neutral.onyx.1000}" } } } }
```

Dark tokens get path `dark.background.primary`; light tokens get `background.primary`. The CSS format checks `token.path[0] === 'dark'` to route into `[data-theme="dark"]`. The Dart format pairs them back up by path (stripping the `dark.` prefix) to produce `Map<EmThemeMode, Color>` constants.

### 4. Dart output: enum-keyed `Map<EmThemeMode, Color>`

```dart
enum EmThemeMode { light, dark }

class EmBackground {
  static const Map<EmThemeMode, Color> primary = {
    EmThemeMode.light: Color(0xFFFCFCFC),
    EmThemeMode.dark:  Color(0xFF1B1B1B),
  };
}
```

The Flutter `color/hex8flutter` transform (applied by the `flutter` transformGroup) converts hex to `Color(0xAARRGGBB)` strings. In `dart-enum.js`, detect these with `val.startsWith('Color(')` — do not wrap them again. If the value starts with `0x` (raw hex), wrap it as `Color(${val})`.

### 5. Cross-collection alias reference paths

When a component token (e.g. `em-button-size.medium.type-size`) aliases a variable from another component collection (e.g. `em-fontSize/14` from `em-type-typeScale`), the W3C reference must include the full path: `{em-type-typeScale.base.em-fontSize.14}` — not just `{em-fontSize.14}`.

**The fix in `extract.js`:** Build `varIdToFullRef` by looking up each variable's `variableCollectionId` in the raw `variableCollections` response to get the collection name, then find the CHOSEN (local) collection via `bestByName[colName]` to get correct mode info. This handles both local and published-library variable IDs pointing to the same logical collection.

```js
// For multi-mode component collections:
varIdToFullRef[id] = `${colName}.${defaultModeKey}.${nameDotted}`;
// e.g. "em-type-typeScale.base.em-fontSize.14"

// For single-mode component collections:
varIdToFullRef[id] = `${colName}.${nameDotted}`;

// For primitive/semantic:
varIdToFullRef[id] = nameDotted;  // name only, no collection/mode prefix
```

### 6. Collection deduplication

The Figma API returns both local and published-library stub versions of shared collections. Deduplicate by preferring the collection with more `variableIds` (the local version). `bestByName[col.name]` holds the chosen collection per name.

---

## Known warnings (acceptable, not errors)

1. **~30 "Unknown alias target" warnings** — Hash-prefixed variable IDs like `VariableID:abc123.../1634:311` are cross-file published library references not present in the local API response. Tokens that reference these are silently skipped (no output). Affects: `em-button-colours`, some `em-button-size` and `em-button-radius` values, `em-type-lineHeight`.

2. **`em-type-typeScale` resolves to `undefined` in CSS/Dart** — These tokens alias to `{size.N}` from the external `Size` collection (skipped). They appear in the output with `undefined` values. Acceptable for Phase 1 — Phase 2 should investigate whether the `Size` collection can be included.

---

## Key implementation files

### `scripts/extract.js`
- Calls `GET /v1/files/:file_key/variables/local`
- Deduplicates collections via `bestByName` (prefers local over published stubs)
- Builds `varIdToFullRef`: maps every variable ID to its full W3C reference path, accounting for collection+mode prefix for component tokens
- Writes 4 files: `primitive.json`, `semantic.light.json`, `semantic.dark.json` (dark wrapped in `{ dark: ... }`), `component.json`
- Collection tier mapping: `em-global` → primitive, `em-theme` → semantic, everything else → component

### `style-dictionary.config.js`
- `usesDtcg: true` at the top level — required
- Two custom formats registered in `hooks.formats`: `css/variables-with-modes` and `dart/enum`
- CSS format: routes `token.path[0] === 'dark'` to `[data-theme="dark"]`, strips `dark.` prefix from var names, skips `em-` double-prefix for tokens whose name already starts with `em-`
- Dart format: loaded from `./formats/dart-enum.js`
- Build command: `style-dictionary build --config style-dictionary.config.js` (the `--config` flag is required)

### `formats/dart-enum.js`
- Categorises tokens by `token.filePath` to distinguish primitive/semantic-light/dark/component
- Builds `darkByPath` lookup (path without `dark.` prefix → dark token)
- Primitives → plain `static const Color` or `static const double`
- Semantics → `static const Map<EmThemeMode, Color>` with light/dark paired
- `dartLiteral()` handles both `Color(0x...)` (already formatted by flutter transform) and raw `0x...` values
- `dartType()` detects color values by `val.startsWith('Color(')` or `val.startsWith('0x')`

---

## What's next (Phase 2+)

- **Phase 2** — Tailwind config wiring + first Storybook component
- **Phase 3** — Flutter Button widget + Widgetbook
- **Phase 4** — Figma webhook to replace manual `workflow_dispatch`

When Phase 2 starts, the repo should be restructured into a monorepo:
```
elementa/
├── packages/
│   ├── tokens/     ← current pipeline moved here
│   └── web/        ← new React component library (@bash/elementa-ui)
├── apps/
│   └── storybook/
├── flutter/        ← Dart package (standalone, ignores npm workspace)
└── package.json    ← npm workspaces root
```
See the Notion artefact "Elementa-Ø — Repo Structure (Tokens + Components)" for full detail.

---

## Related context

- The pipeline replaces **Supernova** — cost saving is part of the business case
- Two consuming teams: **Next.js (web)** and **Flutter (mobile)**
- Token naming is owned by XD in Figma — the pipeline must never rename tokens
- Notion adoption options doc: covers four models (tokens-only → full component library)
- Notion artefacts table: https://www.notion.so/bashdotcom/2a8361a3154680f4bc7af14c1ed4cccf
