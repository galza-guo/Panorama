CREATE TABLE film_rolls (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  film_type_key TEXT NOT NULL DEFAULT 'classic-color',
  artwork_key TEXT NOT NULL DEFAULT 'classic-color',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE photos (
  id TEXT PRIMARY KEY NOT NULL,
  file_path TEXT NOT NULL,
  original_file_name TEXT,
  thumbnail_path TEXT,
  film_roll_id TEXT REFERENCES film_rolls(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_film_rolls_sort_order ON film_rolls(sort_order);
CREATE INDEX idx_photos_film_roll_id ON photos(film_roll_id);
CREATE INDEX idx_photos_sort_order ON photos(sort_order);
