-- Peoplera Action Plans system
-- Run this in Supabase SQL editor.

-- 1) Add columns to employees
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS behavior_profile jsonb,
  ADD COLUMN IF NOT EXISTS employee_type text,
  ADD COLUMN IF NOT EXISTS latest_action_plans jsonb;

-- 2) action_plan_events
CREATE TABLE IF NOT EXISTS public.action_plan_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  action_text text NOT NULL,
  taken_at timestamptz NOT NULL DEFAULT now(),
  burnout_score_at_time integer NOT NULL,
  evaluated_at timestamptz,
  effectiveness text,
  score_delta integer
);

CREATE INDEX IF NOT EXISTS action_plan_events_employee_taken_idx ON public.action_plan_events(employee_id, taken_at DESC);
CREATE INDEX IF NOT EXISTS action_plan_events_evaluated_idx ON public.action_plan_events(evaluated_at);

ALTER TABLE public.action_plan_events ENABLE ROW LEVEL SECURITY;
-- No public policies by default; access via service role / API routes.
