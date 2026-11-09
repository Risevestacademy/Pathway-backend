import { isValidAvatarUrl } from './avatar-policy';

describe('Avatar URL Policy', () => {
  const userId = 'user-123';
  const cloudName = 'my-cloud';
  const host = 'res.cloudinary.com';

  it('accepts a valid URL', () => {
    const url = `https://${host}/${cloudName}/image/upload/v123/avatars/${userId}/pic.jpg`;
    expect(isValidAvatarUrl(url, userId, cloudName, host)).toBe(true);
  });

  it('rejects http', () => {
    const url = `http://${host}/${cloudName}/image/upload/v123/avatars/${userId}/pic.jpg`;
    expect(isValidAvatarUrl(url, userId, cloudName, host)).toBe(false);
  });

  it('rejects another user folder', () => {
    const url = `https://${host}/${cloudName}/image/upload/v123/avatars/other-user/pic.jpg`;
    expect(isValidAvatarUrl(url, userId, cloudName, host)).toBe(false);
  });

  it('rejects another host', () => {
    const url = `https://malicious.com/${cloudName}/image/upload/v123/avatars/${userId}/pic.jpg`;
    expect(isValidAvatarUrl(url, userId, cloudName, host)).toBe(false);
  });
});
