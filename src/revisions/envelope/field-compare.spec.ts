import { describe, expect, it } from '@jest/globals';
import { Prisma } from '../../generated/prisma/client';
import type { PlanOperation } from './strategy.types';
import {
  compareFields,
  findFieldProblems,
  missingRequiredFields,
  normalizeDate,
  normalizeDecimal,
  type FieldConfigEntry,
} from './field-compare';

describe('normalizeDecimal', () => {
  it('gives equal numbers the same form whatever their trailing zeros', () => {
    expect(normalizeDecimal(new Prisma.Decimal('100.00'))).toBe(
      normalizeDecimal('100'),
    );
    expect(normalizeDecimal('30000.00')).toBe(
      normalizeDecimal(new Prisma.Decimal('30000')),
    );
    expect(normalizeDecimal(8.5)).toBe(normalizeDecimal('8.50'));
  });

  it('parses other numeric spellings', () => {
    expect(normalizeDecimal('.5')).toBe(
      normalizeDecimal(new Prisma.Decimal('0.5')),
    );
    expect(normalizeDecimal('1e3')).toBe(normalizeDecimal('1000'));
    expect(normalizeDecimal('+5')).toBe(normalizeDecimal('5'));
  });

  it('rounds to the given scale', () => {
    expect(normalizeDecimal('30000.004', 2)).toBe(normalizeDecimal('30000', 2));
    expect(normalizeDecimal('30000.005', 2)).toBe(
      normalizeDecimal('30000.01', 2),
    );
  });

  it('keeps different numbers different', () => {
    expect(normalizeDecimal('100.01')).not.toBe(normalizeDecimal('100'));
  });

  it('passes through null, undefined and non-numeric strings', () => {
    expect(normalizeDecimal(null)).toBeNull();
    expect(normalizeDecimal(undefined)).toBeUndefined();
    expect(normalizeDecimal('HIGH')).toBe('HIGH');
  });
});

describe('normalizeDate', () => {
  it('gives a Date and an ISO string for the same instant the same form', () => {
    expect(normalizeDate(new Date('2026-01-01T00:00:00.000Z'))).toBe(
      normalizeDate('2026-01-01T01:00:00+01:00'),
    );
  });

  it('passes through null and unparseable strings', () => {
    expect(normalizeDate(null)).toBeNull();
    expect(normalizeDate('not a date')).toBe('not a date');
  });
});

describe('compareFields', () => {
  const config: FieldConfigEntry[] = [
    { field: 'cost', kind: 'decimal', section: 'resources', label: 'Cost' },
    { field: 'checked', kind: 'date', section: 'resources', label: 'Checked' },
  ];

  it('emits no update when decimal and date values are equal in another form', () => {
    const operations: PlanOperation[] = [];
    compareFields(
      config,
      {
        cost: new Prisma.Decimal('100'),
        checked: new Date('2026-01-01T00:00:00.000Z'),
      },
      { cost: '100.00', checked: '2026-01-01T00:00:00.000Z' },
      'id-1',
      operations,
    );
    expect(operations).toEqual([]);
  });

  it('emits updates carrying the snapshot values unchanged', () => {
    const operations: PlanOperation[] = [];
    const live = {
      cost: new Prisma.Decimal('100'),
      checked: new Date('2026-01-01T00:00:00.000Z'),
    };
    compareFields(
      config,
      live,
      { cost: '99.50', checked: null },
      'id-1',
      operations,
    );
    expect(operations).toEqual([
      {
        kind: 'update',
        section: 'resources',
        entityId: 'id-1',
        field: 'cost',
        before: live.cost,
        after: '99.50',
      },
      {
        kind: 'update',
        section: 'resources',
        entityId: 'id-1',
        field: 'checked',
        before: live.checked,
        after: null,
      },
    ]);
  });
});

describe('compareFields with omitted or mistyped values', () => {
  const config: FieldConfigEntry[] = [
    { field: 'name', kind: 'scalar', section: 'skills', label: 'Name' },
    { field: 'tags', kind: 'array', section: 'skills', label: 'Tags' },
  ];

  it('treats a field the snapshot omits as unchanged', () => {
    const operations: PlanOperation[] = [];
    compareFields(config, { name: null, tags: ['a'] }, {}, 'id-1', operations);
    expect(operations).toEqual([]);
  });

  it('emits an update instead of throwing when an array field is not an array', () => {
    const operations: PlanOperation[] = [];
    compareFields(
      config,
      { name: 'x', tags: ['a'] },
      { name: 'x', tags: null },
      'id-1',
      operations,
    );
    expect(operations).toEqual([
      expect.objectContaining({ field: 'tags', before: ['a'], after: null }),
    ]);
  });
});

