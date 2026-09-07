export const khlViolationText = (code: string): string => ({
  ROSTER_SIZE: "Нужно выбрать 17 игроков", POSITION_G: "Нужно 2 вратаря", POSITION_D: "Нужно 6 защитников", POSITION_F: "Нужно 9 нападающих",
  CLUB_LIMIT: "Не более 3 игроков одного клуба", BUDGET_EXCEEDED: "Недостаточно бюджета", CAPITAL_UNKNOWN: "Укажите доступный банк", PRICE_UNKNOWN: "Не все цены известны",
  DUPLICATE_PLAYER: "Игрок выбран дважды", UNKNOWN_TRANSFER_BALANCE: "Остаток трансферов не подтверждён", TRANSFER_LIMIT: "Превышен лимит трансферов",
  LOCK_UNKNOWN_OR_STALE: "Нужно обновить статус блокировки", PRICE_UNKNOWN_OR_STALE: "Нужно обновить цены", PROVIDER_LOCK: "Sports.ru блокирует трансфер", MATCH_LOCK: "Трансфер заблокирован перед матчем или во время игры",
  INVALID_TRANSFER: "Выберите корректную пару игроков", POSITION_OR_CONTEST_MISMATCH: "Замена должна быть той же позиции и из того же турнира", CONTEST_MISMATCH: "Игроки относятся к разным турнирам"
} as Record<string, string>)[code] ?? "Данные требуют проверки";
