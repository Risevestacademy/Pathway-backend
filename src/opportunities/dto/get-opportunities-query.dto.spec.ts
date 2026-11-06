import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GetOpportunitiesQueryDto } from './get-opportunities-query.dto';

const check = async (plain: object) => {
  const dto = plainToInstance(GetOpportunitiesQueryDto, plain);
  return { dto, errors: await validate(dto) };
};

describe('GetOpportunitiesQueryDto', () => {
  it('defaults to page 1 with 20 per page', async () => {
    const { dto, errors } = await check({});

    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({ page: 1, limit: 20 });
  });

  it('coerces query-string numbers', async () => {
    const { dto } = await check({ page: '2', limit: '5' });

    expect(dto).toMatchObject({ page: 2, limit: 5 });
  });

  it('caps a limit above 50 instead of rejecting it', async () => {
    const { dto, errors } = await check({ limit: '1000' });

    expect(errors).toHaveLength(0);
    expect(dto.limit).toBe(50);
  });

  it.each([{ page: '0' }, { page: '10001' }, { limit: '0' }, { limit: 'abc' }])(
    'rejects %j',
    async (query) => {
      expect((await check(query)).errors).not.toHaveLength(0);
    },
  );

  it('rejects an unknown type', async () => {
    expect((await check({ type: 'GIG' })).errors).not.toHaveLength(0);
  });

  it.each(['careerId', 'excludeId'])(
    'rejects a %s that is not a UUID',
    async (key) => {
      expect((await check({ [key]: 'abc' })).errors).not.toHaveLength(0);
    },
  );

  it('trims the search and rejects one over 100 characters', async () => {
    expect((await check({ search: '  data  ' })).dto.search).toBe('data');
    expect((await check({ search: 'a'.repeat(101) })).errors).not.toHaveLength(
      0,
    );
  });
});
