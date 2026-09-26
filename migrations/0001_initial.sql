PRAGMA foreign_keys = ON;
CREATE TABLE visitors (
  id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  busy_until INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE threads (
  id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE INDEX threads_owner ON threads(owner, created_at);
CREATE TABLE messages (
  id TEXT PRIMARY KEY, thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user','assistant')),
  text TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'text',
  created_at INTEGER NOT NULL
);
CREATE INDEX messages_thread ON messages(thread_id, created_at);
CREATE TABLE notes (
  id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  text TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX notes_owner ON notes(owner, created_at);
CREATE TABLE decisions (
  id TEXT PRIMARY KEY, thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  action TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX decisions_thread ON decisions(thread_id, created_at);
CREATE TABLE quotas (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE calls (
  id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  provider_id TEXT, created_at INTEGER NOT NULL, ended_at INTEGER
);
