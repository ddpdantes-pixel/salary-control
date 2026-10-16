# Задача 64: журнал технической проверки

Дата: 16 октября 2026. Ветка `feat/android-ota-64`, основа `6fc12b7` с задачей 62.
Статус: **READY FOR SAMSUNG OTA TEST — техническая проверка на эмуляторах завершена**.
Это не пользовательская приёмка Samsung и не разрешение production OTA. Main/Pages не менялись.
Samsung пользователя и его установленная release 1.0.0 (2) не затрагивались.

## Подписанная release: финальная проверка

Пользователь локально выполнил secure launcher, пароль в чат и логи не передавался.
Проверены обе недебажные APK 1.1.0 (3), package `io.github.ddpdantespixel.moyritm`:

| Артефакт | Результат |
| --- | --- |
| Обычная stable APK | 4 847 705 байт, SHA-256 `8da2866f717f9e986594b2a0c09a3d659c6238611d28035b6b329c819029a01b` |
| Отдельная QA APK | 4 847 701 байт, SHA-256 `1a3c910ff7849f9bcc9235a1279db5af82b52b064ded426d57569c88f6407ee5` |
| apksigner verify | PASS для обеих; постоянный сертификат `C06C1844B6D30F5EB7015F2489EFE9000325096E4C4B98F722B8F8D6E1A549D2` |
| Trust anchor / contract pin | Оба APK соответствуют public keys и финальному native baseline |
| Web assets | Все файлы в обеих APK побайтово соответствуют исходному ZIP проверенной OTA .7 |

Обычная APK: `android/app/build/outputs/apk/release/app-release.apk`.
QA APK и receipt: `android/app/build/outputs/moyritm-release-checks/20261016-183954-a7e8a1e7/`.
Эти артефакты игнорируются Git; QA APK не предназначена для Samsung пользователя.

На отдельных новых AVD `moyritm64-release` и `moyritm64-stable` (API 37) сначала
установлена архивная постоянная release 1.0.0 (2). Синтетический JSON восстановлен
через настоящий Android file picker, создано отдельное тестовое облачное подключение.
Контрольные backup экспортированы через системное окно сохранения, не через debug API.
Затем `adb install -r` установил соответственно QA и обычную stable 1.1.0 (3).
Uninstall, clear data, root/run-as и включение WebView debugging не использовались.

- В обоих обновлениях versionCode стал 3, firstInstallTime сохранился, DEBUGGABLE отсутствует.
- Все экспортируемые поля до/после совпали, кроме `createdAt` самого нового backup.
  Зарплата, финансы, два дня здоровья, обучение, настройки и `goalImages` идентичны.
- Обычная stable APK открылась offline (`Active default network: none`) с прежними данными.
  После восстановления сети та же тестовая облачная копия восстановлена без нового подключения.
- QA release реально скачала подписанную .7 из HTTPS; UI показал очередь. После force-stop
  и запуска **без интернета и без установки APK** UI показал `1.1.1-qa.64.7`.
  Новый backup снова совпал с исходным, включая изображение; cloud restore также прошёл.
- Для release дополнительно опубликован новый изолированный подписанный fault bundle
  `1.1.1-qa.64.release-crash`, тег `android-ota-qa-64-release-crash-20261016`.
  После его активации наблюдался пустой экран bootstrap; updater вернул рабочую .7,
  UI подтвердил блокировку проблемной версии. Backup после rollback снова идентичен.
  Точный измеренный ниже debug-интервал 30.012 s не выдаётся за замер release-интервала.
- После fault-теста QA pointer возвращён на существующую .7 с новой подписанной sequence,
  без повторной публикации или замены её ZIP. Stable channel по-прежнему отсутствует.

Локальное доказательство без ключей: `C:\Temp\moyritm64-signed-runtime-proof.json`.
Исходные/конечные синтетические JSON и screenshots остаются только в `C:\Temp`.
Обновления проверены на эмуляторах, не на физическом Samsung.

## Реальный Android runtime (пока debug QA, не подписанная release-приёмка)

Изолированный AVD `moyritm64-qa`, API 37, 1080×2400, density 420.
Создан отдельно, без копирования userdata исходного пользовательского AVD.
Восстановлен синтетический JSON: продажи 351604 / Арткера 223479 / Лапарет 60563,
баланс 12345.67, цель с PNG, два дня здоровья, вода 3, кофе 1, речь done.
Создано отдельное синтетическое cloud connection; ключ не печатался.

