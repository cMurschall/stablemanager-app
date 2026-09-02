<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import type { HorseSex } from "@stablemanager/shared";
import { api } from "@/lib/api";
import { addDays, dayKey, formatDateTime, formatLocalDate, monthKey } from "@/lib/dates";
import { parseFeifId } from "@/lib/feif";
import { useAuthStore } from "@/stores/auth";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import type {
  Accommodation,
  AccommodationHistoryEntry,
  Horse,
  Member,
  TrainingLog,
} from "@/types/api";

const { t } = useI18n();
const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const horse = ref<Horse | null>(null);
const allHorses = ref<Horse[]>([]);
const accommodations = ref<Accommodation[]>([]);
const accommodationHistory = ref<AccommodationHistoryEntry[]>([]);
const trainingLogs = ref<TrainingLog[]>([]);
const members = ref<Member[]>([]);
const loading = ref(true);
const saving = ref(false);
const editing = ref(false);
const moving = ref(false);
const error = ref("");
const confirmDeactivateOpen = ref(false);
const moveAccommodationId = ref("");

const form = ref({
  name: "",
  feifId: "",
  sex: "" as "" | HorseSex,
  birthYear: "" as string | number,
  ownerUserIds: [] as string[],
  accommodationId: "",
  notes: "",
});

const horseId = computed(() => String(route.params.id));

