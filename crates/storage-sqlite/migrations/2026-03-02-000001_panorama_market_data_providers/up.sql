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
        'EASTMONEY_CN',
        'EastMoney CN',
        'EastMoney provides keyless real-time and historical quotes for mainland China equities and ETFs.',
        'https://quote.eastmoney.com/',
        2,
        TRUE,
        NULL,
        NULL,
        NULL,
        NULL
    ),
    (
        'TIANTIAN_FUND',
        'Tiantian Fund',
        'Tiantian provides keyless NAV quotes and history for mainland China OTC mutual funds.',
        'https://fund.eastmoney.com/',
        5,
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
