-- Peoplera Survey Tables
-- Run this in Supabase SQL editor.

-- 1) survey_tokens — stores unique tokens sent to employees
CREATE TABLE IF NOT EXISTS public.survey_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  user_id uuid,
  token uuid NOT NULL UNIQUE,
  week_number integer NOT NULL,
  send_type text DEFAULT 'monday',
  sent_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used boolean NOT NULL DEFAULT false,
  used_at timestamptz
);

CREATE INDEX IF NOT EXISTS survey_tokens_token_idx ON public.survey_tokens(token);
CREATE INDEX IF NOT EXISTS survey_tokens_employee_week_idx ON public.survey_tokens(employee_id, week_number);

ALTER TABLE public.survey_tokens ENABLE ROW LEVEL SECURITY;

-- 2) survey_responses — stores employee survey answers
CREATE TABLE IF NOT EXISTS public.survey_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL REFERENCES public.survey_tokens(id) ON DELETE CASCADE,
  week_number integer NOT NULL,
  answers jsonb NOT NULL,
  psych_score integer NOT NULL DEFAULT 0,
  open_word text,
  open_word_sentiment text,
  open_word_burnout_signal text,
  suppressed_neutral boolean DEFAULT false,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS survey_responses_week_idx ON public.survey_responses(week_number);
CREATE INDEX IF NOT EXISTS survey_responses_token_idx ON public.survey_responses(token_id);

ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;

-- 3) survey_word_log — logs open-ended word classifications
CREATE TABLE IF NOT EXISTS public.survey_word_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_number integer NOT NULL,
  word text NOT NULL,
  sentiment text,
  burnout_signal text,
  suppressed_neutral boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS survey_word_log_week_idx ON public.survey_word_log(week_number);

ALTER TABLE public.survey_word_log ENABLE ROW LEVEL SECURITY;
