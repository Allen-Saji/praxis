import { isSerializationFailure } from "../errors";

export async function withSerializationRetry<T>(operation: () => Promise<T>, maxAttempts = 3): Promise<T> {
  const attempts = Math.max(1, Math.min(3, Math.trunc(maxAttempts)));
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isSerializationFailure(error) || attempt >= attempts) throw error;
      const delay = Math.min(100, 5 * (2 ** (attempt - 1))) + Math.floor(Math.random() * 5);
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }
}
