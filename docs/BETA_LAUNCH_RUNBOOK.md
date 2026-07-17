# Runbook запуска закрытой beta

Этот документ предназначен владельцу продукта и ведущему модератору. Он
превращает [протокол пользовательского теста](BETA_USER_TEST_PROTOCOL.md) в
конкретный порядок запуска. Он не заменяет протокол и не смягчает его пороги.

## Решение о запуске

Назначьте одного владельца решения и одного ведущего модератора. До первого
приглашения запишите:

- production URL: `https://fantasy.tsyzhman.ru`;
- participant URL: `https://fantasy.tsyzhman.ru/login?next=/beta-test`;
- лига/сезон: `47 / 2026/2027`;
- минимальная длительность реального beta-окна: **1 440 минут (24 часа)**;
- минимум: **10 разных участников**, пять телефонных и пять desktop-прогонов;
- обязательные physical-прогоны: минимум один Safari iOS и один Chrome Android;
- ответственный за production, модерацию и разбор blocker-дефекта;
- канал экстренной связи, доступный участникам и модераторам.

Первый и последний реальные прогоны планируйте с интервалом не меньше 24 часов.
Synthetic-трафик, production monitor и browser smoke не увеличивают реальное
окно и не считаются пользователями.

## Точный preflight

Выполните базовую проверку непосредственно перед открытием server-window. После
настройки exact start и rollout с beta env повторите её целиком; только второй
результат является разрешением приглашать людей. Затем повторяйте проверку перед
каждой группой сессий.

1. Откройте `https://fantasy.tsyzhman.ru/api/health`. Требуется HTTP 200.
2. Откройте `https://fantasy.tsyzhman.ru/login?next=/beta-test`. Требуется HTTP
   200, рабочая форма входа и переход на `/beta-test` после входа тестовым USER.
3. Откройте `https://fantasy.tsyzhman.ru/api/health/client-errors`. Требуются
   HTTP 200, `healthy=true` и `total=0`.
4. Откройте `https://fantasy.tsyzhman.ru/api/health/data-quality` и найдите в
   `plannerDefaults` объект с `leagueId="47"`. Для запуска одновременно
   требуются:

   - `healthy=true`;
   - `scope.season="2026/2027"`;
   - `configured=true`;
   - `readiness.ready=true` и пустой `readiness.reasons`;
   - `readiness.activePlayers > 0` и `readiness.upcomingFixtures > 0`;
   - `readiness.audit.status="COMPLETED"`;
   - `readiness.audit.plannerGatePassed=true`;
   - `readiness.ingestion.status="completed"`;
   - audit и ingestion не старше указанного `readiness.maximumAgeHours`.

   До первого сыгранного матча допустим
   `readiness.audit.mode="PRESEASON_FORECAST"`, ноль
   `readiness.audit.finishedMatches`, `readiness.audit.gatePassed=false` и общий
   HTTP 503 этого endpoint. Это честное состояние: полный match-data gate ещё
   не измерим, но planner разрешён только при свежих реальных fixtures,
   достаточном forecast coverage и `plannerGatePassed=true`.

   После появления хотя бы одного finished match требуется
   `readiness.audit.mode="FULL_DATA_QUALITY"`,
   `readiness.audit.gatePassed=true` и общий data-quality должен быть зелёным.
5. Откройте `/admin/beta-test`. До первой сессии не должно быть неизвестных
   открытых или pending real-прогонов. Старый незавершённый прогон нельзя молча
   удалить или принять как valid: выясните происхождение и закройте его только
   по правилам протокола.
6. Проверьте последний `Production Monitor`: critical failures должны быть
   равны нулю. Warning разбирается по содержанию; warning о предсезонном полном
   DQ допустим только при выполнении пункта 4.

Любое невыполненное требование, кроме явно описанного предсезонного состояния,
означает **NO-GO**.

## Открытие fixed server-window

Fixed-window нужно открыть **до** выдачи задания первому участнику. Не
подставляйте задним числом неизвестное время. Новое окно обрывает непрерывность
старого, поэтому сначала архивируйте прежний start и snapshot.

На сервере под `deploy` выполните:

