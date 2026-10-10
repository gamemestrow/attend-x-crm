import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { getSessionDiagnostics } from "@/lib/attendance/attendance.functions";
import { LOCATION_QUALITY } from "@/lib/attendance/geo";

type Row = Record<string, string | number | boolean | null>;

const num = (v: unknown, d = 6) => (typeof v === "number" ? v.toFixed(d) : "—");
const time = (v: unknown) =>
  typeof v === "string" ? new Date(v).toLocaleTimeString("en-IN", { hour12: false }) : "—";
const yn = (v: unknown) => (v === true ? "yes" : v === false ? "no" : "—");

/** Teacher-only diagnostics for the session they own. Coordinates never leave this view. */
export function LocationDiagnostics({ sessionId, teacherId }: { sessionId: string; teacherId: string }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const fetchDiag = useServerFn(getSessionDiagnostics);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const load = async () => {
      try {
        const r = await fetchDiag({ data: { sessionId, teacherId } });
        if (alive) setRows(r.attempts);
      } catch {
        /* keep last rows */
      }
    };
    void load();
    const t = window.setInterval(() => void load(), 3000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [open, sessionId, teacherId, fetchDiag]);

  const first = rows[0];
  return (
    <Card>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-6 py-4 text-sm font-medium"
      >
        <span>
          Location diagnostics <span className="text-muted-foreground">(teacher only)</span>
        </span>
        <span className="text-xs text-primary">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <CardContent className="space-y-3 border-t pt-4 text-xs">
          <p className="text-muted-foreground">
            Distances are calculated between estimated browser locations, not exact device positions. Quality
            threshold: ±{LOCATION_QUALITY.maxAccuracyMeters} m (does not change the radius).
          </p>
          {first && (
            <p className="tabular">
              Teacher reference: {num(first["teacher_latitude"])}, {num(first["teacher_longitude"])} · ±
              {num(first["teacher_accuracy"], 0)} m · captured {time(first["teacher_location_at"])} · radius{" "}
              {first["radius_meters"]} m
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="tabular w-full text-left">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3">Time</th>
                  <th className="pr-3">Student</th>
                  <th className="pr-3">Student lat, lng</th>
                  <th className="pr-3">± m</th>
                  <th className="pr-3">Reading at</th>
                  <th className="pr-3">Distance</th>
                  <th className="pr-3">QR ok</th>
                  <th className="pr-3">Quality ok</th>
                  <th className="pr-3">Inside</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={String(r["id"])} className="border-t">
                    <td className="py-1 pr-3">{time(r["created_at"])}</td>
                    <td className="pr-3 font-mono">{r["student_id"]}</td>
                    <td className="pr-3">
                      {num(r["student_latitude"])}, {num(r["student_longitude"])}
                    </td>
                    <td className="pr-3">{num(r["student_accuracy"], 0)}</td>
                    <td className="pr-3">{time(r["student_location_at"])}</td>
                    <td className="pr-3">{typeof r["distance_meters"] === "number" ? `${num(r["distance_meters"], 1)} m` : "—"}</td>
                    <td className="pr-3">{yn(r["qr_valid"])}</td>
                    <td className="pr-3">{yn(r["quality_ok"])}</td>
                    <td className="pr-3">{yn(r["inside_radius"])}</td>
                    <td className="font-semibold">
                      {r["outcome"]} · {r["reason"]}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="py-3 text-muted-foreground">
                      No scan attempts yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
