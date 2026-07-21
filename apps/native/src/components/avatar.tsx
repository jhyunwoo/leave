import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";
import { imageUrl } from "@/api/client";
import { colors } from "@/theme";

const PALETTE = ["#ffedd5", "#fce7f3", "#ede9fe", "#d1fae5", "#dbeafe"];

export function Avatar(props: {
  name: string;
  imageKey?: string | null;
  size?: number;
}) {
  const size = props.size ?? 40;
  const url = imageUrl(props.imageKey);
  const box = { width: size, height: size, borderRadius: size / 2 };

  if (url) {
    return <Image source={{ uri: url }} style={box} contentFit="cover" />;
  }
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
