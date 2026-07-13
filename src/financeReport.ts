import { formatMoney } from './financeMoney'
import { formatDateLabel, formatShortDateLabel } from './format'
import type { FinanceCalendarItem } from './financeCalendar'
import type { FinanceOverviewData } from './financeOverview'
import type { BalanceAnchor } from './financeTypes'

export function buildFinanceReport(input: {
  startDate: string
  endDate: string
  anchor: BalanceAnchor | null
  currentBalanceKopecks: number
  overview: FinanceOverviewData
  items: FinanceCalendarItem[]
}): string {
  const periodItems = input.items.filter(
    (item) =>
      item.operation.date >= input.startDate &&
      item.operation.date <= input.endDate,
  )
  const lines = [
    'ФИНАНСОВЫЙ ОТЧЁТ',
    `Период: ${formatDateLabel(input.startDate)} — ${formatDateLabel(input.endDate)}`,
    '',
  ]

  if (input.anchor) {
    lines.push(
      `Фактический остаток: ${formatDateLabel(input.anchor.date)} — ${formatMoney(input.anchor.balanceKopecks)}`,
    )
  }

  lines.push(
    `Текущий расчётный остаток: ${formatMoney(input.currentBalanceKopecks)}`,
    `Статус: ${input.overview.coverage.headline}`,
    input.overview.coverage.detail,
  )

  if (input.overview.nextPayment) {
    lines.push(
      `Ближайший платёж: ${formatDateLabel(input.overview.nextPayment.operation.date)} — ${input.overview.nextPayment.operation.title}, ${formatNullableMoney(input.overview.nextPayment.operation.amountKopecks)}`,
    )
  }

  if (input.overview.forecast.firstNegativeItem) {
    lines.push(
      `Первый отрицательный остаток: ${formatDateLabel(input.overview.forecast.firstNegativeItem.operation.date)}`,
      `Нехватка: ${formatMoney(Math.abs(input.overview.forecast.firstNegativeItem.balanceAfterKopecks))}`,
    )
  }

  const unknownOperations = periodItems.filter(
    (item) => item.operation.amountKopecks === null,
  )
  if (unknownOperations.length > 0) {
    lines.push(
      '',
      'Нужно уточнить:',
      ...unknownOperations.map(
        (item) =>
          `- ${formatDateLabel(item.operation.date)} — ${item.operation.title}`,
      ),
    )
  }

  lines.push('', 'ФИНАНСОВАЯ ЛЕНТА', '')
  if (periodItems.length === 0) {
    lines.push('За выбранный период операций нет.')
  } else {
    lines.push(...periodItems.flatMap(formatFinanceFeedItem))
  }

  return lines.join('\n').trim()
}

export function formatFinanceFeedItem(item: FinanceCalendarItem): string[] {
  const operation = item.operation
  const lines = [
    `📅 ${formatCompactDate(operation.date)} — ${operation.title}`,
    '',
  ]
  if (item.salaryForecastSourceDate) {
    lines.push(
      `Прогноз по выплате ${formatShortDateLabel(item.salaryForecastSourceDate)}`,
      '',
    )
  }
  if (
    operation.status === 'completed' &&
    operation.completedDate &&
    operation.scheduledDate &&
    operation.completedDate < operation.scheduledDate
  ) {
    lines.push(
      `Оплачено досрочно ${formatFullNumericDate(operation.completedDate)}`,
      `По графику: ${formatFullNumericDate(operation.scheduledDate)}`,
      '',
    )
  }

  if (operation.direction === 'income') {
    lines.push(
      `Поступление: +${formatNullableMoney(operation.grossIncomeKopecks ?? operation.amountKopecks)}`,
    )
    if ((operation.personalExpenseDeductions?.length ?? 0) > 0) {
      for (const expense of operation.personalExpenseDeductions ?? []) {
        lines.push(`→ ${expense.title}: −${formatMoney(expense.amountKopecks)}`)
      }
    } else if ((operation.rentKopecks ?? 0) > 0) {
      lines.push(`→ аренда: −${formatMoney(operation.rentKopecks ?? 0)}`)
    }
    if ((operation.livingAmountKopecks ?? 0) > 0) {
      lines.push(
        `→ на жизнь ${formatCompactDate(operation.date)}→${formatCompactDate(operation.livingUntilDate ?? operation.date)}: ${operation.livingDays ?? 0} × ${formatMoney(operation.livingRateKopecks ?? 0)} = ${formatMoney(operation.livingAmountKopecks ?? 0)}`,
      )
    }
    if (operation.source === 'salary' && operation.amountKopecks !== null) {
      lines.push(
        `→ в кредит: +${formatMoney(operation.transferToCreditKopecks ?? operation.amountKopecks)}`,
      )
    }
    if ((operation.shortageKopecks ?? 0) > 0) {
      lines.push(
        '',
        'Недостаток:',
        `поступление − аренда − жизнь = −${formatMoney(operation.shortageKopecks ?? 0)}`,
      )
    }
  } else {
    lines.push(`Списание: −${formatNullableMoney(operation.amountKopecks)}`)
  }

  lines.push('', 'Остаток:')
  if (item.affectsBalance && item.balanceAfterKopecks !== null) {
    const sign = operation.direction === 'income' ? '+' : '−'
    lines.push(
      `${formatMoney(item.balanceBeforeKopecks)} ${sign} ${formatMoney(operation.amountKopecks ?? 0)} = ${formatMoney(item.balanceAfterKopecks)}`,
    )
  } else if (item.includedInAnchor) {
    lines.push('операция уже учтена в фактическом остатке')
  } else if (operation.amountKopecks === null) {
    lines.push('сумма пока недоступна — остаток не изменён')
  } else {
    lines.push(`операция не проведена = ${formatMoney(item.balanceBeforeKopecks)}`)
  }

  return [...lines, '', '']
}

function formatNullableMoney(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : formatMoney(value)
}

function formatCompactDate(isoDate: string): string {
  const [, month, day] = isoDate.split('-')
  return `${day}.${month}`
}

function formatFullNumericDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  return `${day}.${month}.${year}`
}
