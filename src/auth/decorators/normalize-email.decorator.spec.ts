import { plainToInstance } from 'class-transformer';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';

describe('NormalizeEmail', () => {
  it.each([RegisterDto, LoginDto])(
    'trims and lowercases the email on %p',
    (dto) => {
      const instance = plainToInstance(dto, {
        email: '  Jane.Doe@Example.COM ',
        password: 'Password123!',
      });

      expect(instance.email).toBe('jane.doe@example.com');
    },
  );

  it('leaves a non-string email for validation to reject', () => {
    const instance = plainToInstance(LoginDto, { email: 42 });

    expect(instance.email).toBe(42);
  });
});
