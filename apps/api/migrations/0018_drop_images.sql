-- 프로필 사진과 부대 대표 이미지를 기능째 없앤다.
-- 업로드·열람 경로(공개 API·관리자 워커)와 R2 버킷 바인딩을 함께 걷어냈으므로
-- 이 두 컬럼은 참조하는 코드가 남아 있지 않다. 사진 권한 요구 자체를 만들지
-- 않기 위한 결정이라 되살릴 계획이 없어 물리 삭제한다.
-- R2에 남은 `profiles/`·`units/` 오브젝트는 이 마이그레이션과 별개로 파기한다.
ALTER TABLE `users` DROP COLUMN `profile_image_key`;--> statement-breakpoint
ALTER TABLE `units` DROP COLUMN `image_key`;
