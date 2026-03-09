#!/usr/bin/env node
/**
 * extract.js — Pull variables from the Figma Variables API and write
 * W3C DTCG token files to tokens/
 *
 * Output:
 *   tokens/primitive.json       — em-global (raw hex values)
 *   tokens/semantic.light.json  — em-theme Light mode (aliases)
 *   tokens/semantic.dark.json   — em-theme Dark mode (aliases)
 *   tokens/component.json       — em-button-*, em-grid, typography, etc.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const FILE_KEY = 'PSxdDGDYTiOVfr7zXMXSRg';
const FIGMA_TOKEN = process.env.FIGMA_TOKEN;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert Figma RGBA (0–1 floats) to CSS hex string. Alpha only appended if < 1. */
function rgbaToHex({ r, g, b, a }) {
  const toHex = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
  const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  return a < 1 ? hex + toHex(a) : hex;
}

/** Convert Figma variable name (slash-separated) to a W3C DTCG reference path (dot-separated). */
function nameToRef(name) {
  return name.replace(/\//g, '.');
}

/** Kebab-case a mode name ("Extra Small" → "extra-small"). */
function modeNameToKey(name) {
  return name.toLowerCase().replace(/\s+/g, '-');
}

/** Resolve a Figma variable type to a W3C DTCG $type string. */
function resolveType(figmaType) {
  const map = { COLOR: 'color', FLOAT: 'number', STRING: 'string', BOOLEAN: 'boolean' };
  return map[figmaType] ?? 'unknown';
}

/**
 * Set a value deep inside a nested object, creating intermediate objects as needed.
 * pathParts = ['colour', 'brand', 'bash', '500']
 */
function setNested(obj, pathParts, value) {
  let cur = obj;
  for (let i = 0; i < pathParts.length - 1; i++) {
    const key = pathParts[i];
    if (cur[key] === undefined || typeof cur[key] !== 'object' || '$value' in cur[key]) {
      cur[key] = {};
    }
    cur = cur[key];
  }
  cur[pathParts[pathParts.length - 1]] = value;
}

/**
 * Convert a single Figma mode value to a W3C $value.
 * - Raw color  → "#rrggbb"
 * - VARIABLE_ALIAS → "{path.to.token}"
 * - Number/string/boolean → raw value
 */
function resolveValue(modeValue, resolvedType, varIdToFullRef) {
  if (modeValue === undefined || modeValue === null) return null;

  if (modeValue?.type === 'VARIABLE_ALIAS') {
    const ref = varIdToFullRef[modeValue.id];
    if (!ref) {
      console.warn(`  ⚠ Unknown alias target: ${modeValue.id}`);
      return null;
    }
    return `{${ref}}`;
  }

  if (resolvedType === 'color' && modeValue?.r !== undefined) {
    return rgbaToHex(modeValue);
  }

  return modeValue;
}

// ---------------------------------------------------------------------------
// Collections → tiers
// ---------------------------------------------------------------------------

const PRIMITIVE_COLLECTIONS = new Set(['em-global']);
const SEMANTIC_COLLECTIONS  = new Set(['em-theme']);
// Everything else that matches these names goes to component.json
const COMPONENT_COLLECTIONS = new Set([
  'em-button-size', 'em-button-radius', 'em-button-colours',
  'em-grid',
  'em-type-typeScale', 'em-type-fontFamily', 'em-type-lineHeight',
  'Org Styles',
]);

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!FIGMA_TOKEN) {
    console.error('Error: FIGMA_TOKEN is not set. Add it to .env or export it.');
    process.exit(1);
  }

  console.log('Fetching variables from Figma API…');
  const res = await fetch(
    `https://api.figma.com/v1/files/${FILE_KEY}/variables/local`,
    { headers: { 'X-Figma-Token': FIGMA_TOKEN } }
  );

  if (!res.ok) {
    console.error(`Figma API error: ${res.status} ${res.statusText}`);
    const body = await res.text();
    console.error(body);
    process.exit(1);
  }

  const data = await res.json();
  const { variables, variableCollections } = data.meta;

  console.log(`  Found ${Object.keys(variables).length} variables across ${Object.keys(variableCollections).length} collections`);

  // ------------------------------------------------------------------
  // 1. Build variableId → name lookup (used for alias resolution)
  // ------------------------------------------------------------------
  const varIdToName = {};
  for (const [id, variable] of Object.entries(variables)) {
    varIdToName[id] = variable.name;
  }

  // ------------------------------------------------------------------
  // 2. Deduplicate collections — prefer the local version (more variables)
  //    Figma returns both local and published-library stubs for shared collections.
  // ------------------------------------------------------------------
  const bestByName = {};
  for (const [id, col] of Object.entries(variableCollections)) {
    const existing = bestByName[col.name];
    if (!existing || col.variableIds.length > existing.variableIds.length) {
      bestByName[col.name] = { id, ...col };
    }
  }

  const chosenCollections = Object.values(bestByName);
  console.log(`  Deduplicated to ${chosenCollections.length} collections: ${chosenCollections.map(c => c.name).join(', ')}`);

  // ------------------------------------------------------------------
  // 2b. Build variableId → full W3C reference path lookup.
  //     Component tokens are nested under [collectionName, modeName, ...nameParts]
  //     in the output JSON, so aliases into them need the full path prefix.
  //
  //     Each variable carries a variableCollectionId; use that to find the
  //     collection name, then look up the CHOSEN collection (local version)
  //     via bestByName to get the correct mode info.
  //     This handles both local and published-library variable IDs pointing
  //     to the same logical collection.
  // ------------------------------------------------------------------
  const varIdToFullRef = {};
  for (const [id, variable] of Object.entries(variables)) {
    const rawCol  = variableCollections[variable.variableCollectionId];
    const colName = rawCol?.name ?? '';
    const chosenCol = bestByName[colName]; // may be undefined if collection is skipped
    const tier =
      PRIMITIVE_COLLECTIONS.has(colName) ? 'primitive' :
      SEMANTIC_COLLECTIONS.has(colName)  ? 'semantic'  :
      COMPONENT_COLLECTIONS.has(colName) ? 'component' :
      null;

    const nameDotted = nameToRef(variable.name); // slash → dot

    if (tier === 'component' && chosenCol) {
      if (chosenCol.modes.length === 1) {
        // Single-mode component: collectionName.name
        varIdToFullRef[id] = `${colName}.${nameDotted}`;
      } else {
        // Multi-mode component: collectionName.defaultModeName.name
        const defaultModeKey = modeNameToKey(chosenCol.modes[0].name);
        varIdToFullRef[id] = `${colName}.${defaultModeKey}.${nameDotted}`;
      }
    } else {
      // Primitive and semantic — name only (no collection/mode prefix in output)
      varIdToFullRef[id] = nameDotted;
    }
  }

  // ------------------------------------------------------------------
  // 3. Process each collection
  // ------------------------------------------------------------------
  const primitiveTokens  = {};
  const semanticLight    = {};
  const semanticDark     = {};
  const componentTokens  = {};

  for (const collection of chosenCollections) {
    const name = collection.name;
    const tier =
      PRIMITIVE_COLLECTIONS.has(name) ? 'primitive' :
      SEMANTIC_COLLECTIONS.has(name)  ? 'semantic'  :
      COMPONENT_COLLECTIONS.has(name) ? 'component' :
      null;

    if (tier === null) {
      console.log(`  Skipping unknown collection: "${name}"`);
      continue;
    }

    console.log(`  Processing [${tier}] "${name}" — ${collection.variableIds.length} variables, ${collection.modes.length} mode(s)`);

    for (const varId of collection.variableIds) {
      const variable = variables[varId];
      if (!variable) {
        console.warn(`    ⚠ Variable ${varId} not found in response`);
        continue;
      }

      const nameParts  = variable.name.split('/');
      const tokenType  = resolveType(variable.resolvedType);

      // ----------------------------------------------------------------
      // PRIMITIVE — single mode, raw values
      // ----------------------------------------------------------------
      if (tier === 'primitive') {
        const modeId     = collection.modes[0].modeId;
        const modeValue  = variable.valuesByMode[modeId];
        const value      = resolveValue(modeValue, tokenType, varIdToFullRef);
        if (value === null) continue;

        setNested(primitiveTokens, nameParts, { $type: tokenType, $value: value });
      }

      // ----------------------------------------------------------------
      // SEMANTIC — Light + Dark modes, values MUST be aliases
      // ----------------------------------------------------------------
      else if (tier === 'semantic') {
        for (const mode of collection.modes) {
          const modeValue = variable.valuesByMode[mode.modeId];
          const value     = resolveValue(modeValue, tokenType, varIdToFullRef);
          if (value === null) continue;

          const target = mode.name === 'Light' ? semanticLight : semanticDark;
          setNested(target, nameParts, { $type: tokenType, $value: value });
        }
      }

      // ----------------------------------------------------------------
      // COMPONENT — multi-mode; mode name becomes the sub-namespace
      // Structure: { [collectionName]: { [modeName]: { ...tokenPath } } }
      // ----------------------------------------------------------------
      else if (tier === 'component') {
        if (collection.modes.length === 1) {
          // Single-mode component token — no mode namespace
          const modeId    = collection.modes[0].modeId;
          const modeValue = variable.valuesByMode[modeId];
          const value     = resolveValue(modeValue, tokenType, varIdToFullRef);
          if (value === null) continue;

          setNested(componentTokens, [name, ...nameParts], { $type: tokenType, $value: value });
        } else {
          // Multi-mode — nest under mode key
          for (const mode of collection.modes) {
            const modeKey   = modeNameToKey(mode.name);
            const modeValue = variable.valuesByMode[mode.modeId];
            const value     = resolveValue(modeValue, tokenType, varIdToFullRef);
            if (value === null) continue;

            setNested(componentTokens, [name, modeKey, ...nameParts], { $type: tokenType, $value: value });
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // 4. Write output files
  // ------------------------------------------------------------------
  const tokensDir = path.join(__dirname, '..', 'tokens');
  fs.mkdirSync(tokensDir, { recursive: true });

  const write = (filename, obj) => {
    const filepath = path.join(tokensDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(obj, null, 2) + '\n');
    const count = countLeafTokens(obj);
    console.log(`  ✓ ${filename} (${count} tokens)`);
  };

  console.log('\nWriting token files…');
  write('primitive.json',      primitiveTokens);
  write('semantic.light.json', semanticLight);
  // Wrap dark tokens under a top-level "dark" namespace so token paths are
  // distinct from the light tokens when Style Dictionary reads both files.
  // e.g.  background.primary (light)  vs  dark.background.primary (dark)
  write('semantic.dark.json',  { dark: semanticDark });
  write('component.json',      componentTokens);

  console.log('\n✅ Extraction complete. Run `npm run build` to generate CSS and Dart output.');
}

/** Count leaf token objects (those with a $value property). */
function countLeafTokens(obj) {
  if (typeof obj !== 'object' || obj === null) return 0;
  if ('$value' in obj) return 1;
  return Object.values(obj).reduce((sum, v) => sum + countLeafTokens(v), 0);
}

main().catch((err) => {
  console.error('Extraction failed:', err);
  process.exit(1);
});
