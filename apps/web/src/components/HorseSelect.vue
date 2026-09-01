<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { Horse } from "@/types/api";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    horses: Horse[];
    required?: boolean;
    includeAll?: boolean;
    allLabel?: string;
  }>(),
  { required: false, includeAll: false, allLabel: "" },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  change: [];
}>();
const { t } = useI18n();
const search = ref("");
const open = ref(false);
const activeIndex = ref(0);
const listId = `horse-list-${Math.random().toString(36).slice(2)}`;
const filteredHorses = computed(() => {
  const term = search.value.trim().toLocaleLowerCase("de");
  return term
    ? props.horses.filter((horse) => horse.name.toLocaleLowerCase("de").includes(term))
    : props.horses;
});

function selectedName() {
  return props.horses.find((horse) => horse.id === props.modelValue)?.name ?? "";
}

watch(
  [() => props.modelValue, () => props.horses],
  () => {
    if (!open.value) search.value = selectedName();
  },
  { immediate: true },
);

function choose(value: string) {
  emit("update:modelValue", value);
  emit("change");
  search.value = value
    ? props.horses.find((horse) => horse.id === value)?.name ?? ""
    : props.allLabel;
  open.value = false;
}

function onKeydown(event: KeyboardEvent) {
  const options = [...(props.includeAll ? [""] : []), ...filteredHorses.value.map((horse) => horse.id)];
  if (event.key === "Escape") { open.value = false; return; }
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault(); open.value = true;
    activeIndex.value = Math.max(0, Math.min(options.length - 1, activeIndex.value + (event.key === "ArrowDown" ? 1 : -1)));
  }
  const activeOption = options[activeIndex.value];
  if (event.key === "Enter" && open.value && activeOption !== undefined) { event.preventDefault(); choose(activeOption); }
}

function close() {
  window.setTimeout(() => {
    open.value = false;
    search.value = props.modelValue ? selectedName() : props.allLabel;
  }, 150);
}
</script>

<template>
  <div class="relative mt-1">
    <input
      v-model="search"
      type="search"
      class="field"
      :required="required && !modelValue"
      :placeholder="t('horses.search')"
      role="combobox"
      :aria-expanded="open"
      :aria-controls="listId"
      autocomplete="off"
      @focus="open = true"
      @input="open = true"
      @blur="close"
      @keydown="onKeydown"
    />
    <ul
      v-if="open"
      class="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
      role="listbox"
      :id="listId"
    >
      <li v-if="includeAll">
        <button type="button" class="w-full px-3 py-2 text-left text-sm hover:bg-brand-50" role="option" @mousedown.prevent="choose('')">
          {{ allLabel }}
        </button>
      </li>
      <li v-for="horse in filteredHorses" :key="horse.id">
        <button type="button" class="w-full px-3 py-2 text-left text-sm hover:bg-brand-50" role="option" @mousedown.prevent="choose(horse.id)">
          {{ horse.name }}
        </button>
      </li>
      <li v-if="!filteredHorses.length" class="px-3 py-2 text-sm text-stone-500">
        {{ t("common.empty") }}
      </li>
    </ul>
  </div>
</template>
