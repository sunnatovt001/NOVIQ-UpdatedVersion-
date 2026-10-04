// Legacy records use ISO strings while current records use Firestore timestamps.
export const recordDate = (value: unknown): Date | undefined => {
  try {
    let date: Date;
    if (value instanceof Date) date = value;
    else if (typeof value === "string" || typeof value === "number") date = new Date(value);
    else if (value && typeof value === "object") {
      const timestamp = value as { toDate?: () => Date; seconds?: number };
      if (typeof timestamp.toDate === "function") date = timestamp.toDate();
      else if (typeof timestamp.seconds === "number") date = new Date(timestamp.seconds * 1000);
      else return undefined;
    } else return undefined;
    return date instanceof Date && Number.isFinite(date.getTime()) ? date : undefined;
  } catch {
    return undefined;
  }
};
