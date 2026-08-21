CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'editor',
  subscription_tier TEXT DEFAULT 'free',
  -- Onboarding answers as JSON: experience, format, language, genre, tone.
  -- One nullable column rather than a migration per question. NULL means the
  -- user has not been onboarded yet, which is what routes them to /onboarding.
  preferences_json TEXT,
  -- Session generation. Every issued token carries this number and it is checked
  -- on each request, so incrementing it signs the account out everywhere at
  -- once. A JWT is otherwise un-revocable until it expires.
  token_version INTEGER NOT NULL DEFAULT 0,
  -- When a paid plan lapses. NULL means "not time-boxed": a free account, or a
  -- Stripe subscription, where Stripe owns the renewal and a date set here
  -- would fight it. Khalti and eSewa have no subscription primitive — they take
  -- one payment once — so a plan bought through them expires and is extended by
  -- the next payment. Read via payments.effective_tier(), never directly.
  subscription_expires_at TIMESTAMPTZ,
  -- Which renewal reminders have been sent, keyed by the expiry date they were
  -- about: {"expiring": "2026-09-19T...", "lapsed": "..."}. Keyed by date and
  -- not by a boolean so a writer who renews and later lapses again is told
  -- again — that is a different lapse, and a flag would silence it forever.
  renewal_notices_json TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Existing databases:
-- ALTER TABLE users ADD COLUMN preferences_json TEXT;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS renewal_notices_json TEXT;

-- genre / tone / target_audience are free text on purpose. The UI suggests
-- common values but must not constrain them: they feed prompts and retrieval,
-- and a writer whose project is a Nepali social-realist docudrama should not
-- have to file it under whichever enum value is least wrong.
--
-- For format = 'web_series', duration_minutes is ONE EPISODE, not the season.
-- Season length is duration_minutes * episode_count.
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  genre TEXT,
  tone TEXT,
  language TEXT DEFAULT 'English',
  duration_minutes INTEGER,
  target_audience TEXT DEFAULT 'General',
  format TEXT DEFAULT 'short',
  episode_count INTEGER DEFAULT 1,
  -- short_form only: runtime in SECONDS, plus the two choices that shape a
  -- vertical video's beat spine. Minutes cannot express a 30-second reel.
  duration_seconds INTEGER DEFAULT 45,
  hook_type TEXT DEFAULT 'relatable_pain',
  short_form_category TEXT DEFAULT 'storytime',
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Migration for databases created before 2026-08-14. target_audience was
-- accepted by the API and whitelisted for update while never existing as a
-- column; demo mode hid it because the local mock stores rows as JSON.
-- ALTER TABLE projects ADD COLUMN IF NOT EXISTS target_audience TEXT DEFAULT 'General';
-- ALTER TABLE projects ADD COLUMN IF NOT EXISTS format TEXT DEFAULT 'short';
-- ALTER TABLE projects ADD COLUMN IF NOT EXISTS episode_count INTEGER DEFAULT 1;

-- bible_json holds the story bible (logline, dramatic question, theme,
-- character sheets, locations) as a JSON string — one nullable column rather
-- than a migration per field, same pattern as suggestions_json.
CREATE TABLE scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bible_json TEXT,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  content TEXT DEFAULT '',
  status TEXT DEFAULT 'draft',
  suggestions_json TEXT,  -- AI structure preview; scenes are added one-by-one via /scripts/add-scene
  finalized_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- `location`, `emotional_beat` and `characters_json` come from the structure
-- preview (generate_structure emits all three per scene). `draft_json` is
-- written by scene_sync from the screenplay the writer actually typed —
-- heading, time of day, speaking characters, a summary of the action — so a
-- storyboard illustrates the page rather than the plan. One JSON column for the
-- derived set, same pattern as suggestions_json.
CREATE TABLE scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID REFERENCES scripts(id) ON DELETE CASCADE,
  act_number INTEGER,
  scene_type TEXT,
  title TEXT,
  description TEXT,
  time_allocation FLOAT,
  order_index INTEGER,
  location TEXT,
  emotional_beat TEXT,
  characters_json TEXT,
  draft_json TEXT
);
-- Existing databases:
-- ALTER TABLE scenes ADD COLUMN IF NOT EXISTS location TEXT;
-- ALTER TABLE scenes ADD COLUMN IF NOT EXISTS emotional_beat TEXT;
-- ALTER TABLE scenes ADD COLUMN IF NOT EXISTS characters_json TEXT;
-- ALTER TABLE scenes ADD COLUMN IF NOT EXISTS draft_json TEXT;

CREATE TABLE storyboard_frames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id UUID REFERENCES scenes(id) ON DELETE CASCADE,
  image_url TEXT,
  shot_type TEXT,
  camera_notes TEXT,
  order_index INTEGER
);

CREATE TABLE versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID REFERENCES scripts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  content TEXT,
  label TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID REFERENCES scripts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  content TEXT,
  line_number INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  tier TEXT DEFAULT 'free',
  status TEXT DEFAULT 'active',
  starts_at TIMESTAMP DEFAULT NOW(),
  ends_at TIMESTAMP
);


-- Project members (proposal FR12: Admin / Editor / Viewer).
--
-- The project's `user_id` remains the owner and is always an admin, so no row
-- is needed for them — which is why every project created before this table
-- existed keeps working untouched.
CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, user_id)
);
CREATE INDEX idx_project_members_user ON project_members(user_id);


-- Payments.
--
-- A row is written BEFORE the user is sent to the gateway, and this is the
-- point of the table: a user comes back from Khalti holding only a `pidx`. If
-- the tier came from that returning request, anyone could return claiming
-- `studio`. Instead the intended tier and price are recorded up front, and the
-- return trip can only select a row — never describe one.
--
-- `reference` is ours (purchase_order_id for Khalti, transaction_uuid for
-- eSewa, client_reference_id for Stripe). `provider_ref` is theirs, and is
-- never returned to a client.
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('pro', 'studio')),
  provider TEXT NOT NULL CHECK (provider IN ('khalti', 'esewa', 'stripe')),
  -- Paisa, matching what Khalti and Stripe expect on the wire. eSewa is the
  -- odd one out and wants rupees; esewa.py converts at its own boundary.
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'npr',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed', 'underpaid')),
  reference TEXT UNIQUE NOT NULL,
  provider_ref TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX idx_payments_user ON payments(user_id);
CREATE INDEX idx_payments_reference ON payments(reference);