describe('findFieldProblems', () => {
  const config: FieldConfigEntry[] = [
    {
      field: 'name',
      kind: 'scalar',
      section: 'skills',
      label: 'Name',
      required: true,
      valueType: 'string',
    },
    {
      field: 'weeks',
      kind: 'scalar',
      section: 'skills',
      label: 'Weeks',
      valueType: 'int',
    },
    {
      field: 'level',
      kind: 'scalar',
      section: 'skills',
      label: 'Level',
      valueType: ['LOW', 'HIGH'],
    },
    { field: 'cost', kind: 'decimal', section: 'skills', label: 'Cost' },
    {
      field: 'growth',
      kind: 'decimal',
      section: 'skills',
      label: 'Growth',
      precision: 5,
      scale: 2,
    },
    { field: 'checked', kind: 'date', section: 'skills', label: 'Checked' },
    { field: 'tags', kind: 'array', section: 'skills', label: 'Tags' },
  ];

  it('accepts well-typed values and skips null or omitted optional ones', () => {
    expect(
      findFieldProblems(config, {
        name: 'x',
        weeks: 3,
        level: 'LOW',
        cost: '1.50',
        checked: '2026-01-01T00:00:00+01:00',
        tags: [],
      }),
    ).toEqual([]);
    expect(findFieldProblems(config, { name: 'x', weeks: null })).toEqual([]);
  });

  it('rejects date-times without seconds, which Prisma refuses', () => {
    expect(
      findFieldProblems(config, { name: 'x', checked: '2026-03-01T10:00Z' }),
    ).toEqual(['checked: must be an ISO 8601 date-time']);
  });

  it('rejects calendar dates that do not exist', () => {
    expect(
      findFieldProblems(config, {
        name: 'x',
        checked: '2026-02-30T00:00:00Z',
      }),
    ).toEqual(['checked: must be an ISO 8601 date-time']);
    expect(
      findFieldProblems(config, {
        name: 'x',
        checked: '2028-02-29T23:59:59-05:00',
      }),
    ).toEqual([]);
  });

  it('rejects decimals that overflow the column precision', () => {
    expect(findFieldProblems(config, { name: 'x', growth: '999.99' })).toEqual(
      [],
    );
    expect(findFieldProblems(config, { name: 'x', growth: '999.994' })).toEqual(
      [],
    );
    expect(findFieldProblems(config, { name: 'x', growth: '1000' })).toEqual([
      'growth: must be between -999.99 and 999.99',
    ]);
    expect(
      findFieldProblems(config, { name: 'x', growth: '-999.995' }),
    ).toEqual(['growth: must be between -999.99 and 999.99']);
  });

  it('rejects integers outside the 32-bit range', () => {
    expect(findFieldProblems(config, { name: 'x', weeks: 2147483647 })).toEqual(
      [],
    );
    expect(findFieldProblems(config, { name: 'x', weeks: 2147483648 })).toEqual(
      ['weeks: must be between -2147483648 and 2147483647'],
    );
  });

  it('reports a missing required field once, without a type problem', () => {
    expect(findFieldProblems(config, { name: '' })).toEqual(['name: required']);
  });

  it('reports each mistyped value', () => {
    expect(
      findFieldProblems(config, {
        name: 1,
        weeks: 1.5,
        level: 'MID',
        cost: 'NaN',
        checked: '2026-01-01',
        tags: 'a',
      }),
    ).toEqual([
      'name: must be a string',
      'weeks: must be an integer',
      'level: must be one of LOW, HIGH',
      'cost: must be a decimal number',
      'checked: must be an ISO 8601 date-time',
      'tags: must be a list of strings',
    ]);
  });
});

describe('missingRequiredFields', () => {
  it('returns the required entries whose value is null, undefined or empty', () => {
    const config: FieldConfigEntry[] = [
      {
        field: 'a',
        kind: 'scalar',
        section: 'skills',
        label: 'A',
        required: true,
      },
      {
        field: 'b',
        kind: 'scalar',
        section: 'skills',
        label: 'B',
        required: true,
      },
      {
        field: 'c',
        kind: 'scalar',
        section: 'skills',
        label: 'C',
        required: true,
      },
      {
        field: 'd',
        kind: 'scalar',
        section: 'skills',
        label: 'D',
        required: true,
      },
      { field: 'e', kind: 'scalar', section: 'skills', label: 'E' },
    ];
    expect(
      missingRequiredFields(config, { a: '', b: null, d: 'ok', e: '' }).map(
        (entry) => entry.field,
      ),
    ).toEqual(['a', 'b', 'c']);
  });
});