```bash
release_stamp="$(date -u +'%Y%m%dT%H%M%SZ')"
sudo install -d -m 0750 /var/backups/fantasy-scout/beta-monitor
if sudo test -f /var/lib/fantasy-scout-monitor/beta-access-window-start; then
  sudo cp --preserve=mode,timestamps \
    /var/lib/fantasy-scout-monitor/beta-access-window-start \
    "/var/backups/fantasy-scout/beta-monitor/beta-access-window-start-${release_stamp}"
fi
if sudo test -f /var/lib/fantasy-scout-monitor/beta-access-audit.json; then
  sudo cp --preserve=mode,timestamps \
    /var/lib/fantasy-scout-monitor/beta-access-audit.json \
    "/var/backups/fantasy-scout/beta-monitor/beta-access-audit-${release_stamp}.json"
fi
beta_start="$(date -u +'%Y-%m-%dT%H:%M:%S.000Z')"
printf '%s\n' "$beta_start" | \
  sudo tee /var/lib/fantasy-scout-monitor/beta-access-window-start >/dev/null
sudo chown caddy:caddy /var/lib/fantasy-scout-monitor/beta-access-window-start
sudo chmod 0644 /var/lib/fantasy-scout-monitor/beta-access-window-start
printf 'BETA_WINDOW_START=%s\n' "$beta_start"
sudo systemctl start fantasy-access-audit.service
sudo systemctl is-active fantasy-access-audit.timer
```

Скопируйте напечатанное значение `BETA_WINDOW_START` без изменений. Затем в
GitHub repository variables задайте:

```text
MONITOR_FIXED_WINDOW_EXPECTED_START=<точное BETA_WINDOW_START>
MONITOR_FIXED_WINDOW_MIN_OBSERVED_SPAN_MINUTES=1440
```

Через GitHub CLI из рабочего checkout это эквивалентно:

```bash
gh variable set MONITOR_FIXED_WINDOW_EXPECTED_START --body "<точное BETA_WINDOW_START>"
gh variable set MONITOR_FIXED_WINDOW_MIN_OBSERVED_SPAN_MINUTES --body "1440"
gh workflow run production-monitor.yml --ref main
```

Тот же exact start должен попасть в runtime приложения. Через установленный
[immutable deployment-процесс](DEPLOYMENT.md) задайте релизу все переменные:

```text
BETA_TEST_SERVER_AUDIT_URL=https://fantasy.tsyzhman.ru/_monitor/beta-access-audit.json
BETA_TEST_FIXED_WINDOW_EXPECTED_START=<точное BETA_WINDOW_START>
BETA_TEST_FIXED_WINDOW_MIN_SPAN_MINUTES=1440
BETA_TEST_SERVER_AUDIT_MAX_AGE_MINUTES=90
BETA_TEST_RUM_MIN_SPAN_HOURS=24
BETA_TEST_RUM_MAX_AGE_HOURS=24
```

Это runtime env web-приложения, а не замена repository variables монитора. Не
печатайте весь production env и не изменяйте env уже созданного
контейнера. Выполните обычный immutable rollout с rollback-кандидатом, затем
повторите полный preflight. Отсутствующая, malformed или несовпадающая beta
переменная должна оставлять `/admin/beta-test` и его JSON-report в состоянии
FAIL; не обходите fail-closed ручной отметкой.

Проверьте
`https://fantasy.tsyzhman.ru/_monitor/beta-access-audit.json`. До накопления
окна warning/`insufficient_data` ожидаем; обязательны
`windowMode="fixed_start"`, точное совпадение `windowStart` с записанным start и
`retentionCoversWindowStart=true`. Несовпадение start или потеря log coverage —
NO-GO, а не предупреждение, которое можно проигнорировать.

## Выборка и расписание

Каждый слот принадлежит отдельному человеку из целевой аудитории и отдельному
USER-аккаунту. Участник не должен ранее проходить этот сценарий в текущей
версии. Заполните таблицу до рассылки приглашений; имена и email храните только
в закрытом списке контактов, не в beta-отчёте и не в moderator notes.

| Слот | Анонимный ID | Среда | Обязательная конфигурация | Аккаунт создан | Дата/время | Модератор | Итог |
|---:|---|---|---|---|---|---|---|
| 01 | — | Телефон | Physical Safari iOS | ☐ | — | — | — |
| 02 | — | Телефон | Physical Chrome Android | ☐ | — | — | — |
| 03 | — | Телефон | iOS или Android, physical | ☐ | — | — | — |
| 04 | — | Телефон | iOS или Android, physical | ☐ | — | — | — |
| 05 | — | Телефон | iOS или Android, physical | ☐ | — | — | — |
| 06 | — | Desktop | Chrome | ☐ | — | — | — |
| 07 | — | Desktop | Edge | ☐ | — | — | — |
| 08 | — | Desktop | Firefox | ☐ | — | — | — |
| 09 | — | Desktop | Safari macOS или Chrome | ☐ | — | — | — |
| 10 | — | Desktop | Любой поддерживаемый desktop browser | ☐ | — | — | — |

