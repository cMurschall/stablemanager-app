<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { useI18n } from "vue-i18n";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import type { Accommodation, Horse } from "@/types/api";

const { t } = useI18n();
const auth = useAuthStore();

const horses = ref<Horse[]>([]);
const accommodations = ref<Accommodation[]>([]);
const loading = ref(true);
const error = ref("");
const search = ref("");
const filterAccommodationId = ref("");
const groupBy = ref<"" | "accommodation" | "sex" | "birthYear">("");

const filteredHorses = computed(() => {
  const term = search.value.trim().toLocaleLowerCase("de");
  return horses.value.filter(
    (horse) =>
      (!term || horse.name.toLocaleLowerCase("de").includes(term)) &&
      (!filterAccommodationId.value ||
        horse.accommodationId === filterAccommodationId.value),
  );
});

type HorseGroup = {
  id: string | null;
  label: string;
  sortKey: string;
  horses: Horse[];
};

const sexOrder: Record<string, number> = {
  mare: 0,
  stallion: 1,
  gelding: 2,
  unknown: 3,
};

function groupKeyAndLabel(horse: Horse): { key: string; label: string; sortKey: string } {
  if (groupBy.value === "sex") {
    const sex = horse.sex ?? "unknown";
    return {
      key: sex,
      label: horse.sex ? t(`sex.${horse.sex}`) : t("horses.groupUnknownSex"),
      sortKey: String(sexOrder[sex] ?? 9),
    };
  }
  if (groupBy.value === "birthYear") {
    if (horse.birthYear == null) {
      return {
        key: "unknown",
        label: t("horses.groupUnknownBirthYear"),
        sortKey: "9999",
      };
    }
    return {
      key: String(horse.birthYear),
      label: String(horse.birthYear),
      sortKey: String(10000 - horse.birthYear),
    };
  }
  const id = horse.accommodationId;
  return {
    key: id ?? "unassigned",
    label: id
      ? accommodationLabel(id)
      : t("horses.accommodationHistoryUnassigned"),
    sortKey: id
      ? accommodationLabel(id)
      : t("horses.accommodationHistoryUnassigned"),
  };
}

const horseGroups = computed((): HorseGroup[] => {
  if (!groupBy.value) return [];
  const groups = new Map<string, HorseGroup>();
  for (const horse of filteredHorses.value) {
    const { key, label, sortKey } = groupKeyAndLabel(horse);
    const group =
      groups.get(key) ?? {
        id: key === "unassigned" || key === "unknown" ? null : key,
        label,
        sortKey,
        horses: [],
      };
    group.horses.push(horse);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    group.horses.sort((a, b) => a.name.localeCompare(b.name, "de"));
  }
  return [...groups.values()].sort(
    (a, b) =>
      a.sortKey.localeCompare(b.sortKey, "de", { numeric: true }) ||
      a.label.localeCompare(b.label, "de"),
  );
});

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const [h, a] = await Promise.all([
      api<{ horses: Horse[] }>("/api/horses"),
      api<{ accommodations: Accommodation[] }>("/api/housing/accommodations"),
    ]);
    horses.value = h.horses;
    accommodations.value = a.accommodations;
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    loading.value = false;
  }
}

function accommodationLabel(id: string | null) {
  if (!id) return "—";
  const row = accommodations.value.find((s) => s.id === id);
  if (!row) return "—";
  return `${row.name} (${t(`accommodationKind.${row.kind}`)})`;
}

