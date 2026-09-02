<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import type { AccommodationKind, HorseSex, Role } from "@stablemanager/shared";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/dates";
import { parseFeifId } from "@/lib/feif";
import AppDialog from "@/components/AppDialog.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import type {
  Accommodation,
  Horse,
  Invite,
  Member,
} from "@/types/api";

type HofTab = "members" | "horses" | "housing";

type HorseEditForm = {
  name: string;
  feifId: string;
  sex: "" | HorseSex;
  birthYear: string | number;
  ownerUserIds: string[];
  accommodationId: string;
  notes: string;
};

const emptyHorseForm = (): HorseEditForm => ({
  name: "",
  feifId: "",
  sex: "",
  birthYear: "",
  ownerUserIds: [],
  accommodationId: "",
  notes: "",
});

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const tab = ref<HofTab>("members");
const loading = ref(true);
const error = ref("");
const saving = ref(false);

const members = ref<Member[]>([]);
const invites = ref<Invite[]>([]);
const horses = ref<Horse[]>([]);
const archivedHorses = ref<Horse[]>([]);
const accommodations = ref<Accommodation[]>([]);

const inviteDevLink = ref("");
const inviteForm = ref({
  email: "",
  role: "boarder" as Role,
  name: "",
});
const removeMemberTarget = ref<Member | null>(null);
const archiveAction = ref<{ kind: "reactivate" | "delete"; horse: Horse } | null>(null);
const deactivateHorseTarget = ref<Horse | null>(null);
const expandedHorseId = ref<string | null>(null);
const editHorseForm = ref<HorseEditForm>(emptyHorseForm());

const showHorseForm = ref(false);
const horseForm = ref<HorseEditForm>(emptyHorseForm());

const showAccommodationForm = ref(false);
const editingAccommodation = ref<Accommodation | null>(null);
const deleteAccommodationId = ref<string | null>(null);
const accommodationForm = ref({
  name: "",
  kind: "box" as AccommodationKind,
  capacity: "" as string | number,
  notes: "",
});
const editAccommodationForm = ref({
  name: "",
  capacity: "" as string | number,
  notes: "",
});

const needsCapacity = computed(() => accommodationForm.value.kind !== "box");
const capacityMin = computed(() =>
  accommodationForm.value.kind === "paddock_box" ? 2 : 1,
);
const editNeedsCapacity = computed(
  () => editingAccommodation.value != null && editingAccommodation.value.kind !== "box",
);
const editCapacityMin = computed(() =>
  editingAccommodation.value?.kind === "paddock_box" ? 2 : 1,
);

function parseTab(value: unknown): HofTab {
  if (value === "horses" || value === "housing" || value === "members") return value;
  return "members";
}

function setTab(next: HofTab) {
  tab.value = next;
  router.replace({ name: "hof", query: { tab: next } });
}

function horsesIn(accommodationId: string) {
  return horses.value.filter((h) => h.accommodationId === accommodationId);
}

function capacityLabel(row: Accommodation) {
  if (row.kind === "box") return "1";
  return row.capacity != null ? String(row.capacity) : "—";
}

function accommodationLabel(id: string | null) {
  if (!id) return "—";
  const row = accommodations.value.find((s) => s.id === id);
  if (!row) return "—";
  return `${row.name} (${t(`accommodationKind.${row.kind}`)})`;
}

function canRemoveMember(m: Member) {
  if (m.role === "hof_admin") {
    const adminCount = members.value.filter((row) => row.role === "hof_admin").length;
    if (adminCount <= 1) return false;
  }
  return true;
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const [mRes, iRes, hRes, aRes, archiveRes] = await Promise.all([
      api<{ members: Member[] }>("/api/tenants/members"),
      api<{ invites: Invite[] }>("/api/tenants/invites"),
      api<{ horses: Horse[] }>("/api/horses"),
      api<{ accommodations: Accommodation[] }>("/api/housing/accommodations"),
      api<{ horses: Horse[] }>("/api/horses?active=0"),
    ]);
    members.value = mRes.members;
    invites.value = iRes.invites;
    horses.value = hRes.horses;
    accommodations.value = aRes.accommodations;
    archivedHorses.value = archiveRes.horses;
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    loading.value = false;
  }
}

