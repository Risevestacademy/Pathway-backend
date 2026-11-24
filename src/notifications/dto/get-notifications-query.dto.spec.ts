import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GetNotificationsQueryDto } from './get-notifications-query.dto';

const check = async (plain: object) => {
  const dto = plainToInstance(GetNotificationsQueryDto, plain);
  return { dto, errors: await validate(dto) };
};

describe('GetNotificationsQueryDto', () => {
  it('defaults to all, 20 per page', async () => {
    const { dto, errors } = await check({});

    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({ filter: 'all', limit: 20 });
  });

  it('coerces a query-string limit', async () => {
    expect((await check({ limit: '5' })).dto.limit).toBe(5);
  });

  it('allows a limit of 50 but rejects 51', async () => {
    expect((await check({ limit: '50' })).errors).toHaveLength(0);
    expect((await check({ limit: '51' })).errors).not.toHaveLength(0);
  });

  it.each([{ limit: '0' }, { limit: 'ten' }, { filter: 'read' }])(
    'rejects %j',
    async (query) => {
      expect((await check(query)).errors).not.toHaveLength(0);
    },
  );

  it('rejects a cursor over 128 characters', async () => {
    expect((await check({ cursor: 'a'.repeat(129) })).errors).not.toHaveLength(
      0,
    );
  });
});
