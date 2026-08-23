import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  MapPin,
  Play,
  RefreshCw,
  ScanLine,
  Send,
  Sparkles,
  StopCircle,
  Timer,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatCard, StatusBadge } from "@/components/attendance/bits";
import { TeacherShell } from "@/components/attendance/shells";
import {
  className,
  getRoster,
  subjectName,
  type AttendanceSession,
} from "@/lib/attendance/data";
import {
  getActiveToken,
  sessionRecords,
  useAttendanceStore,
} from "@/lib/attendance/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/teacher/session")({
  head: () => ({
    meta: [
      { title: "Live Session — AttendX" },
      {
        name: "description",
        content:
          "Live QR attendance session: rotating QR codes, real-time scans, review and final submission.",
      },
      { property: "og:title", content: "Live Session — AttendX" },
      {
        property: "og:description",
        content:
          "Live QR attendance session: rotating QR codes, real-time scans, review and final submission.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SessionPage,
});

function SessionPage() {
  const activeSessionId = useAttendanceStore((s) => s.activeSessionId);
  const session = useAttendanceStore((s) =>
    s.sessions.find((x) => x.session_id === activeSessionId),
  );

  return (
    <TeacherShell>
      {!session || session.status === "SUBMITTED" ? (
        <NoActiveSession submitted={session?.status === "SUBMITTED"} />
      ) : session.status === "UNDER_REVIEW" ? (
        <ReviewView session={session} />
      ) : (
        <LiveView session={session} />
      )}
    </TeacherShell>
  );
}

// --- Empty states -----------------------------------------------------------

function NoActiveSession({ submitted }: { submitted: boolean }) {
  return (
    <Card className="mx-auto mt-16 max-w-md">
      <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
        <div className="rounded-2xl bg-accent p-4">
          {submitted ? (
            <CheckCircle2 className="h-8 w-8 text-success" />
          ) : (
            <ScanLine className="h-8 w-8 text-muted-foreground" />
          )}
        </div>
        <div>
          <h1 className="font-display text-lg font-semibold">
            {submitted ? "Session submitted" : "No active session"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {submitted
              ? "Attendance for this session has been finalized."
              : "Start a new attendance session to generate a live QR code."}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/teacher/start">
            <Button className="gap-2">
              <Play className="h-4 w-4" /> Start Attendance
            </Button>
          </Link>
          <Link to="/teacher/history">
            <Button variant="outline">View History</Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Live session -----------------------------------------------------------

function LiveView({ session }: { session: AttendanceSession }) {
  const tokens = useAttendanceStore((s) => s.tokens);
  const records = useAttendanceStore((s) => s.records);
  const regenerateToken = useAttendanceStore((s) => s.regenerateToken);
  const expireActiveToken = useAttendanceStore((s) => s.expireActiveToken);
  const endSession = useAttendanceStore((s) => s.endSession);
  const simulateScans = useAttendanceStore((s) => s.simulateScans);

  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  const [showPending, setShowPending] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const token = getActiveToken(tokens, session.session_id);
  const expired = !!token && now > token.expires_at;

  // Mark the token EXPIRED in the store so student scans reject it immediately.
  useEffect(() => {
    if (expired && token) expireActiveToken(session.session_id);
  }, [expired, token, session.session_id, expireActiveToken]);

  const recs = sessionRecords(records, session.session_id)
    .filter((r) => r.status === "PRESENT")
    .sort((a, b) => (b.scan_time ?? 0) - (a.scan_time ?? 0));
  const roster = getRoster(session.class_id);
  const scannedIds = new Set(recs.map((r) => r.student_id));
  const pending = roster.filter((s) => !scannedIds.has(s.student_id));
  const pct = roster.length ? Math.round((recs.length / roster.length) * 100) : 0;

  const secondsLeft = token ? Math.max(0, Math.ceil((token.expires_at - now) / 1000)) : 0;

  const copyToken = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — ignore
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-bold">
              {subjectName(session.subject_id)}
            </h1>
            <Badge variant="success" className="gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
              </span>
              LIVE
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {className(session.class_id)} · Semester {session.semester} ·{" "}
            {new Date(session.start_time).toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            · <span className="font-mono text-xs">{session.session_id}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => simulateScans(session.session_id, 8)}
          >
            <Sparkles className="h-4 w-4" /> Simulate student scans
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="gap-2">
                <StopCircle className="h-4 w-4" /> End Session
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>End this attendance session?</AlertDialogTitle>
                <AlertDialogDescription>
                  The QR code will stop working immediately. The {pending.length}{" "}
                  students who haven't scanned will be marked{" "}
                  <strong>ABSENT</strong>, and you'll review the full list before
                  final submission.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep session running</AlertDialogCancel>
                <AlertDialogAction onClick={() => endSession(session.session_id)}>
                  End & Review
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* QR panel */}
        <Card className="h-fit lg:sticky lg:top-20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              Attendance QR
              <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                <Timer className="h-3.5 w-3.5" /> refreshes every {session.qr_validity}s
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <div className="relative w-full max-w-65 rounded-2xl border bg-card p-4">
              {token && !expired ? (
                <QRCode
                  value={token.token}
                  size={256}
                  style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                  fgColor="oklch(0.35 0.12 255)"
                />
              ) : (
                <div className="flex aspect-square items-center justify-center rounded-lg bg-muted">
                  <QrPlaceholder />
                </div>
              )}
              {expired && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-card/90 backdrop-blur-sm">
                  <AlertTriangle className="h-8 w-8 text-warning" />
                  <div className="text-sm font-semibold">QR Expired</div>
                  <Button
                    size="sm"
                    className="gap-2"
                    onClick={() => regenerateToken(session.session_id)}
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Generate New QR
                  </Button>
                </div>
              )}
            </div>

            {token && !expired && (
              <div className="mt-4 flex items-center gap-4">
                <CountdownRing secondsLeft={secondsLeft} total={session.qr_validity} />
                <div>
                  <div className="tabular font-display text-2xl font-bold">
                    {secondsLeft}s
                  </div>
                  <div className="text-xs text-muted-foreground">
                    until this QR expires
                  </div>
                </div>
              </div>
            )}

            {token && (
              <button
                onClick={() => void copyToken()}
                className="mt-3 flex max-w-full items-center gap-2 rounded-lg bg-muted px-3 py-1.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-accent"
                title="Copy token"
              >
                <span className="truncate">{token.token}</span>
                {copied ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                ) : (
                  <Copy className="h-3.5 w-3.5 shrink-0" />
                )}
              </button>
            )}

            <div className="mt-4 flex w-full items-center justify-between rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {session.teacher_latitude.toFixed(4)}, {session.teacher_longitude.toFixed(4)}
              </span>
              <span className="font-semibold text-foreground">
                {session.attendance_radius} m radius
              </span>
            </div>

            <Button
              variant="outline"
              className="mt-4 w-full gap-2"
              onClick={() => regenerateToken(session.session_id)}
            >
              <RefreshCw className="h-4 w-4" /> Generate New QR
            </Button>
          </CardContent>
        </Card>

        {/* Live list */}
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard
              label="Present"
              value={recs.length}
              tone="success"
              icon={<CheckCircle2 className="h-4 w-4" />}
            />
            <StatCard
              label="Yet to scan"
              value={pending.length}
              icon={<Users className="h-4 w-4" />}
            />
            <StatCard
              label="Class coverage"
              value={`${pct}%`}
              tone="primary"
              sub={`${recs.length} of ${roster.length} students`}
              icon={<ScanLine className="h-4 w-4" />}
            />
          </div>
          <Progress value={pct} className="h-2" />

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Scanned In{" "}
                <span className="tabular text-sm font-normal text-muted-foreground">
                  ({recs.length})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {recs.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-muted-foreground">
                  <ScanLine className="h-8 w-8 opacity-40" />
                  <p className="text-sm">
                    Waiting for students to scan the QR code…
                  </p>
                </div>
              ) : (
                <div className="max-h-105 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Roll No.</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Scan Time</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recs.map((r, i) => {
                        const stu = roster.find((s) => s.student_id === r.student_id);
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="tabular text-muted-foreground">
                              {i + 1}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {r.student_id}
                            </TableCell>
                            <TableCell className="font-medium">
                              {stu?.name ?? r.student_id}
                            </TableCell>
                            <TableCell className="tabular text-muted-foreground">
                              {r.scan_time
                                ? new Date(r.scan_time).toLocaleTimeString("en-IN", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    second: "2-digit",
                                  })
                                : "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              <StatusBadge status="PRESENT" />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <button
              onClick={() => setShowPending((v) => !v)}
              className="flex w-full items-center justify-between px-6 py-4 text-sm font-medium"
            >
              <span>
                Yet to scan{" "}
                <span className="tabular text-muted-foreground">
                  ({pending.length})
                </span>
              </span>
              <span className="text-xs text-primary">
                {showPending ? "Hide" : "Show"}
              </span>
            </button>
            {showPending && (
              <CardContent className="border-t pt-4">
                <div className="flex flex-wrap gap-2">
                  {pending.map((s) => (
                    <span
                      key={s.student_id}
                      className="rounded-full border bg-muted/50 px-3 py-1 text-xs text-muted-foreground"
                    >
                      {s.name} · <span className="font-mono">{s.student_id}</span>
                    </span>
                  ))}
                  {pending.length === 0 && (
                    <p className="text-sm text-success">
                      Every enrolled student has scanned. 🎉
                    </p>
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function QrPlaceholder() {
  return (
    <div className="grid grid-cols-6 gap-1 opacity-20">
      {Array.from({ length: 36 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "aspect-square rounded-sm",
            (i * 7) % 3 === 0 ? "bg-foreground" : "bg-transparent",
          )}
        />
      ))}
    </div>
  );
}

function CountdownRing({
  secondsLeft,
  total,
}: {
  secondsLeft: number;
  total: number;
}) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? Math.min(1, Math.max(0, secondsLeft / total)) : 0;
  const urgent = secondsLeft <= 5;
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90">
      <circle
        cx="28"
        cy="28"
        r={r}
        fill="none"
        strokeWidth="5"
        className="stroke-muted"
      />
      <circle
        cx="28"
        cy="28"
        r={r}
        fill="none"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - frac)}
        className={cn(
          "transition-all duration-300 ease-linear",
          urgent ? "stroke-destructive" : "stroke-primary",
        )}
      />
    </svg>
  );
}

// --- Review & final submit --------------------------------------------------

function ReviewView({ session }: { session: AttendanceSession }) {
  const records = useAttendanceStore((s) => s.records);
  const submitSession = useAttendanceStore((s) => s.submitSession);
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const roster = getRoster(session.class_id);
  const recs = sessionRecords(records, session.session_id);
  const byStudent = new Map(recs.map((r) => [r.student_id, r]));
  const present = recs.filter((r) => r.status === "PRESENT").length;
  const absent = recs.length - present;
  const pct = recs.length ? Math.round((present / recs.length) * 100) : 0;

  const q = query.trim().toLowerCase();
  const rows = roster.filter(
    (s) =>
      !q ||
      s.name.toLowerCase().includes(q) ||
      s.student_id.toLowerCase().includes(q),
  );

  const submit = () => {
    submitSession(session.session_id);
    void navigate({ to: "/teacher/history" });
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold">Review & Submit</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {subjectName(session.subject_id)} · {className(session.class_id)} ·{" "}
          <span className="font-mono text-xs">{session.session_id}</span>
        </p>
      </div>

      <div className="mb-6 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <p>
          These records are <strong>temporary</strong>. Students who didn't scan
          were automatically marked <strong>ABSENT</strong>. Review the list
          below — once you submit, attendance becomes final and visible to
          students.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Present"
          value={present}
          tone="success"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <StatCard label="Absent" value={absent} tone="destructive" icon={<Users className="h-4 w-4" />} />
        <StatCard label="Attendance" value={`${pct}%`} tone="primary" icon={<ScanLine className="h-4 w-4" />} />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4 space-y-0 pb-3">
          <CardTitle className="text-base">Class Roster ({roster.length})</CardTitle>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or roll no…"
            className="h-9 w-56"
          />
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-120 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Roll No.</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Scan Time</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s) => {
                  const r = byStudent.get(s.student_id);
                  return (
                    <TableRow key={s.student_id}>
                      <TableCell className="font-mono text-xs">{s.student_id}</TableCell>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="tabular text-muted-foreground">
                        {r?.scan_time
                          ? new Date(r.scan_time).toLocaleTimeString("en-IN", {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {r?.status === "PRESENT" ? (
                          <span className="flex items-center gap-1 text-xs text-success">
                            <MapPin className="h-3 w-3" /> Verified
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <StatusBadge status={r?.status ?? "ABSENT"} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 flex items-center justify-end gap-3">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="lg" className="gap-2">
              <Send className="h-4 w-4" /> Final Submit Attendance
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Submit final attendance?</AlertDialogTitle>
              <AlertDialogDescription>
                {present} present · {absent} absent for{" "}
                {subjectName(session.subject_id)} ({className(session.class_id)}).
                This cannot be edited after submission.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Back to review</AlertDialogCancel>
              <AlertDialogAction onClick={submit}>
                Submit Attendance
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