Слот 01 должен быть среди первых сессий, слот 02 — среди последних либо
наоборот. Между первым и последним eligible real-запросом должно накопиться не
меньше 1 440 минут. Если один из прогонов invalid, пригласите дополнительного
уникального участника в той же категории устройства: invalid не входит в
знаменатель human-gate, но остаётся в RUM.

## Текст приглашения

Отправляйте URL и временные credentials безопасным личным каналом. Не включайте
пароль в общий чат, календарное описание или moderator notes.

> Приглашаем вас на короткий модерируемый тест сервиса Fantasy Scout. Нужен
> один самостоятельный сценарий продолжительностью до пяти минут и ещё несколько
> минут на вводную и один вопрос. Пожалуйста, используйте назначенное устройство
> и браузер и не открывайте сервис заранее. В согласованное время откройте
> https://fantasy.tsyzhman.ru/login?next=/beta-test и войдите с выданными лично
> логином и временным паролем. На странице теста будет описание собираемых
> технических данных; сбор начнётся только после вашего явного согласия. Мы не
> записываем поисковый текст, введённые данные, имя или email в beta-отчёт. Если
> вы хотите отозвать согласие или запросить удаление данных, сообщите модератору:
> автоматического срока удаления beta-прогонов сейчас нет. Если
> вход или страница не работают, ничего не перезагружайте многократно: сообщите
> модератору по согласованному каналу. Не присылайте пароль в ответном сообщении.

## Жизненный цикл credentials

1. В `/admin/users` создайте десять отдельных активных аккаунтов с ролью USER.
   Используйте уникальный email/alias и уникальный случайный пароль не короче
   требований формы; храните соответствие только в password manager или другом
   утверждённом закрытом хранилище.
2. Не используйте общий аккаунт, рабочий ADMIN или один пароль для нескольких
   участников. Не публикуйте credentials в issue, отчёте или артефакте.
3. Перед сессией проверьте вход один раз, затем выполните sign out. Не запускайте
   `/beta-test` при этой проверке: иначе появится реальный незавершённый прогон.
4. Передайте credentials только конкретному участнику и только на время его
   сессии. При подозрении на раскрытие отключите аккаунт, создайте новый и
   зафиксируйте замену в закрытом roster.
5. Сразу после server submission, moderator review и проверки появления прогона
   в admin-отчёте отключите participant-аккаунт в `/admin/users`. Отключение
   завершает его активные сессии и сохраняет проверяемую историю для финального
   evidence.
6. Удаление персональных данных по запросу нельзя имитировать простым удалением
   строки из отчёта. Перед запуском назначьте контакт владельца данных и
   процедуру обработки такого запроса; до её выполнения аккаунт держите
   отключённым и не распространяйте выгруженный evidence.

## Чеклист модератора в день сессии

### До согласия

- [ ] Повторён preflight; production не в stop-line.
- [ ] Сверены анонимный ID, отдельный USER и назначенное устройство.
- [ ] Для mobile записаны в закрытую карточку модель устройства, версия OS,
  браузер и ориентация; эти данные не добавлены в публичный JSON.
- [ ] Открыт только `https://fantasy.tsyzhman.ru/login?next=/beta-test`, без
  `?synthetic=1`.
- [ ] Участник вошёл и сам прочитал consent. Таймер ещё не запущен.
- [ ] Модератор готов прочитать задание из протокола дословно и не показывать
  расположение элементов.

### Во время пяти минут

- [ ] Участник сам нажал «Согласиться и запустить таймер».
- [ ] Не было подсказки о следующем действии. Любая такая подсказка фиксируется
  как помощь; успешным этот прогон считать нельзя.
- [ ] Зафиксированы только наблюдаемые проблема, время и экран, без имени,
  email, поискового текста и credentials.
- [ ] После рекомендаций задан точный вопрос о прогнозном выигрыше и риске.
- [ ] После сохранения выполнен настоящий reload и проверено восстановление.
- [ ] Записан восьмисимвольный participant code.
- [ ] Участник нажал «Завершить и отправить», а интерфейс подтвердил отправку.

### Сразу после

- [ ] В `/admin/beta-test` найден тот же code и сверены `deviceClass`, milestones,
  duration, Web Vitals и client errors.
