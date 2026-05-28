-- Peoplera Survey System tables
-- Run this in Supabase SQL editor. Adds NEW tables only.

-- Enums
DO $$ BEGIN
  CREATE TYPE public.survey_send_type AS ENUM ('monday','friday');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.survey_sentiment AS ENUM ('positive','neutral','negative');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.survey_burnout_signal AS ENUM ('none','mild','strong');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- survey_tokens
CREATE TABLE IF NOT EXISTS public.survey_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  token uuid NOT NULL UNIQUE,
  week_number integer NOT NULL,
  send_type public.survey_send_type NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS survey_tokens_token_idx ON public.survey_tokens(token);
CREATE INDEX IF NOT EXISTS survey_tokens_employee_week_idx ON public.survey_tokens(employee_id, week_number);

-- survey_responses (anonymized: no employee_id)
CREATE TABLE IF NOT EXISTS public.survey_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL REFERENCES public.survey_tokens(id) ON DELETE CASCADE,
  week_number integer NOT NULL,
  answers jsonb NOT NULL,
  psych_score double precision NOT NULL,
  open_word text NOT NULL,
  open_word_sentiment public.survey_sentiment NOT NULL,
  open_word_burnout_signal public.survey_burnout_signal NOT NULL,
  suppressed_neutral boolean NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS survey_responses_week_idx ON public.survey_responses(week_number);
CREATE INDEX IF NOT EXISTS survey_responses_token_idx ON public.survey_responses(token_id);

-- survey_word_log (fully anonymized)
CREATE TABLE IF NOT EXISTS public.survey_word_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_number integer NOT NULL,
  word text NOT NULL,
  sentiment public.survey_sentiment NOT NULL,
  burnout_signal public.survey_burnout_signal NOT NULL,
  suppressed_neutral boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS survey_word_log_week_idx ON public.survey_word_log(week_number);

-- Constraints for expires_at (sent_at + 48h) implemented via trigger
CREATE OR REPLACE FUNCTION public.set_survey_token_expires_at()
RETURNS trigger AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := NEW.sent_at + interval '48 hours';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_survey_token_expires_at ON public.survey_tokens;
CREATE TRIGGER trg_set_survey_token_expires_at
BEFORE INSERT ON public.survey_tokens
FOR EACH ROW EXECUTE FUNCTION public.set_survey_token_expires_at();

-- RLS (recommended): tokens should not be readable by end-users broadly.
-- Enable if your app uses service role for these endpoints.
ALTER TABLE public.survey_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_word_log ENABLE ROW LEVEL SECURITY;

-- No public policies by default. Access via service role only.
