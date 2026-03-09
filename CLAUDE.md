# Elementa-Ø Token Pipeline — Claude Code Briefing

> Read this file before doing anything. It contains full project context, architectural decisions, and what to build first.

---

## What this project is

A self-owned design token pipeline that replaces Supernova as the delivery mechanism between Figma and code. The pipeline reads variables directly from the **Elementa-Ø Figma file**, transforms them into platform-appropriate formats, and keeps design and code in sync automatically.

**Figma file key:** `PSxdDGDYTiOVfr7zXMXSRg`
**Notion project plan:** https://www.notion.so/bashdotcom/Elementa-Token-Pipeline-Project-Plan-30a361a31546814c9752cf8354dadaa1
**GitHub repo:** https://github.com/bash-elementa/elementa-token-pipeline

---

## Architecture

```
Figma Variables API
      ↓
tokens/
  primitive.json    ← em-global (colour ramps, spacing, radius, sizing)
  semantic.json     ← em-theme (aliases into primitives, Light/Dark modes)
  component.json    ← em-button-*, em-grid, component-level tokens
      ↓
Style Dictionary (style-dictionary.config.js)
      ↓
├── dist/web/
│   ├── variables.css          CSS custom properties (all modes)
│   └── tailwind.config.js     Tailwind token config
└── dist/flutter/
    └── em_tokens.dart         Dart token constants (enum-keyed)
```

---

## Figma variable structure

The file has **515 variables across 16 collections**:

| Collection | Modes | What it contains |
|---|---|---|
| `em-global` | Value | Primitive colour ramps (brand/bash, neutral/onyx, accent/blue, white/black alpha) |
| `em-theme` | Light, Dark | Semantic tokens — background, text, border, icon, scrim roles |
| `Org Styles` | Light, Dark | Org-level colour overrides (neutrals, highlights, shadow) |
| `em-type-typeScale` | Base, Small, Medium, Large | Font sizes (8–96px) + line heights by category (display/headline/title/body/label) |
| `em-type-fontFamily` | Primary, Secondary, Code, Wireframe | Font weight scale (300–800) |
| `em-type-lineHeight` | Comfortable, Compact | Line height density modes |
| `em-grid` | grid-xsm → grid-2xl | Responsive layout breakpoints (min-width, max-width, min-height) |
| `em-button-size` | Large → 2x Small | Button dimension tokens |
| `em-button-radius` | Small, Medium, Large, Full | Button border radius |
| `em-button-colours` | Accent, Black, White, Grey Secondary, Grey Tertiary, Disabled | Button colour variants |

### Naming conventions in Figma
- Primitives use `/` as separator: `colour/brand/bash/500`
- Semantic tokens use role-based naming: `background/primary`, `text/secondary`, `border/error/primary`
- Typography: `em-fontSize/16`, `em-lineHeight/body/20`, `em-fontWeight/600`
- Grid: `min-width`, `max-width`, `min-height` (per breakpoint mode)

---

## Critical architectural decisions

### 1. Preserve alias chains — do NOT resolve to hex at extraction time

Semantic tokens must reference primitives, not resolve them. Style Dictionary needs the full graph.

```json
// ❌ Wrong — resolves alias, loses the relationship
"background/primary": { "$value": "#FFFFFF" }

// ✅ Correct — alias preserved, Style Dictionary follows the chain
"background/primary": {
  "$type": "color",
  "$value": "{colour.neutral.white.1000}"
}
```

Primitives (`em-global`) CAN be raw hex values. Semantics (`em-theme`) MUST be aliases.

### 2. W3C DTCG format for tokens.json

Use the W3C Design Tokens Community Group format throughout:

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

### 3. Dart output: enum-keyed structure (confirmed approach)

Use the enum-based approach for type safety in Flutter — not the `Map<String, dynamic>` approach.

```dart
// ✅ Use this structure
enum EmThemeMode { light, dark }

class EmThemeBackground {
  static const primary = {
    EmThemeMode.light: 0xFFFFFFFF,
    EmThemeMode.dark: 0xFF111111,
  };
}

// ❌ Not this
class EmTokens {
  static const Map<String, dynamic> light = { ... };
  static Map<String, dynamic> get(String mode) { ... }
}
```

This requires a **custom Style Dictionary formatter** for the Dart output — write this as `formats/dart-enum.js`.

### 4. Three-tier token architecture

Tokens must flow through three tiers. Style Dictionary processes them in order:

1. **Primitive** — raw values, no references (em-global colour ramps, spacing)
2. **Semantic** — aliases to primitives, mode-aware (em-theme Light/Dark)
3. **Component** — aliases to semantic tokens (em-button-*, breakpoint-specific values)

---

## Repo structure to build

```
elementa-token-pipeline/
├── CLAUDE.md                     ← this file
├── README.md
├── package.json
├── style-dictionary.config.js    ← main SD config
│
├── scripts/
│   └── extract.js                ← Figma Variables API extraction script
│
├── formats/
│   └── dart-enum.js              ← custom Style Dictionary formatter for Dart
│
├── tokens/                       ← W3C DTCG source files (committed to repo)
│   ├── primitive.json            ← em-global
│   ├── semantic.json             ← em-theme (Light/Dark aliases)
│   └── component.json           ← em-button-*, em-grid, etc.
│
└── dist/                         ← generated outputs (gitignored or committed)
    ├── web/
    │   ├── variables.css
    │   └── tailwind.config.js
    └── flutter/
        └── em_tokens.dart
```

