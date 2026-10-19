// Encoded body observations are not network transfer bytes. Repeated asset
// observations may include cache hits; keep both totals explicit.
export const summarizeResources = resources => {
  const unique = new Map();
  let observedEncodedBodyBytes = 0;
  for (const resource of resources) {
    const bytes = Number.isFinite(resource.bytes) ? Math.max(0, resource.bytes) : 0;
    observedEncodedBodyBytes += bytes;
    unique.set(resource.name, Math.max(unique.get(resource.name) || 0, bytes));
  }
  return {
    observedEncodedBodyBytes,
    uniqueEncodedBodyBytes: [...unique.values()].reduce((total, bytes) => total + bytes, 0),
    repeatedResourceEntries: resources.length - unique.size,
  };
};
