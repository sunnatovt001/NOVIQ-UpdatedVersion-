// Opt-in local audit mode: read existing records without syncing pending writes.
export const isReadOnlyAudit = ["audit", "local-ai"].includes(import.meta.env.MODE);
export const isLocalAi = import.meta.env.DEV && import.meta.env.MODE === "local-ai";
