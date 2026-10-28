import { type CareerSnapshot, isTempId } from './career-snapshot.types';

const duplicates = <T>(
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

// Structural checks within one snapshot; comparison with the live career belongs in buildPlan
export const findSnapshotProblems = (snapshot: CareerSnapshot): string[] => {
  const draftResourceIds = new Set(snapshot.resources.map(({ id }) => id));

  const problems = [
    ...duplicates(
      snapshot.steps,
      (s) => s.id,
      (i) => `steps.${i}`,
      'id',
    ),
    ...duplicates(
      snapshot.steps,
      (s) => s.order,
      (i) => `steps.${i}`,
      'order',
    ),
    ...duplicates(
      snapshot.skills,
      (s) => s.skillId,
      (i) => `skills.${i}`,
      'skillId',
    ),
    ...duplicates(
      snapshot.outlook,
      (o) => o.id,
      (i) => `outlook.${i}`,
      'id',
    ),
    ...duplicates(
      snapshot.resources,
      (r) => r.id,
      (i) => `resources.${i}`,
      'id',
    ),
  ];

  if (snapshot.steps.length > 0 && !snapshot.pathway)
    problems.push('pathway: steps need a pathway');

  snapshot.steps.forEach((step, stepIndex) => {
    problems.push(
      ...duplicates(
        step.skillIds,
        (id) => id,
        (i) => `steps.${stepIndex}.skillIds.${i}`,
        'skill',
      ),
      ...duplicates(
        step.resourceIds,
        (id) => id,
        (i) => `steps.${stepIndex}.resourceIds.${i}`,
        'resource',
      ),
    );

    step.resourceIds.forEach((id, i) => {
      if (isTempId(id) && !draftResourceIds.has(id))
        problems.push(
          `steps.${stepIndex}.resourceIds.${i}: ${id} is not in resources`,
        );
    });
  });

  return problems;
};
