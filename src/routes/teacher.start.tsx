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
import { CAMPUS_FALLBACK, getBrowserPosition, type LatLng } from "@/lib/attendance/geo";
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

type LocState =
  | { kind: "idle" }
  | { kind: "detecting" }
  | { kind: "ok"; pos: LatLng; fallback: boolean };

function StartPage() {
  const [classId, setClassId] = useState("cls-bca-a");
  const [semester, setSemester] = useState(3);
  const [subjectId, setSubjectId] = useState("sub-dbms");
  const [radius, setRadius] = useState(200);
  const [customRadius, setCustomRadius] = useState("");
  const [validity, setValidity] = useState(15);
  const [loc, setLoc] = useState<LocState>({ kind: "idle" });
  const startSession = useAttendanceStore((s) => s.startSession);
  const navigate = useNavigate();

  const effectiveRadius = customRadius ? Math.max(10, Number(customRadius) || radius) : radius;

  const detect = async () => {
    setLoc({ kind: "detecting" });
    try {
      const pos = await getBrowserPosition();
      setLoc({ kind: "ok", pos, fallback: false });
    } catch {
      setLoc({ kind: "ok", pos: CAMPUS_FALLBACK, fallback: true });
    }
  };

  const start = async () => {
    if (loc.kind !== "ok") return;
    await startSession({
      classId,
      semester,
      subjectId,
      radius: effectiveRadius,
      qrValidity: validity,
      location: loc.pos,
    });
    await navigate({ to: "/teacher/session" });
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
                {loc.kind === "idle" && (
                  <Button variant="outline" onClick={() => void detect()} className="gap-2">
                    <MapPin className="h-4 w-4" /> Detect teacher location
                  </Button>
                )}
                {loc.kind === "detecting" && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Detecting teacher location…
                  </div>
                )}
                {loc.kind === "ok" && (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-success">
                      <CheckCircle2 className="h-4 w-4" /> Location detected successfully
                      {loc.fallback && " (campus default)"}
                    </span>
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
                v={loc.kind === "ok" ? "Detected" : loc.kind === "detecting" ? "Detecting…" : "Not detected"}
              />
            </dl>
            <Button
              className="mt-6 w-full gap-2"
              size="lg"
              disabled={loc.kind !== "ok"}
              onClick={start}
            >
              <Play className="h-4 w-4" /> START ATTENDANCE
            </Button>
            {loc.kind !== "ok" && (
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
