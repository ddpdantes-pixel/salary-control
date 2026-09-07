import { PLAN_BONUS_LEVEL_1, PRODUCT_GROUP_BONUS_THRESHOLD } from './calculations'
import type { SalaryMonth } from './types'

export interface HomePlanProgressValue {
  actual: number
  plan: number
  remaining: number
  overage: number
  progressPercent: number | null
  isComplete: boolean
}

export function calculateHomePlanProgress(
  planValue: number,
  actualValue: number,
): HomePlanProgressValue {
  const plan = Number.isFinite(planValue) ? Math.max(0, planValue) : 0
  const actual = Number.isFinite(actualValue) ? Math.max(0, actualValue) : 0

  if (plan === 0) {
    return {
      actual,
      plan,
      remaining: 0,
      overage: 0,
      progressPercent: null,
      isComplete: false,
    }
  }

  return {
    actual,
    plan,
    remaining: Math.max(plan - actual, 0),
    overage: Math.max(actual - plan, 0),
    progressPercent: Math.min(100, Math.max(0, (actual / plan) * 100)),
    isComplete: actual >= plan,
  }
}

export function getHomePlanProgress(month: SalaryMonth): Array<{
  id: 'total' | 'artkera' | 'laparet'
  title: string
  value: HomePlanProgressValue
}> {
  return [
    {
      id: 'total',
      title: 'Продажи',
      value: calculateHomePlanProgress(PLAN_BONUS_LEVEL_1, month.salesTotal),
    },
    {
      id: 'artkera',
      title: 'Арткера',
      value: calculateHomePlanProgress(PRODUCT_GROUP_BONUS_THRESHOLD, month.salesArtkera),
    },
    {
      id: 'laparet',
      title: 'Лапарет',
      value: calculateHomePlanProgress(PRODUCT_GROUP_BONUS_THRESHOLD, month.salesLaparet),
    },
  ]
}