const herdMates = computed(() => {
  if (!horse.value?.accommodationId) return [];
  return allHorses.value.filter(
    (h) =>
      h.accommodationId === horse.value!.accommodationId &&
      h.id !== horse.value!.id,
  );
});

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const to = dayKey(new Date());
    const from = dayKey(addDays(new Date(), -30));
    const [h, a, list, training] = await Promise.all([
      api<{ horse: Horse; accommodationHistory: AccommodationHistoryEntry[] }>(
        `/api/horses/${horseId.value}`,
      ),
      api<{ accommodations: Accommodation[] }>("/api/housing/accommodations"),
      api<{ horses: Horse[] }>("/api/horses"),
      api<{ trainingLogs: TrainingLog[] }>(
        `/api/training-logs?from=${from}&to=${to}&horseId=${horseId.value}`,
      ),
    ]);
    horse.value = h.horse;
    accommodationHistory.value = h.accommodationHistory ?? [];
    accommodations.value = a.accommodations;
    allHorses.value = list.horses;
    trainingLogs.value = [...training.trainingLogs]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10);
    syncForm();
    moveAccommodationId.value = horse.value.accommodationId ?? "";
    if (auth.isAdmin) {
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

function syncForm() {
  if (!horse.value) return;
  form.value = {
    name: horse.value.name,
    feifId: horse.value.feifId ?? "",
    sex: horse.value.sex ?? "",
    birthYear: horse.value.birthYear ?? "",
    ownerUserIds: [...horse.value.ownerUserIds],
    accommodationId: horse.value.accommodationId ?? "",
    notes: horse.value.notes ?? "",
  };
}

/** Prefill birth year + sex from FEIF-ID; keep gelding if already selected */
function onFeifIdInput() {
  const parsed = parseFeifId(form.value.feifId);
  if (!parsed) return;
  form.value.feifId = parsed.feifId;
  form.value.birthYear = parsed.birthYear;
  if (form.value.sex !== "gelding") {
    form.value.sex = parsed.sex;
  }
}

async function save() {
  saving.value = true;
  error.value = "";
  try {
    const birthYear =
      form.value.birthYear === "" ? null : Number(form.value.birthYear);
    const res = await api<{ horse: Horse }>(`/api/horses/${horseId.value}`, {
      method: "PATCH",
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
    horse.value = res.horse;
    editing.value = false;
    moveAccommodationId.value = res.horse.accommodationId ?? "";
    const [list, hist] = await Promise.all([
      api<{ horses: Horse[] }>("/api/horses"),
      api<{ accommodationHistory: AccommodationHistoryEntry[] }>(
        `/api/horses/${horseId.value}/accommodation-history`,
      ),
    ]);
    allHorses.value = list.horses;
    accommodationHistory.value = hist.accommodationHistory ?? [];
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    saving.value = false;
  }
}

async function saveMove() {
  saving.value = true;
  error.value = "";
  try {
    const res = await api<{ horse: Horse }>(`/api/horses/${horseId.value}`, {
      method: "PATCH",
      body: JSON.stringify({
        accommodationId: moveAccommodationId.value || null,
      }),
    });
    horse.value = res.horse;
    moving.value = false;
    syncForm();
    const [list, hist] = await Promise.all([
      api<{ horses: Horse[] }>("/api/horses"),
      api<{ accommodationHistory: AccommodationHistoryEntry[] }>(
        `/api/horses/${horseId.value}/accommodation-history`,
      ),
    ]);
    allHorses.value = list.horses;
    accommodationHistory.value = hist.accommodationHistory ?? [];
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    saving.value = false;
  }
}

async function deactivate() {
  confirmDeactivateOpen.value = false;
  saving.value = true;
  error.value = "";
  try {
    await api(`/api/horses/${horseId.value}`, {
      method: "PATCH",
      body: JSON.stringify({ active: false }),
    });
    router.push({ name: "horses" });
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    saving.value = false;
  }
}

function labelAccommodation(id: string | null) {
  if (!id) return "—";
  const row = accommodations.value.find((s) => s.id === id);
  if (!row) return "—";
  return `${row.name} (${t(`accommodationKind.${row.kind}`)})`;
}

function labelOwners(ids: string[], names?: string[]) {
  if (names?.length) return names.join(", ");
  if (!ids.length) return "—";
  return ids.map((id) => members.value.find((m) => m.userId === id)?.name ?? id).join(", ");
}

function historyLabel(entry: AccommodationHistoryEntry) {
  if (!entry.accommodationId) {
    return t("horses.accommodationHistoryUnassigned");
  }
  if (entry.accommodationName && entry.accommodationKind) {
    return `${entry.accommodationName} (${t(`accommodationKind.${entry.accommodationKind}`)})`;
  }
  return labelAccommodation(entry.accommodationId);
}

onMounted(load);
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-3">
      <button type="button" class="btn-ghost" @click="router.push({ name: 'horses' })">
        ← {{ t("common.back") }}
      </button>
      <div v-if="horse && !editing && !moving" class="flex flex-wrap justify-end gap-2">
        <button
          v-if="auth.canWrite && !auth.isAdmin"
          type="button"
          class="btn-ghost"
          @click="moving = true; moveAccommodationId = horse.accommodationId ?? ''"
        >
          {{ t("horses.move") }}
        </button>
        <template v-if="auth.isAdmin">
          <button type="button" class="btn-ghost" @click="editing = true">
            {{ t("common.edit") }}
          </button>
          <button type="button" class="btn-danger" @click="confirmDeactivateOpen = true">
            {{ t("horses.deactivate") }}
          </button>
        </template>
      </div>
    </div>

    <p v-if="loading" class="text-sm text-stone-500">{{ t("common.loading") }}</p>
    <p v-else-if="error" class="text-sm text-red-600">{{ error }}</p>

    <template v-else-if="horse">
      <h1 class="text-xl font-semibold text-brand-800">
        {{ editing ? t("common.edit") : moving ? t("horses.move") : horse.name }}
      </h1>

      <form
        v-if="editing && auth.isAdmin"
        class="space-y-3 rounded-2xl border border-stone-200 bg-white p-4"
        @submit.prevent="save"
      >
        <label class="block text-sm font-medium">
          {{ t("horses.name") }}
          <input v-model="form.name" required class="field" />
        </label>
        <label class="block text-sm font-medium">
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
        <label class="block text-sm font-medium">
          {{ t("horses.sex") }}
          <select v-model="form.sex" class="field">
            <option value="">—</option>
            <option value="mare">{{ t("sex.mare") }}</option>
            <option value="stallion">{{ t("sex.stallion") }}</option>
            <option value="gelding">{{ t("sex.gelding") }}</option>
          </select>
        </label>
        <label class="block text-sm font-medium">
          {{ t("horses.birthYear") }}
          <input v-model="form.birthYear" type="number" min="1980" max="2100" class="field" />
        </label>
        <fieldset class="text-sm font-medium">
          <legend>{{ t("horses.owner") }}</legend>
          <div class="mt-2 max-h-40 space-y-2 overflow-y-auto rounded-lg border border-stone-200 p-3">
            <label
              v-for="m in members"
              :key="m.userId"
              class="flex items-center gap-2 font-normal"
            >
              <input v-model="form.ownerUserIds" type="checkbox" :value="m.userId" />
              {{ m.name }}
              <span class="text-xs text-stone-500">({{ m.email }})</span>
            </label>
            <p v-if="!members.length" class="text-sm font-normal text-stone-500">
              {{ t("common.empty") }}
            </p>
          </div>
        </fieldset>
        <label class="block text-sm font-medium">
          {{ t("horses.accommodation") }}
          <select v-model="form.accommodationId" class="field">
            <option value="">—</option>
            <option v-for="s in accommodations.filter((row) => row.active || row.id === form.accommodationId)" :key="s.id" :value="s.id">
              {{ s.name }} ({{ t(`accommodationKind.${s.kind}`) }})
            </option>
          </select>
        </label>
        <label class="block text-sm font-medium">
          {{ t("horses.notes") }}
          <textarea v-model="form.notes" rows="3" class="field" />
        </label>
        <div class="flex gap-2 pt-2">
          <button
            type="button"
            class="btn-ghost flex-1"
            @click="editing = false; syncForm()"
          >
            {{ t("common.cancel") }}
          </button>
          <button type="submit" class="btn-primary flex-1" :disabled="saving">
            {{ saving ? t("common.loading") : t("common.save") }}
          </button>
        </div>
      </form>

      <form
        v-else-if="moving && auth.canWrite && !auth.isAdmin"
        class="space-y-3 rounded-2xl border border-stone-200 bg-white p-4"
        @submit.prevent="saveMove"
      >
        <label class="block text-sm font-medium">
          {{ t("horses.accommodation") }}
          <select v-model="moveAccommodationId" class="field">
            <option value="">—</option>
            <option
              v-for="s in accommodations.filter((row) => row.active || row.id === moveAccommodationId)"
              :key="s.id"
              :value="s.id"
            >
              {{ s.name }} ({{ t(`accommodationKind.${s.kind}`) }})
            </option>
          </select>
        </label>
        <div class="flex gap-2 pt-2">
          <button
            type="button"
            class="btn-ghost flex-1"
            @click="moving = false; moveAccommodationId = horse.accommodationId ?? ''"
          >
            {{ t("common.cancel") }}
          </button>
          <button type="submit" class="btn-primary flex-1" :disabled="saving">
            {{ saving ? t("common.loading") : t("horses.moveSave") }}
          </button>
        </div>
      </form>

      <template v-else>
        <dl class="grid gap-3 rounded-2xl border border-stone-200 bg-white p-4 text-sm">
          <div>
            <dt class="text-stone-500">{{ t("horses.feifId") }}</dt>
            <dd class="font-medium">{{ horse.feifId || "—" }}</dd>
          </div>
          <div>
            <dt class="text-stone-500">{{ t("horses.sex") }}</dt>
            <dd class="font-medium">{{ horse.sex ? t(`sex.${horse.sex}`) : "—" }}</dd>
          </div>
          <div>
            <dt class="text-stone-500">{{ t("horses.birthYear") }}</dt>
            <dd class="font-medium">{{ horse.birthYear ?? "—" }}</dd>
          </div>
          <div>
            <dt class="text-stone-500">{{ t("horses.owner") }}</dt>
            <dd class="font-medium">{{ labelOwners(horse.ownerUserIds, horse.ownerNames) }}</dd>
          </div>
          <div>
            <dt class="text-stone-500">{{ t("horses.accommodation") }}</dt>
            <dd class="font-medium">{{ labelAccommodation(horse.accommodationId) }}</dd>
          </div>
          <div>
            <dt class="text-stone-500">{{ t("horses.notes") }}</dt>
            <dd class="whitespace-pre-wrap font-medium">{{ horse.notes || "—" }}</dd>
          </div>
        </dl>

        <section class="rounded-2xl border border-stone-200 bg-white p-4">
          <h2 class="text-sm font-medium text-stone-800">{{ t("horses.herdMates") }}</h2>
          <p class="mt-1 text-xs text-stone-500">{{ t("horses.herdMatesHint") }}</p>
          <p v-if="!horse.accommodationId" class="mt-2 text-sm text-stone-500">
            {{ t("horses.herdNone") }}
          </p>
          <p v-else-if="!herdMates.length" class="mt-2 text-sm text-stone-500">
            {{ t("horses.herdAlone") }}
          </p>
          <ul v-else class="mt-2 divide-y divide-stone-100">
            <li v-for="mate in herdMates" :key="mate.id">
              <RouterLink
                :to="`/horses/${mate.id}`"
                class="btn-ghost block w-full justify-start text-left"
              >
                {{ mate.name }}
              </RouterLink>
            </li>
          </ul>
        </section>

        <section class="rounded-2xl border border-stone-200 bg-white p-4">
          <div class="flex items-center justify-between gap-2">
            <h2 class="text-sm font-medium text-stone-800">
              {{ t("horses.trainingHistory") }}
            </h2>
            <RouterLink
              :to="{
                name: 'training',
                query: {
                  view: 'month',
                  month: monthKey(new Date()),
                  horseId: horse.id,
                },
              }"
              class="btn-ghost"
            >
              {{ t("horses.trainingHistoryMore") }}
            </RouterLink>
          </div>
          <p
            v-if="!trainingLogs.length"
            class="mt-2 text-sm text-stone-500"
          >
            {{ t("horses.trainingHistoryEmpty") }}
          </p>
          <ol v-else class="mt-3 space-y-3">
            <li
              v-for="entry in trainingLogs"
              :key="entry.id"
              class="border-l-2 border-brand-200 pl-3 text-sm"
            >
              <p class="font-medium text-stone-800">
                {{ entry.type }}
              </p>
              <p class="mt-0.5 text-xs text-stone-500">
                {{ formatLocalDate(entry.date) }}
                <span v-if="entry.createdByName">
                  · {{ entry.createdByName }}
                </span>
              </p>
              <p v-if="entry.notes" class="mt-0.5 text-stone-600">
                {{ entry.notes }}
              </p>
            </li>
          </ol>
        </section>

        <section class="rounded-2xl border border-stone-200 bg-white p-4">
          <h2 class="text-sm font-medium text-stone-800">
            {{ t("horses.accommodationHistory") }}
          </h2>
          <p
            v-if="!accommodationHistory.length"
            class="mt-2 text-sm text-stone-500"
          >
            {{ t("horses.accommodationHistoryEmpty") }}
          </p>
          <ol v-else class="mt-3 space-y-3">
            <li
              v-for="entry in accommodationHistory"
              :key="entry.id"
              class="border-l-2 border-brand-200 pl-3 text-sm"
            >
              <p class="font-medium text-stone-800">
                {{ historyLabel(entry) }}
                <span
                  v-if="!entry.endedAt"
                  class="ml-1 text-xs font-normal text-brand-600"
                >
                  · {{ t("horses.accommodationHistoryCurrent") }}
                </span>
              </p>
              <p class="mt-0.5 text-xs text-stone-500">
                <template v-if="entry.endedAt">
                  {{ formatDateTime(entry.startedAt) }}
                  {{ t("horses.accommodationHistoryUntil") }}
                  {{ formatDateTime(entry.endedAt) }}
                </template>
                <template v-else>
                  {{ t("horses.accommodationHistoryFrom") }}
                  {{ formatDateTime(entry.startedAt) }}
                </template>
              </p>
            </li>
          </ol>
        </section>
      </template>
    </template>

    <ConfirmDialog
      :open="confirmDeactivateOpen"
      :title="t('horses.deactivate')"
      :message="t('horses.deactivateConfirm')"
      :confirm-label="t('horses.deactivate')"
      @close="confirmDeactivateOpen = false"
      @confirm="deactivate"
    />
  </div>
</template>
