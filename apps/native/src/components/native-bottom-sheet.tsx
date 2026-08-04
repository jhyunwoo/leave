import { BottomSheet } from "@expo/ui/community/bottom-sheet";
import type { ReactElement } from "react";
import { View } from "react-native";

type SnapPoint = "half" | "full" | { fraction: number } | { height: number };

export function NativeBottomSheet(props: {
  isPresented: boolean;
  onDismiss: () => void;
  snapPoints?: SnapPoint[];
  testID?: string;
  children: ReactElement;
}) {
  if (!props.isPresented) return null;

  const snapPoints = props.snapPoints?.map((point) => {
    if (point === "half") return "50%";
    if (point === "full") return "100%";
    if ("fraction" in point) return `${point.fraction * 100}%`;
    return point.height;
  });

  return (
    <BottomSheet
      onDismiss={props.onDismiss}
      onClose={props.onDismiss}
      enablePanDownToClose
      snapPoints={snapPoints}
    >
      <View style={{ flex: 1 }} testID={props.testID}>
        {props.children}
      </View>
    </BottomSheet>
  );
}
