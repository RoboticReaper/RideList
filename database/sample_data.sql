-- Sample data for RideList schema
begin;

insert into users (id, created_at, email, last_active) values
('u_alex', '2025-08-20T14:12:00Z', 'alex.park@illinois.edu', '2025-12-25T16:30:00Z'),
('u_chen', '2025-07-11T18:35:00Z', 'chen.li@illinois.edu', '2025-12-25T16:30:00Z'),
('u_sara', '2025-09-02T02:10:00Z', 'sara.nguyen@illinois.edu', '2025-12-25T16:30:00Z'),
('u_dan', '2025-06-14T16:00:00Z', 'dan.wilson@illinois.edu', '2025-12-25T16:30:00Z'),
('u_mia', '2025-09-10T20:44:00Z', 'mia.zhang@illinois.edu', '2025-12-25T16:30:00Z'),
('u_ryan', '2025-09-18T12:20:00Z', 'ryan.johnson@illinois.edu', '2025-12-25T16:30:00Z'),
('u_jun', '2025-10-03T03:05:00Z', 'jun.chen@illinois.edu', '2025-12-25T16:30:00Z'),
('u_lily', '2025-10-11T19:30:00Z', 'lily.wang@illinois.edu', '2025-12-25T16:30:00Z'),
('u_kai', '2025-11-01T01:02:00Z', 'kai.xu@illinois.edu', '2025-12-25T16:30:00Z');

insert into profile_global (id, name, verified, created_at, phone, photo_url) values
('u_alex', 'Alex', true, '2025-08-20T14:12:00Z', '+1-217-555-0134', 'https://images.example.com/u_alex.jpg'),
('u_chen', 'Chen', true, '2025-07-11T18:35:00Z', '+1-312-555-0108', 'https://images.example.com/u_chen.jpg'),
('u_sara', 'Sara', false, '2025-09-02T02:10:00Z', null, 'https://images.example.com/u_sara.jpg'),
('u_dan', 'Dan', true, '2025-06-14T16:00:00Z', '+1-217-555-0177', 'https://images.example.com/u_dan.jpg'),
('u_mia', 'Mia', true, '2025-09-10T20:44:00Z', '+1-217-555-0199', 'https://images.example.com/u_mia.jpg'),
('u_ryan', 'Ryan', false, '2025-09-18T12:20:00Z', null, null),
('u_jun', 'Jun', false, '2025-10-03T03:05:00Z', null, 'https://images.example.com/u_jun.jpg'),
('u_lily', 'Lily', true, '2025-10-11T19:30:00Z', '+1-217-555-0111', 'https://images.example.com/u_lily.jpg'),
('u_kai', 'Kai', false, '2025-11-01T01:02:00Z', null, null);

insert into profile_rider (id, default_big_luggage, default_small_luggage, rating_cached, completed_rides) values
('u_mia', 1, 1, 4.9, 12),
('u_ryan', 0, 1, 4.5, 3),
('u_jun', 1, 0, 4.7, 5),
('u_lily', 1, 2, 4.2, 8),
('u_kai', 0, 0, 4.8, 6),
('u_alex', 0, 0, 4.6, 4),
('u_chen', 0, 0, 4.9, 2),
('u_sara', 1, 0, 4.4, 7),
('u_dan', 0, 0, 4.3, 1);

insert into profile_driver (id, rating_cached, completed_trips) values
('u_alex', 4.8, 22),
('u_chen', 4.9, 15),
('u_sara', 4.6, 6),
('u_dan', 4.7, 9);

insert into settings_global (id, notifications, timezone, language) values
('u_alex', '{"channels":{"push":true,"email":true},"quiet_hours":{"start":"23:00","end":"07:00"}}'::jsonb, 'America/Chicago', 'en'),
('u_chen', '{"channels":{"push":true,"email":false},"quiet_hours":{"start":"22:30","end":"07:30"}}'::jsonb, 'America/Chicago', 'en'),
('u_sara', '{"channels":{"push":true,"email":true},"quiet_hours":{"start":"22:00","end":"08:00"}}'::jsonb, 'America/Chicago', 'en'),
('u_dan', '{"channels":{"push":false,"email":true},"quiet_hours":{"start":"21:00","end":"07:00"}}'::jsonb, 'America/Chicago', 'en'),
('u_mia', '{"channels":{"push":true,"email":true},"quiet_hours":{"start":"23:30","end":"08:00"}}'::jsonb, 'America/Chicago', 'zh'),
('u_ryan', '{"channels":{"push":true,"email":false},"quiet_hours":null}'::jsonb, 'America/Chicago', 'en'),
('u_jun', '{"channels":{"push":true,"email":true},"quiet_hours":{"start":"00:00","end":"07:00"}}'::jsonb, 'America/Chicago', 'zh'),
('u_lily', '{"channels":{"push":true,"email":true},"quiet_hours":{"start":"22:00","end":"06:30"}}'::jsonb, 'America/Chicago', 'zh'),
('u_kai', '{"channels":{"push":true,"email":false},"quiet_hours":{"start":"23:00","end":"07:00"}}'::jsonb, 'America/Chicago', 'zh');

insert into settings_rider (id, notifications) values
('u_mia', '{"booking_updates":true,"departure_alerts":true,"pickup_reminders":true,"review_prompts":true}'::jsonb),
('u_ryan', '{"booking_updates":true,"departure_alerts":true,"pickup_reminders":false,"review_prompts":true}'::jsonb),
('u_jun', '{"booking_updates":true,"departure_alerts":false,"pickup_reminders":true,"review_prompts":false}'::jsonb),
('u_lily', '{"booking_updates":true,"departure_alerts":true,"pickup_reminders":true,"review_prompts":true}'::jsonb),
('u_kai', '{"booking_updates":true,"departure_alerts":true,"pickup_reminders":true,"review_prompts":true}'::jsonb),
('u_alex', '{"booking_updates":true,"departure_alerts":true,"pickup_reminders":true,"review_prompts":false}'::jsonb),
('u_chen', '{"booking_updates":true,"departure_alerts":true,"pickup_reminders":true,"review_prompts":false}'::jsonb),
('u_sara', '{"booking_updates":true,"departure_alerts":true,"pickup_reminders":true,"review_prompts":true}'::jsonb),
('u_dan', '{"booking_updates":true,"departure_alerts":true,"pickup_reminders":true,"review_prompts":true}'::jsonb);

