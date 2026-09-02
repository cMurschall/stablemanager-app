<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { api } from "@/lib/api";
import { dayKey, formatLocalDate } from "@/lib/dates";
import { useAuthStore } from "@/stores/auth";
import AppDialog from "@/components/AppDialog.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import HorseSelect from "@/components/HorseSelect.vue";
import type { DailyTask, Horse, ServiceOrder, Tenant } from "@/types/api";

const { t } = useI18n();
const auth = useAuthStore();
const orders = ref<ServiceOrder[]>([]);
const horses = ref<Horse[]>([]);
const tasks = ref<DailyTask[]>([]);
const taskDate = ref(dayKey(new Date()));
const maxDaily = ref(3);
const loading = ref(true);
const saving = ref(false);
const error = ref("");
const showForm = ref(false);
const completionTask = ref<DailyTask | null>(null);
const completionNote = ref("");
const selfDayInputs = ref<Record<string, string>>({});
const periodMode = ref<"end" | "days">("end");
const cancelOrderId = ref<string | null>(null);
const form = ref({
  horseId: "",
  title: "",
  instructions: "",
  startDate: dayKey(new Date()),
  endDate: "",
  durationDays: 1,
  dailyCount: 1,
});

const canManage = computed(() => auth.isAdmin || auth.currentRole === "boarder");
const isTeam = computed(() => auth.isAdmin || auth.currentRole === "staff");

function moveDay(amount: number) {
  const date = new Date(`${taskDate.value}T00:00:00`);
  date.setDate(date.getDate() + amount);
  taskDate.value = dayKey(date);
  void loadTasks();
}

async function loadTasks() {
  if (!isTeam.value) return;
  const result = await api<{ tasks: DailyTask[] }>(
    `/api/service-orders/daily-tasks?date=${taskDate.value}`,
  );
  tasks.value = result.tasks;
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const requests: Promise<unknown>[] = [
      api<{ horses: Horse[] }>("/api/horses").then((r) => {
        horses.value = r.horses;
      }),
      api<{ tenant: Tenant }>("/api/tenants/current").then((r) => {
        maxDaily.value = r.tenant.maxDailyServiceTasks;
      }),
    ];
    if (canManage.value) {
      requests.push(
        api<{ serviceOrders: ServiceOrder[] }>("/api/service-orders").then(
          (r) => {
            orders.value = r.serviceOrders;
          },
        ),
      );
    }
    if (isTeam.value) requests.push(loadTasks());
    await Promise.all(requests);
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  form.value = {
    horseId: horses.value[0]?.id ?? "",
    title: "",
    instructions: "",
    startDate: dayKey(new Date()),
    endDate: "",
    durationDays: 1,
    dailyCount: 1,
  };
  periodMode.value = "end";
  showForm.value = true;
}

