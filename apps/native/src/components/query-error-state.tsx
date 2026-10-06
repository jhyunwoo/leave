import { Text } from "react-native";
import { Button } from "./button";
import { ContentPanel } from "./content-panel";
import { makeStyles, spacing } from "@/theme";

export function QueryErrorState({
  title,
  onRetry,
  retrying,
}: {
  title: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  const styles = useStyles();
  return (
    <ContentPanel style={styles.panel}>
      <Text accessibilityRole="alert" style={styles.title}>
        {title}
      </Text>
      <Text style={styles.caption}>잠시 후 다시 시도해주세요.</Text>
      <Button title="다시 불러오기" onPress={onRetry} loading={retrying} />
    </ContentPanel>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  panel: { padding: spacing.lg, gap: spacing.sm },
  title: { fontSize: 18, fontWeight: "700", color: colors.ink },
  caption: { fontSize: 14, color: colors.body },
}));
