import {
  formatDateLabel,
  formatMonthLabel,
  formatRubles,
  formatSalesPeriod,
} from './format'
import type { CalculationSummary, SalaryMonth } from './types'

export function buildPrintReportHtml(
  month: SalaryMonth,
  summary: CalculationSummary,
): string {
  const rows: Array<[string, string]> = [
    ['Месяц продаж', formatMonthLabel(month.salesMonth)],
    ['Период продаж', formatSalesPeriod(summary.dates)],
    ['Общие продажи', formatRubles(month.salesTotal)],
    ['Бонусы по программе', formatRubles(summary.programBonusTotal)],
    ['Бонус за план', formatRubles(summary.planBonus)],
    ['Бонус Арткера', formatRubles(summary.artkeraBonus)],
    ['Бонус Лапарет', formatRubles(summary.laparetBonus)],
    ['Всего начислено бонусов', formatRubles(summary.totalAccruedBonuses)],
    ['Оклад', formatRubles(month.salary)],
    ['Выплата 25-го', formatRubles(month.payments.day25)],
    ['Выплата 1-го', formatRubles(month.payments.day01)],
    ['Выплата 10-го', formatRubles(month.payments.day10)],
    ['Уже выплачено из бонусов', formatRubles(summary.advanceBonusPart)],
    ['Всего заработано', formatRubles(summary.totalEarned)],
    ['Сумма к выплате 15-го', formatRubles(summary.expectedBonusPayment)],
  ]

  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Расчёт ${escapeHtml(formatMonthLabel(month.salesMonth))}</title>
    <style>
      :root {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #172421;
        background: #f3f6f5;
      }

      body {
        margin: 0;
        padding: 24px;
      }

      main {
        max-width: 760px;
        margin: 0 auto;
        border-radius: 8px;
        padding: 28px;
        background: #fff;
      }

      h1 {
        margin: 0 0 8px;
        color: #0b6f68;
        font-size: 28px;
      }

      p {
        margin: 0 0 24px;
        color: #687873;
      }

      dl {
        display: grid;
        gap: 0;
        margin: 0;
      }

      div {
        display: flex;
        justify-content: space-between;
        gap: 18px;
        border-top: 1px solid #dde7e4;
        padding: 12px 0;
      }

      dt {
        color: #687873;
      }

      dd {
        margin: 0;
        font-weight: 700;
        text-align: right;
      }

      .total dt,
      .total dd {
        color: #0b6f68;
        font-size: 18px;
      }

      button {
        min-height: 44px;
        border: 0;
        border-radius: 8px;
        margin-top: 24px;
        padding: 10px 16px;
        color: #fff;
        background: #0b6f68;
        font: inherit;
        font-weight: 700;
      }

      @media print {
        body {
          padding: 0;
          background: #fff;
        }

        main {
          max-width: none;
          padding: 0;
        }

        button {
          display: none;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Расчёт зарплаты</h1>
      <p>Выплата бонуса: ${escapeHtml(formatDateLabel(summary.dates.bonusPaymentDate))}</p>
      <dl>
        ${rows
          .map(
            ([label, value], index) =>
              `<div class="${index === rows.length - 1 ? 'total' : ''}"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`,
          )
          .join('')}
      </dl>
      <button type="button" onclick="window.print()">Сохранить в PDF</button>
    </main>
  </body>
</html>`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