async function sendInvite() {
  saving.value = true;
  error.value = "";
  inviteDevLink.value = "";
  try {
    const res = await api<{ ok: boolean; devLink?: string }>("/api/tenants/invites", {
      method: "POST",
      body: JSON.stringify({
        email: inviteForm.value.email,
        role: inviteForm.value.role,
        name: inviteForm.value.name.trim() || undefined,
      }),
    });
    if (res.devLink) inviteDevLink.value = res.devLink;
    inviteForm.value = { email: "", role: "boarder", name: "" };
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    saving.value = false;
  }
}

async function confirmRemoveMember() {
  if (!removeMemberTarget.value) return;
  const target = removeMemberTarget.value;
  removeMemberTarget.value = null;
  saving.value = true;
  error.value = "";
  try {
    await api(`/api/tenants/members/${target.userId}`, { method: "DELETE" });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    saving.value = false;
  }
}

function openCreateHorse() {
  horseForm.value = emptyHorseForm();
  showHorseForm.value = true;
}

function applyFeifToForm(form: HorseEditForm) {
  const parsed = parseFeifId(form.feifId);
  if (!parsed) return;
  form.feifId = parsed.feifId;
  form.birthYear = parsed.birthYear;
  if (form.sex !== "gelding") {
    form.sex = parsed.sex;
  }
}

function onFeifIdInput() {
  applyFeifToForm(horseForm.value);
}

function onEditFeifIdInput() {
  applyFeifToForm(editHorseForm.value);
}

function syncEditHorseForm(horse: Horse) {
  editHorseForm.value = {
    name: horse.name,
    feifId: horse.feifId ?? "",
    sex: horse.sex ?? "",
    birthYear: horse.birthYear ?? "",
    ownerUserIds: [...horse.ownerUserIds],
    accommodationId: horse.accommodationId ?? "",
    notes: horse.notes ?? "",
  };
}

function toggleHorseAccordion(horse: Horse) {
  if (expandedHorseId.value === horse.id) {
    expandedHorseId.value = null;
    return;
  }
  expandedHorseId.value = horse.id;
  syncEditHorseForm(horse);
}

async function saveHorseEdit(horseId: string) {
  saving.value = true;
  error.value = "";
  try {
    const birthYear =
      editHorseForm.value.birthYear === ""
        ? null
        : Number(editHorseForm.value.birthYear);
    await api(`/api/horses/${horseId}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: editHorseForm.value.name,
        feifId: editHorseForm.value.feifId.trim() || null,
        sex: editHorseForm.value.sex || null,
        birthYear: Number.isFinite(birthYear) ? birthYear : null,
        ownerUserIds: editHorseForm.value.ownerUserIds,
        accommodationId: editHorseForm.value.accommodationId || null,
        notes: editHorseForm.value.notes.trim() || null,
      }),
    });
    await load();
    const updated = horses.value.find((h) => h.id === horseId);
    if (updated) syncEditHorseForm(updated);
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    saving.value = false;
  }
}

async function confirmDeactivateHorse() {
  if (!deactivateHorseTarget.value) return;
  const horse = deactivateHorseTarget.value;
  deactivateHorseTarget.value = null;
  saving.value = true;
  error.value = "";
  try {
    await api(`/api/horses/${horse.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: false }),
    });
    if (expandedHorseId.value === horse.id) expandedHorseId.value = null;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    saving.value = false;
  }
}

