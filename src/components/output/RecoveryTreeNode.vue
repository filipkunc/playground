<script setup lang="ts">
import type { RecoveryInspectionNode } from "~/composables/oxc";
import { editorValue, outputHoverRange } from "~/composables/state";
import { tsrsRangeToMonacoRange } from "~/utils/tsrs";

defineOptions({ name: "RecoveryTreeNode" });
defineProps<{
  node: RecoveryInspectionNode;
  activePath: RecoveryInspectionNode[];
}>();

function highlight(node: RecoveryInspectionNode) {
  outputHoverRange.value = tsrsRangeToMonacoRange(editorValue.value, node);
}
</script>

<template>
  <details
    v-if="node.children.length"
    :open="activePath.includes(node)"
    class="ml-3 border-l border-divider pl-2"
  >
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
  <div
    v-else
    :data-recovery-kind="node.kind"
    :data-recovered="node.recovered || undefined"
    data-recovery-leaf="true"
    class="ml-3 border-l border-divider pl-2 font-mono text-xs"
    :class="node.recovered ? 'text-red-500' : 'text-foreground'"
    @mouseenter="highlight(node)"
    @mouseleave="outputHoverRange = undefined"
    @click="highlight(node)"
  >
    <span
      aria-hidden="true"
      data-recovery-leaf-marker
      class="mr-1 inline-block size-1.5 rounded-[1px] bg-current align-middle opacity-60"
    />
    {{ node.kind }}<span v-if="node.label">({{ node.label }})</span>
    <span class="text-secondary-foreground"> [{{ node.start }}, {{ node.end }}]</span>
    <span v-if="node.recovered" class="ml-1 rounded bg-red-500/15 px-1">recovered</span>
  </div>
</template>
