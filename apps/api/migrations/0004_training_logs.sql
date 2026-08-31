CREATE TABLE training_logs (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  horse_id TEXT NOT NULL REFERENCES horses(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  type TEXT NOT NULL,
  notes TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX training_logs_tenant_date_idx ON training_logs(tenant_id, date);
CREATE INDEX training_logs_horse_date_idx ON training_logs(horse_id, date);
