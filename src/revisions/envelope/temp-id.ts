import type { TempIdField } from './strategy.types';

/**
 * Rewrite temp IDs (`new-<n>`) in a strategy snapshot to real IDs.
 *
 * Pure. Returns a deep copy; never mutates `snapshot`. Paths where the temp ID
 * is not in the map are left alone (the caller's map grows as earlier
 * revisions in the publish order apply, so a later revision sees the real ID
 * for a temp ID an earlier revision created).
 *
 * The path grammar is intentionally tiny — the same grammar the
 * `TempIdField.path` doc comment declares:
 *
 *   id                     → the scalar field `id`
 *   resources[].id         → the `id` of each element of the array `resources`
 *   steps[].resourceIds[]  → each element of the array `resourceIds`, in each
 *                            element of the array `steps`
 *
 * A segment is `name` or `name[]`. No nested `[]` on one segment, no
 * wildcards, no quoted keys. `kind` describes the *leaf*: `scalar` means the
 * leaf is one temp-ID string; `array` means the leaf is an array of temp-ID
 * strings.
 */
export function rewriteTempIds(
  snapshot: unknown,
  fields: readonly TempIdField[],
  tempIdMap: ReadonlyMap<string, string>,
): unknown {
  const copy = structuredClone(snapshot);
  if (tempIdMap.size === 0 || fields.length === 0) return copy;

  for (const field of fields) {
    const segments = parsePath(field.path, field.kind);
    const last = segments[segments.length - 1];
    const parents = resolveParents(copy, segments, 0);
    for (const parent of parents) {
      if (last.isArray) {
        rewriteArrayLeaf(parent, last.name, tempIdMap);
      } else {
        rewriteScalarLeaf(parent, last.name, tempIdMap);
      }
    }
  }
  return copy;
}

// ─────────────────────────────────────────────────────────────────────
// Path parsing
// ─────────────────────────────────────────────────────────────────────

interface PathSegment {
  name: string;
  isArray: boolean;
}

function parsePath(path: string, kind: 'scalar' | 'array'): PathSegment[] {
  if (path.length === 0) throw new Error('TempIdField.path must be non-empty');
  const segments = path.split('.').map((raw) => {
    if (raw.length === 0)
      throw new Error(`TempIdField.path has an empty segment: "${path}"`);
    const isArray = raw.endsWith('[]');
    const name = isArray ? raw.slice(0, -2) : raw;
    if (name.length === 0 || name.includes('[') || name.includes(']'))
      throw new Error(
        `TempIdField.path has an invalid segment: "${raw}" in "${path}"`,
      );
    return { name, isArray };
  });
  const last = segments[segments.length - 1];
  if (last.isArray !== (kind === 'array'))
    throw new Error(
      `TempIdField "${path}" has kind "${kind}" but its last segment is ${last.isArray ? 'array' : 'scalar'}`,
    );
  return segments;
}

// ─────────────────────────────────────────────────────────────────────
// Traversal
// ─────────────────────────────────────────────────────────────────────

/** Resolve the path's non-leaf prefix to the set of objects that hold the leaf. */
function resolveParents(
  root: unknown,
  segments: readonly PathSegment[],
  i: number,
): Record<string, unknown>[] {
  if (i === segments.length - 1) {
    return root !== null && typeof root === 'object' && !Array.isArray(root)
      ? [root as Record<string, unknown>]
      : [];
  }
  const segment = segments[i];
  if (root === null || typeof root !== 'object') return [];

  if (segment.isArray) {
    const arr = (root as Record<string, unknown>)[segment.name];
    if (!Array.isArray(arr)) return [];
    return arr.flatMap((item) => resolveParents(item, segments, i + 1));
  }

  const child = (root as Record<string, unknown>)[segment.name];
  return resolveParents(child, segments, i + 1);
}

function rewriteScalarLeaf(
  parent: Record<string, unknown>,
  key: string,
  map: ReadonlyMap<string, string>,
): void {
  const value = parent[key];
  if (typeof value !== 'string') return;
  const replaced = map.get(value);
  if (replaced !== undefined) parent[key] = replaced;
}

function rewriteArrayLeaf(
  parent: Record<string, unknown>,
  key: string,
  map: ReadonlyMap<string, string>,
): void {
  const value = parent[key];
  if (!Array.isArray(value)) return;
  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (typeof item !== 'string') continue;
    const replaced = map.get(item);
    if (replaced !== undefined) value[i] = replaced;
  }
}
