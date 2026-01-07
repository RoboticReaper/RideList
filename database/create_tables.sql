drop schema public cascade;

create schema public;




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
  last_active timestamptz           -- used more like last website load
);

create table profile_global (
  id text primary key references users(id) on delete cascade,
  name text not null,               -- preferred_name
  verified bool not null default false,
  created_at timestamptz not null default now(),
  phone text,                       -- relationship-gated in app layer
  photo_url text
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

  -- display text
  from_text text not null,
  to_text text not null,

  -- GIS fields (authoritative for search)
  origin_geog geography(Point, 4326) not null,
  destination_geog geography(Point, 4326) not null,

  start_check_in bool default false,

  departure_time timestamptz not null,
  total_seats int not null check (total_seats > 0),
  seats_taken int not null default 0 check (seats_taken >= 0 and seats_taken <= total_seats),

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

  entity_type text,   -- 'trip', 'booking'
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



