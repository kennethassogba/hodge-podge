CREATE TABLE notion_accounts (
  id TEXT PRIMARY KEY, workspace_name TEXT NOT NULL, credentials TEXT NOT NULL,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, refresh_until INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE notion_sessions (
  token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES notion_accounts(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE notion_oauth_states (
  state_hash TEXT PRIMARY KEY, browser_hash TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE notion_jobs (
  id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES notion_accounts(id) ON DELETE CASCADE,
  intention TEXT NOT NULL, language TEXT NOT NULL, page_ids TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'read', status TEXT NOT NULL DEFAULT 'pending',
  sources TEXT NOT NULL DEFAULT '[]', findings TEXT, review TEXT, draft TEXT,
  error TEXT, attempts INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0,
  lease_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  published_url TEXT, publish_title TEXT, publish_body TEXT, publish_parent TEXT
);
CREATE INDEX notion_jobs_pending ON notion_jobs(status, lease_until, updated_at);
CREATE INDEX notion_jobs_account ON notion_jobs(account_id, created_at);
CREATE UNIQUE INDEX notion_one_active_job ON notion_jobs(account_id) WHERE status='pending';
