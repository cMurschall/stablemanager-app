import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { Role } from "@stablemanager/shared";
import { api } from "@/lib/api";

export type Membership = {
  tenantId: string;
  role: Role;
  tenantName: string;
  tenantSlug: string;
  timezone: string;
};

type MeResponse = {
  user: { id: string; email: string; name: string };
  currentTenantId: string;
  currentRole: Role;
  memberships: Membership[];
};

export const useAuthStore = defineStore("auth", () => {
  const user = ref<MeResponse["user"] | null>(null);
  const memberships = ref<Membership[]>([]);
  const currentTenantId = ref<string | null>(null);
  const currentRole = ref<Role | null>(null);
  const loaded = ref(false);

  const isAuthenticated = computed(() => !!user.value);
  const isAdmin = computed(() => currentRole.value === "hof_admin");
  const canWrite = computed(
    () => currentRole.value === "hof_admin" || currentRole.value === "staff",
  );
  const currentTenant = computed(
    () =>
      memberships.value.find((m) => m.tenantId === currentTenantId.value) ??
      null,
  );

  async function fetchMe() {
    try {
      const data = await api<MeResponse>("/api/auth/me");
      user.value = data.user;
      memberships.value = data.memberships;
      currentTenantId.value = data.currentTenantId;
      currentRole.value = data.currentRole;
    } catch {
      user.value = null;
      memberships.value = [];
      currentTenantId.value = null;
      currentRole.value = null;
    } finally {
      loaded.value = true;
    }
  }

  async function requestMagicLink(email: string) {
    return api<{ ok: boolean; message: string; devLink?: string }>(
      "/api/auth/magic-link",
      { method: "POST", body: JSON.stringify({ email }) },
    );
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    user.value = null;
    memberships.value = [];
    currentTenantId.value = null;
    currentRole.value = null;
  }

  async function switchTenant(tenantId: string) {
    await api("/api/auth/switch-tenant", {
      method: "POST",
      body: JSON.stringify({ tenantId }),
    });
    await fetchMe();
  }

  return {
    user,
    memberships,
    currentTenantId,
    currentRole,
    loaded,
    isAuthenticated,
    isAdmin,
    canWrite,
    currentTenant,
    fetchMe,
    requestMagicLink,
    logout,
    switchTenant,
  };
});