- [ ] Заполнены valid/invalid, without help, transfer understanding, usability
  1–5, critical/blocker и реально наблюдавшаяся environment.
- [ ] Physical iOS/Android выбрано только после личной проверки устройства.
- [ ] Pending/open run не оставлен без решения. Отсутствующий LCP не выдуман:
  это пробел RUM, который требует дополнительного уникального участника.
- [ ] Дефект получил severity, ссылку на issue, owner и решение о продолжении.

## Stop-line

Немедленно остановите новые сессии, если выполняется хотя бы одно условие:

- `/api/health` или login не возвращает 200;
- current planner default перестал быть `healthy=true`/`ready=true`, audit или
  ingestion устарели либо появились readiness reasons;
- client-errors health красный или найден новый crash/error boundary;
- участник не может найти игрока, получить валидный автоподбор, сохранить или
  восстановить состав из-за системной ошибки;
- есть нарушение бюджета, позиций, клубного лимита, старта или скамейки;
- возникла потеря/смешение аккаунтов, чужого состава или observations;
- обнаружен critical/blocker, повторяющийся mobile overflow или недоступное
  основное действие;
- fixed snapshot потерял exact start или `retentionCoversWindowStart=true`;
- rolling или fixed audit показывает server 5xx breach.

Открытый прогон пометьте valid/invalid только по фактам. Технический сбой не
записывайте как пользовательский неуспех. Исправьте причину, повторите полный
preflight и пригласите нового участника; повтор того же человека не заменяет его
первый valid primary-прогон.

## Закрытие окна и evidence

Не закрывайте окно, пока не выполнены все условия:

- reviewed primary-прогонов от разных valid участников не меньше 10;
- physical iOS и Android подтверждены модератором;
- LCP получен от минимум 10 разных реальных участников;
- между первым и последним реальным beta observation прошло не меньше 24 часов;
- fixed server snapshot имеет минимум 20 eligible requests и
  `observedSpanMinutes >= 1440`.

После последней review принудительно обновите snapshot:

```bash
sudo systemctl start fantasy-access-audit.service
sudo systemctl status fantasy-access-audit.service --no-pager
```

Скачайте `/api/admin/beta-test/report` через кнопку на `/admin/beta-test` и
`https://fantasy.tsyzhman.ru/_monitor/beta-access-audit.json`. Значение
`generatedAt` свежего fixed snapshot является точным UTC end этого сохранённого
server evidence window; не подменяйте его временем скачивания. Зафиксируйте
также последний Production Monitor, обезличенную device matrix и список
дефектов. Device matrix содержит только анонимный ID, environment, модель,
версию OS/browser и факт личной проверки модератором. Для каждого файла
сохраните дату, размер и SHA-256.

Финальный evidence manifest:

```text
Release/revision:
Decision owner:
Lead moderator:
Beta window start UTC:
Beta window end UTC:
Minimum span: 1440 minutes
Human report: filename / generatedAt / bytes / SHA-256
Human gate: PASS|FAIL
Participants / independently completed / completion rate:
LCP participants / LCP p75 / RUM observation span:
Physical Safari iOS / Chrome Android:
Device matrix: filename / bytes / SHA-256
Fixed server report: filename / generatedAt / bytes / SHA-256
Fixed start exact match: yes|no
Retention covers start: yes|no
Eligible requests / observed span minutes / server 5xx / rate:
Production Monitor run / critical failures / warnings:
Open critical or blocker issues:
Excluded invalid runs and reasons:
Final composite decision: PASS|FAIL
Sign-off name / UTC timestamp:
```

`Final composite decision=PASS` разрешён только при одновременном выполнении:

1. human JSON `gate.passed=true`;
2. fixed server report: `status="ok"`, exact `windowStart`,
   `retentionCoversWindowStart=true`, `requests >= 20`,
   `observedSpanMinutes >= 1440` и `serverErrorRatePercent < 1`;
3. Production Monitor не имеет critical failure;
4. нет открытого critical/blocker и все обязательные evidence-поля заполнены.

Актуальный admin/JSON gate обязан загружать fixed server evidence и включать его
в composite-решение. Отсутствующий либо stale snapshot, несовпадающий start,
короткий span и 5xx breach должны давать FAIL. Подписанный manifest независимо
фиксирует оба исходных отчёта; UI PASS без сохранённых источников не считается
достаточным доказательством. Не сбрасывайте `beta-access-window-start` и не
меняйте GitHub variables или beta runtime env до сохранения и проверки
evidence.
