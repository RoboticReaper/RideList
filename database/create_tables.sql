-- drop schema public cascade;
--
-- create schema public;




-- Needed for gen_random_uuid()
create extension if not exists pgcrypto;

-- Needed for routing and locations
create extension if not exists postgis;

-- ======================
-- ENUMS
-- ======================
create type trip_status as enum ('bookable', 'locked', 'full', 'departed', 'done', 'cancelled', 'aborted');

create type booking_status as enum (
  'waiting_approval',
  'joined_with_pay_window',
  'pending_pay_confirmation_from_driver',
  'confirmed',
  'pay_timeout',
  'removed',
  'left_paid', -- rider left BEFORE departure after paying
  'left_unpaid', -- rider left BEFORE departure without paying
    -- left_* statuses is never set once trip status has moved beyond departed

  'cancelled', -- trip-level cancellation OR trip aborted BEFORE rider pickup
  'completed', -- rider was picked up and trip finished
  'no_show' -- rider was NOT picked up AFTER pickup started
);

create type trip_event_type as enum (
  'trip_created',
  'trip_updated',
  'trip_cancelled',
  'trip_departed',
  'trip_completed',
  'trip_aborted',
  'trip_late_warning',
  'system_cancelled'
);

create type language_types as enum ('en', 'zh');

-- ======================
-- USERS / PROFILES / SETTINGS
-- ======================
create table users (
  id text primary key,
  created_at timestamptz not null default now(),
  email text not null unique,
  last_active timestamptz,           -- used more like last website load
  is_admin bool not null default false
);

create table profile_global (
  id text primary key references users(id) on delete cascade,
  name text not null,               -- preferred_name
  verified bool not null default false, -- UIUC student verified
  created_at timestamptz not null default now(),
  phone text,                       -- relationship-gated in app layer
  photo_url text,
  community_driver bool not null default false,
  constraint only_one_driver_type check (
    NOT (verified = true AND community_driver = true)
  )
);

create table profile_rider (
  id text primary key references users(id) on delete cascade,
  default_big_luggage int not null default 0,
  default_small_luggage int not null default 0,
  rating_cached double precision,
  completed_rides int not null default 0
);

create table profile_driver (
  id text primary key references users(id) on delete cascade,
  rating_cached double precision,
  completed_trips int not null default 0 -- requires >= 1 completed bookings for each trip to count
);

create table settings_global (
  id text primary key references users(id) on delete cascade,
  -- global = channels/quiet hours/etc. (role-specific toggles live below)
  notifications jsonb not null default '{}'::jsonb,
  timezone text,
  language language_types
);

create table settings_rider (
  id text primary key references users(id) on delete cascade,
  notifications jsonb not null default '{}'::jsonb
);

create table settings_driver (
  id text primary key references users(id) on delete cascade,
  notifications jsonb not null default '{}'::jsonb
);

-- ======================
-- CARS
-- ======================
create table cars (
  id uuid primary key default gen_random_uuid(),
  owner text references users(id) not null,
  make text,
  model text,
  color text,
  year text,
  seats int not null check (seats > 0),
  big_luggage int check (big_luggage is null or big_luggage >= 0),
  small_luggage int check (small_luggage is null or small_luggage >= 0),
  plate text,
  deleted bool not null default false,
  deleted_at timestamptz,
  last_selected timestamptz,
  constraint cars_deleted_consistency check (
    (deleted = false and deleted_at is null) or (deleted = true and deleted_at is not null)
  )
);

-- ======================
-- TRIPS / RULES
-- ======================
create table trips (
  id uuid primary key default gen_random_uuid(),
  driver text references users(id) not null,
  car uuid references cars(id),
  price decimal(8, 2),
  notes text,

  -- public-facing sanitized-into-neighborhood display text
  from_text text not null,
  to_text text not null,

  -- exact address that the driver typed. only show to driver themselves
  from_input_text text not null,
  to_input_text text not null,

  -- GIS fields (authoritative for search)
  origin_geog geography(Point, 4326) not null,
  destination_geog geography(Point, 4326) not null,

  start_check_in bool default false,

  departure_time timestamptz not null,
  total_seats int not null check (total_seats > 0),
  seats_taken int not null default 0 check (seats_taken >= 0 and seats_taken <= total_seats),
  actual_departure_time timestamptz,

  status trip_status not null default 'bookable',
  created_at timestamptz not null default now(),
  modified_at timestamptz
);


