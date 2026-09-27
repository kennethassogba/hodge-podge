CREATE TABLE feedback_nps (
  call_id TEXT PRIMARY KEY REFERENCES calls(id) ON DELETE CASCADE,
  owner TEXT NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  recommendation INTEGER NOT NULL CHECK(recommendation BETWEEN 0 AND 10),
  reason TEXT NOT NULL DEFAULT '',
  value_estimate TEXT NOT NULL DEFAULT '',
  suggestions TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL CHECK(language IN ('fr','en')),
  created_at INTEGER NOT NULL
);
CREATE INDEX feedback_nps_owner ON feedback_nps(owner);
