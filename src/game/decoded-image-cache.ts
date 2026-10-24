interface DecodedImage {
  readonly naturalWidth: number;
  readonly naturalHeight: number;
}

/** A bounded warm cache; callers keep ownership of images they still draw. */
export class DecodedImageCache<T extends DecodedImage> {
  private entries = new Map<string, { promise: Promise<T>; bytes?: number }>();
  private bytes = 0;

  constructor(private readonly budget: number) {}

  get(key: string, load: () => Promise<T>): Promise<T> {
    const cached = this.entries.get(key);
    if (cached) {
      // Recency follows requests, so an old slow decode cannot displace newer requests.
      this.entries.delete(key);
      this.entries.set(key, cached);
      return cached.promise;
    }
    const entry = { promise: load(), bytes: undefined as number | undefined };
    this.entries.set(key, entry);
    entry.promise.then(
      (image) => {
        entry.bytes = image.naturalWidth * image.naturalHeight * 4;
        if (entry.bytes > this.budget) {
          this.entries.delete(key);
          return;
        }
        this.bytes += entry.bytes;
        for (const [oldKey, old] of this.entries) {
          if (this.bytes <= this.budget) break;
          // Keep pending work shared, even while completed images exceed the budget.
          if (old.bytes === undefined) continue;
          this.entries.delete(oldKey);
          this.bytes -= old.bytes;
        }
      },
      () => this.entries.delete(key),
    );
    return entry.promise;
  }
}
