// Expo 템플릿의 release 빌드는 `proguard-android.txt`를 쓴다. 이 기본 파일은 `-dontoptimize`를 담고 있어서
// minify를 켜도 R8이 코드를 줄이고 이름만 바꿀 뿐 최적화(인라인·클래스 병합·죽은 분기 제거)는 하지 않는다.
// Play Console이 "최적화가 사용 설정되지 않음"으로 경고하는 게 이것이다. AGP 9부터는
// `proguard-android.txt` 자체가 지원되지 않으니 미리 `-optimize` 쪽으로 옮겨 둔다.
const { withAppBuildGradle } = require("expo/config-plugins");

const FROM = 'getDefaultProguardFile("proguard-android.txt")';
const TO = 'getDefaultProguardFile("proguard-android-optimize.txt")';

module.exports = function withAndroidR8Optimize(config) {
  return withAppBuildGradle(config, (config) => {
    const gradle = config.modResults.contents;
    if (gradle.includes(TO)) return config;
    if (!gradle.includes(FROM)) {
      // 템플릿이 바뀌어 줄을 못 찾으면 조용히 넘어가지 말고 빌드를 멈춘다.
      throw new Error(
        `with-android-r8-optimize: ${FROM} not found in android/app/build.gradle`,
      );
    }
    config.modResults.contents = gradle.replace(FROM, TO);
    return config;
  });
};
