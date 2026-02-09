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
VALUES (
    'OPEN_EXCHANGE_RATES',
    'Open Exchange Rates',
    'Open Exchange Rates provides currency exchange rates for automatic FX management.',
    'https://openexchangerates.org/',
    30,
    FALSE,
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
    logo_filename = excluded.logo_filename;
