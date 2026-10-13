import { join } from 'node:path';
import Handlebars from 'handlebars';
import { TemplateRenderer } from './template-renderer.service';

// Tests run from the repo root against the source files
const TEMPLATES_DIR = join(process.cwd(), 'src', 'notifications', 'templates');

describe('TemplateRenderer', () => {
  let renderer: TemplateRenderer;

  beforeAll(() => {
    renderer = new TemplateRenderer(TEMPLATES_DIR);
    renderer.onModuleInit();
  });

  it('renders the password-reset email with link and expiry', () => {
    const resetUrl = 'http://localhost:5173/reset-password?token=abc123';

    const { subject, html, text } = renderer.render('password-reset', {
      resetUrl,
      expiresInMinutes: 60,
    });

    expect(subject).toBe('Reset your Pathway password');
    // HTML output is escaped: `=` becomes `&#x3D;`, which mail clients decode
    expect(html).toContain(`href="${Handlebars.escapeExpression(resetUrl)}"`);
    expect(html).toContain('60 minutes');
    // Text output is not escaped
    expect(text).toContain(resetUrl);
    expect(text).toContain('60 minutes');
  });

  it('keeps the URL unescaped in the text version', () => {
    const resetUrl = 'http://localhost:5173/reset-password?token=abc&x=1';

    const { text } = renderer.render('password-reset', {
      resetUrl,
      expiresInMinutes: 30,
    });

    expect(text).toContain(resetUrl);
  });

  it('renders the email verification OTP with the code and expiry', () => {
    const { subject, html, text } = renderer.render('email-verification-otp', {
      otp: '123456',
      expiresInMinutes: 15,
    });

    expect(subject).toBe('Your Pathway verification code');
    expect(html).toContain('123456');
    expect(html).toContain('15 minutes');
    expect(text).toContain('123456');
    expect(text).toContain('15 minutes');
  });

  it('renders a zero-padded OTP with leading zeros intact', () => {
    const { html, text } = renderer.render('email-verification-otp', {
      otp: '000042',
      expiresInMinutes: 15,
    });

    expect(html).toContain('000042');
    expect(text).toContain('000042');
  });

  it('renders the welcome email', () => {
    const { subject, text } = renderer.render('welcome', { name: 'Ada' });

    expect(subject).toBe('Welcome to Pathway');
    expect(text).toContain('Hi Ada, welcome to Pathway!');
  });

  it('escapes user data in the HTML version', () => {
    const { html } = renderer.render('welcome', {
      name: '<script>alert(1)</script>',
    });

    expect(html).not.toContain('<script>');
  });

  it('throws when template data is missing', () => {
    expect(() =>
      renderer.render('password-reset', { expiresInMinutes: 30 }),
    ).toThrow();

    expect(() =>
      renderer.render('email-verification-otp', { expiresInMinutes: 15 }),
    ).toThrow();
  });

  it('throws for an unknown template', () => {
    expect(() => renderer.render('does-not-exist' as never, {})).toThrow(
      'Unknown notification template',
    );
  });

  it('no longer registers the old link-based email-verification template', () => {
    expect(() =>
      renderer.render('email-verification' as never, {
        verificationUrl: 'http://localhost/verify?token=abc',
        expiresInMinutes: 1440,
      }),
    ).toThrow('Unknown notification template');
  });
});
