ALTER TABLE tenants ADD COLUMN max_daily_service_tasks INTEGER NOT NULL DEFAULT 3;

CREATE TABLE service_orders (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  horse_id TEXT NOT NULL REFERENCES horses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  instructions TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  daily_count INTEGER NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  cancelled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX service_orders_tenant_dates_idx ON service_orders(tenant_id, start_date, end_date);
CREATE INDEX service_orders_horse_idx ON service_orders(horse_id);

CREATE TABLE service_order_self_days (
  id TEXT PRIMARY KEY NOT NULL,
  service_order_id TEXT NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX service_order_self_days_order_date_uidx ON service_order_self_days(service_order_id, date);
CREATE INDEX service_order_self_days_date_idx ON service_order_self_days(date);

CREATE TABLE service_task_completions (
  id TEXT PRIMARY KEY NOT NULL,
  service_order_id TEXT NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  occurrence INTEGER NOT NULL,
  note TEXT,
  completed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  completed_at TEXT NOT NULL
);
CREATE UNIQUE INDEX service_task_completions_task_uidx ON service_task_completions(service_order_id, date, occurrence);
CREATE INDEX service_task_completions_date_idx ON service_task_completions(date);
