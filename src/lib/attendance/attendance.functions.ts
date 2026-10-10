import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { findStudentByLoginId } from "./data";
import { DEMO_REFERENCE_POINT, isDemoLocationServer, isDemoReference, simulateStudentLocation } from "./demo-mode";
import { decideRadius, haversineMeters, isValidLatLng, LOCATION_QUALITY } from "./geo";

/**
 * Authoritative attendance check. Runs on the server; the browser only sends
 * the QR payload and its raw location reading. Distance and acceptance are
 * computed here — client-provided distance/approval values are never accepted.
 */
const BeginInput = z.object({
  studentId: z.string().min(1).max(40),
  sessionId: z.string().max(80).optional(),
  token: z.string().min(1).max(200),
});
const SubmitInput = z.object({
  studentId: z.string().min(1).max(40),
  attemptId: z.string().uuid(),
  location: z.object({ lat: z.number(), lng: z.number(), accuracy: z.number(), timestamp: z.number() }).nullable(),
  demoScenario: z.enum(["inside", "outside"]).optional(),
});

/** Time allowed between a valid QR scan and the location reading arriving. */
const LOCATION_WINDOW_MS = 45_000;

export type ServerScanReason =
  | "NOT_LOGGED_IN"
  | "INVALID_QR"
  | "EXPIRED"
  | "WRONG_CLASS"
  | "DUPLICATE"
  | "INVALID_LOCATION"
  | "LOW_ACCURACY"
  | "STALE_LOCATION"
  | "TEACHER_LOCATION_UNRELIABLE"
  | "OUTSIDE_RADIUS"
  | "NETWORK";

export type ServerScanResult =
  | {
      ok: true;
      session: {
        id: string;
        class_id: string;
        subject_id: string;
        semester: number;
        teacher_id: string;
        session_date: string;
        start_time: string;
        attendance_radius: number;
        qr_validity: number;
      };
      recordId: string;
      scanTime: string;
      distance: number | null;
      accuracy: number | null;
      /** True only when the reading passed the real radius + accuracy check. */
      locationVerified: boolean;
      demoMode: boolean;
      demo: DemoLocationInfo | null;
    }
  | {
      ok: false;
      reason: ServerScanReason;
      /** Present only when the token was valid — needed so the student sees a radius or accuracy figure. */
      distance?: number;
      accuracy?: number;
      radius?: number;
      /** When true, the student should take a new location reading and retry. */
      retry?: boolean;
      demo?: DemoLocationInfo;
    };

/** Simulated location result — DEMO DATA, never a real GPS reading. */
export interface DemoLocationInfo {
  reference: { lat: number; lng: number };
  student: { lat: number; lng: number };
  distance: number;
  radius: number;
  inside: boolean;
}


async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

/**
 * Step 1 — called the moment the QR is decoded. The server checks the QR token,
 * expiry, session, class and duplicates *at scan time* and opens a pending
 * attempt. Location capture may then take a few seconds without the QR
 * rotating out from under the student.
 */
export const beginAttendanceScan = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => BeginInput.parse(d))
  .handler(async ({ data }): Promise<{ ok: true; attemptId: string } | { ok: false; reason: ServerScanReason }> => {
    try {
      const db = await admin();
      const student = findStudentByLoginId(data.studentId.trim().toUpperCase());
      if (!student) return { ok: false, reason: "NOT_LOGGED_IN" };
      const log = (row: Record<string, unknown>) =>
        db.from("scan_attempts").insert({ student_id: student.student_id, ...row } as never).select("id").single();
      const { data: tok } = await db
        .from("qr_tokens")
        .select("id, session_id, status, expires_at")
        .eq("token", data.token)
        .maybeSingle();
      if (!tok || (data.sessionId && data.sessionId !== tok.session_id)) {
        await log({ session_id: data.sessionId ?? null, outcome: "REJECTED", reason: "INVALID_QR" });
        return { ok: false, reason: "INVALID_QR" };
      }
      const { data: ses } = await db.from("attendance_sessions").select("*").eq("id", tok.session_id).maybeSingle();
      if (!ses) return { ok: false, reason: "INVALID_QR" };
      const sesRow = ses as typeof ses & { teacher_accuracy: number | null; teacher_location_at: string | null };
      const base = {
        session_id: ses.id,
        teacher_latitude: ses.teacher_latitude,
        teacher_longitude: ses.teacher_longitude,
        teacher_accuracy: sesRow.teacher_accuracy,
        teacher_location_at: sesRow.teacher_location_at,
        radius_meters: ses.attendance_radius,
      };
      // 2 s allowance for network latency only; the QR validity itself is unchanged.
      if (ses.status !== "ACTIVE" || tok.status !== "ACTIVE" && Date.now() > new Date(tok.expires_at).getTime() || Date.now() > new Date(tok.expires_at).getTime() + 2000) {
        await log({ ...base, outcome: "REJECTED", reason: "EXPIRED" });
        return { ok: false, reason: "EXPIRED" };
      }
      if (student.class_id !== ses.class_id) {
        await log({ ...base, qr_valid: true, outcome: "REJECTED", reason: "WRONG_CLASS" });
        return { ok: false, reason: "WRONG_CLASS" };
      }
      const { data: dup } = await db
        .from("attendance_records")
        .select("id")
        .eq("session_id", ses.id)
        .eq("student_id", student.student_id)
        .maybeSingle();
      if (dup) {
        await log({ ...base, qr_valid: true, outcome: "REJECTED", reason: "DUPLICATE" });
        return { ok: false, reason: "DUPLICATE" };
      }
      const { data: row, error } = await log({ ...base, qr_valid: true, outcome: "PENDING", reason: "AWAITING_LOCATION" });
      if (error || !row) return { ok: false, reason: "NETWORK" };
      return { ok: true, attemptId: (row as { id: string }).id };
    } catch (e) {
      console.error("begin scan failed", e);
      return { ok: false, reason: "NETWORK" };
    }
  });

