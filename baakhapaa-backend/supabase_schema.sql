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
  created_at TIMESTAMP DEFAULT NOW()
);

-- Existing databases: ALTER TABLE users ADD COLUMN preferences_json TEXT;

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

CREATE TABLE scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID REFERENCES scripts(id) ON DELETE CASCADE,
  act_number INTEGER,
  scene_type TEXT,
  title TEXT,
  description TEXT,
  time_allocation FLOAT,
  order_index INTEGER
);

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
