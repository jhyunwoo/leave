import { describe, expect, it } from "vitest";
import { ApiError, unwrap } from "../src";

function fakeRes(ok: boolean, status: number, body: unknown) {
  return { ok, status, json: () => Promise.resolve(body) };
}

describe("unwrap", () => {
  it("성공 응답은 파싱된 JSON을 반환", async () => {
    const data = await unwrap(fakeRes(true, 200, { hello: "world" }));
    expect(data).toEqual({ hello: "world" });
  });

  it("실패 응답은 서버 error 메시지로 ApiError를 던진다", async () => {
    await expect(
      unwrap(fakeRes(false, 409, { error: "이미 가입된 이메일입니다" })),
    ).rejects.toMatchObject({
      status: 409,
      message: "이미 가입된 이메일입니다",
    });
  });

  it("error 필드가 없으면 기본 메시지", async () => {
    try {
      await unwrap(fakeRes(false, 500, null));
      throw new Error("던지지 않음");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).message).toBe("요청을 처리하지 못했습니다");
    }
  });
});
