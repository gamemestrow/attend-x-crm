import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionTitle, StatusBadge } from "@/components/attendance/bits";
import { StudentShell } from "@/components/attendance/shells";
import { SUBJECTS, subjectName } from "@/lib/attendance/data";
import { studentStats, useAttendanceStore } from "@/lib/attendance/store";

export const Route = createFileRoute("/student/history")({
  head: () => ({
    meta: [
      { title: "Attendance History — AttendX" },
      { name: "description", content: "Date-wise and subject-wise attendance history." },
      { property: "og:title", content: "Attendance History — AttendX" },
      { property: "og:description", content: "Date-wise and subject-wise attendance history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const auth = useAttendanceStore((s) => s.auth);
  const records = useAttendanceStore((s) => s.records);
  const [subject, setSubject] = useState<string>("all");
  const student = auth?.role === "student" ? auth.student : null;

  const rows = useMemo(() => {
    if (!student) return [];
    const stats = studentStats(records, student.student_id);
    return stats.all
      .filter((r) => subject === "all" || r.subject_id === subject)
      .sort((a, b) => b.date.localeCompare(a.date) || (b.scan_time ?? 0) - (a.scan_time ?? 0));
  }, [records, student, subject]);

  if (!student) return null;

  return (
    <StudentShell>
      <SectionTitle
        title="Attendance History"
        sub={`Semester ${student.semester} · organised by subject and date`}
      />

      <div className="mb-4 grid grid-cols-2 gap-2">
        <Select value={subject} onValueChange={setSubject}>
          <SelectTrigger>
            <SelectValue placeholder="Subject" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Subjects</SelectItem>
            {SUBJECTS.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.subject_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={`sem-${student.semester}`} disabled>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={`sem-${student.semester}`}>Semester {student.semester}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="divide-y p-0">
          {rows.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No attendance records found.
            </p>
          )}
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{subjectName(r.subject_id)}</div>
                <div className="tabular text-xs text-muted-foreground">
                  {new Date(r.date + "T00:00:00").toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                  {r.scan_time &&
                    " · " +
                      new Date(r.scan_time).toLocaleTimeString("en-IN", {
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      })}
                </div>
              </div>
              <StatusBadge status={r.status} />
            </div>
          ))}
        </CardContent>
      </Card>
    </StudentShell>
  );
}
