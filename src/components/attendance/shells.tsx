import { Link, Navigate, useRouterState } from "@tanstack/react-router";
import {
  History,
  LayoutDashboard,
  LogOut,
  QrCode,
  ScanLine,
  Play,
} from "lucide-react";
import { useAttendanceStore, type AuthUser } from "@/lib/attendance/store";
import { cn } from "@/lib/utils";

export function BrandMark({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className={cn(
          "flex items-center justify-center rounded-xl bg-primary text-primary-foreground",
          size === "sm" ? "h-8 w-8" : "h-10 w-10",
        )}
      >
        <QrCode className={size === "sm" ? "h-4.5 w-4.5" : "h-5.5 w-5.5"} />
      </div>
      <div className="leading-tight">
        <div className={cn("font-display font-bold", size === "sm" ? "text-base" : "text-lg")}>
          AttendX
        </div>
        <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          Smart Attendance
        </div>
      </div>
    </div>
  );
}

/**
 * Client-side role guard. The /student and /teacher layouts are ssr:false and
 * also enforce the role in beforeLoad, so by the time a shell renders the
 * session is normally valid. If it isn't (e.g. right after logout), the
 * caller renders an immediate <Navigate> back to the login page — no blank
 * screen, no reliance on a post-render effect.
 */
export function useRequireRole(role: "student" | "teacher"): AuthUser | null {
  const auth = useAttendanceStore((s) => s.auth);
  if (!auth || auth.role !== role) return null;
  return auth;
}

export function StudentShell({ children }: { children: React.ReactNode }) {
  const auth = useRequireRole("student");
  const logout = useAttendanceStore((s) => s.logout);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (!auth || auth.role !== "student") return <Navigate to="/" replace />;
  const s = auth.student;
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <BrandMark size="sm" />
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <div className="text-sm font-semibold">{s.name}</div>
              <div className="font-mono text-[11px] text-muted-foreground">{s.student_id}</div>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 font-display text-sm font-bold text-primary">
              {s.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
            </div>
            <button
              onClick={logout}
              aria-label="Log out"
              className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 pb-28 pt-5">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-card">
        <div className="mx-auto grid max-w-lg grid-cols-3 items-end px-6 py-2">
          <NavItem to="/student" icon={<LayoutDashboard className="h-5 w-5" />} label="Home" active={pathname === "/student" || pathname === "/student/"} />
          <div className="flex justify-center">
            <Link
              to="/student/scan"
              aria-label="Scan attendance QR"
              className={cn(
                "-mt-7 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105",
                pathname.startsWith("/student/scan") && "ring-4 ring-primary/25",
              )}
            >
              <ScanLine className="h-6 w-6" />
            </Link>
          </div>
          <NavItem to="/student/history" icon={<History className="h-5 w-5" />} label="History" active={pathname.startsWith("/student/history")} />
        </div>
      </nav>
    </div>
  );
}

function NavItem({ to, icon, label, active }: { to: string; icon: React.ReactNode; label: string; active: boolean }) {
  return (
    <Link
      to={to}
      className={cn(
        "flex flex-col items-center gap-1 py-1 text-[11px] font-medium transition-colors",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </Link>
  );
}

export function TeacherShell({ children }: { children: React.ReactNode }) {
  const auth = useRequireRole("teacher");
  const logout = useAttendanceStore((s) => s.logout);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (!auth || auth.role !== "teacher") return <Navigate to="/" replace />;
  const t = auth.teacher;
  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const links = [
    { to: "/teacher", label: "Dashboard", icon: LayoutDashboard, match: (p: string) => p === "/teacher" || p === "/teacher/" },
    { to: "/teacher/start", label: "Start Attendance", icon: Play, match: (p: string) => p.startsWith("/teacher/start") || p.startsWith("/teacher/session") },
    { to: "/teacher/history", label: "Attendance History", icon: History, match: (p: string) => p.startsWith("/teacher/history") },
  ];
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-8 px-6 py-3">
          <BrandMark size="sm" />
          <nav className="hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  l.match(pathname)
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <l.icon className="h-4 w-4" />
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-4">
            <div className="hidden text-right text-xs text-muted-foreground lg:block">{today}</div>
            <div className="text-right leading-tight">
              <div className="text-sm font-semibold">{t.name}</div>
              <div className="font-mono text-[11px] text-muted-foreground">{t.teacher_id}</div>
            </div>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
              Logout
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
    </div>
  );
}
