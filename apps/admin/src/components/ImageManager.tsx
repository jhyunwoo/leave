/**
 * 대표 이미지 교체/삭제 패널.
 *
 * 사용처: EntityPage의 상세 서랍 중 사용자·부대 리소스.
 *
 * 이미지는 R2에 저장되므로 JSON이 아니라 multipart로 올라간다. 그래서 다른
 * 필드처럼 RecordForm에 넣지 않고 별도 패널로 둔다.
 */
import { ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import { useState } from "react";
import { api, ApiError } from "../api/client";
import { useToast } from "./ui";

/** 서버가 받아주는 이미지 형식. input의 accept와 안내 문구가 같은 출처를 쓴다. */
const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
];

export function ImageManager(props: {
  resource: "users" | "units";
  id: string;
  /** 업로드·삭제 후 목록 캐시를 다시 받게 한다. */
  onChanged: () => void;
}) {
  const toast = useToast();
  const [pending, setPending] = useState(false);

  /** 업로드와 삭제가 같은 진행 표시·오류 처리를 쓰도록 감싼다. */
  const run = async (
    task: () => Promise<unknown>,
    successMessage: string,
    failureMessage: string,
  ) => {
    setPending(true);
    try {
      await task();
      toast.success(successMessage);
      props.onChanged();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : failureMessage);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="image-manager">
      <h3>대표 이미지</h3>
      <p>JPEG, PNG, WebP, GIF, AVIF · 최대 5MB</p>
      <div>
        <label className="button secondary">
          {pending ? (
            <LoaderCircle className="spin" size={17} />
          ) : (
            <ImagePlus size={17} />
          )}
          이미지 교체
          <input
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            hidden
            disabled={pending}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const form = new FormData();
              form.set("image", file);
              void run(
                () => api.putForm(`/${props.resource}/${props.id}/image`, form),
                "이미지를 변경했습니다",
                "이미지를 변경하지 못했습니다",
              );
            }}
          />
        </label>
        <button
          className="button danger"
          type="button"
          disabled={pending}
          onClick={() =>
            void run(
              () => api.delete(`/${props.resource}/${props.id}/image`),
              "이미지를 삭제했습니다",
              "삭제하지 못했습니다",
            )
          }
        >
          <Trash2 size={17} /> 이미지 삭제
        </button>
      </div>
    </div>
  );
}