| Сценарий | Фактический результат |
| --- | --- |
| HTTPS manifest из Android WebView | PASS, raw.githubusercontent.com, CORS работает |
| HTTPS ZIP из GitHub Releases | PASS, загрузка native downloader с GitHub redirect |
| Capgo V2/RSA + SHA-256 | PASS на реальном скачивании; неподлинный payload не запускается |
| Отложенная загрузка | Bundle pending, активная встроенная версия не меняется |
| Незавершённый ввод и Home/возврат | Черновик «Цель в кружках» 5 сохранился, текущая версия не перезагрузилась |
| Холодный запуск без интернета | Подготовленная 1.1.1-qa.64.4 активировалась; default network = none |
| Последующая версия | 1.1.1-qa.64.6 активировалась без новой установки APK между загрузкой и cold start |
| Данные | 10 исходных business localStorage-разделов без изменений; изображение/IndexedDB побайтово неизменны |
| Облако | Тот же ключ/копия после OTA; список и подтверждённый restore прошли без повторного подключения |
| Подмена metadata / подписи | Native verifier: INVALID_SIGNATURE |
| Подписанный неверный SHA/checksum | Native verifier: INVALID_CHECKSUM |
| Несовместимая native version | Native verifier: NATIVE_UPDATE_REQUIRED |
| Повреждённый ZIP с валидной криптографией | Реальная HTTPS-загрузка отвергнута, активный bundle остался рабочим |
| Изменённые байты ZIP | Реальная HTTPS-загрузка отвергнута; native log: Checksum mismatch |
| Нет интернета | Рабочая локальная версия и данные доступны, проверка не блокирует экран |
| Сервер 503 | Runtime fetch interception: UI показал ошибку, текущая версия не сменилась |
| Повторная проверка без новой версии | UI «Актуально»; отсутствие повторной загрузки также проверено unit test |
| Падающий bootstrap | 10:02:17.416 активация crash → 10:02:47.428 rollback → 10:02:47.740 рабочая .4 |
| Нет notifyAppReady | No-ready fixture откатился через timeout, рабочая .5 снова подтвердила готовность |
| Повтор неисправного bootstrap | Версия имеет error status и блокируется, автоматического цикла загрузок нет |
| Аварийный builtin | Реальный reset при следующем cold start после подписанного отзыва .6; данные сохранены |
| Недостаток места | Выполненный native JUnit: usableBytes=1024 → NOT_ENOUGH_SPACE; физическое заполнение диска не имитировалось |

Для crash/no-ready использовались настоящие подписанные QA fixtures из HTTPS,
не только обработчики ошибок. Для повреждённых ZIP использованы реальные native
verifyManifest/download вызовы с подписанными QA metadata и опубликованным HTTPS ZIP.
Для server 503 и экстренного отзыва response доставлен тестовым browser interception;
в отзыве использован настоящий подписанный channel из GitHub, native reset был реальным.
Это не симуляция отказа production-сервера и не тест на Samsung.

После всех откатов исходные business-ключи и обе IndexedDB-таблицы сравнены снова:
изменений нет. Служебная запись `CapacitorUpdater.webViewSession` закономерно меняется
при запуске и не является схемой финансов/здоровья. Cloud restore создал собственную
существующую страховочную snapshot-запись; контракт backup не менялся.

Последний фактически активированный здоровый QA-пакет (не production):
`https://github.com/ddpdantes-pixel/salary-control/releases/tag/android-ota-qa-64-signed-candidate-20261016`.
Активная web-версия **1.1.1-qa.64.6**, SHA-256 исходного ZIP:
`428f3e42b9bffde9128f77caf68c5086d39f15fd7a62515377757fcfe903aaba`.
После аварийных тестов QA pointer был возвращён к этому проверенному пакету,
без повторной загрузки/замены ZIP.

