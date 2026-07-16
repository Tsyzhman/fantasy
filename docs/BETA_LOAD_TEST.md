# Beta Load Test

Дата последней сверки production: 2026-07-16.

Текущий production — beta27
(`sha256:5158ff770d1b55de3ebb8e4ecb2ddbf71952d882109922fd8d9d286952e9812a`).
Ниже сохранены фактические load-метрики beta22 без переименования их в результаты
beta27: после beta22 не выполнялся сопоставимый длительный authenticated load
profile. Beta27 отдельно прошёл browser workflow `29494531024`.

Verifier имитирует реальную авторизованную загрузку планировщика: каждый
виртуальный пользователь последовательно получает SSR-страницу состава и
приватный API полного пула. Запросы только читающие (`GET`), redirect отключён,
поэтому переход на login не может ошибочно считаться успешным HTTP 200.

## Финальный production-smoke beta22

Активный образ: `fantasy-scout-web:beta22-20260715T194832Z`, image ID
`sha256:0b26738919f6638772749634f07d3acdf69c70baeb2ee1fb6cd322ef26ba18d5`.

После применения 000006 и production swap выполнен короткий авторизованный
mixed-smoke: 40 GET-запросов, пять одновременных запросов в каждом batch, по 20
SSR-страниц и full-pool API. Redirect отключён, ответы полностью прочитаны.

| Контур | SSR page | Full pool API | Ошибки |
|---|---|---|---:|
| Canary beta22 | p75 405 мс; p95 670 мс; max 671 мс | p75 238 мс; p95 3 091 мс; max 3 099 мс | 0/40, 0% |
| Production beta22 | p75 369 мс; p95 678 мс; max 679 мс | p75 238 мс; p95 3 102 мс; max 3 135 мс | 0/40, 0% |

Production остался `running|healthy`, restart count 0; browser console — 0
errors/0 warnings, новых application error-логов нет. После удаления canary у
PostgreSQL 24 активных соединения из 100.

До beta22-promotion функциональный smoke один раз получил HTTP 500 из-за
`too many clients`: одновременно были оставлены четыре устаревших canary
beta18–beta21. Production не переключался и не пострадал. Только эти четыре
точно идентифицированных canary были удалены, соединения упали со 100 до 38, а
повторные canary/production прогоны прошли без ошибок. Runbook теперь требует
держать не более одного canary и удалять его после acceptance.

Короткая выборка beta22 подтверждает новый runtime, но не заменяет более длинный
60-секундный профиль beta17 ниже и тем более не доказывает beta-period error
rate.

## Референсный 60-секундный production-результат beta17

Исторический образ: `fantasy-scout-web:beta17-20260715T174112Z`, image ID
`sha256:cbb542f32e6705199fd48559dd8efd26f37eb3805c4aa0a3ff9eb66dde146323`.

| Контур | Профиль | SSR page | Full pool API | Ошибки |
|---|---|---|---|---:|
| Canary cold | Первый последовательный mixed-цикл | 3 858 мс | 2 918 мс | 0/2, 0% |
| Canary | 5 concurrent, 60 с, 1 112 запросов | p50 311 мс; p75 363 мс; p95 443 мс; p99 537 мс; max 620 мс | p50 169 мс; p75 208 мс; p95 313 мс; p99 2 675 мс; max 2 863 мс | 0/1 112, 0% |
| Production | 5 concurrent, 60 с, 1 362 запроса | p50 318 мс; p75 352 мс; p95 439 мс; p99 583 мс; max 761 мс | p50 64 мс; p75 85 мс; p95 178 мс; p99 2 446 мс; max 2 937 мс | 0/1 362, 0% |

Production после прогона остался `running|healthy`, restart count 0;
публичный `/api/health` ответил 200 за 85 мс. Новых application error-логов не
появилось. Единственный structured warning относится к известному внешнему
состоянию Sports.ru `currentSeason: null`; официальные цены не подменялись.

Начиная с beta17, включая beta22, общий league/season player pool кэшируется внутри процесса на 30 секунд
с максимумом 20 ключей, а одновременные cache miss объединяются в один Promise.
Пользовательские составы не кэшируются, владение переданным `squadId` проверяется
отдельным запросом, HTTP-ответ остаётся `private, no-store`. Поэтому результат
измеряет реальное production-поведение с этим ограниченным кэшем, включая редкие
холодные промахи p99/max.

