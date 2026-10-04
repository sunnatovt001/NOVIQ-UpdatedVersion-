// Opt-in local audit mode: read existing records without syncing pending writes.
export const isReadOnlyAudit = import.meta.env.MODE === "audit";
