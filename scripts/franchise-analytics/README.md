# Аналитика франшиз

Раздел `/franchises` и API требуют обычную сессию Fantasy. Пользователь любой франшизы видит все 12 команд. Фильтры считают агрегаты только из готового снимка в PostgreSQL; браузер не обращается к H2H.

## Обновление

После миграций: `npm run franchises:sync`. На production-хосте: `bash /var/www/fantasy-scout-current/ops/franchises-sync.sh` или штатный systemd service. Общая kernel-блокировка исключает пересечение с полным пересчётом пула и модели; таймер запускает сбор раз в три часа в :10 MSK. Python: `/opt/franchises/bin/python`, локально можно задать `FRANCHISE_PYTHON`. Установить локальные зависимости из `requirements.txt`. PostgreSQL CLI `psql` должен быть в PATH; используется тот же `DATABASE_URL`, чтение футбольных таблиц выполняется read-only.

Порядок: восстановление отсутствующих завершённых составов/пулов из нашей БД → обновление H2H → чтение существующей статистики/прогнозов → расчёт признаков с отсечкой до тура → xФО → сохранение исходных H2H-записей → атомарная публикация готового снимка. Никаких запросов к ИИ.

В production `ops/franchises-job.py` запускает отдельный одноразовый CLI-контейнер: тот же immutable image worker и source volume, отдельные 5 GiB RAM без swap и два CPU, запуск при наличии 6 GiB доступной памяти хоста. Общая блокировка продолжает исключать пересечение тяжёлых вычислений; после выполнения контейнер и временный файл окружения удаляются.

Календарные ID читаются из явных списков составов и популярности H2H. Старый тур восстанавливается из метаданных БД только при совпадении лиги, номера и H2H ID тура; арифметическое восстановление ID недопустимо из-за пропусков. Если подтверждённого индекса нет, обновление завершается ошибкой с сохранением опубликованного снимка.

Снимки прошлых прогнозов связываются по лиге и точному UTC-дедлайну, без допущения об одинаковых номерах тура у H2H и Sports.ru. Эквивалентные алиасы не создают дубли; прогнозы после дедлайна и соседнего тура не подставляются.

По умолчанию временные файлы в `storage/franchises`; у production worker отдельный постоянный volume. `FRANCHISE_DATA_DIR` нужен только для запуска сборщика с другим каталогом; не задавать его web-контейнеру, иначе тот перейдёт на файловый снимок. `FRANCHISE_USE_CACHE=1` — только воспроизведение сохранённого среза, не регулярное обновление. Опциональный `FRANCHISE_HTTP_SSH=deploy` использует проверенный HTTPS через SSH при проблемах локального DNS; штатному серверному запуску не требуется.

`npm run franchises:import` публикует уже подготовленные локальные данные. `npm run franchises:restore` восстанавливает недостающие исходные составы/пулы без обращения к H2H. Эти команды не размещают HTML-отчёт на сайте.

Готовые `ops/fantasy-franchises.service` и `.timer` предназначены для обновления раз в 3 часа. Установка и включение таймера — отдельная операция выпуска; добавление файлов само по себе ничего не запускает.

## Повторы, сбои и память

Для восстановления одного проверенного прерванного сбора оператор может передать `FRANCHISE_RESUME_AFTER` с точным временем его начала и часовым поясом (не старше трёх часов) через `ops/franchises-sync.sh`. Повторно используются только полученные после этой точки HTTP-ответы/составы и завершённые валидные XI; статистика и прогнозы из БД читаются заново. Обычный таймер этот параметр не задаёт. Пустой исторический шаблон H2H учитывается как отсутствие состава и повторно проверяется следующими сборами.

Уникальные ключи: сезон/лига/тур/команда, сезон/лига/тур и сезон/франшиза. Повторный импорт обновляет те же записи. Завершённые составы и пулы фиксируются после суток на уточнение очков и затем повторно не скачиваются; текущие обновляются. HTTP-кэш живёт 30 минут, старые файлы старше 30 дней удаляются после успешного сбора. Снимок — не больше 192 МБ распакованного JSON / 64 МБ gzip; web держит одну актуальную копию, без отдельного кэша на каждый фильтр. Пакетные стадии освобождают память между процессами; после успеха удаляются воспроизводимые DataFrame-файлы.

`.sync.lock` и `.collection.lock` исключают параллельный сбор. После аварийного завершения оператор проверяет, что прежний процесс уже не работает, и только тогда удаляет оставшийся lock. При ошибке новый снимок не публикуется; прежний остаётся в БД. Дата источников и расчёта видна посетителям.

## Проверки

Сравнение xФО с реальными ФО использует тех же 11 игроков до автозамен, без капитанского множителя с обеих сторон. Уже удвоенные очки капитана из H2H делятся на 2. Снимок помечается `xfoCaptainMultiplier: 1`; до пересчёта старого снимка UI не подменяет смысл прежних значений.

`python -m unittest discover -s scripts/franchise-analytics -p test_*.py` проверяет формулу на 107 строках workbook-fixture и крайние случаи, включая 59/60 минут и уже удвоенные очки капитана H2H. `npm test` включает проверки фильтрации и агрегатов. Число отсутствующих данных, будущих матчей и дублей сохраняется в `validation.json`.

## Calendar and personal histories

`franchises.json` registers 74 H2H franchises and the virtual `шизы` group of 24 personal profiles. Profile histories include all available rounds of supported football leagues, independently of franchise board selection. A canonical source squad is downloaded once. Explicit memberships associate it with report groups without duplicate observations inside one group. The virtual group has no board, starting/reserve status or freeze events.

Version 2 snapshots carry complete personal-history semantics. Personal-only leagues contribute to manager comparisons and the virtual group, without changing the tournament sample of regular franchises. Calendar filters use the inclusive Moscow date of each round's first fixture. Undated rounds remain visibly unavailable. `squad-index.json` bounds the current input set; stale cached sources do not re-enter the report. Snapshot encoding streams to gzip and illustrative examples retain two players per group/league/round.
