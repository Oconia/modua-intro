CREATE TABLE intro_media_feed (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  catalog_json TEXT NOT NULL,
  items_json TEXT NOT NULL,
  synced_at TEXT NOT NULL
);
