export const RETIRED_PLANS_STORAGE_KEY = 'moi-ritm.plans.v1'

export function clearRetiredPlansStorage(): void {
  try {
    window.localStorage.removeItem(RETIRED_PLANS_STORAGE_KEY)
  } catch {
    // Storage may be unavailable in private browsing; no other state is touched.
  }
}
