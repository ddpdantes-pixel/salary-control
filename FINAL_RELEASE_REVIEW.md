# Единый интеграционный кандидат «Мой ритм»

Состав: Android/OTA №62–64, security/provenance, versioned timer sessions,
новый 14-минутный комплекс и фиксированный ручной «Скраб для лица» по четвергам.

Git-история всех доступных refs не содержит прежнего face-scrub/«Скраб для лица».
Используется один новый ID face-scrub в существующей карте cosmetology отметок.
Схема HealthState/backup/HealthSettings и pinned native baseline не меняются.
Пункт расписания вычисляется из календаря; это не новая настройка в whitelist старого
normalizeCosmetologySettings. Старые процедуры/их пользовательские настройки не мигрируются
и не переписываются. В настройках показан фиксированный график и подсказка; редактируемого
нового поля нет. По другим дням пункт отсутствует, кроме явно сохранённой истории.
Исторические долги новому пункту автоматически не назначаются.

После native acknowledgement ошибки restore отображаются как безопасный экран retry,
а не как бесконечный loading; бизнес-запись остаётся gated isBooting. Это не превращает
native acknowledgement в data-ready и не отменяет необходимость runtime fault tests.

GitHub Pages build/deploy теперь требует workflow_dispatch. Принятие исходников в main
не является неявным разрешением production PWA deployment. Публичные OTA pointers
обновляются только своим штатным защищённым release tooling после принятия и явного GO.

Официальная APK 1.1.0 (3) закрепляет HTTPS GitHub origins и OTA public keys. Для
изолированного транспорта допустим отдельный пустой rootable emulator с локальным proxy
и временным системным test CA: APK/OTA RSA/checksum/URL policy остаются неизменными.
Это модифицированное TLS-доверие только тестовой платформы, не Samsung и не production DNS.
Такие runtime результаты нельзя называть физической приёмкой Samsung.

Финальные hashes, actual runtime и визуальные доказательства хранятся в immutable local
release dossier ota-output/final-cycle после фиксации commit. До закрытия обязательных
gates нет разрешения merge/main, accepted HEAD, публикации QA/stable или установки на Samsung.
Решение о первом общем stable и последовательности Samsung-приёмки принимается PO явно,
с пониманием отсутствия адресного canary. Задание продолжается в этом же чате.
