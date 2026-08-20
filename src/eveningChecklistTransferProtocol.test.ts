import { describe, expect, it } from 'vitest'
import { EVENING_CHECKLIST_TRANSFER_PROTOCOL } from './eveningChecklistTransferProtocol'

describe('канонический регламент переноса вечернего чек-листа', () => {
  it('сохраняет полный текст и ключевые правила без смысловых сокращений', () => {
    expect(EVENING_CHECKLIST_TRANSFER_PROTOCOL.length).toBeGreaterThan(14_000)
    ;[
      'последние 7 календарных дней',
      '14 последних дней',
      'Не ограничивай историю 14 днями',
      'Сравнение тренировок обязательно',
      'Предыдущее выполнение этой тренировки',
      'Тренировки 2/3',
      'Безалкогольные вечера 3/2',
      'Расслабление 14/14',
      'Ничего не додумывать',
      'Блок «Завтра» обязателен',
      '4–5 предложений максимум',
    ].forEach((phrase) => expect(EVENING_CHECKLIST_TRANSFER_PROTOCOL).toContain(phrase))
  })
})
