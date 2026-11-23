import { createValidationPipe } from '../../common/pipes/validation.pipe';
import { UpdateNotificationPreferenceDto } from './update-notification-preference.dto';

describe('UpdateNotificationPreferenceDto', () => {
  const validate = (body: unknown): Promise<unknown> =>
    createValidationPipe().transform(body, {
      type: 'body',
      metatype: UpdateNotificationPreferenceDto,
    });

  it.each([
    { inAppEnabled: false },
    { emailEnabled: true },
    { inAppEnabled: true, emailEnabled: false },
  ])('accepts %j', async (body) => {
    await expect(validate(body)).resolves.toMatchObject(body);
  });

  it.each([{}, undefined])('rejects an empty body (%j)', async (body) => {
    const required =
      'at least one of inAppEnabled and emailEnabled is required';

    await expect(validate(body)).rejects.toMatchObject({
      fields: { inAppEnabled: required, emailEnabled: required },
    });
  });

  it.each([null, 'false', 0])('rejects %j for a channel', async (value) => {
    await expect(validate({ inAppEnabled: value })).rejects.toMatchObject({
      fields: { inAppEnabled: 'must be a boolean value' },
    });
    await expect(
      validate({ inAppEnabled: true, emailEnabled: value }),
    ).rejects.toMatchObject({
      fields: { emailEnabled: 'must be a boolean value' },
    });
  });

  it('rejects an unknown field', async () => {
    await expect(
      validate({ inAppEnabled: true, smsEnabled: true }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
