INSERT INTO market_data_providers (
    id,
    name,
    description,
    url,
    priority,
    enabled,
    logo_filename,
    last_synced_at,
    last_sync_status,
    last_sync_error
)
VALUES
    (
        'TIANTIAN_FUND',
        'Tiantian Fund',
        'Tiantian Fund (EastMoney/1234567) provides keyless CN OTC fund NAV and estimate data.',
        'https://fund.eastmoney.com/',
        1,
        TRUE,
        NULL,
        NULL,
        NULL,
        NULL
    ),
    (
        'EASTMONEY_CN',
        'EastMoney CN',
        'EastMoney CN provides keyless market data for China A-shares (Shanghai and Shenzhen).',
        'https://quote.eastmoney.com/',
        2,
        TRUE,
        NULL,
        NULL,
        NULL,
        NULL
    )
ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    url = excluded.url,
    priority = excluded.priority,
    enabled = excluded.enabled,
    logo_filename = excluded.logo_filename;

-- Keep existing user customizations when possible by only remapping old defaults.
UPDATE market_data_providers
SET priority = 10
WHERE id = 'YAHOO' AND priority = 1;

UPDATE market_data_providers
SET priority = 20
WHERE id = 'ALPHA_VANTAGE' AND priority = 3;
