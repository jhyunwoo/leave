const PRIMITIVE_TTL_MS = 10_000;
const MAX_PRIMITIVE_KEYS = 100;

/** Prevent one exception from becoming separate boundary/global-handler issues. */
export class ErrorDeduper {
  private readonly objects = new WeakSet<object>();
  private readonly primitives = new Map<string, number>();

  constructor(private readonly now: () => number = Date.now) {}

  shouldCapture(error: unknown): boolean {
    if (
      (typeof error === "object" && error !== null) ||
      typeof error === "function"
    ) {
      const value = error as object;
      if (this.objects.has(value)) return false;
      this.objects.add(value);
      return true;
    }

    let key: string;
    try {
      key = `${typeof error}:${String(error).slice(0, 300)}`;
    } catch {
      key = `${typeof error}:unprintable`;
    }

    const now = this.now();
    const lastSeen = this.primitives.get(key);
    if (lastSeen !== undefined && now - lastSeen < PRIMITIVE_TTL_MS) {
      return false;
    }

    this.primitives.set(key, now);
    if (this.primitives.size > MAX_PRIMITIVE_KEYS) {
      for (const [candidate, seenAt] of this.primitives) {
        if (now - seenAt >= PRIMITIVE_TTL_MS) this.primitives.delete(candidate);
        if (this.primitives.size <= MAX_PRIMITIVE_KEYS) break;
      }
      if (this.primitives.size > MAX_PRIMITIVE_KEYS) {
        this.primitives.delete(this.primitives.keys().next().value as string);
      }
    }
    return true;
  }
}
