<script setup lang="ts">
import { computed } from "vue";
import type { RecoveryInspection } from "~/composables/oxc";
import { useOxc } from "~/composables/oxc";
import { editorCursor, outputHoverRange, recoveryInspectionMode } from "~/composables/state";
import { recoveryInspectionModes, recoverySummary, recoveryTreePathAt } from "~/utils/recovery";
import RecoveryTreeNode from "./RecoveryTreeNode.vue";

const { recoveryInspections } = await useOxc();
const visibleInspections = computed(() => {
  return recoveryInspectionModes(recoveryInspectionMode.value)
    .map((mode) => recoveryInspections.value[mode])
    .filter((inspection): inspection is RecoveryInspection => inspection !== undefined);
});

function highlight(start: number, end: number) {
  outputHoverRange.value = [start, end];
}
</script>

<template>
  <div class="h-full overflow-auto p-4">
    <div class="grid gap-4" :class="visibleInspections.length > 1 ? 'xl:grid-cols-2' : ''">
      <section
        v-for="inspection in visibleInspections"
        :key="inspection.mode"
        :data-recovery-mode="inspection.mode"
        :data-recovery-status="inspection.status"
        class="min-w-0 rounded-md border border-divider p-3"
      >
        <header class="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <strong class="text-sm capitalize">{{ recoverySummary(inspection).mode }}</strong>
          <span class="rounded bg-muted px-2 py-1">{{ recoverySummary(inspection).status }}</span>
          <span>{{ recoverySummary(inspection).statementCount }} statements</span>
          <span>{{ recoverySummary(inspection).recoverySiteCount }} recovery sites</span>
          <span>{{ recoverySummary(inspection).diagnosticCount }} diagnostics</span>
          <span data-recovery-summary="bindings">
            {{ recoverySummary(inspection).bindingCount }} bindings
          </span>
        </header>

        <div v-if="inspection.diagnostics.length" class="mb-3 space-y-1 text-xs text-red-500">
          <button
            v-for="(diagnostic, index) in inspection.diagnostics"
            :key="index"
            type="button"
            class="block text-left hover:underline"
            @mouseenter="
              diagnostic.labels[0] &&
              highlight(diagnostic.labels[0].start, diagnostic.labels[0].end)
            "
            @mouseleave="outputHoverRange = undefined"
            @click="
              diagnostic.labels[0] &&
              highlight(diagnostic.labels[0].start, diagnostic.labels[0].end)
            "
          >
            {{ diagnostic.message }}
            <span v-if="diagnostic.labels[0]">
              [{{ diagnostic.labels[0].start }}, {{ diagnostic.labels[0].end }}]
            </span>
          </button>
        </div>

        <RecoveryTreeNode
          :node="inspection.tree"
          :active-path="recoveryTreePathAt(inspection.tree, editorCursor)"
        />

        <div v-if="inspection.recoverySites.length" class="mt-4 border-t border-divider pt-3">
          <h3 class="mb-1 text-xs font-medium">Recovery sites</h3>
          <button
            v-for="(site, index) in inspection.recoverySites"
            :key="`${site.kind}-${site.start}-${index}`"
            type="button"
            :data-recovery-site-kind="site.kind"
            class="block font-mono text-xs text-red-500 hover:underline"
            @mouseenter="highlight(site.start, site.end)"
            @mouseleave="outputHoverRange = undefined"
            @click="highlight(site.start, site.end)"
          >
            {{ site.kind }} [{{ site.start }}, {{ site.end }}]
            <span class="text-secondary-foreground">under {{ site.parentPath.join(" › ") }}</span>
          </button>
        </div>
      </section>
    </div>
  </div>
</template>