/** Step 2 — authoritative location + radius check and the only path that writes attendance. */
export const submitAttendanceScan = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SubmitInput.parse(d))
  .handler(async ({ data }): Promise<ServerScanResult> => {
    try {
      const db = await admin();
      const student = findStudentByLoginId(data.studentId.trim().toUpperCase());
      if (!student) return { ok: false, reason: "NOT_LOGGED_IN" };
      const { data: att } = await db
        .from("scan_attempts" as never)
        .select("id, session_id, student_id, outcome, created_at")
        .eq("id", data.attemptId)
        .maybeSingle();
      const attempt = att as { id: string; session_id: string; student_id: string; outcome: string; created_at: string } | null;
      if (!attempt || attempt.student_id !== student.student_id || attempt.outcome !== "PENDING") {
        return { ok: false, reason: "INVALID_QR" };
      }
      const studentLoc = data.location
        ? {
            student_latitude: data.location.lat,
            student_longitude: data.location.lng,
            student_accuracy: data.location.accuracy,
            student_location_at: Number.isFinite(data.location.timestamp) ? new Date(data.location.timestamp).toISOString() : null,
          }
        : {};
      const close = (row: Record<string, unknown>) =>
        db.from("scan_attempts").update({ ...(isDemoLocationServer() ? {} : studentLoc), ...row } as never).eq("id", attempt.id);
      const now = Date.now();
      if (now - new Date(attempt.created_at).getTime() > LOCATION_WINDOW_MS) {
        await close({ outcome: "REJECTED", reason: "EXPIRED" });
        return { ok: false, reason: "EXPIRED" };
      }
      const { data: ses } = await db.from("attendance_sessions").select("*").eq("id", attempt.session_id).maybeSingle();
      if (!ses || ses.status !== "ACTIVE") {
        await close({ outcome: "REJECTED", reason: "EXPIRED" });
        return { ok: false, reason: "EXPIRED" };
      }
      const sesRow = ses as typeof ses & { teacher_accuracy: number | null; teacher_location_at: string | null };
      const demo = isDemoLocationServer();
      const loc = data.location && isValidLatLng(data.location) ? data.location : null;
      let distance: number | null = null;
      let verified = false;
      let demoInfo: DemoLocationInfo | null = null;
      if (demo) {
        // DEMO LOCATION MODE: real GPS is ignored entirely. Both points are
        // simulated (DEMO DATA) and the selected radius is still enforced.
        const sim = simulateStudentLocation(student.student_id, ses.attendance_radius, data.demoScenario ?? "inside");
        distance = haversineMeters(DEMO_REFERENCE_POINT, sim);
        const inside = distance <= ses.attendance_radius;
        demoInfo = { reference: DEMO_REFERENCE_POINT, student: sim, distance, radius: ses.attendance_radius, inside };
        if (!inside) {
          await db.from("scan_attempts").update({ inside_radius: false, distance_meters: distance, outcome: "REJECTED", reason: "DEMO_OUTSIDE_RADIUS" } as never).eq("id", attempt.id);
          return { ok: false, reason: "OUTSIDE_RADIUS", distance, radius: ses.attendance_radius, demo: demoInfo };
        }
      } else {
        if (!loc) {
          await close({ quality_ok: false, outcome: "RETRY", reason: "INVALID_LOCATION" });
          return { ok: false, reason: "INVALID_LOCATION", retry: true };
        }
        if (sesRow.teacher_accuracy == null || isDemoReference({ lat: ses.teacher_latitude, lng: ses.teacher_longitude })) {
          await close({ outcome: "RETRY", reason: "TEACHER_LOCATION_UNRELIABLE" });
          return { ok: false, reason: "TEACHER_LOCATION_UNRELIABLE" };
        }
        const decision = decideRadius(
          {
            lat: ses.teacher_latitude,
            lng: ses.teacher_longitude,
            accuracy: sesRow.teacher_accuracy,
            timestamp: sesRow.teacher_location_at ? new Date(sesRow.teacher_location_at).getTime() : now,
          },
          loc,
          ses.attendance_radius,
          now,
        );
        if (decision.kind === "UNCERTAIN") {
          const reason: ServerScanReason =
            decision.who === "teacher"
              ? "TEACHER_LOCATION_UNRELIABLE"
              : decision.quality === "STALE"
                ? "STALE_LOCATION"
                : decision.quality === "INVALID"
                  ? "INVALID_LOCATION"
                  : "LOW_ACCURACY";
          await close({ quality_ok: false, distance_meters: decision.distance, outcome: "RETRY", reason });
          return { ok: false, reason, retry: true, accuracy: loc.accuracy, radius: ses.attendance_radius };
        }
        if (decision.kind === "OUTSIDE") {
          await close({ quality_ok: true, inside_radius: false, distance_meters: decision.distance, outcome: "REJECTED", reason: "OUTSIDE_RADIUS" });
          return { ok: false, reason: "OUTSIDE_RADIUS", distance: decision.distance, accuracy: loc.accuracy, radius: ses.attendance_radius };
        }
        distance = decision.distance;
        verified = true;
      }
      const recordId = `${ses.id}-${student.student_id}`;
      const scanTime = new Date(attempt.created_at).toISOString();
      const { error } = await db.from("attendance_records").insert({
        id: recordId,
        session_id: ses.id,
        student_id: student.student_id,
        subject_id: ses.subject_id,
        class_id: ses.class_id,
        attendance_date: ses.session_date,
        scan_time: scanTime,
        status: "PRESENT",
        location_valid: verified,
        ...(demo ? {} : studentLoc),
        distance_meters: distance,
      } as never);
      if (error?.code === "23505") {
        await close({ outcome: "REJECTED", reason: "DUPLICATE" });
        return { ok: false, reason: "DUPLICATE" };
      }
      if (error) {
        console.error("attendance insert failed", error.message);
        return { ok: false, reason: "NETWORK" };
      }
      await close(verified
        ? { quality_ok: true, inside_radius: true, distance_meters: distance, outcome: "ACCEPTED", reason: "INSIDE_RADIUS" }
        : { inside_radius: true, distance_meters: distance, outcome: "ACCEPTED", reason: "DEMO_INSIDE_RADIUS" });
      return {
        ok: true,
        session: {
          id: ses.id,
          class_id: ses.class_id,
          subject_id: ses.subject_id,
          semester: ses.semester,
          teacher_id: ses.teacher_id,
          session_date: ses.session_date,
          start_time: ses.start_time,
          attendance_radius: ses.attendance_radius,
          qr_validity: ses.qr_validity,
        },
        recordId,
        scanTime,
        distance,
        accuracy: loc?.accuracy ?? null,
        locationVerified: verified,
        demoMode: demo,
        demo: demoInfo,
      };
    } catch (e) {
      console.error("scan validation failed", e);
      return { ok: false, reason: "NETWORK" };
    }
  });

/** Diagnostics for the teacher who owns the session (prototype: teacher ID match). */
export const getSessionDiagnostics = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ sessionId: z.string().max(80), teacherId: z.string().max(40) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: ses } = await db.from("attendance_sessions").select("teacher_id").eq("id", data.sessionId).maybeSingle();
    if (!ses || ses.teacher_id !== data.teacherId.toUpperCase()) return { attempts: [], error: "forbidden" as const };
    const { data: rows } = await db
      .from("scan_attempts" as never)
      .select("*")
      .eq("session_id", data.sessionId)
      .order("created_at", { ascending: false })
      .limit(100);
    return { attempts: (rows ?? []) as Array<Record<string, string | number | boolean | null>>, error: null };
  });

export const QUALITY_LIMIT_M = LOCATION_QUALITY.maxAccuracyMeters;