insert into settings_driver (id, notifications) values
('u_alex', '{"new_booking":true,"payment_marked":true,"rate_riders":true,"trip_changes":false}'::jsonb),
('u_chen', '{"new_booking":true,"payment_marked":true,"rate_riders":true,"trip_changes":true}'::jsonb),
('u_sara', '{"new_booking":true,"payment_marked":false,"rate_riders":true,"trip_changes":true}'::jsonb),
('u_dan', '{"new_booking":true,"payment_marked":true,"rate_riders":false,"trip_changes":false}'::jsonb),
('u_mia', '{"new_booking":false}'::jsonb),
('u_ryan', '{"new_booking":false}'::jsonb),
('u_jun', '{"new_booking":false}'::jsonb),
('u_lily', '{"new_booking":false}'::jsonb),
('u_kai', '{"new_booking":false}'::jsonb);

insert into cars (id, owner, make, model, seats, big_luggage, small_luggage, plate, deleted, deleted_at) values
('bb2af43e-f01b-47f6-8a4b-ac0542a4e422', 'u_alex', 'Toyota', 'Camry', 4, 2, 2, 'IL ALEX-217', true, '2025-12-13T03:10:00Z'),
('009eb7cd-fcf5-40fb-b366-34f990b41af8', 'u_alex', 'Honda', 'CR-V', 4, 3, 3, 'IL CRV-602', false, null),
('b303dcf4-7485-420b-88e6-a155b7da9dd4', 'u_chen', 'Tesla', 'Model 3', 4, 2, 2, 'IL EV-888', false, null),
('98494635-28fc-4275-ac83-0a1ebdaac034', 'u_sara', 'Honda', 'Civic', 4, 1, 2, 'IL SARA-11', false, null),
('ce3884df-abf2-4570-b703-0ec6fc56c06b', 'u_dan', 'Honda', 'Odyssey', 6, 4, 5, 'IL VAN-27', false, null);

insert into trips (id, driver, car, notes, from_text, to_text, origin_geog, destination_geog, departure_time, total_seats, seats_left, status, created_at, modified_at) values
('d9821521-a81a-46fc-95b9-ec67ceaedcac', 'u_alex', '009eb7cd-fcf5-40fb-b366-34f990b41af8', 'Quiet ride, no smoking. 1 stop possible at Kankakee if needed.', 'UIUC: Illini Union', 'Chicago O''Hare (ORD)', ST_MakePoint(-88.2272, 40.1099)::geography, ST_MakePoint(-87.9073, 41.9742)::geography, '2026-01-03T18:00:00Z', 4, 1, 'bookable', '2025-12-22T19:00:00Z', '2025-12-24T02:00:00Z'),
('146f0b89-0e56-42d6-9f5b-3909dde54a64', 'u_alex', '009eb7cd-fcf5-40fb-b366-34f990b41af8', 'Heading to downtown. Small backpacks preferred; please be on time.', 'UIUC: ISR (Ikenberry Commons)', 'Chicago: Union Station', ST_MakePoint(-88.235, 40.0993)::geography, ST_MakePoint(-87.6405, 41.8786)::geography, '2026-01-02T19:00:00Z', 4, 0, 'full', '2025-12-21T18:00:00Z', '2025-12-23T15:40:00Z'),
('f369b504-c440-4d2d-9f8e-c89581a13221', 'u_chen', 'b303dcf4-7485-420b-88e6-a155b7da9dd4', 'Return trip. Can drop off near campus, within radius.', 'Chicago: Chinatown', 'UIUC: Main Quad', ST_MakePoint(-87.6324, 41.8528)::geography, ST_MakePoint(-88.2272, 40.102)::geography, '2025-12-28T18:00:00Z', 4, 4, 'cancelled', '2025-12-18T18:00:00Z', '2025-12-26T01:00:00Z'),
('c32b6cbd-a4ed-42b6-9c7b-6c3edd100dc3', 'u_dan', 'ce3884df-abf2-4570-b703-0ec6fc56c06b', 'Airport run. Large luggage OK. Family-friendly.', 'UIUC: PAR/FAR', 'Chicago Midway (MDW)', ST_MakePoint(-88.2434, 40.0961)::geography, ST_MakePoint(-87.7522, 41.7868)::geography, '2025-12-27T22:00:00Z', 6, 6, 'cancelled', '2025-12-15T19:00:00Z', '2025-12-26T03:30:00Z'),
('47fab6cc-43b0-4a13-9563-ded24eb97594', 'u_sara', '98494635-28fc-4275-ac83-0a1ebdaac034', 'Night ride. I might cancel if weather is bad.', 'UIUC: Engineering Quad', 'Naperville Downtown', ST_MakePoint(-88.2269, 40.1138)::geography, ST_MakePoint(-88.1535, 41.7508)::geography, '2026-01-01T17:00:00Z', 4, 4, 'cancelled', '2025-12-23T15:00:00Z', '2025-12-23T16:00:00Z'),
('7c450f2c-6205-4226-a04a-c0763983fe1c', 'u_alex', 'bb2af43e-f01b-47f6-8a4b-ac0542a4e422', 'Past trip example. Smooth drive.', 'UIUC: Illini Union', 'Chicago: Millennium Park', ST_MakePoint(-88.2272, 40.1099)::geography, ST_MakePoint(-87.6226, 41.8826)::geography, '2025-12-12T20:00:00Z', 4, 1, 'done', '2025-12-05T18:00:00Z', '2025-12-12T23:30:00Z'),
('62bc66b0-b5c3-454a-b079-deb3983d97a0', 'u_chen', 'b303dcf4-7485-420b-88e6-a155b7da9dd4', 'Departed trip example. No longer bookable.', 'UIUC: Beckman Institute', 'Chicago O''Hare (ORD)', ST_MakePoint(-88.2203, 40.1125)::geography, ST_MakePoint(-87.9073, 41.9742)::geography, '2025-12-24T16:00:00Z', 4, 0, 'departed', '2025-12-20T17:00:00Z', '2025-12-24T16:05:00Z');

