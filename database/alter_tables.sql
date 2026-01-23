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
        AND parent_message_id IS NULL
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

CREATE INDEX idx_trip_messages_trip_time
ON trip_messages (trip_id, created_at);

CREATE INDEX idx_trip_messages_parent
ON trip_messages (parent_message_id);

CREATE INDEX idx_trip_messages_receiver
ON trip_messages (receiver_id)
WHERE receiver_id IS NOT NULL;

