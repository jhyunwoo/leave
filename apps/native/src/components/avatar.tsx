/**
 * 별칭 이니셜 아바타(네이티브).
 * 사용처: 출타 명단, 구성원 목록, 프로필.
 */

import { Image } from "expo-image";
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
 * 별칭 이니셜 아바타. `source`를 주면 그 이미지를 대신 그린다.
 *
 * 부대원 목록·출타 명단에서는 source를 주지 않는다. 서버가 내 이미지만
 * 내려주기도 하고, 남의 얼굴을 그룹 화면에 뿌리지 않는 편이 이 앱의
 * 비식별 원칙에 맞기 때문이다.
 */
export function Avatar(props: {
  name: string;
  size?: number;
  /** 인증 헤더가 필요한 이미지라 uri만으로는 부족하다. */
  source?: { uri: string; headers?: Record<string, string> } | null;
}) {
  const styles = useStyles();
  const palette = PALETTE[useAppColorScheme()];
  const size = props.size ?? 40;
  const box = { width: size, height: size, borderRadius: size / 2 };
  const bg = palette[props.name.charCodeAt(0) % palette.length];

  if (props.source) {
    return (
      <Image
        source={props.source}
        style={box}
        contentFit="cover"
        accessibilityLabel={`${props.name} 프로필 사진`}
        // 사진은 색 반전 대상이 아니다.
        accessibilityIgnoresInvertColors
      />
    );
  }

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
