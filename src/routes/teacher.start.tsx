import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Loader2, MapPin, Play } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TeacherShell } from "@/components/attendance/shells";
import {
  CLASSES,
  QR_VALIDITY_OPTIONS,
  RADIUS_OPTIONS,
  SEMESTERS,
  SUBJECTS,
} from "@/lib/attendance/data";
import {
  GEO_ERROR_COPY,
  GeoError,
  getFreshFix,
  teacherMaxAccuracy,
  type LocationFix,
} from "@/lib/attendance/geo";
import { isDemoLocationClient } from "@/lib/attendance/demo-mode";
import { useAttendanceStore } from "@/lib/attendance/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/teacher/start")({
  head: () => ({
    meta: [
      { title: "Start Attendance — AttendX" },
      { name: "description", content: "Configure class, subject, radius and QR validity, then start a live attendance session." },
      { property: "og:title", content: "Start Attendance — AttendX" },
      { property: "og:description", content: "Configure class, subject, radius and QR validity, then start a live attendance session." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StartPage,
});

/** Stop sampling early once a reading is this good. */
const LOCATION_QUALITY_TARGET = 50;

type LocState =
  | { kind: "idle" }
  | { kind: "detecting" }
  | { kind: "ok"; pos: LocationFix }
  | { kind: "poor"; pos: LocationFix }
  | { kind: "error"; message: string };

function StartPage() {
  const [classId, setClassId] = useState("cls-bca-a");
  const [semester, setSemester] = useState(3);
  const [subjectId, setSubjectId] = useState("sub-dbms");
  const [radius, setRadius] = useState(200);
  const [customRadius, setCustomRadius] = useState("");
  const [validity, setValidity] = useState(15);
  const [loc, setLoc] = useState<LocState>({ kind: "idle" });
  const [startError, setStartError] = useState<string | null>(null);
  const startSession = useAttendanceStore((s) => s.startSession);
  const navigate = useNavigate();

  const effectiveRadius = customRadius ? Math.max(10, Number(customRadius) || radius) : radius;

  const detect = async () => {
    setLoc({ kind: "detecting" });
    try {
      const pos = await getFreshFix({ targetAccuracy: LOCATION_QUALITY_TARGET, windowMs: 20_000, timeoutMs: 25_000 });
      setLoc(pos.accuracy <= teacherMaxAccuracy(effectiveRadius) ? { kind: "ok", pos } : { kind: "poor", pos });
    } catch (e) {
      const code = e instanceof GeoError ? e.code : "UNAVAILABLE";
      setLoc({ kind: "error", message: GEO_ERROR_COPY[code] });
    }
  };

  // Demo Location Mode: the fixed demo reference point is used; GPS is not needed.
  const demo = isDemoLocationClient();
  const canStart = demo || loc.kind === "ok";

  const startDemo = async () => {
    setStartError(null);
    try {
      await startSession({ classId, semester, subjectId, radius: effectiveRadius, qrValidity: validity, location: null });
      await navigate({ to: "/teacher/session" });
    } catch {
      setStartError("Could not save the session. Check your internet connection and try again.");
    }
  };

  const start = async () => {
    if (demo) return startDemo();
    if (loc.kind !== "ok") return;
    if (loc.pos.accuracy > teacherMaxAccuracy(effectiveRadius)) {
      setLoc({ kind: "poor", pos: loc.pos });
      return;
    }
    // Never start a session on a stale reference location.
    if (Date.now() - loc.pos.timestamp > 2 * 60_000) {
      setLoc({ kind: "error", message: "Your location reading is over 2 minutes old. Detect it again." });
      return;
    }
    setStartError(null);
    try {
      await startSession({
      classId,
      semester,
      subjectId,
      radius: effectiveRadius,
      qrValidity: validity,
      location: loc.pos,
      });
      await navigate({ to: "/teacher/session" });
    } catch {
      setStartError("Could not save the session. Check your internet connection and try again.");
    }
  };

  const cls = CLASSES.find((c) => c.id === classId);
  const sub = SUBJECTS.find((s) => s.id === subjectId);

  return (
    <TeacherShell>
      <h1 className="mb-1 font-display text-2xl font-bold">Start Attendance</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Configure the session, then generate the live QR code.
      </p>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Class & Subject</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Select Class
                </div>
                <div className="flex flex-wrap gap-2">
                  {CLASSES.map((c) => (
                    <Chip key={c.id} active={classId === c.id} onClick={() => setClassId(c.id)}>
                      {c.class_name}
                    </Chip>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Select Semester
                </div>
                <div className="flex flex-wrap gap-2">
                  {SEMESTERS.map((s) => (
                    <Chip key={s} active={semester === s} onClick={() => setSemester(s)}>
                      Semester {s}
                    </Chip>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Select Subject
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {SUBJECTS.map((s) => (
                    <Chip
                      key={s.id}
                      active={subjectId === s.id}
                      onClick={() => setSubjectId(s.id)}
                      className="justify-start"
                    >
                      {s.subject_name}
                    </Chip>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Location & Security</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Attendance Location
                </div>
                {!demo && loc.kind === "idle" && (
                  <Button variant="outline" onClick={() => void detect()} className="gap-2">
                    <MapPin className="h-4 w-4" /> Detect teacher location
                  </Button>
                )}
                {!demo && loc.kind === "detecting" && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Detecting teacher location…
                  </div>
                )}
                {!demo && loc.kind === "ok" && (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-success">
                      <CheckCircle2 className="h-4 w-4" /> Location detected successfully
                    </span>
                    <span className="tabular text-xs text-muted-foreground">±{Math.round(loc.pos.accuracy)} m</span>
                    <code className="rounded bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">
                      {loc.pos.lat.toFixed(5)}, {loc.pos.lng.toFixed(5)}
                    </code>
                    <button
                      onClick={() => void detect()}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Redetect
                    </button>
                  </div>
                )}
                {!demo && (loc.kind === "poor" || loc.kind === "error") && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-destructive">
                      {loc.kind === "error"
                        ? loc.message
                        : `Location accuracy is ±${Math.round(loc.pos.accuracy)} m — worse than the ±${Math.round(teacherMaxAccuracy(effectiveRadius))} m needed for a ${effectiveRadius} m radius. Laptops locate via Wi-Fi: keep Wi-Fi ON (even if wired), allow precise location in Windows Settings › Privacy › Location, and retry — or start the session from your phone.`}
                    </p>
                    <Button variant="outline" size="sm" onClick={() => void detect()} className="gap-2">
                      <MapPin className="h-4 w-4" /> Retry location
                    </Button>
                  </div>
                )}
              </div>

              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Attendance Radius
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {RADIUS_OPTIONS.map((r) => (
                    <Chip
                      key={r}
                      active={!customRadius && radius === r}
                      onClick={() => {
                        setRadius(r);
                        setCustomRadius("");
                      }}
                    >
                      {r} m
                    </Chip>
                  ))}
                  <Input
                    value={customRadius}
                    onChange={(e) => setCustomRadius(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="Custom (m)"
                    className="tabular h-9 w-28"
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  QR Code Validity
                </div>
                <div className="flex flex-wrap gap-2">
                  {QR_VALIDITY_OPTIONS.map((v) => (
                    <Chip key={v} active={validity === v} onClick={() => setValidity(v)}>
                      {v} seconds
                    </Chip>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Summary */}
        <Card className="h-fit lg:sticky lg:top-20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Session Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <SummaryRow k="Class" v={cls?.class_name ?? "—"} />
              <SummaryRow k="Semester" v={`Semester ${semester}`} />
              <SummaryRow k="Subject" v={sub?.subject_name ?? "—"} />
              <SummaryRow k="QR Validity" v={`${validity} seconds`} />
              <SummaryRow k="Radius" v={`${effectiveRadius} meters`} />
              <SummaryRow
                k="Teacher Location"
                v={demo ? "Reference point set" : loc.kind === "ok" ? `Detected (±${Math.round(loc.pos.accuracy)} m)` : loc.kind === "detecting" ? "Detecting…" : loc.kind === "poor" ? "Too inaccurate" : "Not detected"}
              />
            </dl>
            <Button
              className="mt-6 w-full gap-2"
              size="lg"
              disabled={!canStart}
              onClick={start}
            >
              <Play className="h-4 w-4" /> START ATTENDANCE
            </Button>
            {startError && <p className="mt-2 text-center text-xs text-destructive">{startError}</p>}
            {!canStart && (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Detect your location to enable starting the session.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </TeacherShell>
  );
}

function Chip({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

function SummaryRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b pb-2.5 last:border-0 last:pb-0">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right font-semibold">{v}</dd>
    </div>
  );
}
