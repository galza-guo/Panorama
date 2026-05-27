//! Diesel table declarations for local external connector tables.

diesel::table! {
    external_connections (id) {
        id -> Text,
        provider -> Text,
        display_name -> Text,
        environment -> Text,
        owner_name -> Nullable<Text>,
        status -> Text,
        capabilities_json -> Text,
        metadata_json -> Nullable<Text>,
        created_at -> Timestamp,
        updated_at -> Timestamp,
    }
}

diesel::table! {
    external_account_links (id) {
        id -> Text,
        connection_id -> Text,
        provider -> Text,
        remote_account_id -> Text,
        local_account_id -> Text,
        remote_account_number_masked -> Nullable<Text>,
        remote_account_type -> Nullable<Text>,
        linked_at -> Timestamp,
        source_from_date -> Date,
        sync_mode -> Text,
        status -> Text,
        metadata_json -> Nullable<Text>,
        created_at -> Timestamp,
        updated_at -> Timestamp,
    }
}

diesel::joinable!(external_account_links -> external_connections (connection_id));
diesel::allow_tables_to_appear_in_same_query!(external_connections, external_account_links);