-- 1:1 rules with trips (PK=trip_id)
create table trip_rules (
  id uuid primary key references trips(id) on delete cascade,

  big_luggage_lim int not null check (big_luggage_lim >= 0),
  small_luggage_lim int not null check (small_luggage_lim >= 0),

  pickup_rules text,
  pickup_radius_meters int not null default 5000 check (pickup_radius_meters > 0),
  drop_off_radius_meters int not null default 5000 check (drop_off_radius_meters > 0),

  departure_time_flexibility interval not null,
  payment_methods text[],
  cancellation_policy text,
  payment_handle text,
  payment_qr_codes jsonb default '{}'::jsonb,

  auto_accept bool not null default true,
  cutoff_time interval not null,
  pay_window interval not null,
  start_check_in_hrs_before_departure interval
);

create table trip_routes ( -- expensive feature. only paid users will have routes
  -- this table is not used for now
  trip_id uuid primary key references trips(id) on delete cascade,

  -- full route geometry (polyline)
  -- populate using Google Directions API
  route_geog geography(LineString, 4326) not null,

  -- optional metadata
  distance_meters int,
  duration_seconds int,
  created_at timestamptz not null default now()
);

-- ======================
-- TRIP EVENTS (semantic log)
-- ======================
create table trip_events (
  id uuid primary key default gen_random_uuid(),
  trip uuid references trips(id) not null,
  actor_id text references users(id), -- null => system
  created_at timestamptz not null default now(),

  event_type trip_event_type not null,

  affected_entities jsonb not null default '[]'::jsonb,
  changes jsonb not null default '{}'::jsonb,
  notes text
);

-- ======================
-- BOOKINGS (authoritative booking state)
-- ======================
create table bookings (
  id uuid primary key default gen_random_uuid(),
  rider text references users(id) not null,
  trip uuid references trips(id) not null,

  big_luggage int not null default 0 check (big_luggage >= 0),
  small_luggage int not null default 0 check (small_luggage >= 0),
  seats_booked int not null check (seats_booked >= 1),

  paid bool not null default false,
  created_at timestamptz not null default now(),
  status booking_status not null,

  intended_payment_method text not null,


  -- 3 fields below are available after driver accepts booking.
  pickup_geog geography(Point, 4326),
  pickup_location_text text,
  driver_note text, -- driver note to rider
  rider_note text, -- rider pick up note

  ready bool not null default false,
  ready_at timestamptz,
  preferred_pickup_time timestamptz,

  picked_up bool not null default false,
  picked_up_at timestamptz,

  constraint ready_time_consistency check (
      (ready = false and ready_at is null) or (ready = true and ready_at is not null)
      )
);

-- Snapshot rules per booking (PK=booking_id). This is your immutable truth.
create table booking_rule_snapshot (
  id uuid primary key references bookings(id) on delete cascade,
  captured_at timestamptz not null default now(),

  big_luggage_lim int,
  small_luggage_lim int,
  pickup_rules text,
  pickup_radius_meters int not null,
  drop_off_radius_meters int not null,
  departure_time_flexibility interval not null,
  payment_methods text[],
  payment_handle text,
  payment_qr_codes jsonb,
  cancellation_policy text,
  auto_accept bool not null,
  cutoff_time interval,
  pay_window interval not null,
  start_check_in_hrs_before_departure interval
);

create table booking_status_history (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) on delete cascade not null,
  actor_id text references users(id), -- null => system
  old_status booking_status,
  new_status booking_status not null,
  created_at timestamptz not null default now(),

  -- optional but very useful causality link:
  trigger_event_id uuid references trip_events(id)
);

-- Logs manual rider removals (separate from status history)
create table booking_removal (
  id uuid primary key default gen_random_uuid(),
  bid uuid references bookings(id) on delete cascade not null,
  actor_id text references users(id) not null,
  reason text,
  created_at timestamptz not null default now(),
  trigger_event_id uuid references trip_events(id)
);

