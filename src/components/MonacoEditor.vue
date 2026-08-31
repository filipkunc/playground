<script lang="ts" setup>
import { useDark } from "@vueuse/core";
import * as monaco from "monaco-editor/editor/editor.api";
import { onBeforeUnmount, onMounted, ref, shallowRef, watch, watchEffect } from "vue";
import { editorCursor, outputHoverRange, outputRevealRange } from "~/composables/state";
import { astLensTagLanes, type AstLensAnnotation } from "~/utils/ast-lens";
import { recoveryDecorationClasses } from "~/utils/recovery";
import { utf8ByteOffsetToUtf16Offset } from "~/utils/tsrs";

defineOptions({ name: "MonacoEditor" });

const props = defineProps<{
  modelValue: string;
  language: string;
  theme?: string;
  options?: monaco.editor.IStandaloneEditorConstructionOptions;
  readonly?: boolean;
  filename: string;
  markers?: monaco.editor.IMarkerData[];
  main?: boolean;
  astAnnotations?: AstLensAnnotation[];
}>();
const emit = defineEmits(["editorWillMount", "editorDidMount", "change", "update:modelValue"]);

const container: any = ref(null);
let instance: monaco.editor.IStandaloneCodeEditor | undefined;
const model = shallowRef<monaco.editor.ITextModel>(initModel());

watchEffect((onCleanup) => {
  const dispose = model.value.onDidChangeContent(() => {
    const value = model.value.getValue();
    emit("update:modelValue", value);
  });
  onCleanup(() => dispose);
});

function initModel() {
  return monaco.editor.createModel(
    props.modelValue,
    props.language,
    monaco.Uri.file(props.filename),
  );
}

const isDark = useDark({
  onChanged(isDark) {
    if (!instance) return;
    monaco.editor.setTheme(isDark ? "vs-dark" : "vs");
  },
});

watch(
  () => props.language,
  () => {
    monaco.editor.setModelLanguage(model.value, props.language);
  },
);

watch(
  () => props.filename,
  () => {
    if (instance) {
      model.value.dispose();
      model.value = initModel();
      instance.setModel(model.value);
    }
  },
);

watch(
  () => props.markers,
  () => {
    if (!instance) return;
    if (props.markers) {
      monaco.editor.setModelMarkers(model.value, "playground", props.markers);
    }
  },
);