---

## What to build first (Phase 1 scope)

Work in this order:

### Step 1 — `scripts/extract.js`
Pulls variables from the Figma Variables API and writes the three `tokens/*.json` files.

- Use the Figma REST API: `GET /v1/files/:file_key/variables/local`
- Set `FIGMA_TOKEN` as an env variable (personal access token)
- Preserve alias chains: when a variable value is `{ "type": "VARIABLE_ALIAS", "id": "..." }`, write it as a W3C `$value` reference like `"{collection.name.path}"`
- Split output into `primitive.json`, `semantic.json`, `component.json` based on collection name
- The script should be runnable with `node scripts/extract.js`

### Step 2 — `style-dictionary.config.js`
Configure Style Dictionary to read `tokens/*.json` and output both platforms.

```js
module.exports = {
  source: ['tokens/**/*.json'],
  platforms: {
    css: {
      transformGroup: 'css',
      prefix: 'em',
      buildPath: 'dist/web/',
      files: [
        { destination: 'variables.css', format: 'css/variables' },
        { destination: 'tailwind.config.js', format: 'javascript/module' }
      ]
    },
    dart: {
      transformGroup: 'flutter',
      buildPath: 'dist/flutter/',
      files: [
        { destination: 'em_tokens.dart', format: 'dart/enum' }
      ]
    }
  }
}
```

### Step 3 — `formats/dart-enum.js`
Custom Style Dictionary formatter that outputs the enum-keyed Dart structure.

- Group tokens by category (background, text, border, icon, etc.)
- Each category becomes a Dart class
- Values keyed by `EmThemeMode` enum
- Colors output as Flutter `Color(0xFFRRGGBB)` hex format
- Numbers output as `double` constants

### Step 4 — `package.json` scripts

```json
{
  "scripts": {
    "extract": "node scripts/extract.js",
    "build": "style-dictionary build",
    "sync": "npm run extract && npm run build"
  }
}
```

`npm run sync` is the one-command pipeline: pull from Figma → transform → output both platforms.

### Step 5 — GitHub Actions (`.github/workflows/sync-tokens.yml`)
Triggered manually (`workflow_dispatch`) for now. Phase 4 will add Figma webhook trigger.

```yaml
name: Sync tokens from Figma
on:
  workflow_dispatch:
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run sync
        env:
          FIGMA_TOKEN: ${{ secrets.FIGMA_TOKEN }}
      - uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: "chore: sync tokens from Figma"
```

---

## Known issues / things to watch for

1. **Semantic token extraction gap** — `em-theme` semantic tokens (background/primary, text/secondary etc.) were not fully resolving Light and Dark mode alias chains in the initial extraction. The values came through as stubs. Investigate whether the Figma REST API returns these with full alias IDs and handle accordingly.

2. **Alias resolution in W3C format** — When converting a `VARIABLE_ALIAS` from the Figma API, you need to map the aliased variable's ID back to its name path to write a valid W3C reference like `{colour.neutral.white.1000}`. Build a lookup map of `variableId → name` during extraction.

3. **Mode-aware CSS output** — The CSS output should use `[data-theme]` attribute selectors for mode switching, not separate files:
   ```css
   :root { --em-colour-brand-bash-500: #7474EE; }
   [data-theme="dark"] { --em-background-primary: #111111; }
   ```

4. **Dart color format** — Figma colors are RGBA 0–1 floats. Flutter expects `Color(0xAARRGGBB)`. The transform must convert: `Math.round(r * 255).toString(16)` etc., with alpha as the first byte.

5. **Collection deduplication** — There are two entries for both `em-global` and `em-theme` in the raw Figma response (local + published library versions). The extraction script should deduplicate and prefer the local version.

---

## Environment setup

```bash
npm install style-dictionary
# Add FIGMA_TOKEN to .env (personal access token from Figma settings)
echo "FIGMA_TOKEN=your_token_here" > .env
```

Required Node version: 18+

---

## Phase 1 definition of done

- [ ] `node scripts/extract.js` runs without errors and writes all three token JSON files
- [ ] `tokens.json` contains all three tiers: primitive → semantic → component
- [ ] `npm run build` generates both `dist/web/variables.css` and `dist/flutter/em_tokens.dart`
- [ ] CSS file uses `[data-theme]` selectors for Light/Dark mode
- [ ] Dart file uses enum-keyed structure (confirmed with Flutter engineering)
- [ ] A full `npm run sync` takes under 2 minutes
- [ ] README explains how to run it

---

## Related context

- Notion project plan (full phases, stakeholder map, risk register): https://www.notion.so/bashdotcom/Elementa-Token-Pipeline-Project-Plan-30a361a31546814c9752cf8354dadaa1
- The pipeline replaces **Supernova** — cost saving is part of the business case
- Two consuming teams: **Next.js (web)** and **Flutter (mobile)**
- Token naming is owned by XD in Figma — the pipeline must never rename tokens
- Phase 2 adds Tailwind wiring + Storybook components; Phase 3 adds Flutter Button widget + Widgetbook
