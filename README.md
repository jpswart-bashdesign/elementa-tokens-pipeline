# Elementa-Ø Token Pipeline

Pulls design tokens directly from Figma and delivers them to both web (CSS) and mobile (Dart/Flutter) — replacing Supernova.

```
Figma Variables API → tokens/*.json → dist/web/variables.css
                                     → dist/flutter/em_tokens.dart
```

---

## Quick start

```bash
npm install
echo "FIGMA_TOKEN=your_token_here" > .env
npm run sync
```

The generated files land in `dist/`.

---

## Commands

| Command | What it does |
|---|---|
| `npm run sync` | Full pipeline: pull from Figma → build CSS + Dart |
| `npm run extract` | Pull variables from Figma API → `tokens/*.json` |
| `npm run build` | Transform `tokens/*.json` → `dist/` (no Figma call) |

**`npm run sync` is the one command you need day-to-day.**

---

## Environment

Create a `.env` file in the project root:

```
FIGMA_TOKEN=your_figma_personal_access_token
```

Get a personal access token from **Figma → Settings → Security → Personal access tokens**.

The Figma file key is hardcoded in `scripts/extract.js`: `PSxdDGDYTiOVfr7zXMXSRg`.

---

## Output

### `dist/web/variables.css`

CSS custom properties with Light/Dark mode selectors:

```css
:root {
  --em-colour-brand-bash-500: #7474ee;
  --em-background-primary: #fcfcfc;
  /* ... */
}

[data-theme="dark"] {
  --em-background-primary: #1b1b1b;
  /* ... */
}
```

Switch modes by setting `data-theme="dark"` on any ancestor element (typically `<html>`).

### `dist/flutter/em_tokens.dart`

Typed Dart constants with enum-keyed Light/Dark values:

```dart
enum EmThemeMode { light, dark }

class EmBackground {
  static const Map<EmThemeMode, Color> primary = {
    EmThemeMode.light: Color(0xFFFCFCFC),
    EmThemeMode.dark:  Color(0xFF1B1B1B),
  };
}
```

---

## Token architecture

Tokens flow through three tiers:

1. **Primitive** (`tokens/primitive.json`) — raw values from `em-global` (colour ramps, etc.)
2. **Semantic** (`tokens/semantic.light.json`, `tokens/semantic.dark.json`) — role-based aliases into primitives from `em-theme`
3. **Component** (`tokens/component.json`) — component-level values from `em-button-*`, `em-grid`, `em-type-*`, etc.

Token files are W3C DTCG format and committed to the repo so diffs are reviewable.

---

## Automation

A GitHub Actions workflow (`.github/workflows/sync-tokens.yml`) can be triggered manually to sync tokens and commit the result. Add `FIGMA_TOKEN` as a repository secret.
