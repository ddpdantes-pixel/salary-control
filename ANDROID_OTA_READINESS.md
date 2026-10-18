# №64: readiness и ограниченная canary-приёмка

Runtime-проверки: 17 октября 2026. Финальный аудит: 18 октября 2026.
Ветка `feat/android-ota-64`.

**READY FOR LIMITED CANARY REVIEW. Это не разрешение на stable rollout.**

## Причина и границы доказательства

Первоначальный таймаут `.1` не восстановлен полностью: старый лог не содержит
document ID и ожидаемого/переданного поколения. Успешные повторы и прежние 28
сценариев не доказывают устранение именно того инцидента. Их результаты сохранены
в `ANDROID_OTA_RELIABILITY.md`, а не выданы за новые запуски.

Устранены отдельные доказуемые риски:

- Readiness зависела от animation frame, восстановления основных данных и позднего
  React effect. При удержанных rAF старый `.1` остановился после first-render и
  не подтвердил готовность за 30 секунд. Новый код не ждёт кадров.
- После разрешившегося set/reset старый entry мог продолжить запуск React.
  Теперь документ помечается уходящим до вызова и больше не монтирует приложение;
  дополнительно проверяется позднее продолжение current().
- Capgo 8.53.0 разрешает и отклонённый stale-generation notifyAppReady Promise.
  Теперь подтверждение проверяется по native current ID, версии и status=success.
- Событие appReady не используется как acknowledgement: реально получено retained
  событие disabled со старой версией до принятия нового документа.
- Финальный аудит: необязательный refresh метаданных версии больше не блокирует
  восстановление после уже принятого native acknowledgement. Иначе его отказ мог
  оставить loading shell после отключения rollback. Refresh остаётся в фоновой
  проверке после restore, его ошибка показывается как ошибка обновлений, не скрывается.