async function createOrder() {
  saving.value = true;
  error.value = "";
  try {
    await api("/api/service-orders", {
      method: "POST",
      body: JSON.stringify({
        horseId: form.value.horseId,
        title: form.value.title,
        instructions: form.value.instructions,
        startDate: form.value.startDate,
        dailyCount: form.value.dailyCount,
        ...(periodMode.value === "end"
          ? { endDate: form.value.endDate }
          : { durationDays: form.value.durationDays }),
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

async function confirmCancelOrder() {
  if (!cancelOrderId.value) return;
  const id = cancelOrderId.value;
  cancelOrderId.value = null;
  try {
    await api(`/api/service-orders/${id}/cancel`, { method: "POST" });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  }
}

async function addSelfDay(order: ServiceOrder) {
  const date = selfDayInputs.value[order.id];
  if (!date) return;
  try {
    await api(`/api/service-orders/${order.id}/self-days`, {
      method: "PUT",
      body: JSON.stringify({ date }),
    });
    selfDayInputs.value[order.id] = "";
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  }
}

async function removeSelfDay(order: ServiceOrder, date: string) {
  try {
    await api(`/api/service-orders/${order.id}/self-days/${date}`, {
      method: "DELETE",
    });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  }
}

async function completeTask() {
  const task = completionTask.value;
  if (!task) return;
  saving.value = true;
  try {
    if (task.source === "farrier") {
      await api(`/api/farrier/signups/${task.id}/present`, { method: "POST" });
    } else {
      await api(
        `/api/service-orders/${task.serviceOrderId}/tasks/${taskDate.value}/${task.occurrence}/complete`,
        {
          method: "POST",
          body: JSON.stringify({ note: completionNote.value.trim() || null }),
        },
      );
    }
    completionTask.value = null;
    completionNote.value = "";
    await loadTasks();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between gap-3">
      <h1 class="text-xl font-semibold text-brand-800">{{ t("services.title") }}</h1>
      <button
        v-if="canManage"
        class="btn-primary"
        type="button"
        @click="openCreate"
      >
        {{ t("services.newOrder") }}
      </button>
    </div>
    <p v-if="loading" class="text-sm text-stone-500">{{ t("common.loading") }}</p>
    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

    <section v-if="isTeam" class="groupbox">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-medium text-stone-800">{{ t("services.dailyTasks") }}</h2>
        <div class="flex items-center gap-2">
          <button class="btn-ghost" type="button" @click="moveDay(-1)">
            {{ t("services.previousDay") }}
          </button>
          <input
            v-model="taskDate"
            type="date"
            class="field w-auto"
            @change="loadTasks"
          />
          <button class="btn-ghost" type="button" @click="moveDay(1)">
            {{ t("services.nextDay") }}
          </button>
        </div>
      </div>
      <ul class="divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white">
        <li
          v-for="task in tasks"
          :key="task.id"
          class="flex items-start justify-between gap-3 px-4 py-3"
          :class="task.completedAt ? 'bg-stone-50' : ''"
        >
          <div>
            <p class="font-medium">
              {{ task.horseName }} · {{ task.title }}
              <span
                v-if="task.source === 'service'"
                class="text-sm font-normal text-stone-500"
              >
                ({{ t("services.occurrence", { n: task.occurrence }) }})
              </span>
            </p>
            <p v-if="task.instructions" class="mt-1 text-sm text-stone-600">
              {{ task.instructions }}
            </p>
            <p v-if="task.note" class="mt-1 text-xs text-stone-500">{{ task.note }}</p>
          </div>
          <span v-if="task.completedAt" class="text-sm text-emerald-700">
            {{ t("services.completed") }}
          </span>
          <button
            v-else
            class="btn-primary shrink-0"
            type="button"
            @click="completionTask = task"
          >
            {{ t("services.completeWithNote") }}
          </button>
        </li>
        <li v-if="!tasks.length" class="px-4 py-3 text-sm text-stone-500">
          {{ t("services.noTasks") }}
        </li>
      </ul>
    </section>

    <section v-if="canManage" class="groupbox">
      <h2 class="font-medium text-stone-800">{{ t("services.orders") }}</h2>
      <ul class="space-y-3">
        <li
          v-for="order in orders"
          :key="order.id"
          class="rounded-2xl border border-stone-200 bg-white p-4"
          :class="order.cancelledAt ? 'opacity-60' : ''"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="font-medium">{{ order.horseName }} · {{ order.title }}</p>
              <p class="text-xs text-stone-500">
                {{ formatLocalDate(order.startDate) }} –
                {{ formatLocalDate(order.endDate) }} ·
                {{ order.dailyCount }}× {{ t("services.dailyCount").toLowerCase() }}
              </p>
              <p class="mt-2 text-sm text-stone-600">{{ order.instructions }}</p>
            </div>
            <button
              v-if="!order.cancelledAt"
              class="btn-danger"
              type="button"
              @click="cancelOrderId = order.id"
            >
              {{ t("services.cancelOrder") }}
            </button>
            <span v-else class="text-sm text-stone-500">{{ t("services.cancelled") }}</span>
          </div>
          <div v-if="!order.cancelledAt" class="mt-3 border-t border-stone-100 pt-3">
            <p class="text-sm font-medium">{{ t("services.selfDays") }}</p>
            <div class="mt-1 flex gap-2">
              <input
                v-model="selfDayInputs[order.id]"
                type="date"
                :min="order.startDate"
                :max="order.endDate"
                class="field w-auto"
              />
              <button class="btn-ghost" type="button" @click="addSelfDay(order)">
                {{ t("services.addSelfDay") }}
              </button>
            </div>
            <div v-if="order.selfDays.length" class="mt-2 flex flex-wrap gap-2">
              <span
                v-for="date in order.selfDays"
                :key="date"
                class="rounded-lg bg-brand-50 px-2 py-1 text-xs text-brand-800"
              >
                {{ formatLocalDate(date) }}
                <button class="btn-ghost ml-1 px-1.5 py-0.5" type="button" @click="removeSelfDay(order, date)">
                  ×
                </button>
              </span>
            </div>
          </div>
        </li>
        <li
          v-if="!orders.length"
          class="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-500"
        >
          <p>{{ t("services.noOrders") }}</p>
          <p class="mt-1">{{ t("services.noOrdersHint") }}</p>
          <button type="button" class="btn-primary mt-3" @click="openCreate">
            {{ t("services.newOrder") }}
          </button>
        </li>
      </ul>
    </section>

    <AppDialog
      :open="showForm"
      :title="t('services.newOrder')"
      @close="showForm = false"
    >
      <form class="grid gap-3" @submit.prevent="createOrder">
        <label class="text-sm font-medium">
          {{ t("services.horse") }}
          <HorseSelect v-model="form.horseId" :horses="horses" required />
        </label>
        <label class="text-sm font-medium">
          {{ t("services.taskTitle") }}
          <input v-model="form.title" required class="field mt-1" />
        </label>
        <label class="text-sm font-medium">
          {{ t("services.instructions") }}
          <textarea v-model="form.instructions" rows="3" required class="field mt-1" />
        </label>
        <label class="text-sm font-medium">
          {{ t("services.startDate") }}
          <input v-model="form.startDate" type="date" required class="field mt-1" />
        </label>
        <label class="text-sm font-medium">
          {{ t("services.periodMode") }}
          <select v-model="periodMode" class="field mt-1">
            <option value="end">{{ t("services.periodEnd") }}</option>
            <option value="days">{{ t("services.periodDays") }}</option>
          </select>
        </label>
        <label v-if="periodMode === 'end'" class="text-sm font-medium">
          {{ t("services.endDate") }}
          <input
            v-model="form.endDate"
            type="date"
            :min="form.startDate"
            required
            class="field mt-1"
          />
        </label>
        <label v-else class="text-sm font-medium">
          {{ t("services.durationDays") }}
          <input
            v-model.number="form.durationDays"
            type="number"
            min="1"
            max="365"
            required
            class="field mt-1"
          />
        </label>
        <label class="text-sm font-medium">
          {{ t("services.dailyCount") }}
          <select v-model.number="form.dailyCount" class="field mt-1">
            <option v-for="n in maxDaily" :key="n" :value="n">{{ n }}×</option>
          </select>
        </label>
        <div class="mt-2 flex gap-2">
          <button type="button" class="btn-ghost flex-1" @click="showForm = false">
            {{ t("common.cancel") }}
          </button>
          <button type="submit" class="btn-primary flex-1" :disabled="saving">
            {{ saving ? t("common.loading") : t("common.create") }}
          </button>
        </div>
      </form>
    </AppDialog>

    <AppDialog
      :open="completionTask != null"
      :title="t('services.completeWithNote')"
      @close="completionTask = null"
    >
      <form v-if="completionTask" @submit.prevent="completeTask">
        <p class="text-sm">
          {{ completionTask.horseName }} · {{ completionTask.title }}
        </p>
        <label
          v-if="completionTask.source === 'service'"
          class="mt-4 block text-sm font-medium"
        >
          {{ t("services.completionNote") }}
          <textarea v-model="completionNote" rows="3" class="field mt-1" />
        </label>
        <div class="mt-5 flex gap-2">
          <button
            type="button"
            class="btn-ghost flex-1"
            @click="completionTask = null"
          >
            {{ t("common.cancel") }}
          </button>
          <button type="submit" class="btn-primary flex-1" :disabled="saving">
            {{ t("common.complete") }}
          </button>
        </div>
      </form>
    </AppDialog>

    <ConfirmDialog
      :open="cancelOrderId != null"
      :title="t('services.cancelOrder')"
      :message="t('common.confirmDelete')"
      :confirm-label="t('services.cancelOrder')"
      @close="cancelOrderId = null"
      @confirm="confirmCancelOrder"
    />
  </div>
</template>
