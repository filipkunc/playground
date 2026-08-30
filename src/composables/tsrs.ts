import { createGlobalState } from "@vueuse/core";
import { ref, shallowRef, watch } from "vue";
import type { PlaygroundDiagnostic } from "tsrs-playground";
import { useOxc } from "~/composables/oxc";
import { editorValue } from "~/composables/state";

async function initialize() {
  return import("tsrs-playground");
}

export const loadingTsrs = ref(true);
export const tsrsPromise = initialize().finally(() => (loadingTsrs.value = false));

export const useTsrs = createGlobalState(async () => {
  const tsrs = await tsrsPromise;
  const { options } = await useOxc();
  const diagnostics = shallowRef<PlaygroundDiagnostic[]>([]);
  const error = shallowRef<unknown>();

  function run() {
    try {
      diagnostics.value = tsrs.checkSource(
        `test.${options.value.parser.extension}`,
        editorValue.value,
      );
      error.value = undefined;
    } catch (caughtError) {
      diagnostics.value = [];
      error.value = caughtError;
    }
  }

  watch([editorValue, () => options.value.parser.extension], run, { immediate: true });

  return { diagnostics, error, run };
});
