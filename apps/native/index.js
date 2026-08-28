// 앱 진입점. expo-router/entry가 하는 일(ExpoRoot 등록)을 그대로 하되, 라우터보다
// 위에 에러 경계를 하나 두고 전역 오류 핸들러를 먼저 설치한다.
//
// expo-router는 라우트 파일이 내보낸 ErrorBoundary를 라우트 트리 "안"에 붙인다.
// 그 위(NavigationContainer·SafeAreaProvider·Content)에서 난 렌더 오류는 어떤
// 경계에도 걸리지 않고, 경계 없는 렌더 오류를 만난 React는 루트 element를 null로
// 바꿔 뷰 트리를 통째로 언마운트한 뒤 RN에 isFatal로 보고한다. 그러면 RCTFatal이
// 프로세스를 abort() 시켜 SIGABRT로 앱이 죽는다(build 14 크래시의 경로).
//
// `@expo/metro-runtime`은 Fast Refresh를 위해 가장 먼저 와야 한다.
import "@expo/metro-runtime";
import "./src/lib/observability/bootstrap";

import { registerRootComponent } from "expo";
import { ExpoRoot } from "expo-router";
import { ctx } from "expo-router/_ctx";
import Head from "expo-router/head";
import * as SplashScreen from "expo-splash-screen";

import { RootErrorBoundary } from "./src/components/root-error-boundary";

// expo-router/entry가 대신 해주던 일. 라우트 모듈이 언제 평가되든 스플래시가 먼저
// 사라지지 않게 진입점에서 잡아둔다. 내리는 쪽은 _layout과 오류 화면이 맡는다.
SplashScreen.preventAutoHideAsync();

// Fast Refresh가 라우트 컨텍스트를 갱신하려면 export 되어 있어야 한다.
export function App() {
  return (
    <RootErrorBoundary>
      <Head.Provider>
        <ExpoRoot context={ctx} />
      </Head.Provider>
    </RootErrorBoundary>
  );
}

registerRootComponent(App);
