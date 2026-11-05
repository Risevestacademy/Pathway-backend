export const splitFullName = (
  fullName?: string | null,
): { firstName?: string; lastName?: string } => {
  const [firstName, ...rest] = (fullName ?? '').trim().split(/\s+/);
  if (!firstName) return {};
  return { firstName, lastName: rest.join(' ') || undefined };
};

export const joinNames = (
  firstName?: string | null,
  lastName?: string | null,
): string | null => [firstName, lastName].filter(Boolean).join(' ') || null;
