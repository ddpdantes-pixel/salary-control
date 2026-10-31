# OTA: исправление двух блокеров — CTO-отчёт

1 ноября 2026, Москва. Ветка `codex/ota-security-blockers`.

**Два дефекта release tooling исправлены и проверены. Общий stable — BLOCKED.
Публикация не выполнялась. Release-ready и Samsung-приёмка не заявляются.**

## Исходное состояние и область изменений

Изолированный managed worktree создан от OTA №64 `826d1669919417140097ab926899c39b45c70910`,
без AI-коммитов. Применён готовый `timer-web-only.patch` после `git apply --check`;
SHA-256 входного патча из предыдущего отчёта:
`9eb1df31eeb8676022ee53c28876f72757b2e146d5092ed1a360bb03edc4decd`.
Таймер заново не разрабатывался. Новые native plugins, baseline, схемы и миграции не добавлены.

Защищённые refs проверены отдельно: main `11c18ab4c616e2ab129c661e66579ca1d63ac231`,
AI `da244ba4ba21e73cd7df561ca84e7506acd638ee`, №64 `826d1669919417140097ab926899c39b45c70910`.
Read-only `git ls-remote`: remote main имеет тот же HEAD, QA остаётся
`71ff88ed9aa0fd2ba3f77a7e61a1cfdb0f8ca101`, stable-ветка отсутствует.
Не было push, deploy, channel writes, чтения production private key, сборки/установки APK,
обращения к Samsung или изменения личных данных.

## R1: потеря накопленных отзывов

Причина подтверждена: упаковщик создавал пустой список отзывов, publish заменял текущий
подписанный payload целиком, promote-existing возвращал исторический список пакета.

`scripts/ota-channel-policy.mjs` теперь проверяет подпись/target/sequence/lifetime текущего
указателя и объединяет отзывы монотонным union. Предложение отозванной версии запрещено.
Финальный payload подписывается после объединения и проверяется прежним public key.
Publish проверяет свежесть предложения до внешних записей и перед записью указателя.
Pause/revoke/promote-existing сохраняют старые отзывы; просроченный, но подлинный
предыдущий указатель остаётся источником отзывов и sequence при renewal.

Запись использует прочитанный GitHub SHA. Конфликт не приводит к retry с новым SHA
или перезаписи. Ветка с отсутствующей policy не считается новым пустым каналом.
ZIP проверяется до последней записи pointer. Для release receipt сохраняются
`published-channel.json` и SHA-256 финального payload; первоначальный `channel.json`
из build является предложением, а не готовой заменой live policy.

Негативные проверки выполняют реальные тела publish/update с заменённым I/O:
отозванный кандидат отвергается до remote writes, чужой канал и подменённая подпись
отвергаются, stale sequence/expired publish запрещены, stale SHA получает один PUT
и отказ. Проверены сохранение нескольких отзывов, pause, revoke и renewal.
Реальные каналы в тестах не используются.

## R2: неподтверждённое происхождение ZIP

Причина подтверждена: чистый HEAD мог сосуществовать с произвольным ignored dist;
старый упаковщик копировал его и записывал текущий commit в metadata.

`scripts/ota-provenance.mjs` требует чистый committed source, запрещает source
symlinks/submodules и извлекает точный commit через git archive в новый временный каталог.
Параметр `--assets` запрещён. Ignored dist, local .env и посторонние файлы рабочего
каталога в сборку не попадают. Host autocrlf/eol для archive принудительно заменены
на LF. Хеш lockfile берётся из Git blob и сверяется с реальным build input.

В новом каталоге выполняются offline frozen-lockfile install без lifecycle scripts,
TypeScript и Android Vite build. Build не наследует VITE_*, NODE_OPTIONS, BASE_PATH
и credentials. Требуется заранее заполненный проверяемый pnpm store; отсутствие
зависимости приводит к отказу. Node/pnpm/platform/arch записываются в provenance.
После сборки source identity проверяется повторно.

Внутри ZIP находится `ota-provenance.json`: commit/tree/lock hash, toolchain,
команда, версия/fault и полные списки хешей до и после разрешённых преобразований
HTML. Собственный хеш manifest не включается в себя; SHA-256 manifest хранится в build.json.
ZIP имеет фиксированное время entries. Его plaintext SHA-256 связан с Capgo checksum
и подписанным metadata. Нативный trust anchor и fingerprint не изменены.

Publish и promote-existing расшифровывают ZIP и **заново собирают** исходный commit,
затем сравнивают provenance и все байты ожидаемого ZIP. Взаимно согласованные
поддельные хеши внутри архива не достаточны для принятия. Старые пакеты без такой
provenance не продвигаются новым tooling; silent legacy fallback не добавлен.

## Новые результаты проверки

