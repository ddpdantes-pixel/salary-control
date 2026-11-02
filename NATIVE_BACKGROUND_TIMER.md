# Нативная растяжка — реализация и план проверки

База — принятый и опубликованный Aurora1.1.3/source6222396. Отдельная ветка codex/native-background-stretch. Native-кандидат1.2.0/code4; package ID и release certificate должны совпасть с1.1.0/code3. Публичные OTA-указатели в этом задании не меняются.

## Архитектура

Kotlin StretchClock — чистая state machine на elapsedRealtime. StretchController хранит один сеанс в отдельном SharedPreferences, включая revision/session ID, пройденные границы и monotonic anchor. WebView только читает состояние и посылает команды. На code3/PWA без capability остаётся прежний путь. Таймер лица остаётся прежним. HealthState, финансовые модели, схемы резервного копирования и галочки не меняются.

Новые сеансы:5/1/1/2/5, сигналы300/360/420/540/840секунд. Импорт v1/legacy сохраняет старые названия и порядок; сохранённый работающий JS-сеанс импортируется приостановленным, без фонового автозапуска. Пользователь явно продолжает его. Native является источником истины, JS-сигналы gym не запускаются одновременно.

## Android lifecycle, Doze и разрешения

Пользовательский Start из видимой Activity запускает mediaPlayback Foreground Service с обычным видимым уведомлением и управлением пауза/продолжить/stop. Resume из уведомления является явным пользовательским действием. Служба не запускается из BOOT_COMPLETED, не использует SHORT_SERVICE и прекращается на паузе/stop/завершении. Android17 требует foreground audio lifecycle/WIU: [официальная документация](https://developer.android.com/about/versions/17/changes/bg-audio).

Одного FGS/partial wake lock недостаточно: Doze игнорирует wake locks, а allow-while-idle alarms имеют девятиминутное ограничение. Поэтому для явно запущенного пользователем точного таймера применяется один ближайший AlarmClock с последовательным переносом на следующую границу. setAlarmClock будит устройство и работает в Doze: [API](https://developer.android.com/reference/android/app/AlarmManager#setAlarmClock(android.app.AlarmManager.AlarmClockInfo,%20android.app.PendingIntent)), [Doze](https://developer.android.com/training/monitoring-device-state/doze-standby).

Нужны только FOREGROUND_SERVICE, FOREGROUND_SERVICE_MEDIA_PLAYBACK, POST_NOTIFICATIONS, SCHEDULE_EXACT_ALARM, WAKE_LOCK и VIBRATE, помимо прежнего INTERNET. USE_EXACT_ALARM, battery-optimization exemption, микрофон, контакты, телефония и Bluetooth-доступы не запрашиваются. Для точного пользовательского действия Android допускает SCHEDULE_EXACT_ALARM с отзывным разрешением пользователя и более широким набором применений, чем USE_EXACT_ALARM: [permissions](https://developer.android.com/develop/background-work/services/alarms#exact-permission). Отказ не заменяется приблизительным таймером под видом надёжного; UI сообщает причину.

Отсчёт не зависит от системного времени. TIME_SET пересчитывает только RTC-время ближайшего AlarmClock/уведомления из monotonic остатка. Процесс после гибели/перезагрузки восстанавливает безопасную паузу и не запускает аудио скрыто. Force Stop не обещает невозможного продолжения. Запоздалые события пропускаются, никогда не ставятся в очередь. Граница коммитится до воспроизведения, финал не повторяется.

## Звук

Короткий PCM AudioTrack с USAGE_ALARM/CONTENT_TYPE_SONIFICATION, три импульса. Никаких requestAudioFocus, setStreamVolume, ducking, длинного голоса или silent keepalive. Ресурсы освобождаются после каждого сигнала; Stop отменяет текущий и будущие сигналы. Системный DND/громкость/маршрут/звонок могут влиять на слышимость. Фактическое микширование и Android17 hardening должны быть проверены, а не выведены только из вызова API.

## Gates до финальной выдачи

Пока это незавершённая реализация, без runtime/Samsung PASS. Нужны Kotlin/JUnit, bridge и полная web/native regression; Android14–17/API37 проверки; полные14-минутные прогоны без ускорения; PCM/слышимый выход и timestamps всех5сигналов; Doze и AudioHardening; pause/resume/stop и отсутствие дублей; установка одной release APK поверх официальной1.1.0 с сохранением данных и исходного сертификата. Для подписи пользователь подтвердил однократный локальный ввод пароля; пароль не передаётся в чат.

Новый native/storage fingerprint готовится только как часть нового APK4 после review. Старый code3 fingerprint и public stable1.1.3 не переписываются. Код4 не должен принимать подписанные code3-only bundles в обход target gate; новая builtin web-часть содержит принятый Aurora и новые bridge calls, поэтому resetWhenUpdate не откатывает функциональность к старому UI.
