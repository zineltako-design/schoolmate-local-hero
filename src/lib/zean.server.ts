/**
 * zean.server.ts — Provisionnement sécurisé (service role)
 * Utilisé uniquement par les routes serveur /api/public/zean/*.
 * Jamais importé par le client (suffixe .server).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type Profil = {
  user_id: string;
  ecole_code: string;
  role: string;
  email: string | null;
  prenom: string | null;
  nom: string | null;
  actif: boolean;
  superadmin: boolean;
};

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export function bad(message: string, status = 400) {
  return json({ ok: false, error: message }, status);
}

/** Identifie l'appelant à partir du jeton Bearer, puis lit son profil. */
export async function getCaller(request: Request): Promise<Profil | null> {
  const header = request.headers.get("authorization") || "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: profil } = await supabaseAdmin
    .from("profils")
    .select("*")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!profil || profil.actif === false) return null;
  return profil as Profil;
}

/** Crée (ou retrouve) un compte d'authentification pour cet email. */
export async function ensureAuthUser(email: string, password: string): Promise<string> {
  const clean = email.trim().toLowerCase();
  const created = await supabaseAdmin.auth.admin.createUser({
    email: clean,
    password,
    email_confirm: true,
  });
  if (created.data.user) return created.data.user.id;

  // Compte déjà existant → on le retrouve puis on remet le mot de passe fourni.
  const list = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const found = list.data?.users?.find((u) => (u.email || "").toLowerCase() === clean);
  if (!found) throw new Error(created.error?.message || "Création du compte impossible");
  if (password) {
    await supabaseAdmin.auth.admin.updateUserById(found.id, { password, email_confirm: true });
  }
  return found.id;
}

/** Rattache un compte à une école avec un rôle donné. */
export async function upsertProfil(row: {
  user_id: string;
  ecole_code: string;
  role: string;
  email: string;
  prenom?: string;
  nom?: string;
  superadmin?: boolean;
}) {
  const { error } = await supabaseAdmin.from("profils").upsert(
    {
      user_id: row.user_id,
      ecole_code: row.ecole_code.trim().toUpperCase(),
      role: row.role,
      email: row.email.trim().toLowerCase(),
      prenom: row.prenom || "",
      nom: row.nom || "",
      actif: true,
      superadmin: !!row.superadmin,
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);
}

export const nowMs = () => Date.now();