Для финального release-теста подготовлен отдельный **1.1.1-qa.64.7**:
`https://github.com/ddpdantes-pixel/salary-control/releases/tag/android-ota-qa-64-final-20261016`.
Его ZIP загружен и повторно скачан для проверки до переключения QA pointer.
SHA-256 исходного ZIP: `2d3d95c492047b5ac019327a557d6bd2a45635d9cef89052e7c8a97e9263572a`.
Он содержит финальный клиент и соответствует новому native contract pin
`3c2c2fbe08f870736e16c7d7ad009c407d3af0e7ea6788ddcffc7bb53c041385`.
Активация .7 в подписанной APK проверена отдельно в финальной release-проверке выше.
Ни один существующий ZIP не заменён и не опубликован повторно. Stable channel не опубликован.

Локальный журнал без секретов: `C:\Temp\moyritm64-runtime-proof.json`.
QA APK/build outputs, синтетические fixtures и снимки не входят в Git.

## Регрессия и сборки

- Targeted Android/OTA JavaScript: **59/59**, 9 файлов.
- Полный frontend: **976/976**, 92 файла.
- Worker: **42/42**, 4 файла.
- Native OTA policy JUnit: **13/13**.
- Oxlint: PASS; TypeScript frontend/Worker: PASS/PASS.
- PWA production build: PASS, 33 precache entries; только локальная сборка.
- Android assets build и Capacitor sync: PASS.
- Gradle assembleDebug: BUILD SUCCESSFUL, с Capgo и desugaring для minSdk 24.
- Проверка локального secure launcher `-CheckToolsOnly`: PASS, версия 3 / 1.1.0.
- Подписанный release build/apksigner для новой 1.1.0: **PASS**, QA и stable.
- Реальный signed APK 1.0.0 (2) → 1.1.0 (3): **PASS**, отдельно QA и обычная stable.
- Финальный `git diff --check` и аудит APK/ключей/временных файлов: **PASS**.

Native JUnit запускается через `scripts/test-ota-native.mjs`: Gradle компилирует
те же классы и зависимости, затем JUnitCore выполняет все assertions. Стандартный
Gradle test worker на этом Windows не находит класс из Unicode @argfile path;
прямой Unicode-aware запуск устраняет проблему пути без ослабления тестов.
Существующие предупреждения о крупном JS chunk / deprecated Gradle API остаются
предупреждениями, а не ошибками; unrelated upgrades не делались.

## Визуальная проверка и PWA

- Android settings card: light и dark CSS в WebView; читаемый текст, рамка,
  область кнопки **44 CSS px**, горизонтального скролла нет.
- Тёмные CSS проверены через emulateMedia: Android Playwright context иначе
  принудительно использует light. Это не новая physical Samsung theme-приёмка.
- PWA preview 390×844 сопоставлен с действующей GitHub Pages через screenshot и
  overlay: PNG **полностью идентичны** после закрытия временного offline banner.
- В браузерной PWA Android-only карточка отсутствует, page errors 0.
- На локальном preview один service worker, после reload он управляет страницей;
  второго OTA service worker нет. Production PWA не перезаливалась.

Снимки `C:\Temp\moyritm64-pwa-{home,reference,overlay}.png` и
`C:\Temp\moyritm64-updates-{light,dark}.png` — только внутренние QA-артефакты.

## Безопасность и следующие действия

Android release keystore задачи 63 не пересоздавался и не изменялся.
Отдельный OTA key и совпадающая локальная backup-копия проверены; приватные файлы
вне репозитория, под ограниченным ACL. Независимая offline-копия рекомендована.
V2/PSS защищают подлинность и целостность, не обещают скрыть JavaScript от владельца APK.

Схемы HealthState/FinanceState/localStorage/IndexedDB, Worker/D1, backup, vault,
attachments/share, учебный selector и расчёты не менялись. Миграции нет.
Реальные пользовательские данные/облачные копии не очищались; тестовые cloud keys
относятся только к синтетическим QA namespace. Ничего на Samsung не устанавливалось.

Подписание и эмуляторная приёмка завершены. Следующий этап требует отдельного
согласования: пользовательская проверка обычной stable APK на Samsung, затем review/merge
Android-ветки и отдельное разрешение на выпуск stable OTA. Сейчас на Samsung ничего
не устанавливается, main не объединяется, production channel не публикуется.
Резервную копию OTA signing key нужно дополнительно сохранить на независимом
защищённом носителе: две локальные копии на одном ПК не защищают от его потери.