async function createHorse() {
  saving.value = true;
  error.value = "";
  try {
    const birthYear =
      horseForm.value.birthYear === "" ? null : Number(horseForm.value.birthYear);
    await api("/api/horses", {
      method: "POST",
      body: JSON.stringify({
        name: horseForm.value.name,
        feifId: horseForm.value.feifId.trim() || null,
        sex: horseForm.value.sex || null,
        birthYear: Number.isFinite(birthYear) ? birthYear : null,
        ownerUserIds: horseForm.value.ownerUserIds,
        accommodationId: horseForm.value.accommodationId || null,
        notes: horseForm.value.notes.trim() || null,
      }),
    });
    showHorseForm.value = false;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    saving.value = false;
  }
}

async function confirmArchiveAction() {
  if (!archiveAction.value) return;
  const { kind, horse } = archiveAction.value;
  archiveAction.value = null;
  saving.value = true;
  error.value = "";
  try {
    if (kind === "reactivate") {
      await api(`/api/horses/${horse.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: true }),
      });
    } else {
      await api(`/api/horses/${horse.id}`, { method: "DELETE" });
    }
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    saving.value = false;
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

function openEditAccommodation(row: Accommodation) {
  editingAccommodation.value = row;
  editAccommodationForm.value = {
    name: row.name,
    capacity: row.capacity ?? "",
    notes: row.notes ?? "",
  };
}

async function saveEditAccommodation() {
  if (!editingAccommodation.value) return;
  saving.value = true;
  error.value = "";
  try {
    const capacity =
      editingAccommodation.value.kind === "box"
        ? 1
        : editAccommodationForm.value.capacity === ""
          ? null
          : Number(editAccommodationForm.value.capacity);
    await api(`/api/housing/accommodations/${editingAccommodation.value.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: editAccommodationForm.value.name.trim(),
        capacity: Number.isFinite(capacity as number) ? capacity : null,
        notes: editAccommodationForm.value.notes.trim() || null,
      }),
    });
    editingAccommodation.value = null;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    saving.value = false;
  }
}

async function confirmDeleteAccommodation() {
  if (!deleteAccommodationId.value) return;
  const id = deleteAccommodationId.value;
  deleteAccommodationId.value = null;
  try {
    await api(`/api/housing/accommodations/${id}`, { method: "DELETE" });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  }
}

