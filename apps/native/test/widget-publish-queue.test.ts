import { describe, expect, it } from "vitest";
import { createWidgetPublishQueue } from "../src/widgets/publish-queue";

describe("widget publication ordering", () => {
  it("clears after an in-flight write and skips queued account data on logout", async () => {
    const writes: string[] = [];
    let finish!: () => void;
    const started = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const queue = createWidgetPublishQueue();
    const first = queue.publish(true, async () => {
      await started;
      writes.push("old");
    });
    await Promise.resolve();
    const pending = queue.publish(true, async () => {
      writes.push("stale");
    });
    const logout = queue.reset(false, async () => {
      writes.push("clear");
    });
    const late = queue.publish(true, async () => {
      writes.push("late");
    });
    finish();
    await Promise.all([first, pending, logout, late]);
    expect(writes).toEqual(["old", "clear"]);
  });
  it("permits placeholders while signed out and resumes for a new account", async () => {
    const writes: string[] = [];
    const queue = createWidgetPublishQueue();
    await queue.reset(false, async () => {});
    await queue.publish(false, async () => {
      writes.push("signedOut");
    });
    await queue.reset(true, async () => {
      writes.push("clear");
    });
    await queue.publish(true, async () => {
      writes.push("new account");
    });
    expect(writes).toEqual(["signedOut", "clear", "new account"]);
  });
  it("propagates failures but does not poison later clears or publications", async () => {
    const queue = createWidgetPublishQueue();
    await expect(
      queue.publish(true, async () => {
        throw new Error("disk");
      }),
    ).rejects.toThrow("disk");
    let cleared = false;
    await queue.reset(false, async () => {
      cleared = true;
    });
    expect(cleared).toBe(true);
  });
});
