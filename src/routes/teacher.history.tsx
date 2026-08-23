import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarCheck2, Eye, MapPin, Search, Timer } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/attendance/bits";
import { TeacherShell } from "@/components/attendance/shells";
import {
  SUBJECTS,
  className,
  getRoster,
  subjectName,
  type AttendanceSession,
} from "@/lib/attendance/data";
import { sessionRecords, useAttendanceStore } from "@/lib/attendance/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/teacher/history")({
  head: () => ({
    meta: [
      { title: "Attendance History — AttendX" },
      {
        name: "description",
        content:
          "Browse submitted attendance sessions with per-student present/absent analytics.",
      },
      { property: "og:title", content: "Attendance History — AttendX" },
      {
        property: "og:description",
        content:
          "Browse submitted attendance sessions with per-student present/absent analytics.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const sessions = useAttendanceStore((s) => s.sessions);
  const records = useAttendanceStore((s) => s.records);
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const sorted = [...sessions].sort((a, b) => b.start_time - a.start_time);
  const filtered = sorted.filter((s) => {
    if (subjectFilter !== "all" && s.subject_id !== subjectFilter) return false;
    if (!q) return true;
    return (
      s.session_id.toLowerCase().includes(q) ||
      subjectName(s.subject_id).toLowerCase().includes(q) ||
      s.date.includes(q)
    );
  });

  const detail = detailId
    ? sessions.find((s) => s.session_id === detailId)
    : undefined;

  return (
    <TeacherShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Attendance History</h1>
          <p className="text-sm text-muted-foreground">
            Every session you've run, with per-student records.
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search subject, session, date…"
            className="w-64 pl-9"
          />
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        <FilterChip active={subjectFilter === "all"} onClick={() => setSubjectFilter("all")}>
          All Subjects
        </FilterChip>
        {SUBJECTS.map((s) => (
          <FilterChip
            key={s.id}
            active={subjectFilter === s.id}
            onClick={() => setSubjectFilter(s.id)}
          >
            {s.subject_name}
          </FilterChip>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center text-muted-foreground">
              <CalendarCheck2 className="h-8 w-8 opacity-40" />
              <p className="text-sm">No sessions match your filters.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Config</TableHead>
                  <TableHead className="text-right">Present</TableHead>
                  <TableHead className="text-right">Absent</TableHead>
                  <TableHead className="text-right">Attendance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => {
                  const recs = sessionRecords(records, s.session_id);
                  const present = recs.filter((r) => r.status === "PRESENT").length;
                  const absent = recs.length - present;
                  const pct = recs.length
                    ? Math.round((present / recs.length) * 100)
                    : 0;
                  return (
                    <TableRow key={s.session_id}>
                      <TableCell className="tabular whitespace-nowrap text-muted-foreground">
                        {new Date(s.date + "T00:00:00").toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="font-medium">
                        {subjectName(s.subject_id)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{className(s.class_id)}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <span className="mr-2 inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {s.attendance_radius}m
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Timer className="h-3 w-3" />
                          {s.qr_validity}s
                        </span>
                      </TableCell>
                      <TableCell className="tabular text-right font-semibold text-success">
                        {present}
                      </TableCell>
                      <TableCell className="tabular text-right font-semibold text-destructive">
                        {absent}
                      </TableCell>
                      <TableCell className="tabular text-right font-semibold">
                        {pct}%
                      </TableCell>
                      <TableCell>
                        {s.status === "SUBMITTED" ? (
                          <Badge variant="success">SUBMITTED</Badge>
                        ) : s.status === "UNDER_REVIEW" ? (
                          <Badge variant="warning">UNDER REVIEW</Badge>
                        ) : (
                          <Badge variant="secondary">ACTIVE</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {s.status === "UNDER_REVIEW" || s.status === "ACTIVE" ? (
                          <Link to="/teacher/session">
                            <Button variant="outline" size="sm">
                              Resume
                            </Button>
                          </Link>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5"
                            onClick={() => setDetailId(s.session_id)}
                          >
                            <Eye className="h-3.5 w-3.5" /> Details
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <SessionDetailDialog
        session={detail}
        onClose={() => setDetailId(null)}
      />
    </TeacherShell>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function SessionDetailDialog({
  session,
  onClose,
}: {
  session: AttendanceSession | undefined;
  onClose: () => void;
}) {
  const records = useAttendanceStore((s) => s.records);

  return (
    <Dialog open={!!session} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden p-0">
        {session && (
          <DetailBody session={session} records={records} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailBody({
  session,
  records,
}: {
  session: AttendanceSession;
  records: ReturnType<typeof sessionRecords>;
}) {
  const roster = getRoster(session.class_id);
  const recs = sessionRecords(records, session.session_id);
  const byStudent = new Map(recs.map((r) => [r.student_id, r]));
  const present = recs.filter((r) => r.status === "PRESENT").length;
  const pct = recs.length ? Math.round((present / recs.length) * 100) : 0;

  return (
    <div className="flex max-h-[85vh] flex-col">
      <DialogHeader className="border-b px-6 py-4">
        <DialogTitle>{subjectName(session.subject_id)}</DialogTitle>
        <DialogDescription>
          {className(session.class_id)} ·{" "}
          {new Date(session.date + "T00:00:00").toLocaleDateString("en-IN", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}{" "}
          · <span className="font-mono text-xs">{session.session_id}</span>
        </DialogDescription>
        <div className="flex gap-4 pt-1 text-xs text-muted-foreground">
          <span>
            Present: <strong className="text-success">{present}</strong>
          </span>
          <span>
            Absent:{" "}
            <strong className="text-destructive">{recs.length - present}</strong>
          </span>
          <span>
            Attendance: <strong>{pct}%</strong>
          </span>
          <span>
            Radius {session.attendance_radius}m · QR {session.qr_validity}s
          </span>
        </div>
      </DialogHeader>
      <div className="overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Roll No.</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Scan Time</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roster.map((s) => {
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
                  <TableCell className="text-right">
                    <StatusBadge status={r?.status ?? "ABSENT"} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
