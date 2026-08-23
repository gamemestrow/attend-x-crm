import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { GraduationCap, QrCode, UserRound } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAttendanceStore } from "@/lib/attendance/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AttendX — QR-Based Student Attendance System" },
      {
        name: "description",
        content:
          "Automated student attendance monitoring and analytics for colleges using secure, time-bound dynamic QR codes.",
      },
      { property: "og:title", content: "AttendX — QR-Based Student Attendance System" },
      {
        property: "og:description",
        content:
          "Secure, time-bound QR attendance for colleges. Teacher generates a dynamic QR; students scan to mark attendance with location validation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const [role, setRole] = useState<"student" | "teacher">("student");
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const login = useAttendanceStore((s) => s.login);
  const navigate = useNavigate();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (id.trim().length < 3 || password.trim().length < 3) {
      setError("Enter a valid ID and password (min. 3 characters).");
      return;
    }
    login(role, id);
    void navigate({ to: role === "student" ? "/student" : "/teacher" });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <QrCode className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold leading-tight">AttendX</h1>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Automated Attendance Monitoring
          </p>
        </div>
      </div>

      <Card className="w-full max-w-md shadow-sm">
        <CardContent className="p-6">
          {/* Role selector */}
          <div className="mb-6 grid grid-cols-2 gap-2 rounded-xl bg-muted p-1.5">
            {(
              [
                { key: "student", label: "Student", icon: GraduationCap },
                { key: "teacher", label: "Teacher", icon: UserRound },
              ] as const
            ).map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRole(r.key)}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
                  role === r.key
                    ? "bg-card text-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <r.icon className="h-4 w-4" />
                {r.label}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="login-id">{role === "student" ? "Student ID" : "Teacher ID"}</Label>
              <Input
                id="login-id"
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder={role === "student" ? "e.g. BCA001" : "e.g. TCH001"}
                className="font-mono"
                autoComplete="username"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
              />
            </div>
            {error && <p className="text-sm font-medium text-destructive">{error}</p>}
            <Button type="submit" className="w-full" size="lg">
              Sign in as {role === "student" ? "Student" : "Teacher"}
            </Button>
          </form>

          <div className="mt-5 rounded-lg bg-accent p-3 text-xs text-muted-foreground">
            <span className="font-semibold text-accent-foreground">Prototype demo:</span> any
            valid-looking ID works. Try{" "}
            <span className="font-mono font-semibold text-foreground">BCA001</span> (student) or{" "}
            <span className="font-mono font-semibold text-foreground">TCH001</span> (teacher) with
            any password.
          </div>
        </CardContent>
      </Card>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        Team <span className="font-semibold text-foreground">The Innovators</span> · Smart India
        Hackathon 2026
      </p>
    </div>
  );
}
