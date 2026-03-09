'use strict';

// ---------------------------------------------------------------------------
// Custom format: CSS custom properties with Light/Dark mode selectors
//
// Token routing:
//   - path[0] === 'dark'  →  [data-theme="dark"] { --em-<name>: <value>; }
//   - everything else     →  :root { --em-<name>: <value>; }
//
// Prefix logic:
//   - Tokens whose name already starts with "em-" (from em-grid, em-button-*
//     collections) are left as-is to avoid double-prefix: --em-em-grid-...
//   - All other tokens get the "em-" prefix.
// ---------------------------------------------------------------------------
function cssVariablesWithModes({ dictionary }) {
  const rootTokens = dictionary.allTokens.filter((t) => t.path[0] !== 'dark');
  const darkTokens = dictionary.allTokens.filter((t) => t.path[0] === 'dark');

  function varName(token) {
    if (token.path[0] === 'dark') {
      // dark.background.primary → em-background-primary
      return `em-${token.path.slice(1).join('-')}`;
    }
    // Skip prefix if the name already begins with "em-"
    return token.name.startsWith('em-') ? token.name : `em-${token.name}`;
  }

  const toLine = (token) => `  --${varName(token)}: ${token.$value};`;

  let out = `:root {\n${rootTokens.map(toLine).join('\n')}\n}\n`;

  if (darkTokens.length > 0) {
    out += `\n[data-theme="dark"] {\n${darkTokens.map(toLine).join('\n')}\n}\n`;
  }

  return out;
}

// ---------------------------------------------------------------------------
// Dart formatter — enum-keyed Dart constants (formats/dart-enum.js)
// ---------------------------------------------------------------------------
const dartEnumFormat = require('./formats/dart-enum.js');

// ---------------------------------------------------------------------------
// Style Dictionary config
// ---------------------------------------------------------------------------
module.exports = {
  // Tokens use the W3C DTCG format ($value / $type) — required for SD v4
  usesDtcg: true,

  hooks: {
    formats: {
      'css/variables-with-modes': cssVariablesWithModes,
      'dart/enum': dartEnumFormat,
    },
  },

  // All token source files
  source: ['tokens/**/*.json'],

  platforms: {
    // ------------------------------------------------------------------
    // Web — CSS custom properties + Tailwind config
    // ------------------------------------------------------------------
    css: {
      transformGroup: 'css',
      buildPath: 'dist/web/',
      files: [
        {
          destination: 'variables.css',
          format: 'css/variables-with-modes',
        },
        {
          // Tailwind token config — full wiring is Phase 2.
          // For now this outputs a JS object of resolved token values
          // that can be spread into a Tailwind theme config.
          destination: 'tailwind.config.js',
          format: 'javascript/module',
        },
      ],
    },

    // ------------------------------------------------------------------
    // Flutter — enum-keyed Dart constants
    // ------------------------------------------------------------------
    dart: {
      transformGroup: 'flutter',
      buildPath: 'dist/flutter/',
      files: [
        {
          destination: 'em_tokens.dart',
          format: 'dart/enum',
        },
      ],
    },
  },
};
