<script setup lang="ts">
import { Icon } from "@iconify/vue";
import { computed } from "vue";
import type { AstLensAnnotation } from "~/utils/ast-lens";
import { utf8ByteOffsetToUtf16Offset } from "~/utils/tsrs";

const props = defineProps<{
  annotations: AstLensAnnotation[];
  source: string;
  enabled: boolean;
}>();

const emit = defineEmits<{ toggle: [] }>();

const selected = computed(() => props.annotations.at(-1));
const range = computed(() => {
  const node = selected.value;
  if (!node) return "—";
  return node.start === node.end ? `at ${node.start}` : `${node.start}–${node.end}`;
});
function sourceValue(node: AstLensAnnotation) {
  if (node.start === node.end) return "∅";
  const start = utf8ByteOffsetToUtf16Offset(props.source, node.start);
  const end = utf8ByteOffsetToUtf16Offset(props.source, node.end);
  const value = props.source.slice(start, end).replaceAll(/\s+/g, " ");
  return value.length > 36 ? `${value.slice(0, 35)}…` : value;
}
</script>

<template>
  <footer
    class="ast-lens-inspector h-13 min-h-13 flex flex-none items-stretch overflow-hidden border-t border-divider bg-muted/35 font-mono"
    :data-ast-lens-enabled="enabled"
  >
    <div class="ast-lens-breadcrumb-label">
      <span>AST path</span>
      <strong>{{ annotations[0]?.kind ?? (enabled ? "No node" : "Lens disabled") }}</strong>
    </div>

    <nav class="ast-lens-breadcrumb" aria-label="AST path at caret">
      <template
        v-for="(annotation, index) in annotations"
        :key="`${annotation.kind}-${annotation.start}-${annotation.end}-${index}`"
      >
        <span v-if="index" class="ast-lens-breadcrumb-separator" aria-hidden="true">›</span>
        <span
          class="ast-lens-breadcrumb-item"
          :class="[
            `ast-lens-tone--${annotation.tone}`,
            index === annotations.length - 1 && 'ast-lens-selected',
          ]"
          :title="`${annotation.kind} [${annotation.start}, ${annotation.end}] · ${sourceValue(annotation)}`"
        >
          <span aria-hidden="true">{{ annotation.icon }}</span>
          <strong
            :data-ast-lens-selected-kind="
              index === annotations.length - 1 ? annotation.kind : undefined
            "
            >{{ annotation.kind }}</strong
          >
        </span>
      </template>
      <span v-if="annotations.length === 0" class="ast-lens-breadcrumb-empty">
        Move the caret into a source node
      </span>
    </nav>

    <div class="ast-lens-breadcrumb-meta">
      <span>{{ range }}</span>
      <strong>{{ selected ? (selected.recovered ? "recovered" : "source") : "—" }}</strong>
    </div>

    <button
      type="button"
      class="min-w-18 flex flex-none items-center justify-center gap-1 border-l border-divider px-3 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
      :aria-pressed="enabled"
      title="Toggle inline AST lens"
      @click="emit('toggle')"
    >
      <Icon :icon="enabled ? 'ri:focus-3-line' : 'ri:eye-off-line'" class="text-base" />
      <span>AST</span>
    </button>
  </footer>
</template>
