ALTER TABLE public.attendance_sessions
  ADD COLUMN IF NOT EXISTS teacher_accuracy double precision,
  ADD COLUMN IF NOT EXISTS teacher_location_at timestamptz;
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS student_latitude double precision,
  ADD COLUMN IF NOT EXISTS student_longitude double precision,
  ADD COLUMN IF NOT EXISTS student_accuracy double precision,
  ADD COLUMN IF NOT EXISTS student_location_at timestamptz,
  ADD COLUMN IF NOT EXISTS distance_meters double precision;

CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_session_student_uniq
  ON public.attendance_records(session_id, student_id);

-- Attendance may only be written by the server-side validator now.
DROP POLICY IF EXISTS "Prototype students can create attendance records" ON public.attendance_records;
REVOKE INSERT, UPDATE, DELETE ON public.attendance_records FROM anon, authenticated;
GRANT ALL ON public.attendance_records TO service_role;

CREATE TABLE public.scan_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text,
  student_id text NOT NULL,
  outcome text NOT NULL,
  reason text NOT NULL,
  qr_valid boolean NOT NULL DEFAULT false,
  quality_ok boolean,
  inside_radius boolean,
  teacher_latitude double precision,
  teacher_longitude double precision,
  teacher_accuracy double precision,
  teacher_location_at timestamptz,
  student_latitude double precision,
  student_longitude double precision,
  student_accuracy double precision,
  student_location_at timestamptz,
  distance_meters double precision,
  radius_meters integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.scan_attempts TO service_role;
ALTER TABLE public.scan_attempts ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies: coordinates are only readable via the server.