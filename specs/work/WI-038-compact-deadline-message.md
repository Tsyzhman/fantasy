# WI-038: Компактное сообщение дедлайна

- Kind: `change`
- Canon action: `direct-edit`

## Outcome

Сообщение дедлайна показывает расписание двумя столбцами без даты и времени МСК, официальные популярные трансферы — только именем и командой, а секции роста/падения доли выбора в сообщение не попадают.

## Specs

- Governing: `spec://modules/telegram/FEAT-007-deadline-assistant#message`
- Affected: `spec://modules/telegram/FEAT-007-deadline-assistant#changelog`
- Constraint: `spec://modules/machete/FEAT-006-sports-popularity#data`

## Scope

- In: рендер двухколоночного расписания, фильтр популярности в report builder, тесты, обновление канона.
- Out: изменение сбора данных — `TRANSFERS_GAIN`/`TRANSFERS_DROP` продолжают сохраняться в БД для сайта и истории.

## Acceptance

- [ ] В сообщении нет колонки даты/времени МСК и нет секций роста/падения доли.
- [ ] Официальные трансферы отображаются как `Имя, Клуб` без очков.
- [ ] Статьи «покупки/продажи» и риски/расписание сохраняются; части 1/N работают.
- [ ] `npm run check` проходит.

## Result

Заполняется при завершении.
