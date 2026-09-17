/**
 * 콘텐츠 높이에 맞춰 자라는 바텀시트 높이.
 *
 * `SheetScaffold`가 알려주는 "다 펼쳤을 때의 높이"를 받아, 이 플랫폼의 시트 호스트에
 * 맞는 디텐트 숫자로 바꿔 준다. 왜 고정 비율로는 안 되는지는 `fittedDetentHeight`
 * 주석에 있다.
 */

import { useState } from "react";
import { SHEET_HOST_SIZING } from "./native-bottom-sheet";
import { fittedDetentHeight } from "./sheet-snap-point";

export function useFittedSheetHeight(bounds: { min: number; max: number }) {
  const [contentHeight, setContentHeight] = useState<number | null>(null);

  return {
    /** `snapPoints={[{ height }]}`에 그대로 넣는다. */
    height: fittedDetentHeight(contentHeight, SHEET_HOST_SIZING, bounds),
    /** `SheetScaffold`의 같은 이름 prop에 그대로 넘긴다. */
    onContentHeightChange: setContentHeight,
  };
}