По сравнению с одинаковым production-профилем beta16 SSR p75 уменьшился с
2 308 до 352 мс, а full pool p75 — с 5 461 до 85 мс. SMART-gate SSR p75 ≤2,5 с
пройден с большим запасом; error rate 0%.

## Baseline beta16 до оптимизации

Образ: `fantasy-scout-web:beta16-20260715T165800Z`.

| Ступень | Профиль | SSR page | Full pool API | Ошибки |
|---|---|---|---|---:|
| 1 | 3 concurrent, 30 с, 46 запросов | p50 773 мс; p75 1 391 мс; p95 1 486 мс; max 1 586 мс | p50 3 475 мс; p75 4 075 мс; p95 4 298 мс; max 4 368 мс | 0/46, 0% |
| 2 | 5 concurrent, 60 с, 106 запросов | p50 1 504 мс; p75 2 308 мс; p95 3 075 мс; max 3 214 мс | p50 4 415 мс; p75 5 461 мс; p95 5 992 мс; max 6 297 мс | 0/106, 0% |
| CLI replay | 2 concurrent, 10 с, 14 запросов | p75 498 мс | p75 3 214 мс | 0/14, 0% |

После каждой ступени beta16 оставался `running|healthy`, restart count 0,
`/api/health` отвечал 200. Full pool p75 5 461 мс был реальным bottleneck, а не
скрытым или исключённым из результата; именно этот baseline использован для
сравнения с beta17.

Наблюдаемый error rate во всех корректных основных прогонах beta16, beta17 и beta22 —
0%. Это закрывает воспроизводимый load-smoke, но не доказывает долю ошибок за
период реального beta-тестирования: для этого всё ещё нужна тестовая группа и
длительный сбор production-метрик.

## Повторяемая команда

Публичный health-профиль без авторизации:

```powershell
npm run beta:load -- `
  --base-url=https://fantasy.tsyzhman.ru `
  --target=health=/api/health `
  --duration-seconds=30 `
  --concurrency=3 `
  --max-primary-p75-ms=500
```

Авторизованный mixed-профиль использует временный Cookie header QA-сессии.
Значение нельзя сохранять в `.env`, shell history, документации или Git:

```powershell
$env:BETA_LOAD_COOKIE = '<temporary name=value Cookie header>'
try {
  node node_modules/tsx/dist/cli.mjs scripts/beta-load-test.ts `
    --base-url=https://fantasy.tsyzhman.ru `
    '--target=page=/machete/squad?leagueId=47&season=2026%2F2027&squadId=QA_SQUAD_ID' `
    '--target=pool=/api/machete/squads?leagueId=47&season=2026%2F2027&squadId=QA_SQUAD_ID' `
    --primary-target=page `
    --duration-seconds=60 `
    --concurrency=5 `
    --timeout-ms=20000 `
    --max-error-rate=0.01 `
    --max-primary-p75-ms=2500
} finally {
  Remove-Item Env:BETA_LOAD_COOKIE -ErrorAction SilentlyContinue
}
```

Прямой `node`-запуск обязателен для этого PowerShell-примера: Windows
`npm.cmd` повторно разбирает символы `&` внутри query string и может обрезать
target. На Linux/macOS тот же профиль можно запускать через
`npm run beta:load -- ...`.

## Safety и pass/fail

- Внешний target обязан использовать HTTPS; HTTP разрешён только для loopback.
- URL с embedded credentials отклоняется.
- Concurrency ограничен диапазоном 1–20.
- Duration ограничен диапазоном 1–300 секунд.
- Timeout ограничен диапазоном 100–60 000 мс.
- Разрешено не более пяти target-маршрутов.
- Для каждого запроса добавляется уникальный `_beta_load`, чтобы исключить
  HTTP/CDN-кэш. Ограниченный внутренний beta17+ player-pool cache намеренно не
  обходится: он является частью измеряемого production runtime.
- Redirect используется в режиме `manual`; неавторизованный 3xx считается
  ошибкой.
- Gate падает, если error rate не строго меньше заданного лимита или p75
  основного target превышает лимит.