async function setAccommodationActive(row: Accommodation, active: boolean) {
  saving.value = true;
  error.value = "";
  try {
    await api(`/api/housing/accommodations/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active }),
    });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    saving.value = false;
  }
}

watch(
  () => route.query.tab,
  (value) => {
    tab.value = parseTab(value);
  },
  { immediate: true },
);

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-xl font-semibold text-brand-800">{{ t("hof.title") }}</h1>
      <p class="mt-1 text-sm text-stone-500">{{ t("hof.subtitle") }}</p>
    </div>

    <div class="flex flex-wrap gap-2 border-b border-stone-200 pb-3">
      <button
        type="button"
        class="rounded-lg px-3 py-1.5 text-sm"
        :class="tab === 'members' ? 'bg-brand-100 font-medium text-brand-800' : 'text-stone-600 hover:bg-stone-100'"
        @click="setTab('members')"
      >
        {{ t("hof.tabMembers") }}
      </button>
      <button
        type="button"
        class="rounded-lg px-3 py-1.5 text-sm"
        :class="tab === 'horses' ? 'bg-brand-100 font-medium text-brand-800' : 'text-stone-600 hover:bg-stone-100'"
        @click="setTab('horses')"
      >
        {{ t("hof.tabHorses") }}
      </button>
      <button
        type="button"
        class="rounded-lg px-3 py-1.5 text-sm"
        :class="tab === 'housing' ? 'bg-brand-100 font-medium text-brand-800' : 'text-stone-600 hover:bg-stone-100'"
        @click="setTab('housing')"
      >
        {{ t("hof.tabHousing") }}
      </button>
    </div>

    <p v-if="loading" class="text-sm text-stone-500">{{ t("common.loading") }}</p>
    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

    <template v-if="!loading">
      <!-- Mitglieder -->
      <div v-if="tab === 'members'" class="space-y-6">
        <section class="groupbox">
          <h2 class="font-medium text-stone-800">{{ t("hof.members") }}</h2>
          <ul class="divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white">
            <li
              v-for="m in members"
              :key="m.userId"
              class="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div class="min-w-0">
                <p class="font-medium">{{ m.name }}</p>
                <p class="text-xs text-stone-500">{{ m.email }}</p>
                <p class="mt-0.5 text-xs text-stone-500">
                  {{ t("hof.memberHorses", { n: m.horseCount ?? 0 }) }}
                </p>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <span class="rounded-lg bg-brand-50 px-2 py-1 text-xs text-brand-800">
                  {{ t(`roles.${m.role}`) }}
                </span>
                <button
                  v-if="canRemoveMember(m)"
                  type="button"
                  class="btn-danger"
                  @click="removeMemberTarget = m"
                >
                  {{ t("hof.removeMember") }}
                </button>
              </div>
            </li>
          </ul>
        </section>

        <section class="groupbox">
          <h2 class="font-medium text-stone-800">{{ t("hof.invites") }}</h2>
          <form
            class="space-y-3 rounded-2xl border border-stone-200 bg-white p-4"
            @submit.prevent="sendInvite"
          >
            <label class="block text-sm font-medium">
              {{ t("hof.inviteEmail") }}
              <input v-model="inviteForm.email" type="email" required class="field mt-1" />
            </label>
            <label class="block text-sm font-medium">
              {{ t("hof.inviteRole") }}
              <select v-model="inviteForm.role" class="field mt-1">
                <option value="hof_admin">{{ t("roles.hof_admin") }}</option>
                <option value="staff">{{ t("roles.staff") }}</option>
                <option value="boarder">{{ t("roles.boarder") }}</option>
              </select>
            </label>
            <label class="block text-sm font-medium">
              {{ t("hof.inviteName") }}
              <input v-model="inviteForm.name" class="field mt-1" />
            </label>
            <button type="submit" class="btn-primary" :disabled="saving">
              {{ t("hof.sendInvite") }}
            </button>
            <a
              v-if="inviteDevLink"
              :href="inviteDevLink"
              class="btn-ghost mt-2 inline-flex max-w-full break-all"
            >
              {{ t("hof.inviteDevLink") }}
            </a>
          </form>
          <ul class="divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white">
            <li v-for="inv in invites" :key="inv.id" class="px-4 py-3 text-sm">
              <p class="font-medium">
                {{ inv.email }} · {{ t(`roles.${inv.role}`) }}
              </p>
              <p class="text-xs text-stone-500">
                {{ t("hof.pending") }} · bis {{ formatDateTime(inv.expiresAt) }}
              </p>
            </li>
            <li v-if="!invites.length" class="px-4 py-3 text-sm text-stone-500">
              {{ t("common.empty") }}
            </li>
          </ul>
        </section>
      </div>

      <!-- Pferde -->
      <div v-else-if="tab === 'horses'" class="space-y-6">
        <section class="groupbox">
          <div class="flex items-center justify-between gap-3">
            <h2 class="font-medium text-stone-800">{{ t("hof.activeHorses") }}</h2>
            <button type="button" class="btn-primary" @click="openCreateHorse">
              {{ t("horses.new") }}
            </button>
          </div>
          <ul class="divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white">
            <li v-for="horse in horses" :key="horse.id">
              <button
                type="button"
                class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-brand-50/60"
                :aria-expanded="expandedHorseId === horse.id"
                @click="toggleHorseAccordion(horse)"
              >
                <div class="min-w-0">
                  <p class="font-medium text-stone-900">{{ horse.name }}</p>
                  <p class="text-xs text-stone-500">
                    <span v-if="horse.feifId">{{ horse.feifId }} · </span>
                    <span v-if="horse.sex">{{ t(`sex.${horse.sex}`) }} · </span>
                    {{ accommodationLabel(horse.accommodationId) }}
                  </p>
                </div>
                <span class="shrink-0 text-stone-400" aria-hidden="true">
                  {{ expandedHorseId === horse.id ? "▾" : "▸" }}
                </span>
              </button>

              <form
                v-if="expandedHorseId === horse.id"
                class="space-y-3 border-t border-stone-100 bg-stone-50/60 px-4 py-4"
                @submit.prevent="saveHorseEdit(horse.id)"
              >
                <label class="block text-sm font-medium">
                  {{ t("horses.name") }}
                  <input v-model="editHorseForm.name" required class="field mt-1" />
                </label>
                <label class="block text-sm font-medium">
                  {{ t("horses.feifId") }}
                  <input
                    v-model="editHorseForm.feifId"
                    class="field mt-1"
                    placeholder="DE2017222618"
                    pattern="[A-Za-z]{2}\d{8,12}"
                    @input="onEditFeifIdInput"
                    @blur="onEditFeifIdInput"
                  />
                  <span class="mt-1 block text-xs font-normal text-stone-500">
                    {{ t("horses.feifHint") }}
                  </span>
                </label>
                <label class="block text-sm font-medium">
                  {{ t("horses.sex") }}
                  <select v-model="editHorseForm.sex" class="field mt-1">
                    <option value="">—</option>
                    <option value="mare">{{ t("sex.mare") }}</option>
                    <option value="stallion">{{ t("sex.stallion") }}</option>
                    <option value="gelding">{{ t("sex.gelding") }}</option>
                  </select>
                </label>
                <label class="block text-sm font-medium">
                  {{ t("horses.birthYear") }}
                  <input
                    v-model="editHorseForm.birthYear"
                    type="number"
                    min="1980"
                    max="2100"
                    class="field mt-1"
                  />
                </label>
                <fieldset class="text-sm font-medium">
                  <legend>{{ t("horses.owner") }}</legend>
                  <div class="mt-2 max-h-40 space-y-2 overflow-y-auto rounded-lg border border-stone-200 bg-white p-3">
                    <label
                      v-for="m in members"
                      :key="m.userId"
                      class="flex items-center gap-2 font-normal"
                    >
                      <input
                        v-model="editHorseForm.ownerUserIds"
                        type="checkbox"
                        :value="m.userId"
                      />
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
                  <select v-model="editHorseForm.accommodationId" class="field mt-1">
                    <option value="">—</option>
                    <option
                      v-for="s in accommodations.filter(
                        (row) => row.active || row.id === editHorseForm.accommodationId,
                      )"
                      :key="s.id"
                      :value="s.id"
                    >
                      {{ s.name }} ({{ t(`accommodationKind.${s.kind}`) }})
                    </option>
                  </select>
                </label>
                <label class="block text-sm font-medium">
                  {{ t("horses.notes") }}
                  <textarea v-model="editHorseForm.notes" rows="3" class="field mt-1" />
                </label>
                <div class="flex flex-wrap gap-2 pt-1">
                  <button type="submit" class="btn-primary" :disabled="saving">
                    {{ saving ? t("common.loading") : t("common.save") }}
                  </button>
                  <button
                    type="button"
                    class="btn-danger"
                    :disabled="saving"
                    @click="deactivateHorseTarget = horse"
                  >
                    {{ t("horses.deactivate") }}
                  </button>
                </div>
              </form>
            </li>
            <li v-if="!horses.length" class="px-4 py-3 text-sm text-stone-500">
              {{ t("horses.none") }}
            </li>
          </ul>
        </section>

        <section class="groupbox">
          <h2 class="font-medium text-stone-800">{{ t("hof.horseArchive") }}</h2>
          <p class="text-sm text-stone-500">{{ t("hof.horseArchiveHint") }}</p>
          <ul class="divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white">
            <li
              v-for="horse in archivedHorses"
              :key="horse.id"
              class="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div class="min-w-0">
                <p class="font-medium">{{ horse.name }}</p>
                <p v-if="horse.feifId" class="text-xs text-stone-500">{{ horse.feifId }}</p>
              </div>
              <div class="flex shrink-0 gap-2">
                <button
                  type="button"
                  class="btn-ghost"
                  @click="archiveAction = { kind: 'reactivate', horse }"
                >
                  {{ t("horses.reactivate") }}
                </button>
                <button
                  type="button"
                  class="btn-danger"
                  @click="archiveAction = { kind: 'delete', horse }"
                >
                  {{ t("horses.deleteForever") }}
                </button>
              </div>
            </li>
            <li v-if="!archivedHorses.length" class="px-4 py-3 text-sm text-stone-500">
              {{ t("hof.horseArchiveEmpty") }}
            </li>
          </ul>
        </section>
      </div>

      <!-- Unterbringung -->
      <div v-else class="space-y-6">
        <section class="groupbox">
          <div class="flex items-center justify-between">
            <h2 class="font-medium text-stone-800">{{ t("housing.accommodations") }}</h2>
            <button
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

          <ul class="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
            <li v-for="row in accommodations" :key="row.id" class="px-4 py-3">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="font-medium">
                    {{ row.name }}
                    <span
                      class="ml-1 rounded-full px-2 py-0.5 text-xs font-medium"
                      :class="row.active ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-500'"
                    >{{ row.active ? t("housing.active") : t("housing.inactive") }}</span>
                  </p>
                  <p class="text-xs text-stone-500">
                    {{ t(`accommodationKind.${row.kind}`) }}
                    · {{ t("housing.occupied") }}:
                    {{ horsesIn(row.id).length }}
                    /
                    {{ capacityLabel(row) }}
                  </p>
                  <p v-if="row.notes" class="text-xs text-stone-500">{{ row.notes }}</p>
                </div>
                <div class="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    class="btn-ghost"
                    @click="openEditAccommodation(row)"
                  >
                    {{ t("common.edit") }}
                  </button>
                  <button
                    type="button"
                    class="btn-ghost"
                    :disabled="saving"
                    @click="setAccommodationActive(row, !row.active)"
                  >
                    {{ row.active ? t("housing.deactivate") : t("housing.activate") }}
                  </button>
                  <button
                    type="button"
                    class="btn-danger"
                    @click="deleteAccommodationId = row.id"
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
      </div>
    </template>

    <AppDialog
      :open="showHorseForm"
      :title="t('horses.new')"
      @close="showHorseForm = false"
    >
      <form class="grid gap-3" @submit.prevent="createHorse">
        <label class="text-sm font-medium">
          {{ t("horses.feifId") }}
          <input
            v-model="horseForm.feifId"
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
          <input v-model="horseForm.name" required class="field" />
        </label>
        <label class="text-sm font-medium">
          {{ t("horses.sex") }}
          <select v-model="horseForm.sex" class="field">
            <option value="">—</option>
            <option value="mare">{{ t("sex.mare") }}</option>
            <option value="stallion">{{ t("sex.stallion") }}</option>
            <option value="gelding">{{ t("sex.gelding") }}</option>
          </select>
        </label>
        <label class="text-sm font-medium">
          {{ t("horses.birthYear") }}
          <input v-model="horseForm.birthYear" type="number" min="1980" max="2100" class="field" />
        </label>
        <fieldset class="text-sm font-medium">
          <legend>{{ t("horses.owner") }}</legend>
          <div class="mt-2 max-h-40 space-y-2 overflow-y-auto rounded-lg border border-stone-200 p-3">
            <label
              v-for="m in members"
              :key="m.userId"
              class="flex items-center gap-2 font-normal"
            >
              <input v-model="horseForm.ownerUserIds" type="checkbox" :value="m.userId" />
              {{ m.name }}
              <span class="text-xs text-stone-500">({{ m.email }})</span>
            </label>
          </div>
        </fieldset>
        <label class="text-sm font-medium">
          {{ t("horses.accommodation") }}
          <select v-model="horseForm.accommodationId" class="field">
            <option value="">—</option>
            <option
              v-for="s in accommodations.filter((row) => row.active)"
              :key="s.id"
              :value="s.id"
            >
              {{ s.name }} ({{ t(`accommodationKind.${s.kind}`) }})
            </option>
          </select>
        </label>
        <label class="text-sm font-medium">
          {{ t("horses.notes") }}
          <textarea v-model="horseForm.notes" rows="3" class="field" />
        </label>
        <div class="mt-2 flex gap-2">
          <button type="button" class="btn-ghost flex-1" @click="showHorseForm = false">
            {{ t("common.cancel") }}
          </button>
          <button type="submit" class="btn-primary flex-1" :disabled="saving">
            {{ saving ? t("common.loading") : t("common.create") }}
          </button>
        </div>
      </form>
    </AppDialog>

    <AppDialog
      :open="editingAccommodation != null"
      :title="t('housing.editAccommodation')"
      @close="editingAccommodation = null"
    >
      <form
        v-if="editingAccommodation"
        class="grid gap-3"
        @submit.prevent="saveEditAccommodation"
      >
        <p class="text-sm text-stone-500">
          {{ t(`accommodationKind.${editingAccommodation.kind}`) }}
        </p>
        <label class="text-sm font-medium">
          {{ t("housing.accommodationName") }}
          <input v-model="editAccommodationForm.name" required class="field mt-1" />
        </label>
        <label v-if="editNeedsCapacity" class="text-sm font-medium">
          {{ t("housing.capacity") }}
          <input
            v-model="editAccommodationForm.capacity"
            type="number"
            :min="editCapacityMin"
            max="200"
            :required="editingAccommodation.kind === 'paddock_box'"
            class="field mt-1"
          />
        </label>
        <label class="text-sm font-medium">
          {{ t("housing.notes") }}
          <textarea v-model="editAccommodationForm.notes" rows="3" class="field mt-1" />
        </label>
        <div class="mt-2 flex gap-2">
          <button type="button" class="btn-ghost flex-1" @click="editingAccommodation = null">
            {{ t("common.cancel") }}
          </button>
          <button type="submit" class="btn-primary flex-1" :disabled="saving">
            {{ saving ? t("common.loading") : t("common.save") }}
          </button>
        </div>
      </form>
    </AppDialog>

    <ConfirmDialog
      :open="removeMemberTarget != null"
      :title="t('hof.removeMember')"
      :message="t('hof.removeMemberConfirm', { name: removeMemberTarget?.name ?? '' })"
      :confirm-label="t('hof.removeMember')"
      @close="removeMemberTarget = null"
      @confirm="confirmRemoveMember"
    />
    <ConfirmDialog
      :open="deactivateHorseTarget != null"
      :title="t('horses.deactivate')"
      :message="t('horses.deactivateConfirm')"
      :confirm-label="t('horses.deactivate')"
      @close="deactivateHorseTarget = null"
      @confirm="confirmDeactivateHorse"
    />
    <ConfirmDialog
      :open="archiveAction?.kind === 'reactivate'"
      :title="t('horses.reactivate')"
      :message="t('horses.reactivateConfirm')"
      :confirm-label="t('horses.reactivate')"
      @close="archiveAction = null"
      @confirm="confirmArchiveAction"
    />
    <ConfirmDialog
      :open="archiveAction?.kind === 'delete'"
      :title="t('horses.deleteForever')"
      :message="t('horses.deleteForeverConfirm')"
      :confirm-label="t('horses.deleteForever')"
      @close="archiveAction = null"
      @confirm="confirmArchiveAction"
    />
    <ConfirmDialog
      :open="deleteAccommodationId != null"
      :title="t('common.delete')"
      :message="t('common.confirmDelete')"
      :confirm-label="t('common.delete')"
      @close="deleteAccommodationId = null"
      @confirm="confirmDeleteAccommodation"
    />
  </div>
</template>