onMounted(load);
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <h1 class="text-xl font-semibold text-brand-800">
        {{ auth.currentRole === "boarder" ? t("horses.myHorses") : t("horses.title") }}
      </h1>
      <RouterLink
        v-if="auth.isAdmin"
        to="/hof?tab=horses"
        class="btn-ghost"
      >
        {{ t("nav.hof") }}
      </RouterLink>
    </div>

    <section
      class="groupbox grid gap-3"
      :class="
        auth.currentRole !== 'boarder'
          ? 'sm:grid-cols-2 lg:grid-cols-3'
          : 'sm:grid-cols-1'
      "
    >
      <label
        v-if="auth.currentRole !== 'boarder'"
        class="text-sm font-medium text-stone-700"
      >
        {{ t("horses.filterName") }}
        <input
          v-model="search"
          class="field mt-1"
          :placeholder="t('horses.filterNamePlaceholder')"
        />
      </label>
      <label
        v-if="auth.currentRole !== 'boarder'"
        class="text-sm font-medium text-stone-700"
      >
        {{ t("horses.filterAccommodation") }}
        <select v-model="filterAccommodationId" class="field mt-1">
          <option value="">{{ t("horses.allAccommodations") }}</option>
          <option
            v-for="accommodation in accommodations"
            :key="accommodation.id"
            :value="accommodation.id"
          >
            {{ accommodationLabel(accommodation.id) }}
          </option>
        </select>
      </label>
      <label class="text-sm font-medium text-stone-700">
        {{ t("horses.groupBy") }}
        <select v-model="groupBy" class="field mt-1">
          <option value="">{{ t("horses.groupByNone") }}</option>
          <option value="accommodation">
            {{ t("horses.groupByAccommodation") }}
          </option>
          <option value="sex">{{ t("horses.groupBySex") }}</option>
          <option value="birthYear">{{ t("horses.groupByBirthYear") }}</option>
        </select>
      </label>
    </section>

    <p v-if="loading" class="text-sm text-stone-500">{{ t("common.loading") }}</p>
    <p v-else-if="error" class="text-sm text-red-600">{{ error }}</p>

    <ul
      v-else-if="filteredHorses.length && !groupBy"
      class="divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white"
    >
      <li v-for="horse in filteredHorses" :key="horse.id">
        <RouterLink
          :to="`/horses/${horse.id}`"
          class="flex items-center justify-between gap-3 px-4 py-3 hover:bg-brand-50/60"
        >
          <div class="min-w-0">
            <p class="font-medium text-stone-900">{{ horse.name }}</p>
            <p class="text-xs text-stone-500">
              <span v-if="horse.feifId">{{ horse.feifId }} · </span>
              <span v-if="horse.sex">{{ t(`sex.${horse.sex}`) }} · </span>
              {{ accommodationLabel(horse.accommodationId) }}
            </p>
          </div>
          <span class="text-stone-400">›</span>
        </RouterLink>
      </li>
    </ul>
    <section v-else-if="filteredHorses.length" class="space-y-3">
      <article v-for="group in horseGroups" :key="group.id ?? group.label" class="groupbox">
        <div class="flex items-baseline justify-between gap-3">
          <h2 class="groupbox-title">{{ group.label }}</h2>
          <span class="text-xs text-stone-500">{{ t("horses.horsesCount", { n: group.horses.length }) }}</span>
        </div>
        <ul class="divide-y divide-stone-100 rounded-xl border border-stone-100">
          <li v-for="horse in group.horses" :key="horse.id">
            <RouterLink
              :to="`/horses/${horse.id}`"
              class="flex items-center justify-between gap-3 px-3 py-2 hover:bg-brand-50"
            >
              <div class="min-w-0">
                <p class="font-medium text-stone-900">{{ horse.name }}</p>
                <p class="text-xs text-stone-500">
                  <template v-if="groupBy === 'accommodation'">
                    <span v-if="horse.feifId">{{ horse.feifId }}</span>
                    <span v-if="horse.feifId && horse.sex"> · </span>
                    <span v-if="horse.sex">{{ t(`sex.${horse.sex}`) }}</span>
                  </template>
                  <template v-else-if="groupBy === 'sex'">
                    <span v-if="horse.feifId">{{ horse.feifId }} · </span>
                    <span v-if="horse.birthYear">{{ horse.birthYear }} · </span>
                    {{ accommodationLabel(horse.accommodationId) }}
                  </template>
                  <template v-else>
                    <span v-if="horse.feifId">{{ horse.feifId }} · </span>
                    <span v-if="horse.sex">{{ t(`sex.${horse.sex}`) }} · </span>
                    {{ accommodationLabel(horse.accommodationId) }}
                  </template>
                </p>
              </div>
              <span class="text-stone-400">›</span>
            </RouterLink>
          </li>
        </ul>
      </article>
    </section>
    <p v-else-if="horses.length" class="text-sm text-stone-500">
      {{ t("horses.noFilterResults") }}
    </p>
    <p v-else class="text-sm text-stone-500">{{ t("horses.none") }}</p>
  </div>
</template>
