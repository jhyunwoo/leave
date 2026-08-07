/**
 * 신고·차단 훅 (앱스토어 UGC 정책 대응).
 *
 * 사용처: 구성원 목록의 액션 메뉴, 휴가 상세의 신고 버튼.
 */
import type { BlockCreateInput, ReportCreateInput } from "@leave/shared";
import { useMutation } from "@tanstack/react-query";
import { useLeaveApi } from "../context";
import { queryKeys } from "../query-keys";
import { useInvalidateKeys } from "./invalidate";

/** 신고는 접수만 하면 되므로 캐시를 건드리지 않는다. */
export function useCreateReport() {
  const { client, unwrap } = useLeaveApi();
  return useMutation({
    mutationFn: async (input: ReportCreateInput) =>
      unwrap(await client.moderation.reports.$post({ json: input })),
  });
}

/**
 * 사용자를 차단한다. 차단하면 그 사람의 콘텐츠가 목록에서 빠지므로
 * (그룹이 여러 개일 수 있으니) 구성원 목록 전체를 다시 받는다.
 */
export function useBlockUser() {
  const { client, unwrap } = useLeaveApi();
  const invalidate = useInvalidateKeys([queryKeys.allUnitMembers]);
  return useMutation({
    mutationFn: async (input: BlockCreateInput) =>
      unwrap(await client.moderation.blocks.$post({ json: input })),
    onSuccess: invalidate,
  });
}
