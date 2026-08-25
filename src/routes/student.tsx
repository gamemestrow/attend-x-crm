import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useAttendanceStore } from "@/lib/attendance/store";

/**
 * Student area layout. The session lives in localStorage, which the server
 * cannot read — so this subtree is client-only (ssr: false) and the role
 * guard runs in beforeLoad. Prevents the SSR/client hydration mismatch that
 * previously left these pages in a broken state after logout.
 */
export const Route = createFileRoute("/student")({
  ssr: false,
  beforeLoad: () => {
    const auth = useAttendanceStore.getState().auth;
    if (!auth || auth.role !== "student") {
      throw redirect({ to: "/" });
    }
  },
  component: () => <Outlet />,
});