Проверены [рекомендации Capgo](https://capgo.app/docs/plugins/updater/notify-app-ready/),
[API](https://capgo.app/docs/plugins/updater/api/) и установленный исходник 8.53.0.
Внутренний __CAPGO_READY_GEN читается только для QA-наблюдения, не является
production API или условием принятия bundle.

## Lifecycle

Cold-start claim очереди → остановка уходящего документа → новый entry → native
adapters → минимальный committed React shell → сверка HTML metadata с native
current → notifyAppReady → проверка native success → основные Finance/Health/settings
→ фоновая проверка обновлений. Нет ожидания rAF, сети, облака или IndexedDB цели
на пути readiness. Небольшие существующие чтения timer/preferences и навигации
при mount сохраняются: утверждение «до любого localStorage» не делается.

Readiness проверяет entry/bridge/adapters/React shell, а не каждую будущую операцию
с данными. Ошибки bootstrap до подтверждения, отсутствующий shell/adapters,
несовпадение версии и непринятое native подтверждение не подтверждают bundle.
HTML metadata версии помещается внутрь защищённого ZIP, не запрашивается по сети.
appReadyTimeout остаётся **30000 ms**, случайных retries/delays не добавлено.

При удержанных rAF новый документ a89ac40a-a4bb-4c1d-8705-7bc1a98f1c02, generation 8:
entry 114.5 ms; adapters 155.9; React commit 167.9; current pending 172.0;
notify 172.2; native success 205.6; restore start/complete 209.5/233.9.
Это контролируемая проверка, не реконструкция старого инцидента.

В стресс-прогоне старого `.1` с raw SDK set/reload и удержанием кадров fallback
также указывал на `.1`: два интервала около 30 секунд, затем SDK reset к builtin.
Этот результат не скрывается и не выдаётся за одношаговый откат. Повторная установка
активного ID напрямую SDK не является обычным клиентским путём: уже активная версия
не ставится повторно. Чистые fault-тесты ниже проводились отдельно через cold queue.

## Независимые профили

Эмулятор moyritm64-qa, Android users 10/11/12: три изолированных чистых хранилища,
но один эмулятор/OS, не три устройства. Существующая debug APK code 3 не заменялась.
Пакет 1.1.1-qa.64.readiness.1 реально активирован во всех трёх профилях.

| Профиль | Первая активация | WebView reload | Повторный cold start | Resume |
| --- | ---: | ---: | ---: | --- |
| A / 10 | offline 430.3 ms | offline 129.9 ms | online 699.9 ms | тот же документ |
| B / 11 | online 1145.4 ms | online 506.2 ms | offline 857.7 ms | тот же документ |
| C / 12 | offline 1153.5 ms | offline 694.1 ms | online 1939.5 ms | тот же документ |

Время от performance.timeOrigin нового документа до проверенного native success,
не от нажатия launcher. Всего 9 загрузок документов + 3 resume-проверки.
Все version/status и 10 business localStorage values + IndexedDB-изображение
совпали. Полные безопасные stages/document IDs: `ota/qa-readiness-64.json`.
При cold start без SDK reload generation stamp отсутствует (null), после reload=1.

Подготовительные reload тестового драйвера в B/C могли оборвать JS-очередь после
фонового download; native ZIP не терялся. Для C уже скачанный проверенный пакет
явно поставлен в очередь драйвером. Первая активация начата только после загрузки.

## Stale callback и rollback

- Payload старого document 19a21ecb-5684-4593-b285-c2b153963ad7 / generation 2
  воспроизведён через nativeCallback при ожидаемом generation 3. Native записал
  Ignoring notifyAppReady from a page that is no longer current. Promise разрешился,
  но статус остался pending. Новый document c781247b-e925-41ef-9939-d65529e6c93d / 3
  после снятия QA-задержки получил success. Это replay старого stamp на native
  boundary, не утверждение, что уничтоженный документ продолжал выполнять JS.
- Обычный cold queue отдельно записал document-retiring для
  c6da80b1-185a-4412-b11d-fea574d4bafd, readiness только у следующего документа.
- Bootstrap crash XxuK2g6cCD: reload 05:02:57.122 UTC → rollback 05:03:27.127 UTC,
  **30005 ms**, возврат к readiness.1 success.
- Без JS/notify, CI8wpWXsbO, offline: 05:03:52.432 → 05:04:22.444 UTC,
  **30012 ms**, возврат к readiness.1 success.
- После обоих fault-тестов все контрольные данные и изображение совпали.

Использованы ранее опубликованные immutable fault ZIP, без повторной публикации.
Для no-ready HTML локально подписана актуальная QA compatibility metadata:
HTML не исполняет JS и не требует plugins; ZIP не изменялся. Ранний локальный
crash-кандидат без GitHub release дал HTTP 404 и не установился; затем использован
опубликованный release-crash пакет. Ошибочные версии не предлагаются автоматически
повторно. Не ослаблены RSA-PSS manifest, V2 checksum/signature и compatibility gates.

## Сохранность и UI

Сравнены синтетические зарплата, финансы/цель, здоровье/обучение, настройки,
ключ подключения и изображение цели. Offline и оба rollback сохранили хеши.
Read-only список cloud backup из WebView: HTTP 200, одна тестовая копия.
Новый save/restore/delete в облаке не выполнялся.
Apple Health в подготовленном UI отсутствует. Ручной ввод на тестовой дате проверен
с ожиданием сохранения: 4 кружки / 1.2 л, затем 3 / 0.9 л. Эти намеренные изменения
синтетического дня сделаны после сравнений хешей.

## Проверки

- Targeted OTA/bootstrap/crypto/compatibility после аудита: **39/39**, 4 файла.
- Финальный полный запуск: **959/959 = 917 frontend + 42 Worker**, 94 файла,
  по JSON reporter. Новый тест защищает от блокировки bootstrap необязательным
  refresh; предыдущий результат 958/958 сохранён в машинном журнале.
- Native policy **13/13**, Gradle compileDebugUnitTest и assembleDebug PASS
  в runtime-серии 17 октября; повторно не запускались, native code не менялся.
- Oxlint, TypeScript frontend/Worker, PWA/Android web builds, Capacitor sync,
  compatibility и diff check PASS. Существующий warning chunk >500 kB остаётся.
- Fingerprint: 3c2c2fbe08f870736e16c7d7ad009c407d3af0e7ea6788ddcffc7bb53c041385.
- Production PWA Chromium smoke 390 px: Главное/Здоровье открылись, errors=0,
  overflow=false, native=false, QA trace=false. Это smoke, не полная visual-приёмка.
- Обычные Android/PWA assets не содержат QA trace markers. Трасса включена только
  в QA-кандидате VITE_OTA_DIAGNOSTICS=1, память документа, максимум 64 события.

QA build 64-readiness-20261017, версия 1.1.1-qa.64.readiness.1:
plain ZIP SHA256 662526eb87790a9a83e03f7998cc714a2c82f27f10b4a3fc3157ad589b123d2d;
encrypted SHA256 c8ce865adad9a66b6242a1e69474ea0300f79ec8f5e9258545cb5b9cd7967483.
Кандидат собран от 81975f2 с WIP-исправлением; immutable asset не переписывается.
Он предшествует финальному удалению необязательного refresh из readiness gate.
Эта последняя правка проверена targeted 39 и полным 959, но не выдана за ещё один
эмуляторный OTA-прогон. До Samsung потребуется новый подписанный QA-пакет от
итогового чистого commit, проверка его точной версии в QA и отдельное разрешение.
Raw logs/fixtures/backup/снимки остаются в C:\Temp, не в Git. Только обезличенный
JSON измерений включён в commit. Ключи не пересозданы, секреты и APK не добавлены.

## Следующий шаг

Нативный код, зависимости, package ID, APK 1.1.0 (3) не менялись.
**Достаточно OTA; новый APK для этого исправления не требуется.** Новая release APK
не собиралась/не устанавливалась; прежний тест 2 → 3 не выдан за новый запуск.

QA pause: подписанный sequence **1792213458417**. В 08:09:27 МСК / 05:09:27 UTC
GitHub API и обычный/query CDN вернули одинаковый signed enabled=false без release:
HTTP 200, 360/70 ms, CORS `*`, max-age=300. SHA256 ответа
0b25f9438b05694ad39f092e8a65d209c144a92329224d8837bd612533073f6f.
До этого CDN ещё отдавал enabled=true, что также сохранено в JSON. В 08:09:35 МСК
реальный WebView подтвердил pause, pending пустой, UI «Выпуск обновлений
приостановлен». Stable HTTP 404. Это наблюдение доступного CDN, не всех PoP мира.

18 октября финальный read-only GET снова подтвердил подпись, HTTP 200,
тот же sequence 1792213458417, enabled=false без release; stable HTTP 404.
Команда pause повторно не публиковалась, ZIP не заменялись.

Риск исторического инцидента и отличий Samsung от эмулятора остаётся. Три успешных
first launches и реальные rollback позволяют ограниченную canary-приёмку, но не
обещание абсолютной безошибочности. QA подписанно приостановлен; фактический CDN
результат записан в JSON. Pause не revoke: pending может активироваться, CDN/offline
клиент узнает о pause позже; мгновенное глобальное отключение не заявляется.

Нужно отдельное разрешение на один controlled Samsung canary: свежая резервная
копия, проверка канала установленной APK, согласование конкретного подписанного
пакета. Нельзя переключать всех stable-клиентов ради одного теста. После активации,
offline/истории/облака и согласованной проверки rollback отдельно решить о stable.
Main, production Pages/PWA, stable OTA и Samsung не изменены. Схемы, Worker/D1,
backup contract, attachments и пользовательские данные не очищались.