insert into trip_rules (id, big_luggage_lim, small_luggage_lim, pickup_rules, pickup_radius_meters, drop_off_radius_meters, departure_time_flexibility, payment_methods, cancellation_policy, auto_accept, cutoff_time) values
('d9821521-a81a-46fc-95b9-ec67ceaedcac', 2, 2, 'Meet at Illini Union circle drive; text when you arrive.', 1500, 2000, interval '20 minutes', array['Zelle', 'Venmo', 'Cash']::text[], 'Full refund if cancelled >12h before departure.', true, interval '2 hours'),
('146f0b89-0e56-42d6-9f5b-3909dde54a64', 1, 2, 'Pickup at ISR loading zone only. No last-minute location changes.', 800, 1200, interval '10 minutes', array['Venmo', 'Zelle']::text[], 'No refund within 4 hours of departure.', false, interval '6 hours'),
('f369b504-c440-4d2d-9f8e-c89581a13221', 1, 1, 'Pickup near Chinatown Gate. No food in car.', 1200, 1200, interval '15 minutes', array['Zelle', 'Cash']::text[], 'If driver cancels, full refund.', true, interval '3 hours'),
('c32b6cbd-a4ed-42b6-9c7b-6c3edd100dc3', 3, 3, 'Pickup at PAR/FAR main entrance. Please be ready early.', 1000, 1500, interval '30 minutes', array['Cash', 'Zelle']::text[], 'If you cancel <6h, you may still owe a fee.', true, interval '5 hours'),
('47fab6cc-43b0-4a13-9563-ded24eb97594', 1, 1, 'Engineering Quad pickup. Weather dependent.', 1000, 1500, interval '15 minutes', array['Venmo']::text[], 'If cancelled by driver, no charge.', true, interval '4 hours'),
('7c450f2c-6205-4226-a04a-c0763983fe1c', 2, 2, 'Illini Union pickup. One quick gas stop possible.', 1000, 1500, interval '15 minutes', array['Zelle', 'Venmo']::text[], 'Standard: cancel >12h for refund.', true, interval '2 hours'),
('62bc66b0-b5c3-454a-b079-deb3983d97a0', 1, 1, 'Beckman circle drive pickup. Confirm readiness 2h before.', 1000, 1500, interval '15 minutes', array['Zelle', 'Venmo']::text[], 'No refund within 3 hours. No-show may affect reputation.', true, interval '3 hours');

insert into trip_routes (trip_id, route_geog, distance_meters, duration_seconds, created_at) values
('d9821521-a81a-46fc-95b9-ec67ceaedcac', ST_GeogFromText('LINESTRING(-88.2272 40.1099, -88.05 40.65, -87.75 41.2, -87.9073 41.9742)'), 222000, 8700, '2025-12-22T19:05:00Z'),
('146f0b89-0e56-42d6-9f5b-3909dde54a64', ST_GeogFromText('LINESTRING(-88.235 40.0993, -88.03 40.62, -87.72 41.25, -87.6405 41.8786)'), 214000, 8400, '2025-12-21T18:10:00Z'),
('7c450f2c-6205-4226-a04a-c0763983fe1c', ST_GeogFromText('LINESTRING(-88.2272 40.1099, -88.0 40.6, -87.68 41.3, -87.6226 41.8826)'), 212000, 8300, '2025-12-05T18:10:00Z'),
('62bc66b0-b5c3-454a-b079-deb3983d97a0', ST_GeogFromText('LINESTRING(-88.2203 40.1125, -88.01 40.62, -87.72 41.25, -87.9073 41.9742)'), 222000, 8800, '2025-12-20T17:05:00Z');

