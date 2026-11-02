-- Existing purchased codes stay unlimited. Promotional codes start their
-- six calendar months only when redeemed for the first time.
ALTER TABLE lbt_unlock_codes ADD COLUMN duration_months INTEGER CHECK (duration_months IS NULL OR duration_months = 6);
ALTER TABLE lbt_unlock_codes ADD COLUMN activated_at TEXT;
ALTER TABLE lbt_unlock_codes ADD COLUMN expires_at TEXT;
