import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useAttendanceStore } from "@/lib/attendance/store";

/**
 * Teacher area layout. Client-only (ssr: false) because the demo session is
 * stored in localStorage; the role guard in beforeLoad bounces signed-out
 * visitors back to the login page before any protected UI renders.
 */
export const Route = createFileRoute("/teacher")({
  ssr: false,
  beforeLoad: () => {
    const auth = useAttendanceStore.getState().auth;
    if (!auth || auth.role !== "teacher") {
      throw redirect({ to: "/" });
    }
  },
  component: () => <Outlet />,
});
