<script setup lang="ts">
import { computed } from "vue";
import type { PlaygroundDiagnostic } from "tsrs-playground";
import { useTsrs } from "~/composables/tsrs";
import { editorValue, outputHoverRange, outputRevealRange } from "~/composables/state";
import { tsrsRangeToMonacoRange } from "~/utils/tsrs";

const { diagnostics, error } = await useTsrs();
const errorMessage = computed(() =>
  error.value instanceof Error ? error.value.message : String(error.value ?? ""),
);

function highlight(diagnostic: PlaygroundDiagnostic) {
  if (!diagnostic.range) return;
  outputHoverRange.value = tsrsRangeToMonacoRange(editorValue.value, diagnostic.range);
}

function reveal(diagnostic: PlaygroundDiagnostic) {
  if (!diagnostic.range) return;
  const range = tsrsRangeToMonacoRange(editorValue.value, diagnostic.range);
  outputHoverRange.value = range;
  outputRevealRange.value = range;
}
</script>

<template>
  <div data-tsrs-panel class="h-full overflow-auto p-4">
    <section class="rounded-md border border-divider p-4">
      <header class="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <strong class="text-sm">tsrs type checker</strong>
        <span class="rounded bg-muted px-2 py-1">{{ diagnostics.length }} diagnostics</span>
        <span class="text-secondary-foreground">UTF-8 byte ranges from check_source</span>
      </header>

      <p v-if="error" data-tsrs-error class="text-sm text-red-500">
        {{ errorMessage }}
      </p>
      <p v-else-if="diagnostics.length === 0" data-tsrs-clean class="text-sm text-green-600">
        No diagnostics in the currently supported tsrs subset.
      </p>
      <ol v-else class="space-y-2">
        <li v-for="(diagnostic, index) in diagnostics" :key="`${diagnostic.code}-${index}`">
          <button
            type="button"
            :data-tsrs-diagnostic="diagnostic.code"
            class="block w-full rounded border border-divider p-3 text-left text-sm hover:bg-muted"
            @mouseenter="highlight(diagnostic)"
            @mouseleave="outputHoverRange = undefined"
            @click="reveal(diagnostic)"
          >
            <span class="font-mono text-red-500">{{ diagnostic.code }}</span>
            <span class="ml-2 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              {{ diagnostic.phase }}
            </span>
            <span class="mt-1 block">{{ diagnostic.message }}</span>
            <span v-if="diagnostic.range" class="mt-1 block font-mono text-xs opacity-70">
              bytes [{{ diagnostic.range.start }}, {{ diagnostic.range.end }}]
            </span>
          </button>
        </li>
      </ol>
    </section>
  </div>
</template>
