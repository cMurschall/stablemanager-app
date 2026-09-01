<script setup lang="ts">
import { onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { useI18n } from "vue-i18n";
import type { HorseSex } from "@stablemanager/shared";
import { api } from "@/lib/api";
import { parseFeifId } from "@/lib/feif";
import { useAuthStore } from "@/stores/auth";
import type { Accommodation, Horse, Member } from "@/types/api";

const { t } = useI18n();
const auth = useAuthStore();

const horses = ref<Horse[]>([]);
const accommodations = ref<Accommodation[]>([]);
const members = ref<Member[]>([]);
const loading = ref(true);
const error = ref("");
const showForm = ref(false);
const saving = ref(false);

const form = ref({
  name: "",
  feifId: "",
  sex: "" as "" | HorseSex,
  birthYear: "" as string | number,
  ownerUserIds: [] as string[],
  accommodationId: "",
  notes: "",
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
    if (auth.canWrite) {
      try {
        const m = await api<{ members: Member[] }>("/api/tenants/members");
        members.value = m.members;
      } catch {
        members.value = [];
      }
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  form.value = {
    name: "",
    feifId: "",
    sex: "",
    birthYear: "",
    ownerUserIds: [],
    accommodationId: "",
    notes: "",
  };
  showForm.value = true;
}

/** Prefill birth year + sex from FEIF-ID; keep gelding if user already chose it */
function onFeifIdInput() {
  const parsed = parseFeifId(form.value.feifId);
  if (!parsed) return;
  form.value.feifId = parsed.feifId;
  form.value.birthYear = parsed.birthYear;
  if (form.value.sex !== "gelding") {
    form.value.sex = parsed.sex;
  }
}

async function createHorse() {
  saving.value = true;
  error.value = "";
  try {
    const birthYear =
      form.value.birthYear === "" ? null : Number(form.value.birthYear);
    await api("/api/horses", {
      method: "POST",
      body: JSON.stringify({
        name: form.value.name,
        feifId: form.value.feifId.trim() || null,
        sex: form.value.sex || null,
        birthYear: Number.isFinite(birthYear) ? birthYear : null,
        ownerUserIds: form.value.ownerUserIds,
        accommodationId: form.value.accommodationId || null,
        notes: form.value.notes.trim() || null,
      }),
    });
    showForm.value = false;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    saving.value = false;
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
    <div class="flex items-center justify-between gap-3">
      <h1 class="text-xl font-semibold text-brand-800">{{ t("horses.title") }}</h1>
      <button
        v-if="auth.canWrite"
        type="button"
        class="btn-primary"
        @click="openCreate"
      >
        {{ t("horses.new") }}
      </button>
    </div>

    <p v-if="loading" class="text-sm text-stone-500">{{ t("common.loading") }}</p>
    <p v-else-if="error" class="text-sm text-red-600">{{ error }}</p>

    <ul
      v-else-if="horses.length"
      class="divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white"
    >
      <li v-for="horse in horses" :key="horse.id">
        <RouterLink
          :to="`/horses/${horse.id}`"
          class="flex items-center justify-between gap-3 px-4 py-3 hover:bg-brand-50/60"
        >
          <div>
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
    <p v-else class="text-sm text-stone-500">{{ t("horses.none") }}</p>

    <div
      v-if="showForm"
      class="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      @click.self="showForm = false"
    >
      <form
        class="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        @submit.prevent="createHorse"
      >
        <h2 class="text-lg font-semibold text-brand-800">{{ t("horses.new") }}</h2>
        <div class="mt-4 grid gap-3">
          <label class="text-sm font-medium">
            {{ t("horses.feifId") }}
            <input
              v-model="form.feifId"
              class="field"
              placeholder="DE2017222618"
              pattern="[A-Za-z]{2}\d{8,12}"
              @input="onFeifIdInput"
              @blur="onFeifIdInput"
            />
            <span class="mt-1 block text-xs font-normal text-stone-500">
              {{ t("horses.feifHint") }}
            </span>
          </label>
          <label class="text-sm font-medium">
            {{ t("horses.name") }}
            <input v-model="form.name" required class="field" />
          </label>
          <label class="text-sm font-medium">
            {{ t("horses.sex") }}
            <select v-model="form.sex" class="field">
              <option value="">—</option>
              <option value="mare">{{ t("sex.mare") }}</option>
              <option value="stallion">{{ t("sex.stallion") }}</option>
              <option value="gelding">{{ t("sex.gelding") }}</option>
            </select>
          </label>
          <label class="text-sm font-medium">
            {{ t("horses.birthYear") }}
            <input
              v-model="form.birthYear"
              type="number"
              min="1980"
              max="2100"
              class="field"
            />
          </label>
          <label class="text-sm font-medium">
            {{ t("horses.owner") }}
            <select v-model="form.ownerUserIds" multiple class="field min-h-28">
              <option v-for="m in members" :key="m.userId" :value="m.userId">
                {{ m.name }} ({{ m.email }})
              </option>
            </select>
          </label>
          <label class="text-sm font-medium">
            {{ t("horses.accommodation") }}
            <select v-model="form.accommodationId" class="field">
              <option value="">—</option>
              <option v-for="s in accommodations" :key="s.id" :value="s.id">
                {{ s.name }} ({{ t(`accommodationKind.${s.kind}`) }})
              </option>
            </select>
          </label>
          <label class="text-sm font-medium">
            {{ t("horses.notes") }}
            <textarea v-model="form.notes" rows="3" class="field" />
          </label>
        </div>
        <div class="mt-5 flex gap-2">
          <button type="button" class="btn-ghost flex-1" @click="showForm = false">
            {{ t("common.cancel") }}
          </button>
          <button type="submit" class="btn-primary flex-1" :disabled="saving">
            {{ saving ? t("common.loading") : t("common.create") }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
