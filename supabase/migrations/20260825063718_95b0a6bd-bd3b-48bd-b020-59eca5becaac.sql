CREATE TABLE public.attendance_sessions (
  id text PRIMARY KEY,
  teacher_id text NOT NULL,
  class_id text NOT NULL,
  subject_id text NOT NULL,
  semester integer NOT NULL,
  session_date date NOT NULL,
  start_time timestamptz NOT NULL DEFAULT now(),
  end_time timestamptz,
  teacher_latitude double precision NOT NULL,
  teacher_longitude double precision NOT NULL,
  attendance_radius integer NOT NULL,
  qr_validity integer NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.attendance_sessions TO anon, authenticated;
GRANT ALL ON public.attendance_sessions TO service_role;
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Prototype users can read attendance sessions" ON public.attendance_sessions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Prototype teachers can create attendance sessions" ON public.attendance_sessions FOR INSERT TO anon, authenticated WITH CHECK (status = 'ACTIVE');
CREATE POLICY "Prototype teachers can update attendance sessions" ON public.attendance_sessions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (status IN ('ACTIVE', 'UNDER_REVIEW', 'SUBMITTED'));

CREATE TABLE public.qr_tokens (
  id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE'
);
GRANT SELECT, INSERT, UPDATE ON public.qr_tokens TO anon, authenticated;
GRANT ALL ON public.qr_tokens TO service_role;
ALTER TABLE public.qr_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Prototype users can read QR tokens" ON public.qr_tokens FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Prototype teachers can create QR tokens" ON public.qr_tokens FOR INSERT TO anon, authenticated WITH CHECK (status = 'ACTIVE');
CREATE POLICY "Prototype teachers can expire QR tokens" ON public.qr_tokens FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (status IN ('ACTIVE', 'EXPIRED'));

CREATE TABLE public.attendance_records (
  id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
  student_id text NOT NULL,
  subject_id text NOT NULL,
  class_id text NOT NULL,
  attendance_date date NOT NULL,
  scan_time timestamptz,
  status text NOT NULL,
  location_valid boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, student_id)
);
GRANT SELECT, INSERT ON public.attendance_records TO anon, authenticated;
GRANT ALL ON public.attendance_records TO service_role;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Prototype users can read attendance records" ON public.attendance_records FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Prototype students can create attendance records" ON public.attendance_records FOR INSERT TO anon, authenticated WITH CHECK (status = 'PRESENT' AND scan_time IS NOT NULL AND location_valid = true);

CREATE INDEX attendance_sessions_status_idx ON public.attendance_sessions(status);
CREATE INDEX qr_tokens_session_status_idx ON public.qr_tokens(session_id, status);
CREATE INDEX attendance_records_session_idx ON public.attendance_records(session_id);

CREATE OR REPLACE FUNCTION public.set_attendance_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER attendance_sessions_updated_at
BEFORE UPDATE ON public.attendance_sessions
FOR EACH ROW EXECUTE FUNCTION public.set_attendance_updated_at();