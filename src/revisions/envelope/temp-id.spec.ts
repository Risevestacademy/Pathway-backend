import { rewriteTempIds } from './temp-id';

describe('rewriteTempIds', () => {
  it('rewrites a scalar path', () => {
    const out = rewriteTempIds(
      { id: 'new-1' },
      [{ path: 'id', kind: 'scalar' }],
      new Map([['new-1', 'real-1']]),
    );
    expect(out).toEqual({ id: 'real-1' });
  });

  it('leaves an untouched scalar path unchanged', () => {
    const out = rewriteTempIds(
      { id: 'real-1' },
      [{ path: 'id', kind: 'scalar' }],
      new Map([['new-1', 'real-1']]),
    );
    expect(out).toEqual({ id: 'real-1' });
  });

  it('rewrites an array of scalars', () => {
    const out = rewriteTempIds(
      { resourceIds: ['new-1', 'real-2'] },
      [{ path: 'resourceIds[]', kind: 'array' }],
      new Map([['new-1', 'real-1']]),
    );
    expect(out).toEqual({ resourceIds: ['real-1', 'real-2'] });
  });

  it('rewrites nested array-of-objects paths', () => {
    const out = rewriteTempIds(
      { steps: [{ id: 'new-1' }, { id: 'real-2' }] },
      [{ path: 'steps[].id', kind: 'scalar' }],
      new Map([['new-1', 'real-1']]),
    );
    expect(out).toEqual({ steps: [{ id: 'real-1' }, { id: 'real-2' }] });
  });

  it('leaves a temp ID not in the map unchanged (does NOT strip it)', () => {
    const out = rewriteTempIds(
      { parentId: 'new-1' },
      [{ path: 'parentId', kind: 'scalar' }],
      new Map(),
    );
    expect(out).toEqual({ parentId: 'new-1' });
  });
});
