export function outlookTitle(entity: unknown, fallback: string): string {
  if (!entity || typeof entity !== 'object') return fallback;
  const { type, geography, id } = entity as Record<string, unknown>;
  const hasType = typeof type === 'string' && type.length > 0;
  const hasGeography = typeof geography === 'string' && geography.length > 0;
  if (hasType && hasGeography) return `${type} — ${geography}`;
  if (hasGeography) return geography;
  if (typeof id === 'string' && id.length > 0) return id;
  return fallback;
}
