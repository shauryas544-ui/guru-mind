-- =============================================================================
-- Guru Mind — PostgreSQL Database Schema (Supabase)
-- Implements the 3-layer Memory Architecture + Mistake Fingerprint + Sessions
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Helper trigger function for automatic updated_at maintenance
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 1. User Application Profiles (linked 1:1 to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  native_language text NOT NULL DEFAULT 'Hindi',
  learning_language text NOT NULL DEFAULT 'English',
  level text NOT NULL DEFAULT 'Beginner' CHECK (level IN ('Beginner', 'Intermediate', 'Advanced')),
  goal text NOT NULL DEFAULT '',
  explain_language text NOT NULL DEFAULT 'Hinglish' CHECK (explain_language IN ('Hinglish', 'Hindi', 'English')),
  voice_preference text NOT NULL DEFAULT 'Shivani',
  save_history boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create application profile on Supabase Auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    full_name,
    native_language,
    learning_language,
    level,
    goal,
    explain_language
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'native_language', 'Hindi'),
    COALESCE(NEW.raw_user_meta_data->>'learning_language', 'English'),
    COALESCE(NEW.raw_user_meta_data->>'level', 'Beginner'),
    COALESCE(NEW.raw_user_meta_data->>'goal', ''),
    COALESCE(NEW.raw_user_meta_data->>'explain_language', 'Hinglish')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Learning Sessions (Tutor & Mentor sessions)
CREATE TABLE IF NOT EXISTS public.learning_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'learn' CHECK (mode IN ('learn', 'practice', 'shadow', 'test', 'mentor')),
  language text NOT NULL DEFAULT 'English',
  title text NOT NULL DEFAULT '',
  summary text,
  homework text,
  next_guidance text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_learning_sessions_user_started
  ON public.learning_sessions (user_id, started_at DESC);

-- 3. Raw History: Conversation Messages
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.learning_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  mode text NOT NULL DEFAULT 'learn' CHECK (mode IN ('learn', 'practice', 'shadow', 'test', 'mentor')),
  jo_sahi_tha text,
  corrections jsonb NOT NULL DEFAULT '[]'::jsonb,
  next_question text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_user_created
  ON public.messages (user_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_session_created
  ON public.messages (session_id, created_at ASC);

-- 4. Constant Notes (Cumulative learning knowledge — append-only in normal flow)
CREATE TABLE IF NOT EXISTS public.constant_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  language text NOT NULL DEFAULT 'English',
  tag text NOT NULL DEFAULT 'General',
  title text NOT NULL,
  content text NOT NULL,
  source_session_id uuid REFERENCES public.learning_sessions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_constant_notes_user_lang_created
  ON public.constant_notes (user_id, language, created_at DESC);

-- 5. Learner Model (Concept-level mastery state)
CREATE TABLE IF NOT EXISTS public.learner_concepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  language text NOT NULL DEFAULT 'English',
  concept text NOT NULL,
  status text NOT NULL DEFAULT 'weak' CHECK (status IN ('known', 'weak', 'unknown')),
  confidence numeric(4, 3) NOT NULL DEFAULT 0.500 CHECK (confidence >= 0 AND confidence <= 1),
  error_count integer NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  confusion_note text NOT NULL DEFAULT '',
  last_practiced timestamptz NOT NULL DEFAULT now(),
  next_review_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, language, concept)
);
CREATE INDEX IF NOT EXISTS idx_learner_concepts_user_lang
  ON public.learner_concepts (user_id, language, status, confidence ASC);

DROP TRIGGER IF EXISTS learner_concepts_set_updated_at ON public.learner_concepts;
CREATE TRIGGER learner_concepts_set_updated_at
  BEFORE UPDATE ON public.learner_concepts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. Individual Mistake Observations (Mistake Museum)
CREATE TABLE IF NOT EXISTS public.mistakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.learning_sessions(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  original_text text NOT NULL,
  corrected_text text NOT NULL,
  explanation text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'grammar' CHECK (category IN ('grammar', 'vocabulary', 'spelling', 'pronunciation', 'syntax', 'other')),
  root_cause text NOT NULL DEFAULT '',
  concept text NOT NULL DEFAULT 'General',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mistakes_user_created
  ON public.mistakes (user_id, created_at DESC);

-- 7. Mistake Fingerprint (Aggregated Recurring Patterns)
CREATE TABLE IF NOT EXISTS public.mistake_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  language text NOT NULL DEFAULT 'English',
  pattern_key text NOT NULL,
  category text NOT NULL DEFAULT 'grammar',
  root_cause text NOT NULL DEFAULT '',
  occurrence_count integer NOT NULL DEFAULT 1 CHECK (occurrence_count >= 1),
  practice_status text NOT NULL DEFAULT 'active' CHECK (practice_status IN ('active', 'improving', 'resolved')),
  example_original text NOT NULL DEFAULT '',
  example_corrected text NOT NULL DEFAULT '',
  first_observed_at timestamptz NOT NULL DEFAULT now(),
  last_observed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, language, pattern_key)
);
CREATE INDEX IF NOT EXISTS idx_mistake_patterns_user_count
  ON public.mistake_patterns (user_id, occurrence_count DESC, last_observed_at DESC);

-- 8. Versioned Memory Cards (Compact learner snapshots)
CREATE TABLE IF NOT EXISTS public.memory_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  language text NOT NULL DEFAULT 'English',
  version integer NOT NULL DEFAULT 1,
  card_content jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_memory_cards_user_version
  ON public.memory_cards (user_id, language, version DESC);

-- 9. Time Capsules (Future review messages)
CREATE TABLE IF NOT EXISTS public.time_capsules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  target_language text NOT NULL DEFAULT 'English',
  reminder_at timestamptz NOT NULL,
  opened_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_time_capsules_user_reminder
  ON public.time_capsules (user_id, reminder_at ASC);

-- 10. Session & Weekly Reports
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  report_type text NOT NULL CHECK (report_type IN ('session', 'weekly')),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reports_user_type_period
  ON public.reports (user_id, report_type, period_end DESC);

-- Backfill profiles for any auth accounts that signed up prior to schema creation
INSERT INTO public.profiles (id, full_name, native_language, learning_language, level, goal, explain_language)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''),
  COALESCE(u.raw_user_meta_data->>'native_language', 'Hindi'),
  COALESCE(u.raw_user_meta_data->>'learning_language', 'English'),
  COALESCE(u.raw_user_meta_data->>'level', 'Beginner'),
  COALESCE(u.raw_user_meta_data->>'goal', ''),
  COALESCE(u.raw_user_meta_data->>'explain_language', 'Hinglish')
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

