/** Serializes native writes and invalidates pending account data at session boundaries. */
export function createWidgetPublishQueue() {
  let tail = Promise.resolve();
  let generation = 0;
  let authenticated = true; // Restored sessions may publish before a session-change event.
  function enqueue(write: () => Promise<void>): Promise<void> {
    const result = tail.then(write);
    tail = result.catch(() => {});
    return result;
  }
  return {
    publish(ready: boolean, write: () => Promise<void>): Promise<void> {
      const submitted = generation;
      return enqueue(async () => {
        if (submitted !== generation || (ready && !authenticated)) return;
        await write();
      });
    },
    reset(
      nextAuthenticated: boolean,
      clear: () => Promise<void>,
    ): Promise<void> {
      generation += 1;
      authenticated = nextAuthenticated;
      return enqueue(clear);
    },
  };
}
