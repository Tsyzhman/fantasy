"use client";

import { useEffect } from "react";

import { reportClientCriticalError } from "@/monitoring/report-client-critical-error";

export function ClientCriticalErrorReporter() {
  useEffect(() => {
    const onError = () => reportClientCriticalError("WINDOW_ERROR");
    const onUnhandledRejection = () => reportClientCriticalError("UNHANDLED_REJECTION");
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);
  return null;
}
