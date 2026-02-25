-- V5
alter table trip_rules add big_luggage_paid int not null default 0 check ( big_luggage_paid >= 0 ),
    add small_luggage_paid int not null default 0 check ( small_luggage_paid >= 0 ),
    add big_luggage_paid_price int not null default 0 check ( big_luggage_paid_price >= 0),
    add small_luggage_paid_price int not null default 0 check (small_luggage_paid_price >= 0);

alter table rule_templates
    add big_luggage_paid int,
    add small_luggage_paid int,
    add big_luggage_paid_price int,
    add small_luggage_paid_price int;

alter table booking_rule_snapshot
    add big_luggage_paid int,
    add small_luggage_paid int,
    add big_luggage_paid_price int,
    add small_luggage_paid_price int;

alter table cars add pic1 text,
    add pic2 text,
    add pic3 text,
    add pic4 text;

alter table car_snapshots add pic1 text,
    add pic2 text,
    add pic3 text,
    add pic4 text;

alter table bookings add payment_evidence_url text,
    add payment_evidence_text text;

create table dm_messages (
    id uuid primary key default gen_random_uuid(),
    sender_id text references users(id) not null,
    receiver_id text references users(id) not null,
    message_type text not null check (message_type in ('text', 'image', 'live_location')),
    content text not null, -- content is message if type is text, url if image. live_location for later
    parent_message_id uuid references dm_messages(id),
    created_at timestamptz default now(),
    deleted bool default false
);

alter table trip_messages add content_type text not null default 'text' check (content_type in ('text', 'image'));


-- V4
-- alter table profile_global add community_driver bool not null default false;
--
-- alter table profile_global
-- add constraint only_one_driver_type
-- check (
--   NOT (verified = true AND community_driver = true)
-- );



-- V3

-- create type ride_request_status as enum (
--   'active',
--   'fulfilled',
--   'expired',
--   'deleted'
-- );
--
-- create table ride_requests (
--     id uuid primary key default gen_random_uuid(),
--     requester_id text references users(id) not null,
--     origin_geog geography(Point, 4326) not null,
--     destination_geog geography(Point, 4326) not null,
--     from_text text not null,
--     to_text text not null,
--     preferred_time timestamptz not null,
--     time_flexibility interval not null,
--     seats int not null check (seats > 0),
--     price decimal(8, 2),
--     status ride_request_status not null default 'active',
--     created_at timestamptz not null default now(),
--     expires_at timestamptz not null,
--     -- Generated columns for grid-based clustering (~1km grid cells)
--     origin_grid geometry GENERATED ALWAYS AS (
--         ST_SnapToGrid(origin_geog::geometry, 0.01)
--     ) STORED,
--     dest_grid geometry GENERATED ALWAYS AS (
--         ST_SnapToGrid(destination_geog::geometry, 0.01)
--     ) STORED
-- );
--
-- CREATE OR REPLACE FUNCTION enforce_max_active_requests()
-- RETURNS trigger AS $$
-- DECLARE
--     active_count integer;
-- BEGIN
--     -- Only enforce when inserting ACTIVE request
--     IF NEW.status = 'active' THEN
--
--         SELECT COUNT(*)
--         INTO active_count
--         FROM ride_requests
--         WHERE requester_id = NEW.requester_id
--           AND status = 'active';
--
--         IF active_count > 5 THEN
--             RAISE EXCEPTION 'Maximum of 5 active ride requests allowed per user';
--         END IF;
--
--     END IF;
--
--     RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;
--
-- CREATE TRIGGER check_max_active_requests
-- BEFORE INSERT ON ride_requests
-- FOR EACH ROW
-- EXECUTE FUNCTION enforce_max_active_requests();
--
--
-- create index idx_requests_origin_geog
-- on ride_requests using gist (origin_geog);
--
-- create index idx_requests_destination_geog
-- on ride_requests using gist (destination_geog);
--
-- create index idx_requests_active
-- on ride_requests (preferred_time)
-- where status = 'active';
--
-- -- Indexes on generated grid columns for fast aggregation
-- CREATE INDEX idx_requests_grids_active
-- ON ride_requests (origin_grid, dest_grid)
-- WHERE status='active';





