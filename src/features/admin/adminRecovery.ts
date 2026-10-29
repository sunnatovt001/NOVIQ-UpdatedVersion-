import type { AdminUser } from './adminModel';

export const isAdminQuotaError = (message: string) => /quota|resource-exhausted|daily read/i.test(message);
const key = (owner: string) => `noviq:admin-users:${owner}`;
// Session scoped and admin scoped; never invent rows when the server is unavailable.
export function saveAdminUsersCache(owner: string, users: AdminUser[]) {
  if (!owner) return;
  try { sessionStorage.setItem(key(owner), JSON.stringify({ savedAt: Date.now(), users })); } catch { /* Storage may be full or disabled. */ }
}
export function readAdminUsersCache(owner: string): { savedAt: number; users: AdminUser[] } | null {
  if (!owner) return null;
  try {
    const value = JSON.parse(sessionStorage.getItem(key(owner)) || 'null');
    if (!Number.isFinite(value?.savedAt) || !Array.isArray(value?.users)) return null;
    return { savedAt: value.savedAt, users: value.users.map((user: AdminUser) => ({ ...user,
      createdAt: user.createdAt ? new Date(user.createdAt) : null,
      lastActive: user.lastActive ? new Date(user.lastActive) : null,
    })) };
  } catch { return null; }
}
