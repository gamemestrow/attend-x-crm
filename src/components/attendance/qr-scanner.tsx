import jsQR from "jsqr";
import { useEffect, useRef } from "react";

/**
 * Live-camera QR scanner. Camera only — no gallery / image upload.
 * Calls onScan with the decoded text, or onCameraError if access fails.
 */
export function QrScanner({
  onScan,
  onCameraError,
}: {
  onScan: (text: string) => void;
  onCameraError: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const callbacks = useRef({ onScan, onCameraError });
  callbacks.current = { onScan, onCameraError };

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const cleanup = () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
      } catch {
        callbacks.current.onCameraError();
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      const loop = () => {
        if (stopped) return;
        if (ctx && video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(img.data, img.width, img.height, {
            inversionAttempts: "dontInvert",
          });
          if (code?.data) {
            cleanup();
            callbacks.current.onScan(code.data);
            return;
          }
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    };

    void start();
    return cleanup;
  }, []);

  return (
    <div className="relative overflow-hidden rounded-2xl border bg-foreground/95">
      <video ref={videoRef} playsInline muted className="aspect-square w-full object-cover" />
      {/* Scan frame overlay */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="relative h-48 w-48">
          <span className="absolute left-0 top-0 h-8 w-8 rounded-tl-lg border-l-4 border-t-4 border-primary-foreground" />
          <span className="absolute right-0 top-0 h-8 w-8 rounded-tr-lg border-r-4 border-t-4 border-primary-foreground" />
          <span className="absolute bottom-0 left-0 h-8 w-8 rounded-bl-lg border-b-4 border-l-4 border-primary-foreground" />
          <span className="absolute bottom-0 right-0 h-8 w-8 rounded-br-lg border-b-4 border-r-4 border-primary-foreground" />
          <span className="absolute inset-x-4 top-1/2 h-0.5 animate-pulse bg-primary" />
        </div>
      </div>
    </div>
  );
}