insert into trip_events (id, trip, actor_id, created_at, event_type, affected_entities, changes, notes) values
('932e4139-8b9c-498b-ade3-d919f0e169ad', 'd9821521-a81a-46fc-95b9-ec67ceaedcac', 'u_alex', '2025-12-22T19:00:05Z', 'trip_created', '["trips","trip_rules"]'::jsonb, '{"status":{"to":"bookable"},"seats_left":{"to":4}}'::jsonb, 'Initial post'),
('b52bb35b-f3eb-47f1-9521-db4d611ae62f', 'd9821521-a81a-46fc-95b9-ec67ceaedcac', 'u_alex', '2025-12-24T02:00:00Z', 'trip_updated', '["trip_rules"]'::jsonb, '{"pickup_radius_meters":{"from":1000,"to":1500},"departure_time_flexibility":{"from":"15 minutes","to":"20 minutes"}}'::jsonb, 'Expanded pickup radius due to demand'),
('57836b66-ffed-4940-80fe-3a89cfd6d8d5', 'd9821521-a81a-46fc-95b9-ec67ceaedcac', 'u_alex', '2025-12-24T03:10:00Z', 'trip_updated', '["bookings","booking_removal"]'::jsonb, '{"booking_removed":{"rider":"u_lily","reason":"Did not agree to pickup rules"}}'::jsonb, 'Removed a rider request'),
('a66142b2-6504-463a-955f-150dd8d78500', '146f0b89-0e56-42d6-9f5b-3909dde54a64', 'u_alex', '2025-12-21T18:00:02Z', 'trip_created', '["trips","trip_rules"]'::jsonb, '{"status":{"to":"bookable"},"total_seats":{"to":4}}'::jsonb, 'Posted downtown trip'),
('77e964bc-14d1-40c7-adb9-08d24d337744', '146f0b89-0e56-42d6-9f5b-3909dde54a64', 'u_alex', '2025-12-22T16:20:00Z', 'trip_updated', '["trip_rules"]'::jsonb, '{"auto_accept":{"from":true,"to":false},"cancellation_policy":{"from":"Standard","to":"No refund within 4 hours of departure."}}'::jsonb, 'Switched to manual approval'),
('1ea2c139-9c38-41d2-ab1d-1b9e6d642b1f', '146f0b89-0e56-42d6-9f5b-3909dde54a64', 'u_alex', '2025-12-23T15:40:00Z', 'trip_updated', '["trips"]'::jsonb, '{"status":{"from":"bookable","to":"full"},"seats_left":{"from":1,"to":0}}'::jsonb, 'Marked trip as full'),
('15c70ea8-9065-40b8-945f-ed94f6f85771', 'f369b504-c440-4d2d-9f8e-c89581a13221', 'u_chen', '2025-12-18T18:00:01Z', 'trip_created', '["trips","trip_rules"]'::jsonb, '{"status":{"to":"bookable"}}'::jsonb, 'Return trip created'),
('c7551c31-ca28-4c5f-9cf2-3583882fc512', 'f369b504-c440-4d2d-9f8e-c89581a13221', 'u_chen', '2025-12-26T01:00:00Z', 'trip_cancelled', '["trips","bookings"]'::jsonb, '{"status":{"from":"bookable","to":"cancelled"},"reason":"Car issue"}'::jsonb, 'Driver cancelled the trip'),
('736147e3-cec8-4c61-ab3f-2aec2a937894', 'c32b6cbd-a4ed-42b6-9c7b-6c3edd100dc3', 'u_dan', '2025-12-15T19:00:01Z', 'trip_created', '["trips","trip_rules"]'::jsonb, '{"status":{"to":"bookable"},"total_seats":{"to":6}}'::jsonb, 'Airport run posted'),
('a45c3af0-3449-4c46-be20-d86b6fc7f024', 'c32b6cbd-a4ed-42b6-9c7b-6c3edd100dc3', 'u_ryan', '2025-12-25T12:10:00Z', 'paid_booking_cancelled_by_rider', '["bookings","booking_status_history"]'::jsonb, '{"booking_id":"f2eba348-9ce7-418a-934e-db45b44cdcf9","refund":"pending"}'::jsonb, 'Rider backed out after paying privately'),
('30d403af-5faa-492b-b0df-a586580533de', 'c32b6cbd-a4ed-42b6-9c7b-6c3edd100dc3', 'u_jun', '2025-12-25T12:30:00Z', 'unpaid_booking_cancelled_by_rider', '["bookings","booking_status_history"]'::jsonb, '{"booking_id":"ef7d2a79-9d82-4e62-900b-df35274089c1"}'::jsonb, 'Rider backed out before paying'),
('54a9ec47-651a-4c43-b3b2-0f7fad55d463', 'c32b6cbd-a4ed-42b6-9c7b-6c3edd100dc3', null, '2025-12-26T03:30:00Z', 'system_cancelled', '["trips","bookings"]'::jsonb, '{"status":{"from":"bookable","to":"cancelled"},"reason":"No confirmed riders by cutoff"}'::jsonb, 'System auto-cancelled per policy'),
('216e2f60-11f8-45d6-8607-f00c5c572ebf', '47fab6cc-43b0-4a13-9563-ded24eb97594', 'u_sara', '2025-12-23T15:00:02Z', 'trip_created', '["trips","trip_rules"]'::jsonb, '{"status":{"to":"bookable"}}'::jsonb, 'Weather-dependent trip posted'),
('9365ac79-ecd3-4598-a3ad-eb1b2c429f7e', '47fab6cc-43b0-4a13-9563-ded24eb97594', 'u_sara', '2025-12-23T16:00:00Z', 'trip_cancelled', '["trips","bookings"]'::jsonb, '{"status":{"from":"bookable","to":"cancelled"},"reason":"Snow forecast"}'::jsonb, 'Driver cancelled early'),
('842745bc-f7c3-4667-9eac-4c9defa34fb3', '7c450f2c-6205-4226-a04a-c0763983fe1c', 'u_alex', '2025-12-05T18:00:01Z', 'trip_created', '["trips","trip_rules"]'::jsonb, '{"status":{"to":"bookable"}}'::jsonb, 'Past trip example posted'),
('c14fd210-6346-4cdb-a645-ef0de9e15d49', '7c450f2c-6205-4226-a04a-c0763983fe1c', 'u_alex', '2025-12-12T20:05:00Z', 'trip_departed', '["trips","car_snapshots"]'::jsonb, '{"status":{"from":"bookable","to":"departed"}}'::jsonb, 'Departed on time'),
('ac79dc3c-c2fd-41a7-9929-0b71c63e6357', '7c450f2c-6205-4226-a04a-c0763983fe1c', 'u_alex', '2025-12-12T23:20:00Z', 'trip_completed', '["trips"]'::jsonb, '{"status":{"from":"departed","to":"done"}}'::jsonb, 'Arrived safely'),
('82a8f4d7-8785-4c23-943c-0bb915e4a9b0', '62bc66b0-b5c3-454a-b079-deb3983d97a0', 'u_chen', '2025-12-20T17:00:01Z', 'trip_created', '["trips","trip_rules","trip_routes"]'::jsonb, '{"status":{"to":"bookable"},"total_seats":{"to":4}}'::jsonb, 'Holiday ride posted'),
('082c1a5f-f88e-49ce-ba7d-578de504a324', '62bc66b0-b5c3-454a-b079-deb3983d97a0', 'u_chen', '2025-12-23T22:06:00Z', 'trip_updated', '["trips"]'::jsonb, '{"status":{"from":"bookable","to":"full"},"seats_left":{"from":1,"to":0}}'::jsonb, 'Trip filled (marked full)'),
('40a03e87-ced7-44e9-aa0d-c839fed59327', '62bc66b0-b5c3-454a-b079-deb3983d97a0', 'u_chen', '2025-12-24T13:30:00Z', 'trip_updated', '["bookings","booking_removal"]'::jsonb, '{"booking_removed":{"rider":"u_jun","reason":"No-show at pickup"}}'::jsonb, 'Removed no-show'),
('6646c898-731b-4c00-8436-26c481cf63fd', '62bc66b0-b5c3-454a-b079-deb3983d97a0', 'u_chen', '2025-12-24T16:05:00Z', 'trip_departed', '["trips","car_snapshots"]'::jsonb, '{"status":{"from":"full","to":"departed"}}'::jsonb, 'Departed (full)');

