CREATE TABLE session_recaps (
  scope TEXT NOT NULL,
  language TEXT NOT NULL CHECK(language IN ('fr','en')),
  owner TEXT NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  source_hash TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(scope, language)
);
CREATE TABLE feedback_text (
  thread_id TEXT PRIMARY KEY REFERENCES threads(id) ON DELETE CASCADE,
  owner TEXT NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  recommendation INTEGER NOT NULL CHECK(recommendation BETWEEN 0 AND 10),
  reason TEXT NOT NULL DEFAULT '',
  value_estimate TEXT NOT NULL DEFAULT '',
  suggestions TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL CHECK(language IN ('fr','en')),
  created_at INTEGER NOT NULL
);

-- No recipient or email body is kept here. The fingerprint also prevents duplicate sends.
CREATE TABLE recap_emails (
  fingerprint TEXT PRIMARY KEY,
  owner TEXT NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  sent INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
