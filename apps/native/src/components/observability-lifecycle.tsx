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
import {
  expectedUpdateFailure,
  type ExpectedUpdateFailure,
} from "@/lib/observability/classification";
import { registerDiagnosticRenderTrigger } from "@/lib/observability/diagnostics";
import {
  hasLeftForegroundSinceLaunch,
  isNetworkKnownOffline,
} from "@/lib/observability/http";

export function routeTemplateFromSegments(segments: readonly string[]): string {
  const path = segments.filter(
    (segment) => !(segment.startsWith("(") && segment.endsWith(")")),
  );
  return path.length > 0 ? `/${path.join("/")}` : "/";
}

/** 빵가루에 적을 "왜 실패해도 정상인가". */
const EXPECTED_UPDATE_NOTE: Record<ExpectedUpdateFailure, string> = {
  offline: "while offline",
  backgrounded: "while backgrounded",
};

/**
 * 고칠 것 없는 업데이트 실패는 이슈로 올리지 않는다.
 *
 * **망이 없을 때.** 비행기 모드·지하철·생활관처럼 망이 없는 자리에서 앱을 켜면
 * expo-updates가 곧바로 "The Internet connection appears to be offline."로 실패한다.
 * 다음에 망이 잡히면 스스로 다시 받는다(Sentry LEAVE-NATIVE-7).
 *
 * **앱이 앞에서 내려갔을 때.** 검사·내려받기는 실행 직후에 시작한다. 그 사이 사용자가
 * 앱을 내리면 OS가 전송을 끊고, 받다 만 자리가 "Failed to download remote update",
 * "Failed to download asset …", "Failed to load all assets"로 올라온다 — Sentry
 * LEAVE-NATIVE-9·A·B가 모두 `app.state=background`였다. NetInfo는 이때도 online이라
 * 말하므로 연결 상태만으로는 가려지지 않는다. HTTP 쪽은 이미 같은 신호를 쓴다
 * (`shouldReportTransportFailure`의 `leftForeground`).
 *
 * 빵가루는 어느 쪽이든 남긴다. 나중에 다른 실패를 볼 때 "그때 망이 없었다" · "그때 앱이
 * 내려가 있었다"가 단서가 된다.
 */
function recordUpdateFailure(
  error: unknown,
  phase: "check" | "download",
  level: "warning" | "error",
): void {
  const expected = expectedUpdateFailure(
    isNetworkKnownOffline(),
    hasLeftForegroundSinceLaunch(),
  );
  if (!expected) {
    captureHandledError(error, {
      source: "ota_update",
      level,
      tags: { "ota.phase": phase },
    });
  }
  addObservabilityBreadcrumb({
    category: "app.ota_update",
    message: expected
      ? `OTA update ${phase} failed ${EXPECTED_UPDATE_NOTE[expected]}`
      : `OTA update ${phase} failed`,
    level: expected ? "info" : "warning",
  });
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

  // 실패를 이슈로 올릴지 가리는 규칙은 `recordUpdateFailure`에 적어 두었다.
  useEffect(() => {
    if (!updates.checkError) return;
    recordUpdateFailure(updates.checkError, "check", "warning");
  }, [updates.checkError]);

  useEffect(() => {
    if (!updates.downloadError) return;
    recordUpdateFailure(updates.downloadError, "download", "error");
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