insert into bookings (id, rider, trip, big_luggage, small_luggage, seats_booked, paid, created_at, status, ready, ready_at) values
('d513baa5-4c2e-4a8c-a25e-8bcbba0d9b7d', 'u_mia', 'd9821521-a81a-46fc-95b9-ec67ceaedcac', 1, 1, 1, true, '2025-12-23T01:10:00Z', 'confirmed', false, null),
('bb23da4f-fb5c-4caf-b02e-01f558fa787b', 'u_ryan', 'd9821521-a81a-46fc-95b9-ec67ceaedcac', 0, 1, 1, false, '2025-12-22T20:10:00Z', 'pay_timeout', false, null),
('3d55e8a8-d53c-4cff-8a1b-9f6cf25ae091', 'u_ryan', 'd9821521-a81a-46fc-95b9-ec67ceaedcac', 0, 1, 1, false, '2025-12-24T00:40:00Z', 'joined_with_pay_window', false, null),
('783e8a51-2314-4d43-b783-e374b6a1a755', 'u_jun', 'd9821521-a81a-46fc-95b9-ec67ceaedcac', 1, 0, 1, false, '2025-12-24T01:05:00Z', 'waiting_approval', false, null),
('38c50d74-cee6-456d-b966-f94250e72a4a', 'u_lily', 'd9821521-a81a-46fc-95b9-ec67ceaedcac', 1, 2, 1, false, '2025-12-24T02:55:00Z', 'removed', false, null),
('33a628fd-ca98-47b5-94a6-891dd2e85ef7', 'u_mia', '146f0b89-0e56-42d6-9f5b-3909dde54a64', 1, 1, 1, true, '2025-12-22T10:10:00Z', 'confirmed', false, null),
('722e80d3-5b1d-481d-aea9-661eaeea2de1', 'u_ryan', '146f0b89-0e56-42d6-9f5b-3909dde54a64', 0, 1, 1, true, '2025-12-22T11:40:00Z', 'pending_pay_confirmation_from_driver', false, null),
('c3f7c790-6402-4753-8637-8eba7b2cbbaf', 'u_jun', '146f0b89-0e56-42d6-9f5b-3909dde54a64', 1, 0, 1, true, '2025-12-22T12:00:00Z', 'confirmed', false, null),
('25b25f51-0888-4a57-a4fa-b9d32d4ee55b', 'u_sara', '146f0b89-0e56-42d6-9f5b-3909dde54a64', 1, 0, 1, true, '2025-12-22T12:15:00Z', 'confirmed', false, null),
('7f271322-52f2-429f-9b19-2b18bf615d9f', 'u_kai', '146f0b89-0e56-42d6-9f5b-3909dde54a64', 0, 0, 1, false, '2025-12-22T08:00:00Z', 'pay_timeout', false, null),
('9b03c929-a237-4936-88aa-606ac30fc8be', 'u_sara', 'f369b504-c440-4d2d-9f8e-c89581a13221', 1, 0, 1, true, '2025-12-20T16:00:00Z', 'cancelled', false, null),
('10857599-d1cd-4f03-8a27-310e74fdab17', 'u_mia', 'f369b504-c440-4d2d-9f8e-c89581a13221', 1, 1, 1, false, '2025-12-21T03:00:00Z', 'cancelled', false, null),
('f2eba348-9ce7-418a-934e-db45b44cdcf9', 'u_ryan', 'c32b6cbd-a4ed-42b6-9c7b-6c3edd100dc3', 0, 1, 1, true, '2025-12-24T20:00:00Z', 'left_paid', false, null),
('ef7d2a79-9d82-4e62-900b-df35274089c1', 'u_jun', 'c32b6cbd-a4ed-42b6-9c7b-6c3edd100dc3', 1, 0, 1, false, '2025-12-24T21:10:00Z', 'left_unpaid', false, null),
('a5cccd34-b5e2-4ba8-84bd-434026cf09dc', 'u_mia', 'c32b6cbd-a4ed-42b6-9c7b-6c3edd100dc3', 1, 1, 1, false, '2025-12-25T04:20:00Z', 'cancelled', false, null),
('a977b6fd-2c4b-4547-811c-846d3500b755', 'u_lily', '47fab6cc-43b0-4a13-9563-ded24eb97594', 1, 1, 1, false, '2025-12-23T15:20:00Z', 'cancelled', false, null),
('04d6c10e-6364-4b27-978a-e919fdb5995a', 'u_mia', '7c450f2c-6205-4226-a04a-c0763983fe1c', 1, 1, 1, true, '2025-12-08T15:00:00Z', 'confirmed', true, '2025-12-12T18:30:00Z'),
('6b31f6b8-6d68-4633-9b07-061a1d10b3e8', 'u_jun', '7c450f2c-6205-4226-a04a-c0763983fe1c', 1, 0, 1, true, '2025-12-08T16:00:00Z', 'confirmed', true, '2025-12-12T18:35:00Z'),
('e078b6ea-d390-456f-8f83-ed5dab54d368', 'u_sara', '7c450f2c-6205-4226-a04a-c0763983fe1c', 0, 1, 1, true, '2025-12-09T02:00:00Z', 'confirmed', true, '2025-12-12T18:40:00Z'),
('432aa588-7d44-461d-8183-5f41495503b0', 'u_kai', '7c450f2c-6205-4226-a04a-c0763983fe1c', 0, 0, 1, false, '2025-12-09T03:00:00Z', 'cancelled', false, null),
('1f0cc104-297b-4b1d-b5bf-95944b54529d', 'u_ryan', '62bc66b0-b5c3-454a-b079-deb3983d97a0', 0, 1, 1, true, '2025-12-22T02:00:00Z', 'confirmed', true, '2025-12-24T14:10:00Z'),
('a2a98e76-8765-4aa8-ab90-ab4df537f245', 'u_mia', '62bc66b0-b5c3-454a-b079-deb3983d97a0', 1, 1, 1, true, '2025-12-22T02:10:00Z', 'confirmed', true, '2025-12-24T14:12:00Z'),
('dbbac5b0-47d6-489c-b8c7-344a4838d230', 'u_kai', '62bc66b0-b5c3-454a-b079-deb3983d97a0', 0, 0, 1, true, '2025-12-22T02:12:00Z', 'confirmed', true, '2025-12-24T14:15:00Z'),
('27da8a2b-dc31-4ade-b309-cd9b34cc1a70', 'u_lily', '62bc66b0-b5c3-454a-b079-deb3983d97a0', 1, 1, 1, true, '2025-12-23T20:00:00Z', 'confirmed', true, '2025-12-24T14:18:00Z'),
('0463fa90-c36c-4ce3-8adb-f0b9dc25d560', 'u_jun', '62bc66b0-b5c3-454a-b079-deb3983d97a0', 1, 0, 1, true, '2025-12-22T02:20:00Z', 'removed', false, null);

