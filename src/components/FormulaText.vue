<script setup lang="ts">
import { computed } from 'vue';
import { ParsedFormula } from '../lib/parser';
import { tokenize } from '../lib/render';

const props = defineProps<{
  raw: string;
  formula: ParsedFormula;
  highlightSpans?: { start: number; end: number }[];
  dim?: boolean;
}>();

const tokens = computed(() => tokenize(props.raw, props.formula));
const spans = computed(() => props.highlightSpans ?? []);

function lit(start: number, end: number): boolean {
  return spans.value.some((s) => start >= s.start && end <= s.end);
}
</script>

<template>
  <span class="formula" :class="{ dim }">
    <template v-for="(t, i) in tokens" :key="i">
      <span
        :class="['tok', t.kind, { lit: lit(t.start, t.end) }]"
      >{{ t.text }}</span>
    </template>
  </span>
</template>
