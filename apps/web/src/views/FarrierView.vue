<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import type { FarrierPresentation, FarrierShoeing } from "@stablemanager/shared";
import { api } from "@/lib/api";
import {
  formatDateTime,
  fromLocalInputValue,
  toLocalInputValue,
} from "@/lib/dates";
import { useAuthStore } from "@/stores/auth";
import AppDialog from "@/components/AppDialog.vue";
import HorseSelect from "@/components/HorseSelect.vue";
import type { FarrierSignup, FarrierVisit, Horse } from "@/types/api";

const { t } = useI18n();
const auth = useAuthStore();

const visits = ref<FarrierVisit[]>([]);
const toPresent = ref<FarrierSignup[]>([]);
const billingOpen = ref<FarrierSignup[]>([]);
const billingDone = ref<FarrierSignup[]>([]);
const horses = ref<Horse[]>([]);
const loading = ref(true);
const error = ref("");
const saving = ref(false);

const showVisitForm = ref(false);
const showSignupForm = ref(false);
const signupVisit = ref<FarrierVisit | null>(null);
const billingTab = ref<"open" | "done">("open");

const visitForm = ref({
  startsAt: "",
  endsAt: "",
  farrierName: "",
  notes: "",
});

const signupForm = ref({
  horseId: "",
  shoeing: "trim" as FarrierShoeing,
  shoeingNotes: "",
  presentation: "staff" as FarrierPresentation,
});

const shoeingOptions: FarrierShoeing[] = [
  "trim",
  "front_shoes",
  "all_shoes",
  "other",
];

function shoeingLabel(s: FarrierShoeing): string {
  const map: Record<FarrierShoeing, string> = {
    trim: t("farrier.shoeingTrim"),
    front_shoes: t("farrier.shoeingFront"),
    all_shoes: t("farrier.shoeingAll"),
    other: t("farrier.shoeingOther"),
  };
  return map[s];
}

function presentationLabel(p: FarrierPresentation): string {
  return p === "staff"
    ? t("farrier.presentationStaff")
    : t("farrier.presentationOwner");
}

const availableHorses = computed(() => {
  if (!signupVisit.value) return [];
  const signed = new Set(signupVisit.value.signups.map((s) => s.horseId));
  return horses.value.filter((h) => !signed.has(h.id));
});

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const tasks: Promise<unknown>[] = [
      api<{ visits: FarrierVisit[] }>("/api/farrier/visits").then((d) => {
        visits.value = d.visits;
      }),
      api<{ horses: Horse[] }>("/api/horses").then((d) => {
        horses.value = d.horses;
      }),
    ];

    if (auth.canWrite) {
      tasks.push(
        api<{ signups: FarrierSignup[] }>(
          "/api/farrier/signups?needsPresentation=1",
        ).then((d) => {
          toPresent.value = d.signups;
        }),
      );
    }

    if (auth.isAdmin) {
      tasks.push(
        api<{ signups: FarrierSignup[] }>("/api/farrier/signups?unbilled=1").then(
          (d) => {
            billingOpen.value = d.signups;
          },
        ),
        api<{ signups: FarrierSignup[] }>("/api/farrier/signups?billed=1").then(
          (d) => {
            billingDone.value = d.signups;
          },
        ),
      );
    }

    await Promise.all(tasks);
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    loading.value = false;
  }
}

function openVisitCreate() {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(9, 0, 0, 0);
  visitForm.value = {
    startsAt: toLocalInputValue(start.toISOString()),
    endsAt: "",
    farrierName: "",
    notes: "",
  };
  showVisitForm.value = true;
}

async function createVisit() {
  saving.value = true;
  error.value = "";
  try {
    await api("/api/farrier/visits", {
      method: "POST",
      body: JSON.stringify({
        startsAt: fromLocalInputValue(visitForm.value.startsAt),
        endsAt: visitForm.value.endsAt
          ? fromLocalInputValue(visitForm.value.endsAt)
          : null,
        farrierName: visitForm.value.farrierName.trim() || null,
        notes: visitForm.value.notes.trim() || null,
      }),
    });
    showVisitForm.value = false;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    saving.value = false;
  }
}

