export function errorMessage(error: unknown, fallback = "Request failed.") {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const directMessage = record.message ?? record.error ?? record.details ?? record.hint;
    if (typeof directMessage === "string" && directMessage.trim()) {
      return directMessage;
    }
    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== "{}") {
        return serialized;
      }
    } catch {
      return fallback;
    }
  }
  return fallback;
}
