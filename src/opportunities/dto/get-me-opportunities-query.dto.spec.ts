import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GetMeOpportunitiesQueryDto } from './get-me-opportunities-query.dto';

const check = async (plain: object) =>
  validate(plainToInstance(GetMeOpportunitiesQueryDto, plain));

describe('GetMeOpportunitiesQueryDto', () => {
  it('accepts scope=pathway', async () => {
    expect(await check({ scope: 'pathway' })).toHaveLength(0);
  });

  it.each([{}, { scope: '' }, { scope: 'saved' }, { scope: 'PATHWAY' }])(
    'rejects %j',
    async (query) => {
      expect(await check(query)).not.toHaveLength(0);
    },
  );
});
