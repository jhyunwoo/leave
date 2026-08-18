/// <reference types="vite/client" />

/**
 * 이 앱이 읽는 빌드 시점 환경변수. vite/client가 주는 색인 시그니처는 any라서,
 * 여기 적지 않은 이름을 읽으면 타입 없이 흘러간다. 새 변수를 쓸 때 여기도 채운다.
 */
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** 접속 기록에 남길 배포 버전. 미설정 시 "dev". */
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
