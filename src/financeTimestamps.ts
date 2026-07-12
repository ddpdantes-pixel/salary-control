export function deriveFinanceEventTimestamp(
  eventDate: string,
  ...candidates: Array<string | undefined>
): string {
  for (const candidate of candidates) {
    if (!isFinanceTimestamp(candidate)) continue
    const normalized = new Date(candidate).toISOString()
    if (normalized.slice(0, 10) >= eventDate) return normalized
  }
  return `${eventDate}T12:00:00.000Z`
}

export function isFinanceTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T/.test(value) &&
    !Number.isNaN(Date.parse(value))
  )
}
