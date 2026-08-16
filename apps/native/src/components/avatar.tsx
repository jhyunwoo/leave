/**
 * 별칭 이니셜 아바타(네이티브).
 * 사용처: 출타 명단, 구성원 목록, 프로필.
 */

import { Text, View } from "react-native";
import { makeStyles, useAppColorScheme } from "@/theme";

/**
 * 이니셜 배경. 라이트는 파스텔, 다크는 같은 색조를 유지한 저명도 톤.
 * 글자색(inkDeep)이 다크에서 밝은 연두라 배경이 충분히 어두워야 읽힌다.
 * 두 배열의 길이가 같아야 같은 사람이 스킴을 바꿔도 같은 색 자리를 지킨다.
 */
const PALETTE = {
  light: ["#ffedd5", "#fce7f3", "#ede9fe", "#d1fae5", "#dbeafe"],
  dark: ["#4a2f10", "#45182f", "#2e2650", "#123528", "#12294a"],
} as const;

/**
 * 별칭 이니셜만 그린다. 사진 업로드·열람 경로를 없앴으므로 이미지 분기도 없다.
 * 군사시설 촬영 위험과 사진 권한 요구를 애초에 만들지 않기 위한 선택이다.
 */
export function Avatar(props: { name: string; size?: number }) {
  const styles = useStyles();
  const palette = PALETTE[useAppColorScheme()];
  const size = props.size ?? 40;
  const box = { width: size, height: size, borderRadius: size / 2 };
  const bg = palette[props.name.charCodeAt(0) % palette.length];

  return (
    <View style={[styles.fallback, box, { backgroundColor: bg }]}>
      <Text style={[styles.initial, { fontSize: size * 0.42 }]}>
        {props.name.slice(0, 1)}
      </Text>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  fallback: { alignItems: "center", justifyContent: "center" },
  initial: { fontWeight: "600", color: colors.inkDeep },
}));
