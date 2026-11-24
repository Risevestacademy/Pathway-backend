import { rewriteTempIds } from './temp-id';

describe('rewriteTempIds', () => {
  const map = new Map([
    ['new-1', 'real-1'],
    ['new-2', 'real-2'],
  ]);

  it('returns a deep copy when there is nothing to rewrite', () => {
    const snapshot = { a: 1, nested: { b: [1, 2] } };
    const out = rewriteTempIds(snapshot, [], map);
    expect(out).toEqual(snapshot);
    expect(out).not.toBe(snapshot);
    (out as typeof snapshot).nested.b.push(3);
    expect(snapshot.nested.b).toEqual([1, 2]);
  });

  it('rewrites a scalar leaf', () => {
    const snapshot = { resources: [{ id: 'new-1' }, { id: 'real-x' }] };
    const out = rewriteTempIds(
      snapshot,
      [{ path: 'resources[].id', kind: 'scalar' }],
      map,
    );
    expect(out).toEqual({ resources: [{ id: 'real-1' }, { id: 'real-x' }] });
  });

  it('rewrites an array leaf', () => {
    const snapshot = { steps: [{ resourceIds: ['new-1', 'real-x', 'new-2'] }] };
    const out = rewriteTempIds(
      snapshot,
      [{ path: 'steps[].resourceIds[]', kind: 'array' }],
      map,
    );
    expect(out).toEqual({
      steps: [{ resourceIds: ['real-1', 'real-x', 'real-2'] }],
    });
  });

  it('leaves temp IDs not in the map alone', () => {
    const snapshot = { id: 'new-9' };
    const out = rewriteTempIds(snapshot, [{ path: 'id', kind: 'scalar' }], map);
    expect(out).toEqual({ id: 'new-9' });
  });

  it('does not mutate the original', () => {
    const snapshot = { resources: [{ id: 'new-1' }] };
    rewriteTempIds(snapshot, [{ path: 'resources[].id', kind: 'scalar' }], map);
    expect(snapshot.resources[0].id).toBe('new-1');
  });

  it('skips a missing intermediate', () => {
    const snapshot = { resources: [] };
    const out = rewriteTempIds(
      snapshot,
      [{ path: 'steps[].resourceIds[]', kind: 'array' }],
      map,
    );
    expect(out).toEqual({ resources: [] });
  });

  it('skips a non-array where an array is expected', () => {
    const snapshot = { resources: 'oops' };
    const out = rewriteTempIds(
      snapshot,
      [{ path: 'resources[].id', kind: 'scalar' }],
      map,
    );
    expect(out).toEqual({ resources: 'oops' });
  });

  it('rejects a kind/segment mismatch', () => {
    expect(() =>
      rewriteTempIds({}, [{ path: 'resources[].id[]', kind: 'scalar' }], map),
    ).toThrow(/kind "scalar" but its last segment is array/);
  });

  it('rejects a malformed path', () => {
    expect(() =>
      rewriteTempIds({}, [{ path: 'a..b', kind: 'scalar' }], map),
    ).toThrow(/empty segment/);
  });
});
