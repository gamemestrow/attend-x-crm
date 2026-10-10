import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  TEACHERS,
  findStudentByLoginId,
  fmtDate,
  getRoster,
  makeStudentSeedRecords,
  makeTeacherSeedSessions,
  type AttendanceRecord,
  type AttendanceSession,
  type QrToken,
  type Student,
  type Teacher,
} from "./data";
import { isDemoLocationClient, type DemoScenario } from "./demo-mode";
import type { DemoLocationInfo } from "./attendance.functions";
import { getFreshFix, GeoError, type LocationFix } from "./geo";
import { beginAttendanceScan, submitAttendanceScan, type ServerScanResult } from "./attendance.functions";
import { supabase } from "@/integrations/supabase/client";
import { parseAttendanceQr } from "./qr";

export type AuthUser =
  | { role: "student"; student: Student }
  | { role: "teacher"; teacher: Teacher };

export type ScanFailure =
  | "NOT_LOGGED_IN"
  | "INVALID_QR"
  | "EXPIRED"
  | "WRONG_CLASS"
  | "DUPLICATE"
  | "LOCATION_DENIED"
  | "OUTSIDE_RADIUS"
  | "INVALID_LOCATION"
  | "LOW_ACCURACY"
  | "STALE_LOCATION"
  | "TEACHER_LOCATION_UNRELIABLE"
  | "GEO_UNSUPPORTED"
  | "GEO_INSECURE"
  | "GEO_UNAVAILABLE"
  | "GEO_TIMEOUT"
  | "NETWORK";

export type ScanOutcome =
  | { ok: true; session: AttendanceSession; record: AttendanceRecord; distance: number | null; accuracy: number | null; locationVerified: boolean; demoMode: boolean; demo: DemoLocationInfo | null }
  | { ok: false; reason: ScanFailure; distance?: number; accuracy?: number; radius?: number; demo?: DemoLocationInfo };

export interface SessionConfig {
  classId: string;
  semester: number;
  subjectId: string;
  radius: number;
  qrValidity: number;
  location: LocationFix;
}

const uid = () => Math.random().toString(36).slice(2, 10).toUpperCase();

interface AttendanceState {
  auth: AuthUser | null;
  sessions: AttendanceSession[];
  tokens: QrToken[];
  records: AttendanceRecord[];
  activeSessionId: string | null;
  seeded: boolean;

  login: (role: "student" | "teacher", id: string) => void;
  logout: () => void;
  ensureSeeded: () => void;
  startSession: (cfg: SessionConfig) => Promise<string>;
  regenerateToken: (sessionId: string) => Promise<void>;
  expireActiveToken: (sessionId: string) => void;
  endSession: (sessionId: string) => void;
  submitSession: (sessionId: string) => void;
  attemptScan: (raw: string, demoScenario?: DemoScenario) => Promise<ScanOutcome>;
  simulateScans: (sessionId: string, count?: number) => void;
}

