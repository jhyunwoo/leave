/**
 * 네이티브 앱의 루트 레이아웃 — 프로바이더, 세션 복원, 화면 스택.
 *
 * expo-router가 이 파일을 모든 화면의 부모로 삼는다.
 *
 * 시작 순서가 화면 깜빡임을 좌우한다. SecureStore에서 토큰을 되살릴 때까지는
 * 스플래시를 유지하고(`ready`), 그 뒤에야 Stack.Protected가 로그인 여부에 따라
 * 갈 곳을 정한다. 먼저 그리면 로그인 화면이 한 프레임 번쩍인다.
 *
 * 쿼리 캐시는 디스크에 저장한다(PersistQueryClientProvider). 통신이 끊긴
 * 훈련장·생활관에서도 마지막으로 본 달력과 내 휴가는 볼 수 있어야 한다.
 */

import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { type ErrorBoundaryProps, Stack, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { loadStoredToken } from "@/api/client";
import { ApiProvider } from "@/api/provider";
import { ErrorScreen } from "@/components/error-screen";
import { ObservabilityLifecycle } from "@/components/observability-lifecycle";
import { reportFatalError, toFatalRecord } from "@/lib/fatal-error";
import {
  capturePendingProfile,
  takePendingProfile,
} from "@/lib/pending-profile-link";
import {
  configureQueryOnlineManager,
  QUERY_CACHE_MAX_AGE,
  queryPersistenceOptions,
} from "@/lib/query-persistence";
import { useNotificationLogging } from "@/lib/use-notification-logging";
import { tokenAtom } from "@/state/auth";
import {
  useOnboardingStatus,
  watchFriendAccessRevocation,
} from "@leave/client";
import { useColors } from "@/theme";

SplashScreen.preventAutoHideAsync();
configureQueryOnlineManager();

/**
 * 라우트 트리 안에서 난 렌더 오류를 잡는다. 이게 없으면 프로덕션에서 렌더 오류가
 * 경계 없이 위로 올라가 RCTFatal로 앱이 종료된다.
 *
 * 이 경계는 라우트 트리 안쪽만 덮는다. 그 바깥은 index.js의 RootErrorBoundary가
 * 맡는다. 여기서도 내용을 남겨야 다음 실행에서 원인을 되짚을 수 있다.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const record = useMemo(() => toFatalRecord(error), [error]);
  useEffect(() => {
    void SplashScreen.hideAsync();
    // notify=false is essential: notifying RootErrorBoundary here would place
    // its overlay on top of Router's own recovery screen and create two UIs.
    reportFatalError(error, record.componentStack, {
      source: "router_error_boundary",
      level: "error",
      notify: false,
    });
  }, [error, record]);
  return (
    <ErrorScreen
      title="문제가 발생했어요"
      body="화면을 그리는 중 오류가 났어요. 다시 시도해도 계속되면 아래 내용을 알려주세요."
      record={record}
      actionLabel="다시 시도"
      onAction={() => void retry()}
    />
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      gcTime: QUERY_CACHE_MAX_AGE,
      networkMode: "offlineFirst",
    },
  },
});

// 서버가 친구 권한을 거절하면(403/404) 캐시에 남은 일정 본문도 함께 버린다.
// 재조회가 실패해도 TanStack은 마지막 성공 데이터를 들고 있어, 이게 없으면
// 친구가 나를 끊은 뒤에도 화면이 예전 일정을 계속 그린다.
// (디스크 캐시에는 애초에 친구 데이터를 저장하지 않는다 — query-persistence.ts)
watchFriendAccessRevocation(queryClient);

/**
 * 로그인 전에 도착한 프로필 딥링크를 기억했다가, 갈 수 있게 된 순간 보낸다.
 *
 * 인증·온보딩·이름 설정이 모두 끝나기 전에는 `/u/{username}`이 라우트 트리에
 * 없어 목적지가 사라진다. 자세한 배경은 lib/pending-profile-link.ts에 있다.
 */
function usePendingProfileLink(ready: boolean, canNavigate: boolean) {
  const router = useRouter();
  useEffect(() => {
    // `ready`가 되기 전에는 인증 상태를 모르므로 판단을 미룬다. 그 전에 도착한
    // 링크도 getInitialURL로 다시 읽을 수 있어 놓치지 않는다.
    if (!ready) return;
    let cancelled = false;
    void Linking.getInitialURL().then((url) => {
      if (!cancelled && url) capturePendingProfile(url);
    });
    const subscription = Linking.addEventListener("url", (event) => {
      capturePendingProfile(event.url);
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [ready]);

  // 갈 수 있게 된 순간 한 번만 꺼낸다. `takePendingProfile`이 값을 비우므로
  // 이 effect가 다시 돌아도 같은 곳으로 두 번 이동하지 않는다.
  useEffect(() => {
    if (!canNavigate) return;
    const username = takePendingProfile();
    if (username) {
      router.push({ pathname: "/u/[username]", params: { username } });
    }
  }, [canNavigate, router]);
}

function RootNavigator() {
  const colors = useColors();
  const token = useAtomValue(tokenAtom);
  const setToken = useSetAtom(tokenAtom);
  const [ready, setReady] = useState(false);

  // SecureStore에서 토큰을 되살릴 때까지는 스플래시를 유지한다. 먼저 그리면
  // 로그인 화면이 한 프레임 번쩍이고 나서 홈으로 넘어간다.
  useEffect(() => {
    void loadStoredToken().then((stored) => {
      setToken(stored);
      setReady(true);
      void SplashScreen.hideAsync();
    });
  }, [setToken]);

  const isAuthed = token !== null && token !== undefined;
  const onboarding = useOnboardingStatus(isAuthed);
  // 로그인 상태에서만 이 앱 푸시의 수신·열람 이벤트를 서버에 보고 (동의 기반)
  useNotificationLogging(isAuthed);

  const onboardingComplete = onboarding.data?.completed === true;
  // 0023 이전에 가입해 아직 공개 이름이 없는 계정은 1회성 설정 화면을 지난다.
  const hasUsername = Boolean(onboarding.data?.username);
  const canBrowse = isAuthed && onboardingComplete && hasUsername;

  // 인증·온보딩·이름 설정을 모두 지난 순간, 로그인 전에 눌렀던 프로필 링크로 간다.
  usePendingProfileLink(ready, canBrowse);

  const lifecycle = (
    <ObservabilityLifecycle
      authenticated={isAuthed}
      sessionReady={ready && token !== undefined}
    />
  );

  if (!ready || token === undefined || (isAuthed && onboarding.isPending))
    return lifecycle; // 스플래시 유지

  return (
    <>
      {lifecycle}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.canvasSoft },
        }}
      >
        <Stack.Protected guard={canBrowse}>
          <Stack.Screen name="(tabs)" />
          {/* 공유 주소(`https://leave.moveto.kr/u/…`, `leave://u/…`)의 착지점.
            탭 그룹 밖의 최상위 라우트라 어디서 열려도 같은 카드로 뜬다. */}
          <Stack.Screen
            name="u/[username]"
            options={{
              headerShown: true,
              title: "프로필",
              headerBackTitle: "뒤로",
              headerTransparent: process.env.EXPO_OS !== "web",
              headerShadowVisible: false,
              headerTintColor: colors.brand,
              headerTitleStyle: { fontWeight: "600", color: colors.ink },
            }}
          />
          <Stack.Screen
            name="units"
            options={{
              presentation: "formSheet",
              headerShown: true,
              title: "그룹 참여",
              headerTransparent: process.env.EXPO_OS !== "web",
              headerShadowVisible: false,
              sheetGrabberVisible: true,
              sheetAllowedDetents: [0.75, 1],
              contentStyle: {
                backgroundColor:
                  process.env.EXPO_OS === "web"
                    ? colors.canvasSoft
                    : "transparent",
              },
              headerTitleStyle: { fontWeight: "600", color: colors.ink },
            }}
          />
          <Stack.Screen
            name="unit-manage"
            options={{
              presentation: "formSheet",
              headerShown: true,
              title: "그룹 관리",
              headerTransparent: process.env.EXPO_OS !== "web",
              headerShadowVisible: false,
              sheetGrabberVisible: true,
              sheetAllowedDetents: [0.75, 1],
              contentStyle: {
                backgroundColor:
                  process.env.EXPO_OS === "web"
                    ? colors.canvasSoft
                    : "transparent",
              },
              headerTitleStyle: { fontWeight: "600", color: colors.ink },
            }}
          />
          {/* 내 휴가 탭에서 들락거리는 목적지라 모달이 아니라 카드로 밀어 뒤로가기를 남긴다. */}
          <Stack.Screen
            name="leave-grants"
            options={{
              headerShown: true,
              title: "보유 휴가",
              // 탭은 헤더를 숨겨 제목이 없으므로, 돌아갈 곳을 뒤로가기에 직접 적는다.
              headerBackTitle: "내 휴가",
              // 탭 스택들과 같은 규칙 — headerStyle로 배경을 칠하지 않고 시스템의
              // 반투명 바를 그대로 쓴다. 불투명하게 칠하면 다크모드에서 본문과
              // 색이 어긋나 흰 띠처럼 보인다. 웹에는 blur 바가 없어 흐름에 남긴다.
              headerTransparent: process.env.EXPO_OS !== "web",
              headerShadowVisible: false,
              headerTintColor: colors.brand,
              headerTitleStyle: { fontWeight: "600", color: colors.ink },
            }}
          />
          {/* 알림 탭·내 휴가 탭 양쪽에서 들어오므로 돌아갈 곳을 고정하지 않는다. */}
          <Stack.Screen
            name="leave/[leaveId]"
            options={{
              headerShown: true,
              title: "휴가 상세",
              headerBackTitle: "뒤로",
              headerTransparent: process.env.EXPO_OS !== "web",
              headerShadowVisible: false,
              headerTintColor: colors.brand,
              headerTitleStyle: { fontWeight: "600", color: colors.ink },
            }}
          />
        </Stack.Protected>
        <Stack.Protected guard={isAuthed && !onboardingComplete}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={isAuthed && onboardingComplete && !hasUsername}>
          <Stack.Screen name="username-setup" />
        </Stack.Protected>
        <Stack.Protected guard={!isAuthed}>
          <Stack.Screen name="login" />
          <Stack.Screen name="signup" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const colors = useColors();

  // 루트 뷰 배경. 회전·모달 전환 중 잠깐 드러나는 면이라, 다크모드에서 흰 판이
  // 번쩍이지 않도록 스킴에 맞춰 맞춰둔다.
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.canvasSoft);
  }, [colors.canvasSoft]);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={queryPersistenceOptions}
    >
      {/* ApiProvider는 401 처리에서 쿼리 캐시를 비우므로 QueryClient 안쪽이어야 한다. */}
      <ApiProvider>
        <StatusBar style="auto" />
        <RootNavigator />
      </ApiProvider>
    </PersistQueryClientProvider>
  );
}