function initMonaco() {
  const editorOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
    minimap: { enabled: false },
    fontSize: props.main ? 28 : 14,
    lineHeight: props.main ? 58 : undefined,
    cursorHeight: props.main ? 34 : undefined,
    padding: props.main ? { top: 32, bottom: 48 } : undefined,
    scrollBeyondLastLine: true,
    fixedOverflowWidgets: true,
    fontFamily: `ui-monospace, Menlo, Monaco, "Cascadia Code", "Cascadia Mono", "Segoe UI Mono", "Roboto Mono", "Oxygen Mono", "Ubuntu Monospace", "Source Code Pro","Fira Mono", "Droid Sans Mono", "Courier New", monospace`,
    ...props.options,
    theme: props.theme || (isDark.value ? "vs-dark" : "vs"),
    automaticLayout: true,
    readOnly: props.readonly,
  };

  instance = monaco.editor.create(container.value, editorOptions);
  instance.setModel(model.value);

  emit("editorDidMount", instance);

  if (props.main) {
    editorCursor.value = model.value.getOffsetAt(
      instance.getPosition() ?? { lineNumber: 1, column: 1 },
    );
    instance.onDidChangeCursorPosition((e) => {
      editorCursor.value = model.value.getOffsetAt(e.position);
    });

    let decorationsCollection: monaco.editor.IEditorDecorationsCollection | undefined;

    watchEffect(() => {
      if (outputHoverRange.value) {
        decorationsCollection?.clear();
        const start = model.value.getPositionAt(outputHoverRange.value[0]);
        const end = model.value.getPositionAt(outputHoverRange.value[1]);
        decorationsCollection = instance!.createDecorationsCollection([
          {
            range: monaco.Range.fromPositions(start, end),
            options: { isWholeLine: false, ...recoveryDecorationClasses(outputHoverRange.value) },
          },
        ]);
      } else {
        decorationsCollection?.clear();
      }
    });

    watchEffect(() => {
      if (!outputRevealRange.value) return;
      const start = model.value.getPositionAt(outputRevealRange.value[0]);
      const end = model.value.getPositionAt(outputRevealRange.value[1]);
      instance!.revealRangeInCenterIfOutsideViewport(monaco.Range.fromPositions(start, end));
    });

    const astDecorationsCollection = instance.createDecorationsCollection();
    let astWidgets: monaco.editor.IContentWidget[] = [];

    function clearAstWidgets() {
      for (const widget of astWidgets) instance!.removeContentWidget(widget);
      astWidgets = [];
    }

    watchEffect(() => {
      const annotations = props.astAnnotations ?? [];
      const lastIndex = annotations.length - 1;
      const source = model.value.getValue();
      const sourceByteLength = new TextEncoder().encode(source).length;
      const rendered = annotations.map((annotation, index) => {
        const startByteOffset = Math.max(0, Math.min(annotation.start, sourceByteLength));
        const endByteOffset = Math.max(startByteOffset, Math.min(annotation.end, sourceByteLength));
        const startOffset = utf8ByteOffsetToUtf16Offset(source, startByteOffset);
        const endOffset = utf8ByteOffsetToUtf16Offset(source, endByteOffset);
        const start = model.value.getPositionAt(startOffset);
        const end = model.value.getPositionAt(endOffset);
        const selected = index === lastIndex;
        const selectedClass = selected ? " ast-lens-selected" : "";
        const toneClass = `ast-lens-tone--${annotation.tone}`;
        const zeroWidth = startOffset === endOffset;

        return {
          annotation,
          start,
          decoration: {
            range: monaco.Range.fromPositions(start, end),
            options: {
              stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
              showIfCollapsed: true,
              zIndex: index + 1,
              className: zeroWidth ? "recovery-caret" : undefined,
              beforeContentClassName: zeroWidth ? "recovery-caret-before" : undefined,
              inlineClassName: zeroWidth
                ? undefined
                : `ast-lens-frame ${toneClass}${selectedClass}`,
              hoverMessage: {
                value: `**${annotation.kind}**  \n[${annotation.start}, ${annotation.end}]${annotation.label ? `  \n${annotation.label}` : ""}`,
              },
            },
          } satisfies monaco.editor.IModelDeltaDecoration,
          selectedClass,
          toneClass,
        };
      });

      astDecorationsCollection.set(rendered.map(({ decoration }) => decoration));
      clearAstWidgets();

      const widgetEntries: Array<{
        domNode: HTMLSpanElement;
        start: monaco.Position;
        widget: monaco.editor.IContentWidget;
      }> = [];
      for (const [index, tag] of rendered.entries()) {
        const domNode = document.createElement("span");
        domNode.className = `ast-lens-tag ${tag.toneClass}${tag.selectedClass}`;
        domNode.textContent = `${tag.annotation.icon} ${tag.annotation.shortKind}`;
        domNode.title = `${tag.annotation.kind} [${tag.annotation.start}, ${tag.annotation.end}]`;
        domNode.dataset.astLensKind = tag.annotation.kind;
        domNode.setAttribute("aria-hidden", "true");

        const widget: monaco.editor.IContentWidget = {
          suppressMouseDown: true,
          getId: () => `ast-lens-tag-${index}`,
          getDomNode: () => domNode,
          getPosition: () => ({
            position: tag.start,
            preference: [monaco.editor.ContentWidgetPositionPreference.EXACT],
          }),
        };
        astWidgets.push(widget);
        instance!.addContentWidget(widget);
        widgetEntries.push({ domNode, start: tag.start, widget });
      }

      const sourceCharacterWidth = instance!.getOption(
        monaco.editor.EditorOption.fontInfo,
      ).typicalHalfwidthCharacterWidth;
      const lanes = astLensTagLanes(
        widgetEntries.map(({ domNode, start }) => ({
          line: start.lineNumber,
          left:
            instance!.getScrolledVisiblePosition(start)?.left ??
            (start.column - 1) * sourceCharacterWidth,
          width:
            domNode.getBoundingClientRect().width ||
            Array.from(domNode.textContent ?? "").length * 6.2 + 8,
        })),
      );
      for (const [index, { domNode, widget }] of widgetEntries.entries()) {
        domNode.style.setProperty("--ast-lens-tag-lane", String(lanes[index] ?? 0));
        instance!.layoutContentWidget(widget);
      }
    });
  }
}

onMounted(() => {
  initMonaco();
});

onBeforeUnmount(() => {
  model.value.dispose();
  instance?.dispose();
});

const getPositionAt = (offset: number) => model.value.getPositionAt(offset);
defineExpose({
  getPositionAt,
});
</script>

<template>
  <div ref="container" :class="['h-full w-full', main && 'ast-lens-editor']" />
</template>