export const useAttendanceStore = create<AttendanceState>()(
  persist(
    (set, get) => ({
      auth: null,
      sessions: [],
      tokens: [],
      records: [],
      activeSessionId: null,
      seeded: false,

      login: (role, rawId) => {
        const id = rawId.trim().toUpperCase();
        if (role === "teacher") {
          const teacher: Teacher =
            TEACHERS.find((t) => t.teacher_id === id) ??
            ({ id: `t-${id}`, teacher_id: id, name: `Faculty ${id}` } as Teacher);
          set({ auth: { role: "teacher", teacher } });
        } else {
          const student: Student =
            findStudentByLoginId(id) ??
            ({
              id: `s-${id}`,
              student_id: id,
              name: `Student ${id}`,
              class_id: "cls-bca-a",
              semester: 3,
            } as Student);
          set({ auth: { role: "student", student } });
        }
        get().ensureSeeded();
      },

      logout: () => set({ auth: null, activeSessionId: null }),

      ensureSeeded: () => {
        const st = get();
        if (st.seeded) return;
        const seed = makeTeacherSeedSessions(TEACHERS[0]?.teacher_id ?? "TCH001");
        set({
          seeded: true,
          sessions: [...seed.sessions, ...st.sessions],
          tokens: [...seed.tokens, ...st.tokens],
          records: [...seed.records, ...st.records],
        });
      },

      startSession: async (cfg) => {
        const st = get();
        const teacherId =
          st.auth?.role === "teacher" ? st.auth.teacher.teacher_id : "TCH001";
        const now = Date.now();
        const sid = `SES-${uid()}`;
        const session: AttendanceSession = {
          id: sid,
          session_id: sid,
          teacher_id: teacherId,
          class_id: cfg.classId,
          subject_id: cfg.subjectId,
          semester: cfg.semester,
          date: fmtDate(now),
          start_time: now,
          end_time: null,
          teacher_latitude: cfg.location.lat,
          teacher_longitude: cfg.location.lng,
          attendance_radius: cfg.radius,
          qr_validity: cfg.qrValidity,
          status: "ACTIVE",
        };
        const token: QrToken = {
          id: `tok-${uid()}`,
          session_id: sid,
          token: `ATT-${sid}-${uid()}`,
          created_at: now,
          expires_at: now + cfg.qrValidity * 1000,
          status: "ACTIVE",
        };
        set({
          sessions: [...st.sessions, session],
          tokens: [...st.tokens, token],
          activeSessionId: sid,
        });

        const { error: sessionError } = await supabase.from("attendance_sessions").insert({
          id: sid,
          teacher_id: teacherId,
          class_id: cfg.classId,
          subject_id: cfg.subjectId,
          semester: cfg.semester,
          session_date: session.date,
          start_time: new Date(now).toISOString(),
          teacher_latitude: cfg.location.lat,
          teacher_longitude: cfg.location.lng,
          attendance_radius: cfg.radius,
          qr_validity: cfg.qrValidity,
          status: "ACTIVE",
          teacher_accuracy: cfg.location.accuracy,
          teacher_location_at: new Date(cfg.location.timestamp).toISOString(),
        } as never);
        if (sessionError) throw new Error(`Unable to create attendance session: ${sessionError.message}`);

        const { error: tokenError } = await supabase.from("qr_tokens").insert({
          id: token.id,
          session_id: sid,
          token: token.token,
          created_at: new Date(now).toISOString(),
          expires_at: new Date(token.expires_at).toISOString(),
          status: "ACTIVE",
        });
        if (tokenError) throw new Error(`Unable to create attendance QR: ${tokenError.message}`);
        return sid;
      },

      regenerateToken: async (sessionId) => {
        const st = get();
        const session = st.sessions.find((s) => s.session_id === sessionId);
        if (!session || session.status !== "ACTIVE") return;
        const now = Date.now();
        const token: QrToken = {
          id: `tok-${uid()}`,
          session_id: sessionId,
          token: `ATT-${sessionId}-${uid()}`,
          created_at: now,
          expires_at: now + session.qr_validity * 1000,
          status: "ACTIVE",
        };
        set({
          tokens: [
            ...st.tokens.map((t) =>
              t.session_id === sessionId && t.status === "ACTIVE"
                ? { ...t, status: "EXPIRED" as const }
                : t,
            ),
            token,
          ],
        });
        await supabase
          .from("qr_tokens")
          .update({ status: "EXPIRED" })
          .eq("session_id", sessionId)
          .eq("status", "ACTIVE");
        const { error } = await supabase.from("qr_tokens").insert({
          id: token.id,
          session_id: sessionId,
          token: token.token,
          created_at: new Date(now).toISOString(),
          expires_at: new Date(token.expires_at).toISOString(),
          status: "ACTIVE",
        });
        if (error) throw new Error(`Unable to rotate attendance QR: ${error.message}`);
      },

      expireActiveToken: (sessionId) => {
        set({
          tokens: get().tokens.map((t) =>
            t.session_id === sessionId && t.status === "ACTIVE"
              ? { ...t, status: "EXPIRED" as const }
              : t,
          ),
        });
        void supabase
          .from("qr_tokens")
          .update({ status: "EXPIRED" })
          .eq("session_id", sessionId)
          .eq("status", "ACTIVE");
      },

      endSession: (sessionId) => {
        const st = get();
        const session = st.sessions.find((s) => s.session_id === sessionId);
        if (!session || session.status !== "ACTIVE") return;
        // Mark every enrolled student who never scanned as ABSENT.
        const roster = getRoster(session.class_id);
        const scanned = new Set(
          st.records
            .filter((r) => r.session_id === sessionId)
            .map((r) => r.student_id),
        );
        const absents: AttendanceRecord[] = roster
          .filter((s) => !scanned.has(s.student_id))
          .map((s) => ({
            id: `${sessionId}-${s.student_id}`,
            session_id: sessionId,
            student_id: s.student_id,
            subject_id: session.subject_id,
            class_id: session.class_id,
            date: session.date,
            scan_time: null,
            status: "ABSENT" as const,
            location_valid: false,
          }));
        set({
          sessions: st.sessions.map((s) =>
            s.session_id === sessionId
              ? { ...s, status: "UNDER_REVIEW" as const, end_time: Date.now() }
              : s,
          ),
          tokens: st.tokens.map((t) =>
            t.session_id === sessionId && t.status === "ACTIVE"
              ? { ...t, status: "EXPIRED" as const }
              : t,
          ),
          records: [...st.records, ...absents],
        });
      },

      submitSession: (sessionId) => {
        set({
          sessions: get().sessions.map((s) =>
            s.session_id === sessionId
              ? { ...s, status: "SUBMITTED" as const, end_time: s.end_time ?? Date.now() }
              : s,
          ),
        });
      },

      attemptScan: async (raw, demoScenario) => {
        const auth = get().auth;
        // 1. Logged in?
        if (!auth || auth.role !== "student") return { ok: false, reason: "NOT_LOGGED_IN" };
        const student = auth.student;
        const payload = parseAttendanceQr(raw);
        if (!payload) return { ok: false, reason: "INVALID_QR" };
        let attemptId: string;
        try {
          const begun = await beginAttendanceScan({
            data: { studentId: student.student_id, sessionId: payload.sessionId, token: payload.token },
          });
          if (!begun.ok) return { ok: false, reason: begun.reason as ScanFailure };
          attemptId = begun.attemptId;
        } catch {
          return { ok: false, reason: "NETWORK" };
        }
        // Fresh browser geolocation reading (no Bluetooth). Raw reading is sent to
        // the server, which computes distance and decides acceptance.
        // Location permission is still requested. In temporary Demo Mode a failed
        // reading is sent as null (never fabricated) and the server decides.
        // DEMO LOCATION MODE: no GPS reading is taken; the server simulates it.
        let fix: LocationFix | null = null;
        if (!isDemoLocationClient()) {
          try {
            fix = await getFreshFix();
          } catch (e) {
            const code = e instanceof GeoError ? e.code : "UNAVAILABLE";
            return { ok: false, reason: code === "DENIED" ? "LOCATION_DENIED" : (`GEO_${code}` as ScanFailure) };
          }
        }
        let res: ServerScanResult;
        try {
          res = await submitAttendanceScan({
            data: { studentId: student.student_id, attemptId, location: fix, ...(demoScenario ? { demoScenario } : {}) },
          });
        } catch {
          return { ok: false, reason: "NETWORK" };
        }
        if (!res.ok) {
          return {
            ok: false,
            reason: res.reason as ScanFailure,
            ...(res.distance != null ? { distance: res.distance } : {}),
            ...(res.accuracy != null ? { accuracy: res.accuracy } : {}),
            ...(res.radius != null ? { radius: res.radius } : {}),
            ...(res.demo ? { demo: res.demo } : {}),
          };
        }
        const s = res.session;
        const session: AttendanceSession = {
          id: s.id,
          session_id: s.id,
          teacher_id: s.teacher_id,
          class_id: s.class_id,
          subject_id: s.subject_id,
          semester: s.semester,
          date: s.session_date,
          start_time: new Date(s.start_time).getTime(),
          end_time: null,
          teacher_latitude: 0,
          teacher_longitude: 0,
          attendance_radius: s.attendance_radius,
          qr_validity: s.qr_validity,
          status: "ACTIVE",
        };
        const record: AttendanceRecord = {
          id: res.recordId,
          session_id: s.id,
          student_id: student.student_id,
          subject_id: s.subject_id,
          class_id: s.class_id,
          date: s.session_date,
          scan_time: new Date(res.scanTime).getTime(),
          status: "PRESENT",
          location_valid: res.locationVerified,
        };
        set((state) => ({ records: [...state.records.filter((r) => r.id !== record.id), record] }));
        return { ok: true, session, record, distance: res.distance, accuracy: res.accuracy, locationVerified: res.locationVerified, demoMode: res.demoMode, demo: res.demo };
      },

      // Demo helper for the hackathon presentation: a few classmates scan in.
      simulateScans: (sessionId, count = 8) => {
        const tick = () => {
          const st = get();
          const session = st.sessions.find((s) => s.session_id === sessionId);
          if (!session || session.status !== "ACTIVE") return;
          const active = st.tokens.find(
            (t) => t.session_id === sessionId && t.status === "ACTIVE",
          );
          if (!active || Date.now() > active.expires_at) return;
          const recorded = new Set(
            st.records.filter((r) => r.session_id === sessionId).map((r) => r.student_id),
          );
          const pending = getRoster(session.class_id).filter(
            (s) => !recorded.has(s.student_id),
          );
          if (pending.length === 0) return;
          const pick = pending[Math.floor(Math.random() * pending.length)];
          if (!pick) return;
          const record: AttendanceRecord = {
            id: `${sessionId}-${pick.student_id}`,
            session_id: sessionId,
            student_id: pick.student_id,
            subject_id: session.subject_id,
            class_id: session.class_id,
            date: session.date,
            scan_time: Date.now(),
            status: "PRESENT",
            location_valid: true,
          };
          set({ records: [...st.records, record] });
        };
        for (let i = 0; i < count; i++) {
          setTimeout(tick, 600 + i * 700);
        }
      },
    }),
    {
      name: "attendx-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        auth: s.auth,
        sessions: s.sessions,
        tokens: s.tokens,
        records: s.records,
        activeSessionId: s.activeSessionId,
        seeded: s.seeded,
      }),
    },
  ),
);

