import type { Env } from "../env";

export async function sendMagicLinkEmail(
  env: Env,
  to: string,
  link: string,
): Promise<{ delivered: boolean; link: string }> {
  if (!env.RESEND_API_KEY) {
    console.log(`[dev-email] Magic link for ${to}: ${link}`);
    return { delivered: false, link };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Stablemanager <onboarding@resend.dev>",
      to: [to],
      subject: "Dein Anmelde-Link",
      text: `Hallo,\n\nmelde dich hier an:\n${link}\n\nDer Link ist 15 Minuten gültig.`,
    }),
  });

  if (!res.ok) {
    console.error("Resend error", await res.text());
    return { delivered: false, link };
  }

  return { delivered: true, link };
}

export async function sendInviteEmail(
  env: Env,
  to: string,
  link: string,
  tenantName: string,
): Promise<{ delivered: boolean; link: string }> {
  if (!env.RESEND_API_KEY) {
    console.log(`[dev-email] Invite for ${to} (${tenantName}): ${link}`);
    return { delivered: false, link };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Stablemanager <onboarding@resend.dev>",
      to: [to],
      subject: `Einladung: ${tenantName}`,
      text: `Du wurdest zu ${tenantName} eingeladen.\n\nEinladung annehmen:\n${link}\n\nDer Link ist 7 Tage gültig.`,
    }),
  });

  if (!res.ok) {
    console.error("Resend error", await res.text());
    return { delivered: false, link };
  }

  return { delivered: true, link };
}
