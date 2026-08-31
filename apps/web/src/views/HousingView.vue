<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { useI18n } from "vue-i18n";
import type { AccommodationKind } from "@stablemanager/shared";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import type { Accommodation, Horse } from "@/types/api";

const { t } = useI18n();
const auth = useAuthStore();

const accommodations = ref<Accommodation[]>([]);
const horses = ref<Horse[]>([]);
const loading = ref(true);
const error = ref("");
const saving = ref(false);
const showAccommodationForm = ref(false);
const editing = ref<Accommodation | null>(null);

const accommodationForm = ref({
  name: "",
  kind: "box" as AccommodationKind,
  capacity: "" as string | number,
  notes: "",
});

const editForm = ref({
  name: "",
  capacity: "" as string | number,
  notes: "",
});

const needsCapacity = computed(() => accommodationForm.value.kind !== "box");
const capacityMin = computed(() =>
  accommodationForm.value.kind === "paddock_box" ? 2 : 1,
);
const editNeedsCapacity = computed(
  () => editing.value != null && editing.value.kind !== "box",
);
const editCapacityMin = computed(() =>
  editing.value?.kind === "paddock_box" ? 2 : 1,
);

function horsesIn(accommodationId: string) {
  return horses.value.filter((h) => h.accommodationId === accommodationId);
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const [a, h] = await Promise.all([
      api<{ accommodations: Accommodation[] }>("/api/housing/accommodations"),
      api<{ horses: Horse[] }>("/api/horses"),
    ]);
    accommodations.value = a.accommodations;
    horses.value = h.horses;
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    loading.value = false;
  }
}

async function createAccommodation() {
  saving.value = true;
  error.value = "";
  try {
    const capacity =
      accommodationForm.value.kind === "box"
        ? 1
        : accommodationForm.value.capacity === ""
          ? null
          : Number(accommodationForm.value.capacity);
    await api("/api/housing/accommodations", {
      method: "POST",
      body: JSON.stringify({
        name: accommodationForm.value.name,
        kind: accommodationForm.value.kind,
        capacity: Number.isFinite(capacity) ? capacity : null,
        notes: accommodationForm.value.notes.trim() || null,
      }),
    });
    accommodationForm.value = { name: "", kind: "box", capacity: "", notes: "" };
    showAccommodationForm.value = false;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    saving.value = false;
  }
}

function openEdit(row: Accommodation) {
  editing.value = row;
  editForm.value = {
    name: row.name,
    capacity: row.capacity ?? "",
    notes: row.notes ?? "",
  };
}

function closeEdit() {
  editing.value = null;
}

