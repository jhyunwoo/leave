/**
 * PNG(base64)를 공유한다 — 웹(Expo web 타깃) 구현.
 * 웹에는 OS 공유 시트로 파일을 넘길 길이 없어 내려받기로 대신한다.
 */
export async function shareImage(base64: string, fileName: string) {
  const link = document.createElement("a");
  link.href = `data:image/png;base64,${base64}`;
  link.download = fileName;
  link.click();
}
