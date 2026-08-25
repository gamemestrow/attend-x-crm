const QR_KIND = "attendx-attendance";
const QR_VERSION = 1;

export interface AttendanceQrPayload {
  sessionId?: string;
  token: string;
}

export function encodeAttendanceQr(sessionId: string, token: string): string {
  return JSON.stringify({
    type: QR_KIND,
    version: QR_VERSION,
    sessionId,
    token,
  });
}

export function parseAttendanceQr(raw: string): AttendanceQrPayload | null {
  const value = raw.trim();
  if (!value) return null;

  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object") {
      const payload = parsed as Record<string, unknown>;
      if (
        payload["type"] === QR_KIND &&
        payload["version"] === QR_VERSION &&
        typeof payload["sessionId"] === "string" &&
        typeof payload["token"] === "string"
      ) {
        return { sessionId: payload["sessionId"].trim(), token: payload["token"].trim() };
      }
      return null;
    }
  } catch {
    // Continue with URL and legacy-token parsing.
  }

  try {
    const url = new URL(value);
    const token = url.searchParams.get("token")?.trim();
    const sessionId = url.searchParams.get("session")?.trim();
    if (token) return sessionId ? { sessionId, token } : { token };
  } catch {
    // The decoded value is not a URL.
  }

  // Keep already-issued QR codes valid while all new codes use the versioned payload.
  return value.startsWith("ATT-SES-") ? { token: value } : null;
}