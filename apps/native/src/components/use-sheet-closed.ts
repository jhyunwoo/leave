/**
 * 시트가 닫힌 뒤 한 번만 알리는 신호 — Android·웹 바텀시트용.
 *
 * 두 플랫폼에는 "완전히 닫혔다"는 네이티브 콜백이 없다. 대신 표시 상태가 꺼지는
 * 순간 알린다. 대화상자가 겹쳐도 되는 플랫폼이라 닫힘 애니메이션이 끝나기를
 * 기다릴 이유가 없다. 겹치기를 거부하는 iOS만 네이티브 콜백을 쓴다
 * (native-bottom-sheet.ios.tsx).
 */

import { useEffect, useRef } from "react";

export function useSheetClosed(isPresented: boolean, onClosed?: () => void) {
  const wasPresented = useRef(isPresented);

  useEffect(() => {
    // onClosed는 대개 새 함수로 다시 오지만, 한 번 알린 뒤에는 아래 ref가
    // 꺼져 있어 이펙트가 다시 돌아도 두 번 알리지 않는다.
    if (!wasPresented.current || isPresented) {
      wasPresented.current = isPresented;
      return;
    }
    wasPresented.current = false;
    onClosed?.();
  }, [isPresented, onClosed]);
}
