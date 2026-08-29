-- Store the provider-reported share of fantasy managers who selected a player.
-- The nullable column keeps existing FPL and manually imported price rows valid.

ALTER TABLE "fantasy_player_prices"
ADD COLUMN "selected_by_percent" DOUBLE PRECISION;
