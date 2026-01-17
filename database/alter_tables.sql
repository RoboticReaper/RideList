-- 1. Update Trip Rules
ALTER TABLE trip_rules ADD COLUMN payment_qr_codes jsonb DEFAULT '{}'::jsonb;

-- 2. Update Booking Snapshots (Crucial for "Immutable Truth")
ALTER TABLE booking_rule_snapshot ADD COLUMN payment_qr_codes jsonb;

-- 3. Update Templates (For Driver UX)
ALTER TABLE rule_templates ADD COLUMN payment_qr_codes jsonb;