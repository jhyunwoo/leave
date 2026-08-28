/**
 * 라우트 트리 **바깥**까지 덮는 최상위 에러 경계.
 *
 * 사용처: apps/native/index.js — expo-router보다 위에 둔다.
 * 라우터 안쪽은 `app/_layout.tsx`의 ErrorBoundary가 맡고, 라우터 자체가
 * 초기화되기 전에 터진 오류는 여기가 아니면 아무도 잡지 못한다.
 */

import * as SplashScreen from "expo-splash-screen";
import { Component, Fragment, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import {
  clearPersistedFatalError,
  type FatalErrorRecord,
  reportFatalError,
  subscribeFatalError,
  takePersistedFatalError,
  toFatalRecord,
} from "@/lib/fatal-error";
import { ErrorScreen } from "./error-screen";

type Props = { children: ReactNode };

type State = {
  record: FatalErrorRecord | null;
  /** 지금 이 트리의 렌더가 깨진 상태인지. 아니면 지난 오류를 알리기만 하는 것. */
  broken: boolean;
  /** 다시 시도할 때 하위 트리를 새로 마운트하려고 올리는 값. */
  attempt: number;
};

/**
 * 앱 전체를 감싸는 마지막 방어선.
 *
 * expo-router가 라우트 파일의 ErrorBoundary를 붙여주는 자리는 라우트 트리 "안"이라
 * NavigationContainer·SafeAreaProvider·Content에서 난 렌더 오류는 걸리지 않는다.
 * 위에 경계가 하나도 없으면 React가 루트를 통째로 언마운트하고 RN이 그 오류를
 * isFatal로 보고해 RCTFatal → SIGABRT로 앱이 죽는다. 그래서 라우터보다 위에 둔다.
 *
 * 렌더 밖에서 난 오류(이벤트 핸들러·타이머·네이티브 콜백)는 경계가 잡을 수 없어
 * 전역 핸들러가 보내주는 것을 구독해 같은 화면으로 보여준다.
 */
export class RootErrorBoundary extends Component<Props, State> {
  state: State = { record: null, broken: false, attempt: 0 };

  private unsubscribe: (() => void) | null = null;

  static getDerivedStateFromError(error: unknown): Partial<State> {
    // 오류 화면이 스플래시에 가려지지 않게 한다.
    void SplashScreen.hideAsync();
    return { record: toFatalRecord(error), broken: true };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string | null }) {
    reportFatalError(error, info.componentStack, {
      source: "root_error_boundary",
      level: "fatal",
    });
  }

  componentDidMount() {
    this.unsubscribe = subscribeFatalError((record) => {
      // 렌더가 깨진 상태의 내용을 나중에 온 오류가 덮지 않게 한다.
      this.setState((prev) => (prev.broken ? prev : { ...prev, record }));
    });

    // 지난 실행이 오류로 끝났다면(우리가 막지 못한 네이티브 종료 포함) 그 내용을
    // 이번 실행에서 한 번 보여준다. 그러지 않으면 원인이 영영 남지 않는다.
    void takePersistedFatalError().then((record) => {
      if (!record) return;
      this.setState((prev) => (prev.record ? prev : { ...prev, record }));
    });
  }

  componentWillUnmount() {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private dismiss = () => {
    // 사용자가 확인한 오류를 다음 실행에서 또 띄우지 않는다.
    clearPersistedFatalError();
    this.setState((prev) => ({
      record: null,
      broken: false,
      attempt: prev.broken ? prev.attempt + 1 : prev.attempt,
    }));
  };

  render() {
    const { record, broken, attempt } = this.state;

    // 렌더가 깨졌으면 그릴 수 있는 게 없다. 트리를 오류 화면으로 갈아끼운다.
    if (record && broken) {
      return (
        <ErrorScreen
          title="문제가 발생했어요"
          body="화면을 그리는 중 오류가 났어요. 다시 시도해도 계속되면 아래 내용을 알려주세요."
          record={record}
          actionLabel="다시 시도"
          onAction={this.dismiss}
        />
      );
    }

    return (
      // key를 바꿔 "다시 시도"가 깨진 트리를 새로 마운트하게 한다.
      <Fragment key={attempt}>
        {this.props.children}
        {/* 렌더 밖에서 난 오류는 트리가 멀쩡하다. 화면만 덮어 내용을 알리고,
            닫으면 하던 일을 그대로 이어가게 한다(앱을 다시 마운트하지 않는다).

            RN Modal이 아니라 트리 안 오버레이인 이유: iOS는 한 화면에 모달을
            하나만 띄운다. 휴가 등록 시트 같은 게 떠 있는 동안 이 Modal을 띄우면
            UIKit이 표시를 거부하는데, RN은 거부 전에 이미 "표시됨"으로 적어둬서
            (RCTModalHostViewComponentView가 presentViewController 전에
            _isPresented를 세운다) 오류 알림이 그대로 사라진다. 오버레이는
            아무것도 present하지 않아 거부될 일이 없다. 시트가 떠 있으면 그 아래에
            그려졌다가 시트를 닫는 순간 드러난다 — 알림을 잃는 것보다 낫다. */}
        {record ? (
          <View
            style={styles.overlay}
            // 오버레이는 모달과 달리 뒤 화면을 접근성 트리에서 가리지 않는다.
            // 보이스오버 초점이 뒤로 새지 않게 직접 막는다.
            accessibilityViewIsModal
          >
            <ErrorScreen
              title="문제가 발생했어요"
              body="오류가 났지만 앱은 계속 쓸 수 있어요. 같은 일이 반복되면 아래 내용을 알려주세요."
              record={record}
              actionLabel="계속하기"
              onAction={this.dismiss}
            />
          </View>
        ) : null}
      </Fragment>
    );
  }
}

const styles = StyleSheet.create({
  // 라우터 트리 위에 겹친다. 배경은 ErrorScreen이 불투명하게 칠한다.
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1,
  },
});
