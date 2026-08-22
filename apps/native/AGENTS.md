# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# 네이티브 의존성은 버전을 고정한다

`app.json`의 `runtimeVersion.policy`가 `"fingerprint"`다. OTA 업데이트는 **fingerprint가 정확히
같은 빌드에만** 배달되고, autolink되는 네이티브 모듈의 버전이 그 fingerprint에 들어간다.

그래서 `package.json`에서 **네이티브 코드를 담은 패키지는 `^` 없이 정확한 버전으로 적는다.**
`^`가 붙어 있으면 `pnpm update` 한 번, 혹은 lockfile 재생성 한 번에 조용히 fingerprint가 갈라지고,
**그 이후 발행하는 OTA는 기존 스토어 사용자 누구에게도 닿지 않는다.** 실제로 그 상태였던 적이 있다.

고정 대상은 `android/`·`ios/`·podspec·`expo-module.config.json`을 담아 autolink되는 것 전부와,
prebuild 결과를 바꾸는 config plugin(`expo-build-properties`)이다. 즉 `expo*`, `react-native*`,
`@expo/ui`, `@react-native-community/netinfo`.

`^`를 그대로 두는 것: `@tanstack/*`, `jotai`, `react-native-web`, `@leave/*`, devDependencies.
JS만 있어서 OTA로 안전하게 바뀐다. `react`·`react-dom`·`hono`는 루트 `pnpm-workspace.yaml`의
`overrides`가 이미 워크스페이스 전체를 한 버전으로 묶는다.

**올릴 때**는 `npx expo install --check`가 알려주는 버전으로 올리고,
`pnpm-workspace.yaml`의 `overrides`도 같이 맞춘다. 그리고 **반드시 새 EAS 빌드로 배포한다** —
OTA로는 안 된다.

## `scripts` 블록도 fingerprint 소스다

`@expo/fingerprint`는 `apps/native/package.json`의 `scripts`를 `JSON.stringify`해서 그대로 해싱한다
(`build/sourcer/Bare.js`의 `normalizePackageJsonScriptSources`). **스크립트를 한 줄 추가하는 것만으로
runtimeVersion이 바뀌어 OTA가 끊긴다.** 배포·도구용 스크립트는 루트 `package.json`이나 `scripts/`에 둔다.

바꾸기 전후로 확인하는 법:

```bash
npx expo-updates fingerprint:generate --platform ios \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['hash'])"
```

배포 절차 전체는 `deploy-app` skill에 있다.
