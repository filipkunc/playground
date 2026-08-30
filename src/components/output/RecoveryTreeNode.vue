<script setup lang="ts">
import type { RecoveryInspectionNode } from "~/composables/oxc";
import { outputHoverRange } from "~/composables/state";

defineOptions({ name: "RecoveryTreeNode" });
defineProps<{ node: RecoveryInspectionNode; activePath: RecoveryInspectionNode[] }>();

function highlight(node: RecoveryInspectionNode) {
  outputHoverRange.value = [node.start, node.end];
}
</script>

<template>
  <details :open="activePath.includes(node)" class="ml-3 border-l border-divider pl-2">
    <summary
      :data-recovery-kind="node.kind"
      :data-recovered="node.recovered || undefined"
      class="cursor-pointer font-mono text-xs"
      :class="node.recovered ? 'text-red-500' : 'text-foreground'"
      @mouseenter="highlight(node)"
      @mouseleave="outputHoverRange = undefined"
      @click="highlight(node)"
    >
      {{ node.kind }}<span v-if="node.label">({{ node.label }})</span>
      <span class="text-secondary-foreground"> [{{ node.start }}, {{ node.end }}]</span>
      <span v-if="node.recovered" class="ml-1 rounded bg-red-500/15 px-1">recovered</span>
    </summary>
    <RecoveryTreeNode
      v-for="(child, index) in node.children"
      :key="index"
      :node="child"
      :active-path="activePath"
    />
  </details>
</template>
