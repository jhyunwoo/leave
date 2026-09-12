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
import { isNetworkKnownOffline } from "@/lib/observability/http";

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

  /**
   * 연결이 없을 때의 업데이트 실패는 정상이다 — 아래 두 effect가 함께 따르는 규칙이다.
   *
   * 비행기 모드·지하철·생활관처럼 망이 없는 자리에서 앱을 켜면 expo-updates가 곧바로
   * "The Internet connection appears to be offline."로 실패한다. 고칠 것이 없고, 다음에
   * 망이 잡히면 스스로 다시 받는다. 이슈로 올리면 진짜 OTA 사고(서명 실패·깨진
   * 매니페스트)가 그 속에 묻힌다 — Sentry LEAVE-NATIVE-7이 그렇게 쌓였다.
   * 빵가루는 그대로 남긴다. 나중에 다른 실패를 볼 때 "그때 망이 없었다"가 단서가 된다.
   */
  useEffect(() => {
    if (!updates.checkError) return;
    const expected = isNetworkKnownOffline();
    if (!expected) {
      captureHandledError(updates.checkError, {
        source: "ota_update",
        level: "warning",
        tags: { "ota.phase": "check" },
      });
    }
    addObservabilityBreadcrumb({
      category: "app.ota_update",
      message: expected
        ? "OTA update check failed while offline"
        : "OTA update check failed",
      level: expected ? "info" : "warning",
    });
  }, [updates.checkError]);

  useEffect(() => {
    if (!updates.downloadError) return;
    const expected = isNetworkKnownOffline();
    if (!expected) {
      captureHandledError(updates.downloadError, {
        source: "ota_update",
        level: "error",
        tags: { "ota.phase": "download" },
      });
    }
    addObservabilityBreadcrumb({
      category: "app.ota_update",
      message: expected
        ? "OTA update download failed while offline"
        : "OTA update download failed",
      level: expected ? "info" : "warning",
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
