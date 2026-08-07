/**
 * 별칭 이니셜 아바타(네이티브).
 * 사용처: 출타 명단, 구성원 목록, 프로필.
 */

import { StyleSheet, Text, View } from "react-native";
import { colors } from "@/theme";

const PALETTE = ["#ffedd5", "#fce7f3", "#ede9fe", "#d1fae5", "#dbeafe"];

/**
 * 별칭 이니셜만 그린다. 사진 업로드·열람 경로를 없앴으므로 이미지 분기도 없다.
 * 군사시설 촬영 위험과 사진 권한 요구를 애초에 만들지 않기 위한 선택이다.
 */
export function Avatar(props: { name: string; size?: number }) {
  const size = props.size ?? 40;
  const box = { width: size, height: size, borderRadius: size / 2 };
  const bg = PALETTE[props.name.charCodeAt(0) % PALETTE.length];

  return (
    <View style={[styles.fallback, box, { backgroundColor: bg }]}>
      <Text style={[styles.initial, { fontSize: size * 0.42 }]}>
        {props.name.slice(0, 1)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: "center", justifyContent: "center" },
  initial: { fontWeight: "600", color: colors.inkDeep },
});
