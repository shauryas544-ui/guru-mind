-- =============================================================================
-- Guru Mind — Row Level Security (RLS) Policies & Grants
-- Guarantees strict per-user isolation at the PostgreSQL database boundary.
-- =============================================================================

-- Grants for authenticated users & service_role
GRANT USAGE ON SCHEMA public TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.learning_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.constant_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.learner_concepts TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.mistakes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mistake_patterns TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.memory_cards TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_capsules TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.reports TO authenticated;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- Enable RLS on every user-owned table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.constant_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learner_concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mistakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mistake_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_capsules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Profiles (owner key: id)
DROP POLICY IF EXISTS "profiles_own_select" ON public.profiles;
CREATE POLICY "profiles_own_select" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_own_insert" ON public.profiles;
CREATE POLICY "profiles_own_insert" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_own_update" ON public.profiles;
CREATE POLICY "profiles_own_update" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_own_delete" ON public.profiles;
CREATE POLICY "profiles_own_delete" ON public.profiles
  FOR DELETE TO authenticated USING (auth.uid() = id);

-- Learning Sessions (owner key: user_id)
DROP POLICY IF EXISTS "sessions_own_all" ON public.learning_sessions;
CREATE POLICY "sessions_own_all" ON public.learning_sessions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Messages (owner key: user_id + verified parent session ownership)
DROP POLICY IF EXISTS "messages_own_select" ON public.messages;
CREATE POLICY "messages_own_select" ON public.messages
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "messages_own_insert" ON public.messages;
CREATE POLICY "messages_own_insert" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.learning_sessions s
      WHERE s.id = session_id AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "messages_own_delete" ON public.messages;
CREATE POLICY "messages_own_delete" ON public.messages
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Constant Notes (owner key: user_id)
DROP POLICY IF EXISTS "constant_notes_own_select" ON public.constant_notes;
CREATE POLICY "constant_notes_own_select" ON public.constant_notes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "constant_notes_own_insert" ON public.constant_notes;
CREATE POLICY "constant_notes_own_insert" ON public.constant_notes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "constant_notes_own_delete" ON public.constant_notes;
CREATE POLICY "constant_notes_own_delete" ON public.constant_notes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Learner Concepts (owner key: user_id)
DROP POLICY IF EXISTS "learner_concepts_own_all" ON public.learner_concepts;
CREATE POLICY "learner_concepts_own_all" ON public.learner_concepts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Mistakes (owner key: user_id)
DROP POLICY IF EXISTS "mistakes_own_select" ON public.mistakes;
CREATE POLICY "mistakes_own_select" ON public.mistakes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "mistakes_own_insert" ON public.mistakes;
CREATE POLICY "mistakes_own_insert" ON public.mistakes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "mistakes_own_delete" ON public.mistakes;
CREATE POLICY "mistakes_own_delete" ON public.mistakes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Mistake Patterns (owner key: user_id)
DROP POLICY IF EXISTS "mistake_patterns_own_all" ON public.mistake_patterns;
CREATE POLICY "mistake_patterns_own_all" ON public.mistake_patterns
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Memory Cards (owner key: user_id)
DROP POLICY IF EXISTS "memory_cards_own_select" ON public.memory_cards;
CREATE POLICY "memory_cards_own_select" ON public.memory_cards
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "memory_cards_own_insert" ON public.memory_cards;
CREATE POLICY "memory_cards_own_insert" ON public.memory_cards
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "memory_cards_own_delete" ON public.memory_cards;
CREATE POLICY "memory_cards_own_delete" ON public.memory_cards
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Time Capsules (owner key: user_id)
DROP POLICY IF EXISTS "time_capsules_own_all" ON public.time_capsules;
CREATE POLICY "time_capsules_own_all" ON public.time_capsules
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Reports (owner key: user_id)
DROP POLICY IF EXISTS "reports_own_select" ON public.reports;
CREATE POLICY "reports_own_select" ON public.reports
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "reports_own_insert" ON public.reports;
CREATE POLICY "reports_own_insert" ON public.reports
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reports_own_delete" ON public.reports;
CREATE POLICY "reports_own_delete" ON public.reports
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