-- Snapshot car info for each trip at departure time (immutable history)
create table car_snapshots (
  id uuid primary key references trips(id) on delete cascade,
  original_car_id uuid, -- no FK req: traceability only
  make text,
  model text,
  seats int,
  big_luggage int,
  small_luggage int,
  plate text,
  color text,
  year text,
  created_at timestamptz not null default now()
);

-- ======================
-- TEMPLATES
-- ======================
create table rule_templates (
  id uuid primary key default gen_random_uuid(),
  driver text references users(id) not null,
  name text not null,

  big_luggage_lim int,
  small_luggage_lim int,
  pickup_rules text,
  pickup_radius_meters int,
  drop_off_radius_meters int,
  departure_time_flexibility interval,
  payment_methods text[],
  cancellation_policy text,
  auto_accept bool,
  cutoff_time interval,
  payment_handle text,
  payment_qr_codes jsonb,
  pay_window interval,
  start_check_in_hrs_before_departure interval
);

create table trip_templates (
  id uuid primary key default gen_random_uuid(),
  driver text references users(id) not null,
  car uuid references cars(id),
  rule uuid references rule_templates(id),
  price decimal(8, 2),
  name text not null,

  notes text not null,
  from_text text,
  from_place_id text,
  to_text text,
  to_place_id text,
  origin_geog geography(Point, 4326),
  destination_geog geography(Point, 4326),

  total_seats int check (total_seats is null or total_seats > 0),
  created_at timestamptz not null default now(),
  modified_at timestamptz
);


create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id text references users(id) on delete cascade,

  type text not null, -- e.g. 'booking_confirmed'
  title text not null,
  body text not null,

  entity_type text,   -- 'trip', 'booking', 'messages'
  entity_id uuid,

  open_link text,

  read bool not null default false,
  created_at timestamptz not null default now()
);


CREATE TABLE user_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Ownership
    user_id text references users(id),

    -- Device identity (client-generated, stored in localStorage)
    device_id TEXT NOT NULL,

    -- Push delivery
    fcm_token TEXT UNIQUE,
    platform TEXT NOT NULL CHECK (platform IN ('web', 'ios', 'android')),

    -- Permission state (mirrors browser / OS)
    permission_state TEXT NOT NULL CHECK (
        permission_state IN ('default', 'granted', 'denied')
    ) DEFAULT 'default',

    -- Prompt history (anti-spam logic)
    last_prompted_at TIMESTAMPTZ,
    last_prompt_result TEXT CHECK (
        last_prompt_result IN ('accepted', 'denied', 'dismissed')
    ),

    -- Whether we are allowed to send push to this device
    push_enabled BOOLEAN NOT NULL DEFAULT false,

    -- Health & lifecycle
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    token_last_updated_at TIMESTAMPTZ,
    invalidated_at TIMESTAMPTZ,

    -- Auditing
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Prevent duplicate device rows per user
    UNIQUE (user_id, device_id)
);

CREATE TABLE booking_mutations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  actor text NOT NULL, -- rider or driver
  change jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

