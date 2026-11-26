/**
 * Report duplicate values in a list, with the path of both the first
 * occurrence and the duplicate. Used by every strategy's consistency
 * validator to detect duplicate IDs / orders / etc. in a snapshot.
 *
 * Example:
 *   duplicates(
 *     snapshot.skills,
 *     (s) => s.skillId,
 *     (i) => `skills.${i}`,
 *     'skillId',
 *   )
 *   // => ['skills.2: duplicate skillId of skills.0']
 */
export const duplicates = <T>(
  items: T[],
  key: (item: T) => string | number,
  path: (index: number) => string,
  label: string,
): string[] => {
  const seen = new Map<string | number, number>();
  const problems: string[] = [];
  items.forEach((item, index) => {
    const value = key(item);
    const first = seen.get(value);
    if (first === undefined) seen.set(value, index);
    else problems.push(`${path(index)}: duplicate ${label} of ${path(first)}`);
  });
  return problems;
};
