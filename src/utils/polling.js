async function waitFor(checkFn, options) {
  const timeoutMs = options?.timeoutMs ?? 120000;
  const intervalMs = options?.intervalMs ?? 2000;
  const onRetry = options?.onRetry;

  const startedAt = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = await checkFn();
    if (result) {
      return;
    }

    const elapsed = Date.now() - startedAt;
    if (elapsed >= timeoutMs) {
      throw new Error(`Condition was not met within ${timeoutMs} ms`);
    }

    if (onRetry) {
      onRetry(elapsed);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

module.exports = {
  waitFor
};