// Cross-tab sync: lets a projector tab (teacher) update live when a student
// scans in another tab on the same machine. Real multi-device sync is the
// future Supabase step.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== "attendx-store" || !e.newValue) return;
    try {
      const parsed = JSON.parse(e.newValue);
      if (parsed?.state) useAttendanceStore.setState(parsed.state);
    } catch {
      // ignore malformed payloads
    }
  });
}

// --- Selectors / derived helpers -------------------------------------------

export function getActiveToken(tokens: QrToken[], sessionId: string): QrToken | undefined {
  return tokens.find((t) => t.session_id === sessionId && t.status === "ACTIVE");
}

export function sessionRecords(records: AttendanceRecord[], sessionId: string) {
  return records.filter((r) => r.session_id === sessionId);
}

export function studentStats(records: AttendanceRecord[], studentId: string) {
  const mine = records.filter((r) => r.student_id === studentId);
  const present = mine.filter((r) => r.status === "PRESENT");
  const pct = mine.length ? Math.round((present.length / mine.length) * 100) : 0;
  const sorted = [...mine].sort(
    (a, b) => (b.scan_time ?? 0) - (a.scan_time ?? 0) || b.date.localeCompare(a.date),
  );
  let streak = 0;
  for (const r of sorted) {
    if (r.status === "PRESENT") streak++;
    else break;
  }
  const points = present.length * 10 + streak * 5;
  const bySubject = new Map<string, { present: number; total: number }>();
  for (const r of mine) {
    const cur = bySubject.get(r.subject_id) ?? { present: 0, total: 0 };
    cur.total++;
    if (r.status === "PRESENT") cur.present++;
    bySubject.set(r.subject_id, cur);
  }
  return { pct, streak, points, bySubject, recent: sorted.slice(0, 6), all: sorted };
}
