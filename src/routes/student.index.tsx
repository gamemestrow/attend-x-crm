import { createFileRoute, Link } from "@tanstack/react-router";
import { Flame, ScanLine, Star } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { SectionTitle, StatCard, StatusBadge } from "@/components/attendance/bits";
import { StudentShell } from "@/components/attendance/shells";
import { SUBJECTS, className, subjectName } from "@/lib/attendance/data";
import { studentStats, useAttendanceStore } from "@/lib/attendance/store";

export const Route = createFileRoute("/student/")({
  head: () => ({
    meta: [
      { title: "Student Dashboard — AttendX" },
      { name: "description", content: "Your attendance overview, streak, rewards and quick QR scan." },
      { property: "og:title", content: "Student Dashboard — AttendX" },
      { property: "og:description", content: "Your attendance overview, streak, rewards and quick QR scan." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudentDashboard,
});

function fmtWhen(r: { date: string; scan_time: number | null }) {
  const d = new Date(r.date + "T00:00:00");
  const date = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  if (!r.scan_time) return date;
  const t = new Date(r.scan_time).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${date} · ${t}`;
}

function StudentDashboard() {
  const auth = useAttendanceStore((s) => s.auth);
  const records = useAttendanceStore((s) => s.records);
  const ensureSeeded = useAttendanceStore((s) => s.ensureSeeded);

  useEffect(() => {
    ensureSeeded();
  }, [ensureSeeded]);

  const student = auth?.role === "student" ? auth.student : null;

  const stats = useMemo(
    () => (student ? studentStats(records, student.student_id) : null),
    [records, student],
  );
  if (!student || !stats) return null;

  return (
    <StudentShell>
      {/* Identity */}
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold">Hello, {student.name.split(" ")[0]}</h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="font-mono">{student.student_id}</Badge>
          <Badge variant="secondary">{className(student.class_id)}</Badge>
          <Badge variant="secondary">Semester {student.semester}</Badge>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-3 gap-2.5">
        <StatCard label="Attendance" value={`${stats.pct}%`} tone="primary" />
        <StatCard
          label="Streak"
          value={stats.streak}
          sub="classes"
          tone="success"
          icon={<Flame className="h-4 w-4" />}
        />
        <StatCard
          label="Points"
          value={stats.points}
          tone="default"
          icon={<Star className="h-4 w-4" />}
        />
      </div>

      {/* Primary action */}
      <Link to="/student/scan" className="mb-7 block">
        <button className="flex w-full items-center justify-center gap-3 rounded-2xl bg-primary py-4 font-display text-lg font-bold text-primary-foreground shadow-md transition-transform hover:scale-[1.01] active:scale-[0.99]">
          <ScanLine className="h-6 w-6" />
          SCAN ATTENDANCE QR
        </button>
      </Link>

      {/* Subject-wise attendance */}
      <SectionTitle title="Subject-wise Attendance" sub="This semester" />
      <Card className="mb-7">
        <CardContent className="divide-y p-0">
          {SUBJECTS.map((sub) => {
            const s = stats.bySubject.get(sub.id) ?? { present: 0, total: 0 };
            const pct = s.total ? Math.round((s.present / s.total) * 100) : 0;
            return (
              <div key={sub.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{sub.subject_name}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <Progress value={pct} className="h-1.5 flex-1" />
                    <span className="tabular text-xs font-medium text-muted-foreground">
                      {s.present}/{s.total}
                    </span>
                  </div>
                </div>
                <span
                  className={
                    "tabular font-display text-sm font-bold " +
                    (pct >= 85 ? "text-success" : pct >= 75 ? "text-warning" : "text-destructive")
                  }
                >
                  {pct}%
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Recent attendance */}
      <SectionTitle title="Recent Attendance" />
      <Card>
        <CardContent className="divide-y p-0">
          {stats.recent.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{subjectName(r.subject_id)}</div>
                <div className="text-xs text-muted-foreground">{fmtWhen(r)}</div>
              </div>
              <StatusBadge status={r.status} />
            </div>
          ))}
        </CardContent>
      </Card>
    </StudentShell>
  );
}