async function saveEdit() {
  if (!editing.value) return;
  saving.value = true;
  error.value = "";
  try {
    const capacity =
      editing.value.kind === "box"
        ? 1
        : editForm.value.capacity === ""
          ? null
          : Number(editForm.value.capacity);
    await api(`/api/housing/accommodations/${editing.value.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: editForm.value.name.trim(),
        capacity: Number.isFinite(capacity as number) ? capacity : null,
        notes: editForm.value.notes.trim() || null,
      }),
    });
    closeEdit();
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    saving.value = false;
  }
}

async function deleteAccommodation(id: string) {
  if (!confirm(t("common.confirmDelete"))) return;
  try {
    await api(`/api/housing/accommodations/${id}`, { method: "DELETE" });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  }
}

function capacityLabel(row: Accommodation) {
  if (row.kind === "box") return "1";
  return row.capacity != null ? String(row.capacity) : "—";
}

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-xl font-semibold text-brand-800">{{ t("housing.title") }}</h1>
    <p v-if="loading" class="text-sm text-stone-500">{{ t("common.loading") }}</p>
    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

    <section class="space-y-3">
      <div class="flex items-center justify-between">
        <h2 class="font-medium text-stone-800">{{ t("housing.accommodations") }}</h2>
        <button
          v-if="auth.canWrite"
          type="button"
          class="btn-primary"
          @click="showAccommodationForm = !showAccommodationForm"
        >
          {{ t("housing.addAccommodation") }}
        </button>
      </div>

      <form
        v-if="showAccommodationForm"
        class="space-y-3 rounded-2xl border border-stone-200 bg-white p-4"
        @submit.prevent="createAccommodation"
      >
        <label class="block text-sm font-medium">
          {{ t("housing.accommodationName") }}
          <input v-model="accommodationForm.name" required class="field" />
        </label>
        <label class="block text-sm font-medium">
          {{ t("housing.kind") }}
          <select v-model="accommodationForm.kind" class="field">
            <option value="box">{{ t("accommodationKind.box") }}</option>
            <option value="paddock_box">{{ t("accommodationKind.paddock_box") }}</option>
            <option value="paddock">{{ t("accommodationKind.paddock") }}</option>
            <option value="pasture">{{ t("accommodationKind.pasture") }}</option>
          </select>
        </label>
        <label v-if="needsCapacity" class="block text-sm font-medium">
          {{ t("housing.capacity") }}
          <input
            v-model="accommodationForm.capacity"
            type="number"
            :min="capacityMin"
            max="200"
            :required="accommodationForm.kind === 'paddock_box'"
            class="field"
          />
        </label>
        <label class="block text-sm font-medium">
          {{ t("housing.notes") }}
          <textarea v-model="accommodationForm.notes" rows="2" class="field" />
        </label>
        <div class="flex gap-2">
          <button
            type="button"
            class="btn-ghost flex-1"
            @click="showAccommodationForm = false"
          >
            {{ t("common.cancel") }}
          </button>
          <button type="submit" class="btn-primary flex-1" :disabled="saving">
            {{ t("common.create") }}
          </button>
        </div>
      </form>

      <ul class="divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white">
        <li
          v-for="row in accommodations"
          :key="row.id"
          class="px-4 py-3"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="font-medium">{{ row.name }}</p>
              <p class="text-xs text-stone-500">
                {{ t(`accommodationKind.${row.kind}`) }}
                · {{ t("housing.occupied") }}:
                {{ horsesIn(row.id).length }}
                /
                {{ capacityLabel(row) }}
              </p>
              <p v-if="row.notes" class="text-xs text-stone-500">{{ row.notes }}</p>
              <p class="mt-2 text-xs font-medium text-stone-600">
                {{ t("housing.currentHerd") }}
              </p>
              <p
                v-if="horsesIn(row.id).length"
                class="text-sm text-stone-800"
              >
                <template v-for="(h, i) in horsesIn(row.id)" :key="h.id">
                  <RouterLink
                    :to="`/horses/${h.id}`"
                    class="text-brand-700 hover:underline"
                  >{{ h.name }}</RouterLink><span v-if="i < horsesIn(row.id).length - 1">, </span>
                </template>
              </p>
              <p v-else class="text-sm text-stone-400">{{ t("housing.emptyHerd") }}</p>
            </div>
            <div class="flex shrink-0 flex-col items-end gap-2">
              <button
                v-if="auth.canWrite"
                type="button"
                class="text-sm text-brand-700"
                @click="openEdit(row)"
              >
                {{ t("common.edit") }}
              </button>
              <button
                v-if="auth.canWrite"
                type="button"
                class="text-sm text-red-600"
                @click="deleteAccommodation(row.id)"
              >
                {{ t("common.delete") }}
              </button>
            </div>
          </div>
        </li>
        <li v-if="!accommodations.length" class="px-4 py-3 text-sm text-stone-500">
          {{ t("common.empty") }}
        </li>
      </ul>
    </section>

    <div
      v-if="editing"
      class="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      @click.self="closeEdit"
    >
      <form
        class="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        @submit.prevent="saveEdit"
      >
        <h2 class="text-lg font-semibold text-brand-800">
          {{ t("housing.editAccommodation") }}
        </h2>
        <p class="mt-1 text-sm text-stone-500">
          {{ t(`accommodationKind.${editing.kind}`) }}
        </p>
        <div class="mt-4 grid gap-3">
          <label class="text-sm font-medium">
            {{ t("housing.accommodationName") }}
            <input v-model="editForm.name" required class="field mt-1" />
          </label>
          <label v-if="editNeedsCapacity" class="text-sm font-medium">
            {{ t("housing.capacity") }}
            <input
              v-model="editForm.capacity"
              type="number"
              :min="editCapacityMin"
              max="200"
              :required="editing.kind === 'paddock_box'"
              class="field mt-1"
            />
          </label>
          <label class="text-sm font-medium">
            {{ t("housing.notes") }}
            <textarea v-model="editForm.notes" rows="3" class="field mt-1" />
          </label>
        </div>
        <div class="mt-5 flex gap-2">
          <button type="button" class="btn-ghost flex-1" @click="closeEdit">
            {{ t("common.cancel") }}
          </button>
          <button type="submit" class="btn-primary flex-1" :disabled="saving">
            {{ saving ? t("common.loading") : t("common.save") }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