async function toggleVisitStatus(visit: FarrierVisit) {
  try {
    await api(`/api/farrier/visits/${visit.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: visit.status === "open" ? "closed" : "open",
      }),
    });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  }
}

function openSignup(visit: FarrierVisit) {
  signupVisit.value = visit;
  signupForm.value = {
    horseId: "",
    shoeing: "trim",
    shoeingNotes: "",
    presentation: "staff",
  };
  const available = horses.value.filter(
    (h) => !visit.signups.some((s) => s.horseId === h.id),
  );
  signupForm.value.horseId = available[0]?.id ?? "";
  showSignupForm.value = true;
}

async function createSignup() {
  if (!signupVisit.value || !signupForm.value.horseId) return;
  saving.value = true;
  error.value = "";
  try {
    await api(`/api/farrier/visits/${signupVisit.value.id}/signups`, {
      method: "POST",
      body: JSON.stringify({
        horseId: signupForm.value.horseId,
        shoeing: signupForm.value.shoeing,
        shoeingNotes: signupForm.value.shoeingNotes.trim() || null,
        presentation: signupForm.value.presentation,
      }),
    });
    showSignupForm.value = false;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    saving.value = false;
  }
}

async function markPresented(signupId: string) {
  try {
    await api(`/api/farrier/signups/${signupId}/present`, { method: "POST" });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  }
}

async function setBilled(signupId: string, billed: boolean) {
  try {
    await api(`/api/farrier/signups/${signupId}/billed`, {
      method: "POST",
      body: JSON.stringify({ billed }),
    });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  }
}

function canSignup(visit: FarrierVisit): boolean {
  if (visit.status !== "open") return false;
  const signedIds = new Set(visit.signups.map((s) => s.horseId));
  return horses.value.some((h) => !signedIds.has(h.id));
}

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between gap-3">
      <h1 class="text-xl font-semibold text-brand-800">
        {{ t("farrier.title") }}
      </h1>
      <button
        v-if="auth.canWrite"
        type="button"
        class="btn-primary"
        @click="openVisitCreate"
      >
        {{ t("farrier.newVisit") }}
      </button>
    </div>

    <p v-if="loading" class="text-sm text-stone-500">{{ t("common.loading") }}</p>
    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

    <!-- Staff checklist -->
    <section v-if="auth.canWrite" class="groupbox">
      <h2 class="font-medium text-stone-800">{{ t("farrier.toPresent") }}</h2>
      <ul
        class="divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white"
      >
        <li
          v-for="s in toPresent"
          :key="s.id"
          class="flex items-start justify-between gap-3 px-4 py-3"
        >
          <div>
            <p class="font-medium">{{ s.horseName }}</p>
            <p class="text-xs text-stone-500">
              {{ formatDateTime(s.visitStartsAt!) }}
              <span v-if="s.visitFarrierName"> · {{ s.visitFarrierName }}</span>
            </p>
            <p class="text-sm text-stone-600">
              {{ shoeingLabel(s.shoeing) }}
              <span v-if="s.shoeingNotes"> · {{ s.shoeingNotes }}</span>
            </p>
            <p v-if="s.ownerName" class="text-xs text-stone-500">
              {{ s.ownerName }}
            </p>
          </div>
          <button
            type="button"
            class="btn-primary shrink-0"
            @click="markPresented(s.id)"
          >
            {{ t("farrier.markPresented") }}
          </button>
        </li>
        <li v-if="!toPresent.length" class="px-4 py-3 text-sm text-stone-500">
          {{ t("farrier.noneToPresent") }}
        </li>
      </ul>
    </section>

    <!-- Visits -->
    <section class="groupbox">
      <h2 class="font-medium text-stone-800">{{ t("farrier.visits") }}</h2>
      <div class="space-y-3">
        <article
          v-for="visit in visits"
          :key="visit.id"
          class="rounded-2xl border border-stone-200 bg-white p-4"
        >
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p class="font-medium text-stone-900">
                {{ formatDateTime(visit.startsAt) }}
                <span
                  class="ml-2 rounded-full px-2 py-0.5 text-xs font-normal"
                  :class="
                    visit.status === 'open'
                      ? 'bg-emerald-50 text-emerald-800'
                      : 'bg-stone-100 text-stone-600'
                  "
                >
                  {{
                    visit.status === "open"
                      ? t("farrier.statusOpen")
                      : t("farrier.statusClosed")
                  }}
                </span>
              </p>
              <p v-if="visit.farrierName" class="text-sm text-stone-600">
                {{ visit.farrierName }}
              </p>
              <p v-if="visit.notes" class="mt-1 text-sm text-stone-500">
                {{ visit.notes }}
              </p>
              <p class="mt-1 text-xs text-stone-500">
                {{
                  t("farrier.signupCount", {
                    n: visit.signupCount ?? visit.signups.length,
                  })
                }}
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                v-if="canSignup(visit)"
                type="button"
                class="btn-primary"
                @click="openSignup(visit)"
              >
                {{ t("farrier.signup") }}
              </button>
              <button
                v-if="auth.canWrite"
                type="button"
                class="btn-ghost"
                @click="toggleVisitStatus(visit)"
              >
                {{
                  visit.status === "open"
                    ? t("farrier.closeVisit")
                    : t("farrier.reopenVisit")
                }}
              </button>
            </div>
          </div>

          <ul
            v-if="visit.signups.length"
            class="mt-3 divide-y divide-stone-100 rounded-xl border border-stone-100"
          >
            <li
              v-for="s in visit.signups"
              :key="s.id"
              class="px-3 py-2 text-sm"
            >
              <div class="flex flex-wrap items-baseline justify-between gap-2">
                <p class="font-medium">{{ s.horseName }}</p>
                <p class="text-xs text-stone-500">
                  {{ presentationLabel(s.presentation) }}
                  <span v-if="s.presentedAt"> · ✓</span>
                  <span v-if="s.billedAt"> · {{ t("farrier.billingDone") }}</span>
                </p>
              </div>
              <p class="text-stone-600">
                {{ shoeingLabel(s.shoeing) }}
                <span v-if="s.shoeingNotes"> · {{ s.shoeingNotes }}</span>
              </p>
              <p v-if="s.ownerName" class="text-xs text-stone-500">
                {{ s.ownerName }}
              </p>
            </li>
          </ul>
          <p
            v-else
            class="mt-3 text-sm text-stone-500"
          >
            {{ t("farrier.noneSignups") }}
          </p>
        </article>

        <p
          v-if="!visits.length && !loading"
          class="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-500"
        >
          {{ t("farrier.noneVisits") }}
        </p>
      </div>
    </section>

    <!-- Admin billing -->
    <section v-if="auth.isAdmin" class="groupbox">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-medium text-stone-800">{{ t("farrier.billing") }}</h2>
        <div class="flex gap-1 rounded-lg bg-stone-100 p-1 text-sm">
          <button
            type="button"
            class="rounded-md px-3 py-1"
            :class="
              billingTab === 'open'
                ? 'bg-white font-medium shadow-sm'
                : 'text-stone-600'
            "
            @click="billingTab = 'open'"
          >
            {{ t("farrier.billingOpen") }}
          </button>
          <button
            type="button"
            class="rounded-md px-3 py-1"
            :class="
              billingTab === 'done'
                ? 'bg-white font-medium shadow-sm'
                : 'text-stone-600'
            "
            @click="billingTab = 'done'"
          >
            {{ t("farrier.billingDone") }}
          </button>
        </div>
      </div>

      <ul
        class="divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white"
      >
        <li
          v-for="s in billingTab === 'open' ? billingOpen : billingDone"
          :key="s.id"
          class="flex items-start justify-between gap-3 px-4 py-3"
        >
          <div>
            <p class="font-medium">{{ s.horseName }}</p>
            <p class="text-xs text-stone-500">
              {{ formatDateTime(s.visitStartsAt!) }}
              <span v-if="s.ownerName"> · {{ s.ownerName }}</span>
            </p>
            <p class="text-sm text-stone-600">
              {{ shoeingLabel(s.shoeing) }}
              <span v-if="s.shoeingNotes"> · {{ s.shoeingNotes }}</span>
            </p>
            <p class="text-xs text-stone-500">
              {{ presentationLabel(s.presentation) }}
            </p>
          </div>
          <button
            v-if="billingTab === 'open'"
            type="button"
            class="btn-primary shrink-0"
            @click="setBilled(s.id, true)"
          >
            {{ t("farrier.markBilled") }}
          </button>
          <button
            v-else
            type="button"
            class="btn-ghost shrink-0"
            @click="setBilled(s.id, false)"
          >
            {{ t("farrier.unmarkBilled") }}
          </button>
        </li>
        <li
          v-if="
            (billingTab === 'open' ? billingOpen : billingDone).length === 0
          "
          class="px-4 py-3 text-sm text-stone-500"
        >
          {{ t("farrier.noneBilling") }}
        </li>
      </ul>
    </section>

    <AppDialog
      :open="showVisitForm"
      :title="t('farrier.newVisit')"
      @close="showVisitForm = false"
    >
      <form class="grid gap-3" @submit.prevent="createVisit">
        <label class="text-sm font-medium">
          {{ t("farrier.startsAt") }}
          <input
            v-model="visitForm.startsAt"
            type="datetime-local"
            required
            class="field mt-1"
          />
        </label>
        <label class="text-sm font-medium">
          {{ t("farrier.endsAt") }}
          <input
            v-model="visitForm.endsAt"
            type="datetime-local"
            class="field mt-1"
          />
        </label>
        <label class="text-sm font-medium">
          {{ t("farrier.farrierName") }}
          <input
            v-model="visitForm.farrierName"
            type="text"
            class="field mt-1"
          />
        </label>
        <label class="text-sm font-medium">
          {{ t("farrier.notes") }}
          <textarea v-model="visitForm.notes" rows="2" class="field mt-1" />
        </label>
        <div class="mt-2 flex gap-2">
          <button
            type="button"
            class="btn-ghost flex-1"
            @click="showVisitForm = false"
          >
            {{ t("common.cancel") }}
          </button>
          <button type="submit" class="btn-primary flex-1" :disabled="saving">
            {{ saving ? t("common.loading") : t("common.create") }}
          </button>
        </div>
      </form>
    </AppDialog>

    <AppDialog
      :open="showSignupForm && signupVisit != null"
      :title="t('farrier.signup')"
      @close="showSignupForm = false"
    >
      <form v-if="signupVisit" class="grid gap-3" @submit.prevent="createSignup">
        <p class="text-sm text-stone-500">
          {{ formatDateTime(signupVisit.startsAt) }}
        </p>
        <label class="text-sm font-medium">
          {{ t("farrier.horse") }}
          <HorseSelect
            v-model="signupForm.horseId"
            :horses="availableHorses"
            required
          />
        </label>
        <label class="text-sm font-medium">
          {{ t("farrier.shoeing") }}
          <select v-model="signupForm.shoeing" class="field mt-1">
            <option v-for="opt in shoeingOptions" :key="opt" :value="opt">
              {{ shoeingLabel(opt) }}
            </option>
          </select>
        </label>
        <label class="text-sm font-medium">
          {{ t("farrier.shoeingNotes") }}
          <textarea
            v-model="signupForm.shoeingNotes"
            rows="2"
            class="field mt-1"
          />
        </label>
        <fieldset class="text-sm">
          <legend class="font-medium">{{ t("farrier.presentation") }}</legend>
          <label class="mt-2 flex items-center gap-2">
            <input
              v-model="signupForm.presentation"
              type="radio"
              value="staff"
            />
            {{ t("farrier.presentationStaff") }}
          </label>
          <label class="mt-1 flex items-center gap-2">
            <input
              v-model="signupForm.presentation"
              type="radio"
              value="owner"
            />
            {{ t("farrier.presentationOwner") }}
          </label>
        </fieldset>
        <div class="mt-2 flex gap-2">
          <button
            type="button"
            class="btn-ghost flex-1"
            @click="showSignupForm = false"
          >
            {{ t("common.cancel") }}
          </button>
          <button
            type="submit"
            class="btn-primary flex-1"
            :disabled="saving || !signupForm.horseId"
          >
            {{ saving ? t("common.loading") : t("common.create") }}
          </button>
        </div>
      </form>
    </AppDialog>
  </div>
</template>
