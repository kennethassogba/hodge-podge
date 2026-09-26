ALTER TABLE calls ADD COLUMN language TEXT NOT NULL DEFAULT 'fr';
ALTER TABLE calls ADD COLUMN duration_seconds INTEGER;
ALTER TABLE calls ADD COLUMN outcome TEXT;
ALTER TABLE calls ADD COLUMN interruptions INTEGER NOT NULL DEFAULT 0;
ALTER TABLE calls ADD COLUMN transcription_failures INTEGER NOT NULL DEFAULT 0;
CREATE TABLE feedback (
  call_id TEXT PRIMARY KEY REFERENCES calls(id) ON DELETE CASCADE,
  owner TEXT NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  clarity INTEGER NOT NULL CHECK(clarity BETWEEN 0 AND 10),
  quality INTEGER NOT NULL CHECK(quality BETWEEN 0 AND 10),
  comment TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL CHECK(language IN ('fr','en')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE admin_sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
CREATE INDEX feedback_owner ON feedback(owner);