insert into booking_rule_snapshot (id, captured_at, big_luggage_lim, small_luggage_lim, pickup_rules, pickup_radius_meters, drop_off_radius_meters, departure_time_flexibility, payment_methods, cancellation_policy, auto_accept, cutoff_time) values
('bb23da4f-fb5c-4caf-b02e-01f558fa787b', '2025-12-22T20:10:05Z', 2, 2, 'Meet at Illini Union circle drive; text when you arrive.', 1000, 2000, interval '20 minutes', array['Zelle', 'Venmo', 'Cash']::text[], 'Full refund if cancelled >12h before departure.', true, interval '2 hours'),
('d513baa5-4c2e-4a8c-a25e-8bcbba0d9b7d', '2025-12-23T01:10:05Z', 2, 2, 'Meet at Illini Union circle drive; text when you arrive.', 1000, 2000, interval '20 minutes', array['Zelle', 'Venmo', 'Cash']::text[], 'Full refund if cancelled >12h before departure.', true, interval '2 hours'),
('3d55e8a8-d53c-4cff-8a1b-9f6cf25ae091', '2025-12-24T00:40:05Z', 2, 2, 'Meet at Illini Union circle drive; text when you arrive.', 1500, 2000, interval '20 minutes', array['Zelle', 'Venmo', 'Cash']::text[], 'Full refund if cancelled >12h before departure.', true, interval '2 hours'),
('783e8a51-2314-4d43-b783-e374b6a1a755', '2025-12-24T01:05:05Z', 2, 2, 'Meet at Illini Union circle drive; text when you arrive.', 1500, 2000, interval '20 minutes', array['Zelle', 'Venmo', 'Cash']::text[], 'Full refund if cancelled >12h before departure.', true, interval '2 hours'),
('38c50d74-cee6-456d-b966-f94250e72a4a', '2025-12-24T02:55:05Z', 2, 2, 'Meet at Illini Union circle drive; text when you arrive.', 1500, 2000, interval '20 minutes', array['Zelle', 'Venmo', 'Cash']::text[], 'Full refund if cancelled >12h before departure.', true, interval '2 hours'),
('33a628fd-ca98-47b5-94a6-891dd2e85ef7', '2025-12-22T12:30:00Z', 1, 2, 'Pickup at ISR loading zone only. No last-minute location changes.', 800, 1200, interval '10 minutes', array['Venmo', 'Zelle']::text[], 'Cancel >12h for refund. (old policy)', true, interval '6 hours'),
('722e80d3-5b1d-481d-aea9-661eaeea2de1', '2025-12-22T12:30:00Z', 1, 2, 'Pickup at ISR loading zone only. No last-minute location changes.', 800, 1200, interval '10 minutes', array['Venmo', 'Zelle']::text[], 'Cancel >12h for refund. (old policy)', true, interval '6 hours'),
('c3f7c790-6402-4753-8637-8eba7b2cbbaf', '2025-12-22T12:30:00Z', 1, 2, 'Pickup at ISR loading zone only. No last-minute location changes.', 800, 1200, interval '10 minutes', array['Venmo', 'Zelle']::text[], 'Cancel >12h for refund. (old policy)', true, interval '6 hours'),
('25b25f51-0888-4a57-a4fa-b9d32d4ee55b', '2025-12-22T12:30:00Z', 1, 2, 'Pickup at ISR loading zone only. No last-minute location changes.', 800, 1200, interval '10 minutes', array['Venmo', 'Zelle']::text[], 'Cancel >12h for refund. (old policy)', true, interval '6 hours'),
('7f271322-52f2-429f-9b19-2b18bf615d9f', '2025-12-22T12:30:00Z', 1, 2, 'Pickup at ISR loading zone only. No last-minute location changes.', 800, 1200, interval '10 minutes', array['Venmo', 'Zelle']::text[], 'Cancel >12h for refund. (old policy)', true, interval '6 hours'),
('9b03c929-a237-4936-88aa-606ac30fc8be', '2025-12-21T03:10:00Z', 1, 1, 'Pickup near Chinatown Gate. No food in car.', 1200, 1200, interval '15 minutes', array['Zelle', 'Cash']::text[], 'If driver cancels, full refund.', true, interval '3 hours'),
('10857599-d1cd-4f03-8a27-310e74fdab17', '2025-12-21T03:10:00Z', 1, 1, 'Pickup near Chinatown Gate. No food in car.', 1200, 1200, interval '15 minutes', array['Zelle', 'Cash']::text[], 'If driver cancels, full refund.', true, interval '3 hours'),
('f2eba348-9ce7-418a-934e-db45b44cdcf9', '2025-12-25T12:00:00Z', 3, 3, 'Pickup at PAR/FAR main entrance. Please be ready early.', 1000, 1500, interval '30 minutes', array['Cash', 'Zelle']::text[], 'If you cancel <6h, you may still owe a fee.', true, interval '5 hours'),
('ef7d2a79-9d82-4e62-900b-df35274089c1', '2025-12-25T12:00:00Z', 3, 3, 'Pickup at PAR/FAR main entrance. Please be ready early.', 1000, 1500, interval '30 minutes', array['Cash', 'Zelle']::text[], 'If you cancel <6h, you may still owe a fee.', true, interval '5 hours'),
('a5cccd34-b5e2-4ba8-84bd-434026cf09dc', '2025-12-25T12:00:00Z', 3, 3, 'Pickup at PAR/FAR main entrance. Please be ready early.', 1000, 1500, interval '30 minutes', array['Cash', 'Zelle']::text[], 'If you cancel <6h, you may still owe a fee.', true, interval '5 hours'),
('a977b6fd-2c4b-4547-811c-846d3500b755', '2025-12-23T15:20:05Z', 1, 1, 'Engineering Quad pickup. Weather dependent.', 1000, 1500, interval '15 minutes', array['Venmo']::text[], 'If cancelled by driver, no charge.', true, interval '4 hours'),
('04d6c10e-6364-4b27-978a-e919fdb5995a', '2025-12-09T03:10:00Z', 2, 2, 'Illini Union pickup. One quick gas stop possible.', 1000, 1500, interval '15 minutes', array['Zelle', 'Venmo']::text[], 'Standard: cancel >12h for refund.', true, interval '2 hours'),
('6b31f6b8-6d68-4633-9b07-061a1d10b3e8', '2025-12-09T03:10:00Z', 2, 2, 'Illini Union pickup. One quick gas stop possible.', 1000, 1500, interval '15 minutes', array['Zelle', 'Venmo']::text[], 'Standard: cancel >12h for refund.', true, interval '2 hours'),
('e078b6ea-d390-456f-8f83-ed5dab54d368', '2025-12-09T03:10:00Z', 2, 2, 'Illini Union pickup. One quick gas stop possible.', 1000, 1500, interval '15 minutes', array['Zelle', 'Venmo']::text[], 'Standard: cancel >12h for refund.', true, interval '2 hours'),
('432aa588-7d44-461d-8183-5f41495503b0', '2025-12-09T03:10:00Z', 2, 2, 'Illini Union pickup. One quick gas stop possible.', 1000, 1500, interval '15 minutes', array['Zelle', 'Venmo']::text[], 'Standard: cancel >12h for refund.', true, interval '2 hours'),
('1f0cc104-297b-4b1d-b5bf-95944b54529d', '2025-12-23T22:07:00Z', 1, 1, 'Beckman circle drive pickup. Confirm readiness 2h before.', 1000, 1500, interval '15 minutes', array['Zelle', 'Venmo']::text[], 'No refund within 3 hours. No-show may affect reputation.', true, interval '3 hours'),
('a2a98e76-8765-4aa8-ab90-ab4df537f245', '2025-12-23T22:07:00Z', 1, 1, 'Beckman circle drive pickup. Confirm readiness 2h before.', 1000, 1500, interval '15 minutes', array['Zelle', 'Venmo']::text[], 'No refund within 3 hours. No-show may affect reputation.', true, interval '3 hours'),
('dbbac5b0-47d6-489c-b8c7-344a4838d230', '2025-12-23T22:07:00Z', 1, 1, 'Beckman circle drive pickup. Confirm readiness 2h before.', 1000, 1500, interval '15 minutes', array['Zelle', 'Venmo']::text[], 'No refund within 3 hours. No-show may affect reputation.', true, interval '3 hours'),
('27da8a2b-dc31-4ade-b309-cd9b34cc1a70', '2025-12-23T22:07:00Z', 1, 1, 'Beckman circle drive pickup. Confirm readiness 2h before.', 1000, 1500, interval '15 minutes', array['Zelle', 'Venmo']::text[], 'No refund within 3 hours. No-show may affect reputation.', true, interval '3 hours'),
('0463fa90-c36c-4ce3-8adb-f0b9dc25d560', '2025-12-23T22:07:00Z', 1, 1, 'Beckman circle drive pickup. Confirm readiness 2h before.', 1000, 1500, interval '15 minutes', array['Zelle', 'Venmo']::text[], 'No refund within 3 hours. No-show may affect reputation.', true, interval '3 hours');

