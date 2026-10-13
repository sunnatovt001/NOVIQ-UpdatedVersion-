export type AdminMigrationStatus = {
  archives: Array<{ _id: string; count: number; verified: boolean; readTime: string }>;
  applicationCutover: boolean;
};

// Same-origin HttpOnly cookie only. Do not put session tokens in localStorage.
export async function getAdminMigrationStatus(signal?: AbortSignal): Promise<AdminMigrationStatus> {
  const response = await fetch('/api/admin/migration-status', {
    credentials: 'same-origin', cache: 'no-store',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    throw new Error(response.status === 401 ? 'Sign in to the new backend first.' :
      response.status === 403 ? 'Admin access required.' : 'Admin service unavailable.');
  }
  const data: unknown = await response.json();
  if (!data || typeof data !== 'object' || !('archives' in data) || !Array.isArray(data.archives) ||
      !('applicationCutover' in data) || typeof data.applicationCutover !== 'boolean' ||
      data.archives.length > 10 || !data.archives.every(row => row && typeof row._id === 'string' &&
        Number.isInteger(row.count) && row.count >= 0 && typeof row.verified === 'boolean' && typeof row.readTime === 'string')) {
    throw new Error('Invalid admin service response.');
  }
  return data as AdminMigrationStatus;
}
