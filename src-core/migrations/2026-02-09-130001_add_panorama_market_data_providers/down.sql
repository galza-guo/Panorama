DELETE FROM market_data_providers
WHERE id IN ('TIANTIAN_FUND', 'EASTMONEY_CN');

-- Restore old defaults only when they still match migrated defaults.
UPDATE market_data_providers
SET priority = 1
WHERE id = 'YAHOO' AND priority = 10;

UPDATE market_data_providers
SET priority = 3
WHERE id = 'ALPHA_VANTAGE' AND priority = 20;
