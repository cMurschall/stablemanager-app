CREATE TABLE horse_owners (
  horse_id TEXT NOT NULL REFERENCES horses(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX horse_owners_horse_user_uidx ON horse_owners(horse_id, user_id);
CREATE INDEX horse_owners_tenant_user_idx ON horse_owners(tenant_id, user_id);

INSERT INTO horse_owners (horse_id, tenant_id, user_id)
SELECT id, tenant_id, owner_user_id
FROM horses
WHERE owner_user_id IS NOT NULL;
