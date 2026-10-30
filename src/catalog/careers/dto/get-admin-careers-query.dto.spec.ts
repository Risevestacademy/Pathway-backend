import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GetAdminCareersQueryDto } from './get-admin-careers-query.dto';

const check = async (plain: object) => {
  const dto = plainToInstance(GetAdminCareersQueryDto, plain);
  return { dto, errors: await validate(dto) };
};

describe('GetAdminCareersQueryDto', () => {
  it('defaults to page 1 with 20 per page', async () => {
    const { dto, errors } = await check({});

    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({ page: 1, limit: 20 });
  });

  it('coerces query-string numbers', async () => {
    const { dto } = await check({ page: '2', limit: '5' });

    expect(dto).toMatchObject({ page: 2, limit: 5 });
  });

  it('allows a limit of 100 but rejects 101', async () => {
    expect((await check({ limit: 100 })).errors).toHaveLength(0);
    expect((await check({ limit: 101 })).errors).not.toHaveLength(0);
  });

  it.each([{ page: 0 }, { page: 10001 }, { limit: 0 }])(
    'rejects %j',
    async (query) => {
      expect((await check(query)).errors).not.toHaveLength(0);
    },
  );

  it('rejects an unknown status', async () => {
    expect((await check({ status: 'OPEN' })).errors).not.toHaveLength(0);
  });

  it('trims the search and rejects one over 100 characters', async () => {
    expect((await check({ search: '  data  ' })).dto.search).toBe('data');
    expect((await check({ search: 'a'.repeat(101) })).errors).not.toHaveLength(
      0,
    );
  });
});