insert into booking_status_history (booking_id, actor_id, old_status, new_status, created_at, trigger_event_id) values
('bb23da4f-fb5c-4caf-b02e-01f558fa787b', 'u_ryan', null, 'joined_with_pay_window', '2025-12-22T20:10:00Z', null),
('bb23da4f-fb5c-4caf-b02e-01f558fa787b', null, 'joined_with_pay_window', 'pay_timeout', '2025-12-22T22:10:00Z', null),
('d513baa5-4c2e-4a8c-a25e-8bcbba0d9b7d', 'u_mia', null, 'waiting_approval', '2025-12-23T01:10:00Z', null),
('d513baa5-4c2e-4a8c-a25e-8bcbba0d9b7d', 'u_alex', 'waiting_approval', 'confirmed', '2025-12-23T01:45:00Z', null),
('3d55e8a8-d53c-4cff-8a1b-9f6cf25ae091', 'u_ryan', null, 'joined_with_pay_window', '2025-12-24T00:40:00Z', null),
('3d55e8a8-d53c-4cff-8a1b-9f6cf25ae091', null, 'joined_with_pay_window', 'pending_pay_confirmation_from_driver', '2025-12-24T01:10:00Z', null),
('783e8a51-2314-4d43-b783-e374b6a1a755', 'u_jun', null, 'waiting_approval', '2025-12-24T01:05:00Z', null),
('38c50d74-cee6-456d-b966-f94250e72a4a', 'u_lily', null, 'waiting_approval', '2025-12-24T02:55:00Z', null),
('38c50d74-cee6-456d-b966-f94250e72a4a', 'u_alex', 'waiting_approval', 'removed', '2025-12-24T03:10:00Z', '57836b66-ffed-4940-80fe-3a89cfd6d8d5'),
('7f271322-52f2-429f-9b19-2b18bf615d9f', 'u_kai', null, 'joined_with_pay_window', '2025-12-22T08:00:00Z', null),
('7f271322-52f2-429f-9b19-2b18bf615d9f', null, 'joined_with_pay_window', 'pay_timeout', '2025-12-22T10:00:00Z', null),
('33a628fd-ca98-47b5-94a6-891dd2e85ef7', 'u_mia', null, 'waiting_approval', '2025-12-22T12:00:00Z', null),
('33a628fd-ca98-47b5-94a6-891dd2e85ef7', 'u_alex', 'waiting_approval', 'confirmed', '2025-12-22T12:20:00Z', null),
('c3f7c790-6402-4753-8637-8eba7b2cbbaf', 'u_jun', null, 'waiting_approval', '2025-12-22T12:00:00Z', null),
('c3f7c790-6402-4753-8637-8eba7b2cbbaf', 'u_alex', 'waiting_approval', 'confirmed', '2025-12-22T12:20:00Z', null),
('25b25f51-0888-4a57-a4fa-b9d32d4ee55b', 'u_sara', null, 'waiting_approval', '2025-12-22T12:00:00Z', null),
('25b25f51-0888-4a57-a4fa-b9d32d4ee55b', 'u_alex', 'waiting_approval', 'confirmed', '2025-12-22T12:20:00Z', null),
('722e80d3-5b1d-481d-aea9-661eaeea2de1', 'u_ryan', null, 'joined_with_pay_window', '2025-12-22T11:40:00Z', null),
('722e80d3-5b1d-481d-aea9-661eaeea2de1', null, 'joined_with_pay_window', 'pending_pay_confirmation_from_driver', '2025-12-22T12:05:00Z', null),
('9b03c929-a237-4936-88aa-606ac30fc8be', 'u_sara', null, 'confirmed', '2025-12-20T16:00:00Z', null),
('9b03c929-a237-4936-88aa-606ac30fc8be', 'u_chen', 'confirmed', 'cancelled', '2025-12-26T01:00:05Z', 'c7551c31-ca28-4c5f-9cf2-3583882fc512'),
('10857599-d1cd-4f03-8a27-310e74fdab17', 'u_mia', null, 'waiting_approval', '2025-12-21T03:00:00Z', null),
('10857599-d1cd-4f03-8a27-310e74fdab17', 'u_chen', 'waiting_approval', 'cancelled', '2025-12-26T01:00:05Z', 'c7551c31-ca28-4c5f-9cf2-3583882fc512'),
('f2eba348-9ce7-418a-934e-db45b44cdcf9', 'u_ryan', null, 'joined_with_pay_window', '2025-12-24T20:00:00Z', null),
('f2eba348-9ce7-418a-934e-db45b44cdcf9', 'u_ryan', 'joined_with_pay_window', 'left_paid', '2025-12-25T12:10:00Z', 'a45c3af0-3449-4c46-be20-d86b6fc7f024'),
('ef7d2a79-9d82-4e62-900b-df35274089c1', 'u_jun', null, 'waiting_approval', '2025-12-24T21:10:00Z', null),
('ef7d2a79-9d82-4e62-900b-df35274089c1', 'u_jun', 'waiting_approval', 'left_unpaid', '2025-12-25T12:30:00Z', '30d403af-5faa-492b-b0df-a586580533de'),
('a5cccd34-b5e2-4ba8-84bd-434026cf09dc', 'u_mia', null, 'waiting_approval', '2025-12-25T04:20:00Z', null),
('a5cccd34-b5e2-4ba8-84bd-434026cf09dc', null, 'waiting_approval', 'cancelled', '2025-12-26T03:30:05Z', '54a9ec47-651a-4c43-b3b2-0f7fad55d463'),
('a977b6fd-2c4b-4547-811c-846d3500b755', 'u_lily', null, 'waiting_approval', '2025-12-23T15:20:00Z', null),
('a977b6fd-2c4b-4547-811c-846d3500b755', 'u_sara', 'waiting_approval', 'cancelled', '2025-12-23T16:00:05Z', '9365ac79-ecd3-4598-a3ad-eb1b2c429f7e'),
('04d6c10e-6364-4b27-978a-e919fdb5995a', 'u_mia', null, 'waiting_approval', '2025-12-08T15:00:00Z', null),
('04d6c10e-6364-4b27-978a-e919fdb5995a', 'u_alex', 'waiting_approval', 'confirmed', '2025-12-09T12:00:00Z', null),
('6b31f6b8-6d68-4633-9b07-061a1d10b3e8', 'u_jun', null, 'waiting_approval', '2025-12-08T16:00:00Z', null),
('6b31f6b8-6d68-4633-9b07-061a1d10b3e8', 'u_alex', 'waiting_approval', 'confirmed', '2025-12-09T12:00:00Z', null),
('e078b6ea-d390-456f-8f83-ed5dab54d368', 'u_sara', null, 'waiting_approval', '2025-12-09T02:00:00Z', null),
('e078b6ea-d390-456f-8f83-ed5dab54d368', 'u_alex', 'waiting_approval', 'confirmed', '2025-12-09T12:00:00Z', null),
('432aa588-7d44-461d-8183-5f41495503b0', 'u_kai', null, 'waiting_approval', '2025-12-09T03:00:00Z', null),
('432aa588-7d44-461d-8183-5f41495503b0', 'u_kai', 'waiting_approval', 'cancelled', '2025-12-09T04:00:00Z', null),
('1f0cc104-297b-4b1d-b5bf-95944b54529d', 'u_ryan', null, 'waiting_approval', '2025-12-22T02:00:00Z', null),
('1f0cc104-297b-4b1d-b5bf-95944b54529d', 'u_chen', 'waiting_approval', 'confirmed', '2025-12-23T22:07:00Z', '082c1a5f-f88e-49ce-ba7d-578de504a324'),
('a2a98e76-8765-4aa8-ab90-ab4df537f245', 'u_mia', null, 'waiting_approval', '2025-12-22T02:10:00Z', null),
('a2a98e76-8765-4aa8-ab90-ab4df537f245', 'u_chen', 'waiting_approval', 'confirmed', '2025-12-23T22:07:00Z', '082c1a5f-f88e-49ce-ba7d-578de504a324'),
('dbbac5b0-47d6-489c-b8c7-344a4838d230', 'u_kai', null, 'waiting_approval', '2025-12-22T02:12:00Z', null),
('dbbac5b0-47d6-489c-b8c7-344a4838d230', 'u_chen', 'waiting_approval', 'confirmed', '2025-12-23T22:07:00Z', '082c1a5f-f88e-49ce-ba7d-578de504a324'),
('27da8a2b-dc31-4ade-b309-cd9b34cc1a70', 'u_lily', null, 'waiting_approval', '2025-12-23T20:00:00Z', null),
('27da8a2b-dc31-4ade-b309-cd9b34cc1a70', 'u_chen', 'waiting_approval', 'confirmed', '2025-12-23T22:07:00Z', '082c1a5f-f88e-49ce-ba7d-578de504a324'),
('0463fa90-c36c-4ce3-8adb-f0b9dc25d560', 'u_jun', null, 'confirmed', '2025-12-22T02:20:00Z', null),
('0463fa90-c36c-4ce3-8adb-f0b9dc25d560', 'u_chen', 'confirmed', 'removed', '2025-12-24T13:30:00Z', '40a03e87-ced7-44e9-aa0d-c839fed59327');

