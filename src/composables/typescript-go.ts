import { createGlobalState } from "@vueuse/core";
import { ref, shallowRef, watch } from "vue";
import type { RecoveryInspection } from "~/composables/oxc";
import { useOxc } from "~/composables/oxc";
import { activeTab, editorValue } from "~/composables/state";

export type TypeScriptGoReferenceStatus = "loading" | "available" | "unavailable";

const RETRY_DELAY_MS = 1_000;
const MAX_STARTUP_RETRIES = 300;

class ReferenceUnavailableError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export const useTypeScriptGo = createGlobalState(async () => {
  const { options } = await useOxc();
  const inspection = shallowRef<RecoveryInspection>();
  const status = ref<TypeScriptGoReferenceStatus>("loading");
  const error = shallowRef<unknown>();
  let controller: AbortController | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retries = 0;
  let requestVersion = 0;

  function clearRetry() {
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    retryTimer = undefined;
  }

  async function inspect(resetRetries = true) {
    if (activeTab.value !== "recovery") {
      clearRetry();
      controller?.abort();
      return;
    }
    if (resetRetries) retries = 0;
    clearRetry();
    controller?.abort();
    controller = new AbortController();
    const version = ++requestVersion;
    status.value = "loading";

    try {
      const response = await fetch("/api/typescript-go/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: `test.${options.value.parser.extension}`,
          source: editorValue.value,
        }),
        signal: controller.signal,
      });
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
        throw new ReferenceUnavailableError(
          `TypeScript-Go reference returned HTTP ${response.status}`,
          response.status >= 500,
        );
      }
      const result = (await response.json()) as RecoveryInspection;
      if (version !== requestVersion) return;
      inspection.value = result;
      status.value = "available";
      error.value = undefined;
    } catch (caughtError) {
      if (controller.signal.aborted || version !== requestVersion) return;
      inspection.value = undefined;
      error.value = caughtError;
      const retryable =
        !(caughtError instanceof ReferenceUnavailableError) || caughtError.retryable;
      if (retryable && retries < MAX_STARTUP_RETRIES) {
        status.value = "loading";
        retries += 1;
        retryTimer = setTimeout(() => void inspect(false), RETRY_DELAY_MS);
      } else {
        status.value = "unavailable";
      }
    }
  }

  watch([editorValue, () => options.value.parser.extension, activeTab], () => void inspect(), {
    immediate: true,
  });

  return { inspection, status, error, inspect };
});
