import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { findStudentByLoginId } from "./data";
import { decideRadius, isValidLatLng, LOCATION_QUALITY } from "./geo";

/**
 * Authoritative attendance check. Runs on the server; the browser only sends
 * the QR payload and its raw location reading. Distance and acceptance are
 * computed here — client-provided distance/approval values are never accepted.
 */
const ScanInput = z.object({
  studentId: z.string().min(1).max(40),
  sessionId: z.string().max(80).optional(),
  token: z.string().min(1).max(200),
  location: z
    .object({
      lat: z.number(),
      lng: z.number(),
      accuracy: z.number(),
      timestamp: z.number(),
    })
    .nullable(),
});

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
      distance: number;
      accuracy: number;
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
    };

export const submitAttendanceScan = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ScanInput.parse(d))
  .handler(async ({ data }): Promise<ServerScanResult> => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const student = findStudentByLoginId(data.studentId.trim().toUpperCase());
    if (!student) return { ok: false, reason: "NOT_LOGGED_IN" };

    type Log = Record<string, unknown>;
    const log = async (row: Log) => {
      await db.from("scan_attempts").insert({ student_id: student.student_id, ...row } as never);
    };
    const studentLoc = data.location
      ? {
          student_latitude: data.location.lat,
          student_longitude: data.location.lng,
          student_accuracy: data.location.accuracy,
          student_location_at: Number.isFinite(data.location.timestamp)
            ? new Date(data.location.timestamp).toISOString()
            : null,
        }
      : {};

    try {
      const { data: tok } = await db
        .from("qr_tokens")
        .select("id, session_id, status, expires_at")
        .eq("token", data.token)
        .maybeSingle();
      if (!tok || (data.sessionId && data.sessionId !== tok.session_id)) {
        await log({ session_id: data.sessionId ?? null, outcome: "REJECTED", reason: "INVALID_QR", ...studentLoc });
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
        ...studentLoc,
      };
      const now = Date.now();
      // Small grace for client→server latency only; QR validity itself is unchanged.
      if (ses.status !== "ACTIVE" || tok.status !== "ACTIVE" || now > new Date(tok.expires_at).getTime() + 3000) {
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
      if (!data.location || !isValidLatLng(data.location)) {
        await log({ ...base, qr_valid: true, quality_ok: false, outcome: "RETRY", reason: "INVALID_LOCATION" });
        return { ok: false, reason: "INVALID_LOCATION", retry: true };
      }
      if (sesRow.teacher_accuracy == null || !isValidLatLng({ lat: ses.teacher_latitude, lng: ses.teacher_longitude })) {
        await log({ ...base, qr_valid: true, outcome: "RETRY", reason: "TEACHER_LOCATION_UNRELIABLE" });
        return { ok: false, reason: "TEACHER_LOCATION_UNRELIABLE" };
      }
      const decision = decideRadius(
        {
          lat: ses.teacher_latitude,
          lng: ses.teacher_longitude,
          accuracy: sesRow.teacher_accuracy,
          timestamp: sesRow.teacher_location_at ? new Date(sesRow.teacher_location_at).getTime() : now,
        },
        data.location,
        ses.attendance_radius,
        now,
      );
      const distance = decision.distance ?? undefined;
      if (decision.kind === "UNCERTAIN") {
        const reason: ServerScanReason =
          decision.who === "teacher"
            ? "TEACHER_LOCATION_UNRELIABLE"
            : decision.quality === "STALE"
              ? "STALE_LOCATION"
              : decision.quality === "INVALID"
                ? "INVALID_LOCATION"
                : "LOW_ACCURACY";
        await log({ ...base, qr_valid: true, quality_ok: false, distance_meters: distance ?? null, outcome: "RETRY", reason });
        return { ok: false, reason, retry: true, accuracy: data.location.accuracy, radius: ses.attendance_radius };
      }
      if (decision.kind === "OUTSIDE") {
        await log({ ...base, qr_valid: true, quality_ok: true, inside_radius: false, distance_meters: decision.distance, outcome: "REJECTED", reason: "OUTSIDE_RADIUS" });
        return { ok: false, reason: "OUTSIDE_RADIUS", distance: decision.distance, accuracy: data.location.accuracy, radius: ses.attendance_radius };
      }
      const recordId = `${ses.id}-${student.student_id}`;
      const scanTime = new Date(now).toISOString();
      const { error } = await db.from("attendance_records").insert({
        id: recordId,
        session_id: ses.id,
        student_id: student.student_id,
        subject_id: ses.subject_id,
        class_id: ses.class_id,
        attendance_date: ses.session_date,
        scan_time: scanTime,
        status: "PRESENT",
        location_valid: true,
        ...studentLoc,
        distance_meters: decision.distance,
      } as never);
      if (error?.code === "23505") return { ok: false, reason: "DUPLICATE" };
      if (error) {
        console.error("attendance insert failed", error.message);
        return { ok: false, reason: "NETWORK" };
      }
      await log({ ...base, qr_valid: true, quality_ok: true, inside_radius: true, distance_meters: decision.distance, outcome: "ACCEPTED", reason: "INSIDE_RADIUS" });
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
        distance: decision.distance,
        accuracy: data.location.accuracy,
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