insert into booking_removal (id, bid, actor_id, reason, created_at, trigger_event_id) values
('c21eff25-0be9-4506-85ac-dd683168b1fb', '38c50d74-cee6-456d-b966-f94250e72a4a', 'u_alex', 'Did not agree to pickup rules / late response.', '2025-12-24T03:10:00Z', '57836b66-ffed-4940-80fe-3a89cfd6d8d5'),
('d6ee8511-0481-4181-94ac-c30f7949c406', '0463fa90-c36c-4ce3-8adb-f0b9dc25d560', 'u_chen', 'No-show at pickup after 10-minute grace period.', '2025-12-24T13:30:00Z', '40a03e87-ced7-44e9-aa0d-c839fed59327');

insert into car_snapshots (id, original_car_id, make, model, seats, big_luggage, small_luggage, plate, created_at) values
('7c450f2c-6205-4226-a04a-c0763983fe1c', 'bb2af43e-f01b-47f6-8a4b-ac0542a4e422', 'Toyota', 'Camry', 4, 2, 2, 'IL ALEX-217', '2025-12-12T20:05:00Z'),
('62bc66b0-b5c3-454a-b079-deb3983d97a0', 'b303dcf4-7485-420b-88e6-a155b7da9dd4', 'Tesla', 'Model 3', 4, 2, 2, 'IL EV-888', '2025-12-24T16:05:00Z');

insert into rule_templates (id, driver, big_luggage_lim, small_luggage_lim, pickup_rules, pickup_radius_meters, drop_off_radius_meters, departure_time_flexibility, payment_methods, cancellation_policy, auto_accept, cutoff_time) values
('4c9ac204-2cdc-4997-acfa-22d699a385d6', 'u_alex', 2, 2, 'Default UIUC pickup: Illini Union. No smoking.', 1200, 1500, interval '15 minutes', array['Zelle', 'Venmo']::text[], 'Cancel >12h for refund.', true, interval '2 hours'),
('d257986c-dc00-40d7-aef8-22826ab3799c', 'u_chen', 1, 1, 'Default pickup: Beckman. EV charging stop possible.', 1000, 1500, interval '15 minutes', array['Zelle']::text[], 'No refund within 3 hours.', true, interval '3 hours');

insert into trip_templates (id, driver, car, rule, notes, from_text, to_text, origin_geog, destination_geog, total_seats, created_at, modified_at) values
('c12b0e0d-cc6e-42a9-bb08-cb06a7cecf97', 'u_alex', '009eb7cd-fcf5-40fb-b366-34f990b41af8', '4c9ac204-2cdc-4997-acfa-22d699a385d6', 'Weekly Chicago run template.', 'UIUC: Illini Union', 'Chicago: Union Station', ST_MakePoint(-88.2272, 40.1099)::geography,ST_MakePoint(-87.6405, 41.8786)::geography, 4, '2025-10-01T12:00:00Z', '2025-12-20T10:00:00Z'),
('60b5b644-c271-4da8-85a9-0d91c9c11611', 'u_chen', 'b303dcf4-7485-420b-88e6-a155b7da9dd4', 'd257986c-dc00-40d7-aef8-22826ab3799c', 'Weekend ORD template.', 'UIUC: Beckman Institute', 'Chicago O''Hare (ORD)', ST_MakePoint(-88.2203, 40.1125)::geography, ST_MakePoint(-87.9073, 41.9742)::geography, 4, '2025-09-15T12:00:00Z', '2025-12-18T12:00:00Z');

commit;
