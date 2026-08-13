import { createFileRoute } from "@tanstack/react-router";

/**
 * Initialisation unique du compte Éditrice (SuperAdmin).
 * Idempotent : si un SuperAdmin existe déjà, la route ne crée rien.
 */
export const Route = createFileRoute("/api/public/zean/bootstrap")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { json, bad, ensureAuthUser, upsertProfil } = await import("@/lib/zean.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let body: { email?: string; password?: string };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return bad("Requête invalide");
        }
        const email = (body.email || "").trim().toLowerCase();
        const password = body.password || "";
        if (!email || password.length < 8) return bad("Email et mot de passe (8+) requis");

        const { data: existing } = await supabaseAdmin
          .from("profils")
          .select("user_id, email")
          .eq("superadmin", true)
          .limit(1);

        if (existing && existing.length > 0) {
          return json({ ok: true, exists: true });
        }

        try {
          const userId = await ensureAuthUser(email, password);
          await upsertProfil({
            user_id: userId,
            ecole_code: "*",
            role: "superadmin",
            email,
            prenom: "Éditrice",
            nom: "Zean",
            superadmin: true,
          });
          return json({ ok: true, created: true });
        } catch (e) {
          return bad(e instanceof Error ? e.message : "Erreur inconnue", 500);
        }
      },
    },
  },
});
