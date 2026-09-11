/**
 * `KeyboardAvoidingView`의 동작 방식 — 입력 폼이 있는 모든 화면이 함께 쓴다.
 *
 * 예전에는 iOS만 `"padding"`이고 안드로이드는 `undefined`였다. 그 관용구는
 * `android:windowSoftInputMode="adjustResize"`가 **창을 줄여 준다**는 전제에
 * 기대는데, 이 앱은 `edgeToEdgeEnabled=true`에 targetSdk 36이라 그 전제가 깨졌다 —
 * 에지투에지에서는 IME가 창을 줄이지 않고 inset으로만 알려 준다. 그래서 안드로이드에서
 * 키보드가 아래쪽 입력칸과 저장 버튼을 덮었다.
 *
 * RN의 `KeyboardAvoidingView`는 안드로이드에서도 `keyboardDidShow`의 좌표로
 * 필요한 여백을 직접 계산하므로(`ReactRootView.checkForKeyboardEvents`가 IME inset을
 * 실어 보낸다) 두 플랫폼에 같은 방식을 주는 편이 맞다. 창이 실제로 줄어드는 환경에서는
 * 그 계산이 0을 내므로 두 번 밀리지도 않는다.
 */
export const KEYBOARD_AVOID_BEHAVIOR = "padding" as const;
