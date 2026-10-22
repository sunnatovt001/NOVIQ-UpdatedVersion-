import type { UserProfile } from '@/src/types';
import { isPro } from '@/src/lib/subscription';
import { loadLocalData, trySaveLocalData } from '@/src/lib/localStore';

export const avatarOptions = (premium: boolean) =>
  Array.from({ length: 4 }, (_, index) => `/avatars/${premium ? 'pro' : 'free'}-${index + 1}.png`);

export function getProfileAvatar(profile?: UserProfile | null): string {
  const premium = isPro(profile);
  const photo = profile?.photoURL || '';
  const preset = photo.match(/^\/avatars\/(?:free|pro)-([1-4])\.png$/);
  if (preset) return avatarOptions(premium)[Number(preset[1]) - 1];
  if (photo && !/api\.dicebear\.com|profile-placeholder\.svg/.test(photo)) return photo;
  if (!profile?.uid) return avatarOptions(premium)[0];
  const key = `noviq:${profile.uid}:avatar-index`;
  let index = loadLocalData<number>(key, -1);
  if (!Number.isInteger(index) || index < 0 || index > 3) {
    const values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    index = values[0] % 4;
    trySaveLocalData(key, index);
  }
  return avatarOptions(premium)[index];
}
