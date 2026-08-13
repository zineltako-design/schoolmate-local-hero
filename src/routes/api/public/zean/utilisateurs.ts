import { createFileRoute } from "@tanstack/react-router";

/**
 * Création d'un membre du personnel (compte cloud réel).
 * Réservé à l'admin / directeur de l'école, ou au SuperAdmin.
 */
export const Route = createFileRoute("/api/public/zean/utilisateurs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { json, bad, getCaller, ensureAuthUser, upsertProfil } = await import(
          "@/lib/zean.server"
        );
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const caller = await getCaller(request);
        if (!caller) return bad("Session requise", 401);

        type Body = {
          id?: string;
          email?: string;
          password?: string;
          prenom?: string;
          nom?: string;
          role?: string;
          classe_id?: string;
          matieres_ids?: string[];
          ecole_code?: string;
        };
        let b: Body;
        try {
          b = (await request.json()) as Body;
        } catch {
          return bad("Requête invalide");
        }

        const isAdmin = caller.superadmin || ["admin", "directeur"].includes(caller.role);
        if (!isAdmin) return bad("Réservé à l'administrateur de l'école", 403);

        const ecoleCode = (
          caller.superadmin ? b.ecole_code || caller.ecole_code : caller.ecole_code
        )
          .trim()
          .toUpperCase();
        if (!ecoleCode || ecoleCode === "*") return bad("École introuvable pour ce compte");

        const email = (b.email || "").trim().toLowerCase();
        const password = b.password || "";
        const role = b.role || "prof";
        if (!email || password.length < 6) return bad("Email et mot de passe (6+) requis");
        if (!["admin", "directeur", "prof", "comptable", "superviseur"].includes(role)) {
          return bad("Rôle invalide");
        }

        const now = Date.now();
        try {
          const userId = await ensureAuthUser(email, password);
          await upsertProfil({
            user_id: userId,
            ecole_code: ecoleCode,
            role,
            email,
            prenom: b.prenom || "",
            nom: b.nom || "",
          });

          const row = {
            id: b.id || `user-${now}`,
            ecole_code: ecoleCode,
            email,
            role,
            prenom: b.prenom || "",
            nom: b.nom || "",
            actif: true,
            classe_id: b.classe_id || "",
            matieres_ids: b.matieres_ids || [],
            user_id: userId,
            created_at: now,
            updated_at: now,
          };
          const up = await supabaseAdmin
            .from("utilisateurs")
            .upsert(row, { onConflict: "id" });
          if (up.error) throw new Error(up.error.message);

          return json({ ok: true, utilisateur: row });
        } catch (e) {
          return bad(e instanceof Error ? e.message : "Erreur inconnue", 500);
        }
      },
    },
  },
});
