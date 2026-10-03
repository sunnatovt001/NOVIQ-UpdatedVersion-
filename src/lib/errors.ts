export const getAppErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || "");
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";

  if (code === "permission-denied" || /missing or insufficient permissions|permission-denied/i.test(message)) {
    return "Database access is not available for this account yet. Please sign in again; if this continues, deploy the updated Firebase rules.";
  }

  if (/storage\/unauthorized|unauthorized/i.test(code) || /storage\/unauthorized|unauthorized/i.test(message)) {
    return "File upload is not allowed for this account yet. Please sign in again; if this continues, deploy the updated Storage rules.";
  }

  if (/network|offline|failed to fetch/i.test(message)) {
    return "Network connection failed. Check your internet connection and try again.";
  }

  return message || "Something went wrong. Please try again.";
};

export const requireSignedIn = (userId?: string | null) => {
  if (!userId) {
    throw new Error("You must be signed in to use this feature.");
  }
};
