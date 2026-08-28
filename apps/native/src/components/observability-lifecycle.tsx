import { queryKeys, type Me } from "@leave/client";
import { useQueryClient } from "@tanstack/react-query";
import { useSegments } from "expo-router";
import * as Updates from "expo-updates";
import { useEffect, useState } from "react";
import {
  addObservabilityBreadcrumb,
  captureHandledError,
  clearObservabilityUser,
  setCurrentRoute,
  setObservabilityTag,
  setObservabilityUser,
} from "@/lib/observability";
import { registerDiagnosticRenderTrigger } from "@/lib/observability/diagnostics";

export function routeTemplateFromSegments(segments: readonly string[]): string {
  const path = segments.filter(
    (segment) => !(segment.startsWith("(") && segment.endsWith(")")),
  );
  return path.length > 0 ? `/${path.join("/")}` : "/";
}

/** Router/auth/update context that is unavailable during the early bootstrap. */
export function ObservabilityLifecycle(props: {
  authenticated: boolean;
  sessionReady: boolean;
}) {
  const segments = useSegments();
  const queryClient = useQueryClient();
  const updates = Updates.useUpdates();
  const [diagnosticRenderError, setDiagnosticRenderError] = useState(false);

  useEffect(() => {
    setCurrentRoute(routeTemplateFromSegments(segments));
    setObservabilityTag("app.lifecycle_phase", "router_mounted");
  }, [segments]);

  useEffect(() => {
    registerDiagnosticRenderTrigger(() => setDiagnosticRenderError(true));
    return () => registerDiagnosticRenderTrigger(null);
  }, []);

  useEffect(() => {
    if (!props.sessionReady) return;
    addObservabilityBreadcrumb({
      category: "app.authentication",
      message: props.authenticated
        ? "authentication restored"
        : "authentication anonymous",
      level: "info",
    });

    if (!props.authenticated) {
      clearObservabilityUser();
      return;
    }

    const syncUser = () => {
      const me = queryClient.getQueryData<Me>(queryKeys.me);
      const id = me?.user.id;
      if (typeof id === "string" && id.length > 0) {
        setObservabilityUser(id);
      }
    };
    syncUser();
    return queryClient.getQueryCache().subscribe(syncUser);
  }, [props.authenticated, props.sessionReady, queryClient]);

  useEffect(() => {
    if (!updates.checkError) return;
    captureHandledError(updates.checkError, {
      source: "ota_update",
      level: "warning",
      tags: { "ota.phase": "check" },
    });
    addObservabilityBreadcrumb({
      category: "app.ota_update",
      message: "OTA update check failed",
      level: "warning",
    });
  }, [updates.checkError]);

  useEffect(() => {
    if (!updates.downloadError) return;
    captureHandledError(updates.downloadError, {
      source: "ota_update",
      level: "error",
      tags: { "ota.phase": "download" },
    });
    addObservabilityBreadcrumb({
      category: "app.ota_update",
      message: "OTA update download failed",
      level: "warning",
    });
  }, [updates.downloadError]);

  useEffect(() => {
    if (!updates.isUpdatePending) return;
    addObservabilityBreadcrumb({
      category: "app.ota_update",
      message: "OTA update downloaded and pending restart",
      level: "info",
    });
  }, [updates.isUpdatePending]);

  if (diagnosticRenderError) {
    throw new Error("Leave observability diagnostic: React render");
  }
  return null;
}
