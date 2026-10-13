// Short random ids for saved items.
export function uid(): string {
  try {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  } catch {
    return Math.random().toString(36).slice(2, 14);
  }
}
