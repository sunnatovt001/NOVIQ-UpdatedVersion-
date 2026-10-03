export const getAdminEmails = () => {
  const raw = String(import.meta.env.VITE_ADMIN_EMAILS || "");
  return raw.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
};

export const isAdminEmail = (email?: string) => {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return getAdminEmails().includes(normalized);
};