| Проверка | Результат и границы |
|---|---|
| Полный Vitest на `f7300bd` | 990/990, включая 16 новых security tests |
| Последняя правка receipt `ed25973` | 20/20 targeted policy/command/compatibility tests, Oxlint |
| Native policy JUnit | 13/13, существующие JDK 21 / SDK; без APK build/install |
| Frontend и Worker TypeScript, Oxlint, Android web build | PASS; chunk-size warning сохранён |
| Compatibility | `3c2c2fbe08f870736e16c7d7ad009c407d3af0e7ea6788ddcffc7bb53c041385`, native code 3 |
| Произвольный `--assets` | Реальный CLI отказ до чтения private key |
| Dirty/untracked source, чужой commit | Негативные unit tests PASS |
| ZIP с разными timestamp исходных файлов | Побайтово воспроизводим |
| Криптография / происхождение | Временный RSA key, AES round-trip, проверка подписанного checksum, независимая fresh rebuild |

Повторяемая интеграционная проверка: `node scripts/test-ota-provenance.mjs`.
Финальный прогон provenance выполнен на **`f7300bdc0c39d9b3e4ee6d63bc68cf053cdf0e86`**,
tree `776854f2414d569c5e70a193b83fcb13b9c8a9bd`, 22 исходных web assets плюс provenance.
Lock SHA-256 `c0e72f1be3d87f10c0eb1ae30cfcb70052edffbbeb796c341fad1bf95384ebdc`.
Проверенный plaintext ZIP SHA-256:
`af743ad40c1d2164f17c84c7198b89e51aa8961db8451270dfe0d6fb2b254648`.
Независимый rebuild дал точные байты. Дополнительный `alien.js` с заново
пересчитанными хешами и корректной тестовой подписью отвергнут.
**Тестовый ключ не является production key: эти байты не distributable для APK.**
Это не проверка точного будущего stable ZIP и не наследуемая runtime-приёмка.

Browser: кандидат и donor `303858a`, локальные Android web builds, синтетическое
чистое browser storage. Запуск показывает первый этап 05:00 и общий остаток 14:00;
остановка работает. Полные screenshots страницы Сегодня после start/stop:
375×3597, **0 отличающихся пикселей из 1 348 875**, overlay просмотрен.
Сравнение ограничено светлой темой и проверенным idle состоянием.
Автоматических галочек после start/stop нет; завершение и ручные отметки проверены
существующими timer/completion tests. Браузерный звук не является Samsung audio acceptance.
Первичные попытки захвата с разными viewport и чёрным снимком не засчитаны;
PASS относится только к финальной паре full screenshots.

Машинные материалы в ignored `ota-output/`: `security-regression-final.json`,
`source-proof-1793486156785/evidence.json`, `visual/full-evidence.json`,
`visual/full-overlay.png`, `visual/overlay-card.png`, `security-evidence.json`.
В Git нет ZIP, личных данных, ключей или credentials.

## Commits и изменённые файлы

- `84e32f5`: точный готовый web-only timer patch, 14 src файлов.
- `369121a`: build/publish/update, новые channel-policy/provenance modules,
  security tests и адаптация compatibility test.
- `e6c2433`: повторяемый integration probe и reserved provenance filename.
- `4481083`, `f7300bd`: хеш committed lock, версия pnpm, фиксированные LF archive inputs.
- `ed25973`: receipt финального подписанного payload.
- Отдельный docs commit содержит этот отчёт и уточнения release workflow.

## Оставшиеся обязательные gates и следующий шаг

**Stable — BLOCKED:** main не содержит принятую Android/OTA интеграцию; менять его
в этой задаче запрещено. Guard чистого принятого main не ослаблен. Поэтому точный
production-signed stable candidate здесь не создавался. Его activation, повторный
cold launch, offline, два native rollback и сохранность пользовательского состояния
не выполнены и не заменяются историческим QA final.2 или mock/emulator результатами.
Новые публикации QA/stable и установка APK для обхода этого ограничения запрещены.

До release-ready остаются review интеграции и источников будущего пакета, визуальная
приёмка active/final/dark, runtime-проверки точных байтов, политика running/paused
legacy gym sessions (R4 предыдущего отчёта) и post-ack restore failure (R3).
Последние два замечания не исправлялись расширением области этой задачи: формат
таймера может совпадать при изменённом смысле stageIndex, а native success подтверждает
shell/bridge/document identity до restore, не успех всех бизнес-операций.
Физическая Samsung-приёмка остаётся отдельной. Общий stable доступен всем совместимым
stable-клиентам и не является адресным canary.

Следующий конкретный шаг: review этой изолированной интеграционной ветки и решение
о включении в main по регламенту. После принятия — новый exact stable build из
принятого commit, весь runtime/visual/data checklist, затем отдельное разрешение
конкретной публикации. На текущем этапе разрешение публикации не запрашивается.
