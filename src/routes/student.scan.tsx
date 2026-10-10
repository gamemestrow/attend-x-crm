import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { isDemoLocationClient, type DemoScenario } from "@/lib/attendance/demo-mode";
import type { DemoLocationInfo } from "@/lib/attendance/attendance.functions";
import {
  Ban,
  CameraOff,
  CheckCircle2,
  Clock4,
  Copy,
  Loader2,
  MapPinOff,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { QrScanner } from "@/components/attendance/qr-scanner";
import { StudentShell } from "@/components/attendance/shells";
import { className, subjectName } from "@/lib/attendance/data";
import {
  getActiveToken,
  useAttendanceStore,
  type ScanFailure,
  type ScanOutcome,
} from "@/lib/attendance/store";

export const Route = createFileRoute("/student/scan")({
  head: () => ({
    meta: [
      { title: "Scan Attendance QR — AttendX" },
      { name: "description", content: "Scan the live QR code shown by your teacher to mark attendance." },
      { property: "og:title", content: "Scan Attendance QR — AttendX" },
      { property: "og:description", content: "Scan the live QR code shown by your teacher to mark attendance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ScanPage,
});

type Phase =
  | { kind: "scanning" }
  | { kind: "validating" }
  | { kind: "success"; outcome: Extract<ScanOutcome, { ok: true }> }
  | { kind: "failure"; reason: ScanFailure | "CAMERA_DENIED"; distance?: number; accuracy?: number; radius?: number; demo?: DemoLocationInfo };

const VALIDATION_STEPS = [
  "Verifying login",
  "Validating QR token",
  "Checking session status",
  "Verifying class enrolment",
  "Checking duplicate entry",
  "Taking a fresh location reading",
  "Server distance check",
];

const FAILURE_COPY: Record<string, { title: string; body: string; icon: typeof XCircle }> = {
  EXPIRED: {
    title: "QR Code Expired",
    body: "This QR code is no longer active. Please scan the newly generated QR.",
    icon: Clock4,
  },
  INVALID_QR: {
    title: "Invalid QR Code",
    body: "This QR does not belong to an active attendance session.",
    icon: XCircle,
  },
  WRONG_CLASS: {
    title: "Attendance Not Allowed",
    body: "You are not registered in this class.",
    icon: Ban,
  },
  OUTSIDE_RADIUS: {
    title: "Outside Attendance Area",
    body: "Your location was measured reliably and is outside the teacher's attendance area.",
    icon: MapPinOff,
  },
  DUPLICATE: {
    title: "Attendance Already Marked",
    body: "Your attendance has already been recorded for this session.",
    icon: Copy,
  },
  LOCATION_DENIED: {
    title: "Location Permission Required",
    body: "Enable location access to mark attendance.",
    icon: MapPinOff,
  },
  CAMERA_DENIED: {
    title: "Camera Permission Required",
    body: "Allow camera access to scan the attendance QR.",
    icon: CameraOff,
  },
  LOW_ACCURACY: {
    title: "Location Not Precise Enough",
    body: "We couldn't verify your location reliably — this does not mean you are too far. Move near a window or open area, turn on Wi-Fi and device location, then scan again.",
    icon: MapPinOff,
  },
  STALE_LOCATION: {
    title: "Location Reading Out of Date",
    body: "Your device returned an old location. Please scan again to take a fresh reading.",
    icon: Clock4,
  },
  INVALID_LOCATION: {
    title: "Location Could Not Be Verified",
    body: "Your device returned an invalid location. Please scan again.",
    icon: MapPinOff,
  },
  TEACHER_LOCATION_UNRELIABLE: {
    title: "Session Location Not Verified",
    body: "The teacher's session location is not reliable enough. Ask your teacher to restart the session.",
    icon: ShieldAlert,
  },
  GEO_TIMEOUT: {
    title: "Location Timed Out",
    body: "Getting your location took too long. Move to a spot with better reception and retry.",
    icon: Clock4,
  },
  GEO_UNAVAILABLE: {
    title: "Location Unavailable",
    body: "Your device could not determine a location. Turn on device location and retry.",
    icon: MapPinOff,
  },
  GEO_UNSUPPORTED: {
    title: "Location Not Supported",
    body: "This browser can't share location. Use a current version of Chrome.",
    icon: MapPinOff,
  },
  GEO_INSECURE: {
    title: "Secure Connection Required",
    body: "Location only works on the secure (https://) version of AttendX.",
    icon: ShieldAlert,
  },
  NETWORK: {
    title: "Attendance Not Saved",
    body: "We couldn't reach the server, so attendance was NOT recorded. Check your internet and scan again.",
    icon: XCircle,
  },
  NOT_LOGGED_IN: {
    title: "Not Signed In",
    body: "Please sign in again to mark attendance.",
    icon: ShieldAlert,
  },
};

function ScanPage() {
  const [phase, setPhase] = useState<Phase>({ kind: "scanning" });
  const demoMode = isDemoLocationClient();
  const [scenario, setScenario] = useState<DemoScenario>("inside");
  const attemptScan = useAttendanceStore((s) => s.attemptScan);
  const tokens = useAttendanceStore((s) => s.tokens);
  const sessions = useAttendanceStore((s) => s.sessions);
  const activeSessionId = useAttendanceStore((s) => s.activeSessionId);
  const authUser = useAttendanceStore((s) => s.auth);
  const studentName = authUser?.role === "student" ? authUser.student.name : "";
  const navigate = useNavigate();

  const handleScan = async (text: string) => {
    setPhase({ kind: "validating" });
    const outcome = await attemptScan(text, demoMode ? scenario : undefined);
    if (outcome.ok) {
      setPhase({ kind: "success", outcome });
    } else {
      setPhase({
        kind: "failure",
        reason: outcome.reason,
        ...(outcome.distance != null ? { distance: outcome.distance } : {}),
        ...(outcome.accuracy != null ? { accuracy: outcome.accuracy } : {}),
        ...(outcome.radius != null ? { radius: outcome.radius } : {}),
        ...(outcome.demo ? { demo: outcome.demo } : {}),
      });
    }
  };

  // Demo helper for evaluators without a second screen: runs the exact same
  // validation pipeline against the current session's latest token.
  const demoScan = () => {
    const activeSession = sessions.find((s) => s.session_id === activeSessionId);
    const token = activeSession
      ? (getActiveToken(tokens, activeSession.session_id) ??
        [...tokens].reverse().find((t) => t.session_id === activeSession.session_id))
      : undefined;
    void handleScan(token?.token ?? "ATT-NO-ACTIVE-SESSION");
  };

  return (
    <StudentShell>
      <h1 className="mb-1 font-display text-xl font-bold">Scan Attendance QR</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Scan the QR code displayed by your teacher.
      </p>

      {phase.kind === "scanning" && (
        <>
          {demoMode && (
            <div className="mb-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              <div className="mb-2 font-semibold text-warning">DEMO DATA — Simulated student location</div>
              <div className="flex gap-2">
                {(["inside", "outside"] as const).map((sc) => (
                  <Button key={sc} size="sm" variant={scenario === sc ? "default" : "outline"} onClick={() => setScenario(sc)}>
                    {sc === "inside" ? "Inside radius" : "Outside radius"}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <QrScanner
            onScan={(text) => void handleScan(text)}
            onCameraError={() => setPhase({ kind: "failure", reason: "CAMERA_DENIED" })}
          />
          <div className="mt-4 flex flex-col gap-2">
            <Button variant="outline" onClick={() => void navigate({ to: "/student" })}>
              Cancel
            </Button>
            <button
              onClick={demoScan}
              className="text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              No second screen handy? Run a demo scan
            </button>
          </div>
        </>
      )}

      {phase.kind === "validating" && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-6">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="text-sm font-semibold">Validating attendance…</div>
            <ul className="w-full space-y-2">
              {VALIDATION_STEPS.map((step, i) => (
                <li
                  key={step}
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                  style={{ animation: `row-flash 0.5s ${i * 0.12}s both` }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  {step}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {phase.kind === "success" && (
        <Card className="border-success/40">
          <CardContent className="flex flex-col items-center p-6 text-center">
            <CheckCircle2 className="mb-2 h-12 w-12 text-success" />
            <h2 className="font-display text-lg font-bold text-success">
              Attendance Marked Successfully
            </h2>
            <dl className="mt-4 w-full space-y-2 text-sm">
              <Row k="Student" v={studentName} />
              <Row k="Subject" v={subjectName(phase.outcome.session.subject_id)} />
              <Row k="Class" v={className(phase.outcome.session.class_id)} />
              <Row
                k="Date"
                v={new Date(phase.outcome.session.date + "T00:00:00").toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              />
              <Row
                k="Time"
                v={
                  phase.outcome.record.scan_time
                    ? new Date(phase.outcome.record.scan_time).toLocaleTimeString("en-IN", {
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      })
                    : "—"
                }
              />
              <Row k="Status" v="PRESENT" highlight />
              <Row
                k="Location"
                v={phase.outcome.locationVerified ? "Verified within radius" : "Simulated (DEMO DATA)"}
              />
            </dl>
            {phase.outcome.demo && <DemoPanel d={phase.outcome.demo} />}
            <Button className="mt-5 w-full" onClick={() => void navigate({ to: "/student" })}>
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      )}

      {phase.kind === "failure" && (
        <Card className="border-destructive/40">
          <CardContent className="flex flex-col items-center p-6 text-center">
            {(() => {
              const copy = FAILURE_COPY[phase.reason] ?? FAILURE_COPY["INVALID_QR"]!;
              const Icon = copy.icon;
              return (
                <>
                  <Icon className="mb-2 h-12 w-12 text-destructive" />
                  <h2 className="font-display text-lg font-bold text-destructive">{copy.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{copy.body}</p>
                  {phase.demo && <DemoPanel d={phase.demo} />}
                  {!phase.demo && phase.reason === "OUTSIDE_RADIUS" && phase.distance != null && (
                    <p className="tabular mt-2 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium">
                      Measured distance: {Math.round(phase.distance)} m (allowed: {phase.radius} m)
                    </p>
                  )}
                  {phase.accuracy != null && (
                    <p className="tabular mt-2 text-xs text-muted-foreground">
                      Your reported accuracy: ±{Math.round(phase.accuracy)} m
                    </p>
                  )}
                </>
              );
            })()}
            <div className="mt-5 flex w-full flex-col gap-2">
              {phase.reason !== "CAMERA_DENIED" && (
                <Button onClick={() => setPhase({ kind: "scanning" })}>Scan Again</Button>
              )}
              {phase.reason === "CAMERA_DENIED" && (
                <Button onClick={() => setPhase({ kind: "scanning" })}>Retry Camera</Button>
              )}
              <Button variant="outline" onClick={() => void navigate({ to: "/student" })}>
                Back to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </StudentShell>
  );
}

function Row({ k, v, highlight }: { k: string; v: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className={highlight ? "font-bold text-success" : "font-semibold"}>{v}</dd>
    </div>
  );
}

function DemoPanel({ d }: { d: DemoLocationInfo }) {
  const c = (p: { lat: number; lng: number }) => `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
  return (
    <div className="mt-4 w-full rounded-lg border border-warning/40 bg-warning/10 p-3 text-left text-xs">
      <div className="mb-1 font-semibold text-warning">DEMO DATA — not real GPS</div>
      <div className="tabular space-y-0.5 text-muted-foreground">
        <div>Teacher demo reference: <span className="font-mono">{c(d.reference)}</span></div>
        <div>Simulated student location: <span className="font-mono">{c(d.student)}</span></div>
        <div>Selected radius: {d.radius} m · Calculated distance: {Math.round(d.distance)} m</div>
        <div className={d.inside ? "font-semibold text-success" : "font-semibold text-destructive"}>
          {d.inside ? "Inside radius (simulated)" : "Outside radius (simulated)"}
        </div>
      </div>
    </div>
  );
}