-- V1
-- -- 1. Update Trip Rules
-- ALTER TABLE trip_rules ADD COLUMN payment_qr_codes jsonb DEFAULT '{}'::jsonb;
--
-- -- 2. Update Booking Snapshots (Crucial for "Immutable Truth")
-- ALTER TABLE booking_rule_snapshot ADD COLUMN payment_qr_codes jsonb;
--
-- -- 3. Update Templates (For Driver UX)
-- ALTER TABLE rule_templates ADD COLUMN payment_qr_codes jsonb;


-- V2
-- create table trip_messages (
--   id uuid primary key default gen_random_uuid(),
--   trip_id uuid references trips(id) not null,
--   sender_id text references users(id),
--   sender_role text check (sender_role in ('driver', 'rider', 'system')),
--
--   -- Message classification
--   message_type text not null check (
--     message_type in (
--       'announcement',   -- driver → all
--       'question',       -- rider → driver (top level)
--       'followup',       -- rider → driver (reply to an answer)
--       'answer_public',   -- driver → all (public answer to a question)
--       'answer_private',  -- driver → rider (private reply)
--       'dm_private',      -- driver initiated → rider
--       'system'
--     )
--   ),
--
--   -- Threading (for Q&A). References a question.
--   parent_message_id uuid references trip_messages(id),
--
--   -- DM target (only set for 'answer_private' or 'followup' or 'dm_private' or 'answer_public')
--   receiver_id text references users(id),
--
--   content text not null,
--   created_at timestamptz default now(),
--   deleted bool default false,
--
--   -- Parent / threading rules
--     CONSTRAINT trip_messages_parent_rules
--     CHECK (
--       -- Top-level messages (no parent)
--       (
--         message_type IN (
--           'announcement',
--           'question',
--           'dm_private',
--           'system'
--         )
--         AND (parent_message_id IS NULL OR message_type = 'dm_private')
--       )
--
--       OR
--
--       -- Threaded replies
--       (
--         message_type IN (
--           'followup',
--           'answer_public',
--           'answer_private'
--         )
--         AND parent_message_id IS NOT NULL
--       )
--     ),
--
--     -- Receiver rules (who this message is directed to)
--     CONSTRAINT trip_messages_receiver_rules
--     CHECK (
--       -- Private messages require a receiver
--       (
--         message_type IN (
--           'dm_private',
--           'followup',
--           'answer_private'
--         )
--         AND receiver_id IS NOT NULL
--       )
--
--       OR
--
--       -- Public / broadcast messages must NOT have a receiver
--       (
--         message_type IN (
--           'announcement',
--           'question',
--           'answer_public',
--           'system'
--         )
--         AND receiver_id IS NULL
--       )
--     ),
--
--     -- Sender role vs message type
--     CONSTRAINT trip_messages_sender_role_rules
--     CHECK (
--       -- Driver capabilities
--       (
--         sender_role = 'driver'
--         AND message_type IN (
--           'announcement',
--           'answer_public',
--           'answer_private',
--           'dm_private',
--           'followup'
--         )
--       )
--
--       OR
--
--       -- Rider capabilities
--       (
--         sender_role = 'rider'
--         AND message_type IN (
--           'question',
--           'followup'
--         )
--       )
--
--       OR
--
--       -- System messages
--       (
--         sender_role = 'system'
--         AND message_type = 'system'
--       )
--     ),
--
--     -- Sender identity consistency
--     CONSTRAINT trip_messages_sender_identity
--     CHECK (
--       (sender_role = 'system' AND sender_id IS NULL)
--       OR
--       (sender_role <> 'system' AND sender_id IS NOT NULL)
--     )
--
-- );
--
-- CREATE INDEX idx_trip_messages_trip_time
-- ON trip_messages (trip_id, created_at);
--
-- CREATE INDEX idx_trip_messages_parent
-- ON trip_messages (parent_message_id);
--
-- CREATE INDEX idx_trip_messages_receiver
-- ON trip_messages (receiver_id)
-- WHERE receiver_id IS NOT NULL;

