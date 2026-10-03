// A missing or unreachable session service must never hold the timer controls.
export async function withFocusTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs = 5000,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Session server timed out")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}