create table feedbacks (
  id uuid primary key default gen_random_uuid(),
  actor text not null references users(id),
  message text not null,
  read bool not null default false,

  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table trip_messages (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references trips(id) not null,
  sender_id text references users(id),
  sender_role text check (sender_role in ('driver', 'rider', 'system')),

  -- Message classification
  message_type text not null check (
    message_type in (
      'announcement',   -- driver → all
      'question',       -- rider → driver (top level)
      'followup',       -- rider → driver (reply to an answer)
      'answer_public',   -- driver → all (public answer to a question)
      'answer_private',  -- driver → rider (private reply)
      'dm_private',      -- driver initiated → rider
      'system'
    )
  ),

  -- Threading (for Q&A). References a question.
  parent_message_id uuid references trip_messages(id),

  -- DM target (only set for 'answer_private' or 'followup' or 'dm_private' or 'answer_public')
  receiver_id text references users(id),

  content text not null,
  created_at timestamptz default now(),
  deleted bool default false,

  -- Parent / threading rules
    CONSTRAINT trip_messages_parent_rules
    CHECK (
      -- Top-level messages (no parent)
      (
        message_type IN (
          'announcement',
          'question',
          'dm_private',
          'system'
        )
        AND (parent_message_id IS NULL OR message_type = 'dm_private')
      )

      OR

      -- Threaded replies
      (
        message_type IN (
          'followup',
          'answer_public',
          'answer_private'
        )
        AND parent_message_id IS NOT NULL
      )
    ),

    -- Receiver rules (who this message is directed to)
    CONSTRAINT trip_messages_receiver_rules
    CHECK (
      -- Private messages require a receiver
      (
        message_type IN (
          'dm_private',
          'followup',
          'answer_private'
        )
        AND receiver_id IS NOT NULL
      )

      OR

      -- Public / broadcast messages must NOT have a receiver
      (
        message_type IN (
          'announcement',
          'question',
          'answer_public',
          'system'
        )
        AND receiver_id IS NULL
      )
    ),

    -- Sender role vs message type
    CONSTRAINT trip_messages_sender_role_rules
    CHECK (
      -- Driver capabilities
      (
        sender_role = 'driver'
        AND message_type IN (
          'announcement',
          'answer_public',
          'answer_private',
          'dm_private',
          'followup'
        )
      )

      OR

      -- Rider capabilities
      (
        sender_role = 'rider'
        AND message_type IN (
          'question',
          'followup'
        )
      )

      OR

      -- System messages
      (
        sender_role = 'system'
        AND message_type = 'system'
      )
    ),

    -- Sender identity consistency
    CONSTRAINT trip_messages_sender_identity
    CHECK (
      (sender_role = 'system' AND sender_id IS NULL)
      OR
      (sender_role <> 'system' AND sender_id IS NOT NULL)
    )

);

create type ride_request_status as enum (
  'active',
  'fulfilled',
  'expired',
  'deleted'
);

create table ride_requests (
    id uuid primary key default gen_random_uuid(),
    requester_id text references users(id) not null,
    origin_geog geography(Point, 4326) not null,
    destination_geog geography(Point, 4326) not null,
    from_text text not null,
    to_text text not null,
    preferred_time timestamptz not null,
    time_flexibility interval not null,
    seats int not null check (seats > 0),
    price decimal(8, 2),
    status ride_request_status not null default 'active',
    created_at timestamptz not null default now(),
    expires_at timestamptz not null,
    -- Generated columns for grid-based clustering (~1km grid cells)
    origin_grid geometry GENERATED ALWAYS AS (
        ST_SnapToGrid(origin_geog::geometry, 0.01)
    ) STORED,
    dest_grid geometry GENERATED ALWAYS AS (
        ST_SnapToGrid(destination_geog::geometry, 0.01)
    ) STORED
);

CREATE OR REPLACE FUNCTION enforce_max_active_requests()
RETURNS trigger AS $$
DECLARE
    active_count integer;
BEGIN
    -- Only enforce when inserting ACTIVE request
    IF NEW.status = 'active' THEN

        SELECT COUNT(*)
        INTO active_count
        FROM ride_requests
        WHERE requester_id = NEW.requester_id
          AND status = 'active';

        IF active_count >= 5 THEN
            RAISE EXCEPTION 'Maximum of 5 active ride requests allowed per user';
        END IF;

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_max_active_requests
BEFORE INSERT ON ride_requests
FOR EACH ROW
EXECUTE FUNCTION enforce_max_active_requests();


create index idx_requests_origin_geog
on ride_requests using gist (origin_geog);

create index idx_requests_destination_geog
on ride_requests using gist (destination_geog);

create index idx_requests_active
on ride_requests (preferred_time)
where status = 'active';

-- Indexes on generated grid columns for fast aggregation
CREATE INDEX idx_requests_grids_active
ON ride_requests (origin_grid, dest_grid)
WHERE status='active';


CREATE INDEX idx_trip_messages_trip_time
ON trip_messages (trip_id, created_at);

CREATE INDEX idx_trip_messages_parent
ON trip_messages (parent_message_id);

CREATE INDEX idx_trip_messages_receiver
ON trip_messages (receiver_id)
WHERE receiver_id IS NOT NULL;

CREATE INDEX ON booking_mutations (booking_id, created_at, actor);



-- ======================
-- Database Index
-- ======================
create unique index uniq_active_booking_per_rider_trip
on bookings (rider, trip)
where status in (
  'waiting_approval',
  'joined_with_pay_window',
  'pending_pay_confirmation_from_driver',
  'confirmed'
);

create index idx_bookings_trip_status
on bookings (trip, status);

-- fast “upcoming trips” queries
create index idx_trips_departure_time on trips (departure_time);

-- driver dashboard: upcoming trips
create index idx_trips_driver_departure on trips (driver, departure_time);

-- trip timeline / audit view
create index idx_trip_events_trip_time on trip_events (trip, created_at);

-- booking timeline view
create index idx_booking_status_history_booking_time on booking_status_history (booking_id, created_at);

-- rider dashboard: my bookings
create index idx_bookings_rider_created on bookings (rider, created_at desc);

-- my templates page for prefilling UI
create index idx_trip_templates_driver
on trip_templates (driver);

create index idx_rule_templates_driver
on rule_templates (driver);

-- origin / destination radius search
create index idx_trips_origin_geog
on trips using gist (origin_geog);

create index idx_trips_destination_geog
on trips using gist (destination_geog);

-- route off-track search
create index idx_trip_routes_geog
on trip_routes using gist (route_geog);

-- filter by pre-departure trips
create index idx_trips_active_departure
on trips (departure_time)
where status in ('bookable', 'full');

create index idx_notifications_user_unread
on notifications (user_id, read, created_at desc);

-- Booking lookups
CREATE INDEX idx_bookings_trip_rider_created
ON bookings (trip, rider, created_at DESC);

CREATE INDEX idx_bookings_rider_active
ON bookings (rider, created_at DESC)
WHERE status IN (
  'waiting_approval',
  'joined_with_pay_window',
  'pending_pay_confirmation_from_driver',
  'confirmed'
);

CREATE INDEX idx_bookings_trip_active
ON bookings (trip)
WHERE status IN (
  'joined_with_pay_window',
  'pending_pay_confirmation_from_driver',
  'confirmed'
);

-- Notifications
CREATE INDEX idx_notifications_user_created
ON notifications (user_id, created_at DESC);

-- Push devices
CREATE INDEX idx_user_devices_pushable
ON user_devices (user_id)
WHERE permission_state = 'granted'
  AND push_enabled = true
  AND invalidated_at IS NULL;

CREATE INDEX idx_trips_status_departure
ON trips (status, departure_time);

CREATE INDEX idx_trips_driver_status
ON trips (driver, status, departure_time);

CREATE INDEX idx_bookings_created_status
ON bookings (status, created_at)
WHERE status = 'joined_with_pay_window';

CREATE INDEX idx_trips_status_time_automation
ON trips (status, departure_time, actual_departure_time);

CREATE INDEX idx_bookings_status_trip
ON bookings (status, trip);

CREATE INDEX idx_bookings_rider_all
ON bookings (rider, created_at DESC);

CREATE INDEX idx_trip_events_type_time
ON trip_events (event_type, created_at DESC);

CREATE INDEX idx_user_devices_inactive
ON user_devices (last_seen_at)
WHERE invalidated_at IS NULL;

CREATE INDEX idx_trips_status_departure_time
ON trips (status, departure_time);

CREATE INDEX idx_trip_rules_payment_methods
ON trip_rules
USING GIN (payment_methods);

CREATE INDEX idx_trip_rules_id_filters
ON trip_rules (id, big_luggage_lim, small_luggage_lim, auto_accept);

CREATE INDEX idx_trips_price
ON trips (price)
WHERE status IN ('bookable','full');

CREATE INDEX idx_trip_rules_radius
ON trip_rules (pickup_radius_meters, drop_off_radius_meters);

CREATE INDEX idx_trips_available_seats
ON trips (departure_time)
WHERE status = 'bookable'
  AND seats_taken < total_seats;


