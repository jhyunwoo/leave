/**
 * PNG(base64)를 임시 파일로 써서 OS 공유 시트로 넘긴다 — iOS/Android 구현.
 *
 * RN의 `Share`는 안드로이드에서 글자만 보낼 수 있어 이미지는 expo-sharing으로 넘긴다.
 * 파일은 캐시 폴더에 두므로 OS가 알아서 치운다.
 */
import { File, Paths } from "expo-file-system";
import { shareAsync } from "expo-sharing";

export async function shareImage(base64: string, fileName: string) {
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(base64, { encoding: "base64" });
  await shareAsync(file.uri, {
    mimeType: "image/png",
    UTI: "public.png",
    dialogTitle: "휴가 일정 공유",
  });
}
