import { URL } from 'url';

export function isValidAvatarUrl(
  urlString: string,
  userId: string,
  cloudName: string,
  allowedHost: string,
): boolean {
  try {
    const url = new URL(urlString);

    if (url.protocol !== 'https:') return false;
    if (url.hostname !== allowedHost) return false;

    const expectedPathPrefix = `/${cloudName}/image/upload/`;
    if (!url.pathname.startsWith(expectedPathPrefix)) return false;

    const userFolder = `/avatars/${userId}/`;
    if (!url.pathname.includes(userFolder)) return false;

    return true;
  } catch {
    return false;
  }
}
