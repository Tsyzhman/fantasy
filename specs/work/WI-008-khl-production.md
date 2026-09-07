# WI-008: Доступный КХЛ на сервере

- Kind: `fix`
- Canon action: `direct-edit`

## Outcome
Production показывает реальный каталог КХЛ и позволяет сохранять локальные составы.

## Specs
- Governing: `spec://modules/khl/INFRA-001-khl-data-ingestion#operations`.
- Governing: `spec://modules/khl/INFRA-002-khl-storage-and-api#root`.

- Governing: `spec://modules/betting/FEAT-001-virtual-league#feed`.

## Scope
- In: список и охват Betting как Squad; активация, проверенная идентичность сезона, каталог, ограниченный worker, production browser acceptance.
- Out: неподтверждённые feeds, xG, обученный прогноз и отправка трансферов провайдеру.

## Acceptance
- [ ] Проверенный турнир и полный реальный каталог доступны на production.
- [ ] Повторная синхронизация обновляет свежесть без дублей и неограниченного накопления receipts.
- [ ] Авторизованный браузер открывает раздел на desktop/tablet/mobile.
- [ ] Проверены выпуск, здоровье, память и очередь.

- [ ] Betting использует общий список Squad, включая лиги без событий.

## Result
В работе. Было: KHL_ENABLED=false и 0 турниров после 0.3.58.
