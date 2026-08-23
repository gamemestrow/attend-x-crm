import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CalendarCheck2, Percent, Play, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SectionTitle, StatCard } from "@/components/attendance/bits";
import { TeacherShell } from "@/components/attendance/shells";
import { className, subjectName } from "@/lib/attendance/data";
import { sessionRecords, useAttendanceStore } from "@/lib/attendance/store";

export const Route = createFileRoute("/teacher/")({
  head: () => ({
    meta: [
      { title: "Teacher Dashboard — AttendX" },
      { name: "description", content: "Start QR attendance sessions and review class attendance." },
      { property: "og:title", content: "Teacher Dashboard — AttendX" },
      { property: "og:description", content: "Start QR attendance sessions and review class attendance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TeacherDashboard,
});

function TeacherDashboard() {
  const auth = useAttendanceStore((s) => s.auth);
  const sessions = useAttendanceStore((s) => s.sessions);
  const records = useAttendanceStore((s) => s.records);
  if (!auth || auth.role !== "teacher") return null;

  const submitted = sessions
    .filter((s) => s.status === "SUBMITTED")
    .sort((a, b) => b.start_time - a.start_time);
  const totalPresent = records.filter(
    (r) => r.status === "PRESENT" && submitted.some((s) => s.session_id === r.session_id),
  ).length;
  const totalRecords = records.filter((r) =>
    submitted.some((s) => s.session_id === r.session_id),
  ).length;
  const avgPct = totalRecords ? Math.round((totalPresent / totalRecords) * 100) : 0;

  return (
    <TeacherShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Welcome, {auth.teacher.name}</h1>
          <p className="text-sm text-muted-foreground">
            Manage QR-based attendance for your classes.
          </p>
        </div>
        <Link to="/teacher/start">
          <Button size="lg" className="gap-2">
            <Play className="h-4 w-4" />
            Start Attendance
          </Button>
        </Link>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Submitted Sessions"
          value={submitted.length}
          icon={<CalendarCheck2 className="h-4 w-4" />}
        />
        <StatCard
          label="Average Attendance"
          value={`${avgPct}%`}
          tone="primary"
          icon={<Percent className="h-4 w-4" />}
        />
        <StatCard label="Students (BCA-A)" value={50} icon={<Users className="h-4 w-4" />} />
      </div>

      <SectionTitle title="Recent Sessions" sub="Previously submitted attendance" />
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subject</TableHead>
              <TableHead>Class</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Present</TableHead>
              <TableHead className="text-right">Absent</TableHead>
              <TableHead className="text-right">Attendance</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {submitted.slice(0, 6).map((s) => {
              const recs = sessionRecords(records, s.session_id);
              const present = recs.filter((r) => r.status === "PRESENT").length;
              const absent = recs.length - present;
              const pct = recs.length ? Math.round((present / recs.length) * 100) : 0;
              return (
                <TableRow key={s.session_id}>
                  <TableCell className="font-medium">{subjectName(s.subject_id)}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{className(s.class_id)}</Badge>
                  </TableCell>
                  <TableCell className="tabular text-muted-foreground">
                    {new Date(s.date + "T00:00:00").toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </TableCell>
                  <TableCell className="tabular text-right font-semibold text-success">
                    {present}
                  </TableCell>
                  <TableCell className="tabular text-right font-semibold text-destructive">
                    {absent}
                  </TableCell>
                  <TableCell className="tabular text-right font-semibold">{pct}%</TableCell>
                  <TableCell className="text-right">
                    <Link to="/teacher/history">
                      <Button variant="ghost" size="sm" className="gap-1">
                        View <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </TeacherShell>
  );
}
