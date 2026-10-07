/**
 * tests/ts_resolver.mjs
 *
 * Minimal Node ESM resolver hook for resolving extensionless TypeScript imports
 * (e.g. import from '../../services/moduleLoader' -> '.../services/moduleLoader.ts')
 * when running stress tests directly in Node.js.
 */

import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { register } from 'node:module';

try {
  register(import.meta.url);
} catch {
  // Ignore if already registered
}

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (context.parentURL && (specifier.startsWith('.') || specifier.startsWith('/'))) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      for (const ext of ['.ts', '.tsx', '.js', '/index.ts', '/index.js']) {
        const candidate = path.resolve(parentDir, specifier + ext);
        if (fs.existsSync(candidate)) {
          return nextResolve(pathToFileURL(candidate).href, context);
        }
      }
    }
    for (const candidate of [specifier + '.ts', specifier + '.tsx', specifier + '/index.ts']) {
      try {
        const res = await nextResolve(candidate, context);
        return {
          ...res,
          shortCircuit: true,
        };
      } catch (candidateErr) {
        // try next
      }
    }
    throw err;
  }
}
