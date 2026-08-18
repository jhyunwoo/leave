/**
 * 서식은 전적으로 Prettier가 정한다. ESLint에는 서식 규칙을 두지 않는다
 * (eslint.config.mjs 참고).
 *
 * 값은 저장소가 이미 따르고 있던 Prettier 기본값을 명시적으로 적어 둔 것이다.
 * 설정 파일이 없으면 Prettier 메이저 버전이 올라갈 때 기본값이 바뀌면서
 * 코드 전체가 한 번에 재서식되는 일이 생긴다.
 */
export default {
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  printWidth: 80,
  tabWidth: 2,
};
