import { getGymTimerStages, getTimerDisplayRemaining, getTimerTitle, getTimerTotalRemaining } from './healthTimer'
import type { HealthTimerController } from './useHealthTimer'
import { HealthIcon } from './HealthIcon'

export default function StretchTimer({ controller }: { controller: HealthTimerController }) {
  const active = controller.timer?.kind === 'gym' ? controller.timer : null
  const complete = active?.status === 'completed'
  return <div className={`health-inline-timer health-stretch-timer ${active && !complete ? 'is-active' : ''}`} aria-label="Таймер растяжки">
    <div className="health-inline-timer-heading"><HealthIcon name="timer" /><span>Таймер растяжки — 14 минут</span></div>
    {active && !complete && <>
      <strong>{getGymTimerStages(active)[active.stageIndex].title}</strong>
      <span className="health-muted">Этап {active.stageIndex + 1} из 5{active.status === 'paused' ? ' · Пауза' : ''}</span>
      <div className="health-stretch-times">
        <span>Осталось в этапе<output aria-label="Осталось в этапе">{formatTime(getTimerDisplayRemaining(active, controller.now))}</output></span>
        <span>До завершения<output aria-label="Общее оставшееся время">{formatTime(getTimerTotalRemaining(active, controller.now))}</output></span>
      </div>
      <div className="health-timer-actions">
        {active.status === 'running' ? <button type="button" onClick={controller.pause}>Пауза</button> : <button type="button" onClick={controller.resume}>Продолжить</button>}
        <button type="button" className="secondary" onClick={controller.stop}>Остановить</button>
      </div>
    </>}
    {complete ? <><p role="status">Растяжка завершена</p><button type="button" onClick={() => controller.restart('gym')}>Начать заново</button></> : !active && <button type="button" onClick={() => controller.requestStart('gym')}>Начать растяжку</button>}
    <div className="health-stretch-options">
      <label><input type="checkbox" checked={controller.preferences.soundEnabled} onChange={e => controller.setPreference('soundEnabled', e.target.checked)} />Звук</label>
      <label><input type="checkbox" checked={controller.preferences.vibrationEnabled} onChange={e => controller.setPreference('vibrationEnabled', e.target.checked)} />Вибрация</label>
      <button type="button" className="secondary" disabled={!controller.preferences.soundEnabled || active?.status === 'running'} onClick={() => void controller.testSound('gym')}>Проверить звук</button>
    </div>
    <small className="health-muted">Сигналы при блокировке экрана или в фоне не гарантируются. Галочки отмечаются вручную.</small>
    {active?.status === 'running' && <small className="health-muted">{controller.screenAwake === 'active' ? 'Экран остаётся включённым на время растяжки.' : controller.screenAwake === 'unavailable' ? 'Удержание экрана недоступно. Проверьте автоблокировку телефона.' : 'Подготовка удержания экрана…'}</small>}
    {active && controller.audioWarning && <div role="alert" className="health-timer-audio-warning">{controller.audioWarning}</div>}
    {controller.pendingStart === 'gym' && controller.timer && <div className="dialog-backdrop" role="presentation"><section className="restore-dialog" role="dialog" aria-modal="true" aria-labelledby="stretch-replace-title"><h2 id="stretch-replace-title">Сейчас уже работает таймер «{getTimerTitle(controller.timer.kind)}». Остановить его и запустить новый?</h2><div className="dialog-actions"><button type="button" className="primary-action" onClick={controller.confirmStart}>Остановить и запустить</button><button type="button" onClick={controller.cancelStart}>Отмена</button></div></section></div>}
  </div>
}

function formatTime(seconds: number): string { return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` }
