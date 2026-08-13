import { createFileRoute } from "@tanstack/react-router";

/**
 * Création d'une école + compte directeur.
 * Réservé au SuperAdmin (jeton Bearer vérifié côté serveur).
 */
export const Route = createFileRoute("/api/public/zean/ecoles")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { json, bad, getCaller, ensureAuthUser, upsertProfil } = await import(
          "@/lib/zean.server"
        );
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const caller = await getCaller(request);
        if (!caller) return bad("Session requise", 401);
        if (!caller.superadmin) return bad("Réservé au SuperAdmin", 403);

        type Body = {
          code?: string;
          nom?: string;
          ville?: string;
          pays?: string;
          telephone?: string;
          directeur_nom?: string;
          directeur_email?: string;
          directeur_password?: string;
          devise?: string;
          notes_internes?: string;
          essai_jours?: number;
        };
        let b: Body;
        try {
          b = (await request.json()) as Body;
        } catch {
          return bad("Requête invalide");
        }

        const code = (b.code || "").trim().toUpperCase();
        const nom = (b.nom || "").trim();
        const dirEmail = (b.directeur_email || "").trim().toLowerCase();
        const dirNom = (b.directeur_nom || "").trim();
        const dirPwd = b.directeur_password || "";
        if (!code || !nom || !dirEmail || !dirNom || dirPwd.length < 6) {
          return bad("Code, nom, directeur et mot de passe (6+) requis");
        }
        if (!/^[A-Z0-9][A-Z0-9-]{1,14}$/.test(code)) return bad("Code école invalide");

        const { data: dejaPris } = await supabaseAdmin
          .from("ecoles")
          .select("id")
          .eq("code", code)
          .limit(1);
        if (dejaPris && dejaPris.length > 0) return bad(`Le code "${code}" est déjà utilisé`);

        const now = Date.now();
        const jours = Number(b.essai_jours) > 0 ? Number(b.essai_jours) : 14;
        const ecoleId = `ecole-${now}`;
        const essaiFin = new Date(now + jours * 86400000).toISOString();

        const fiche = {
          id: ecoleId,
          code,
          nom,
          ville: (b.ville || "").trim(),
          pays: b.pays || "Guinée",
          telephone: b.telephone || "",
          email_contact: dirEmail,
          directeur_nom: dirNom,
          directeur_email: dirEmail,
          devise: b.devise || "GNF",
          statut: "essai",
          date_creation: new Date(now).toISOString(),
          essai_fin: essaiFin,
          licence_fin: null,
          nb_eleves: 0,
          nb_utilisateurs: 1,
          plan: "essai",
          notes_internes: b.notes_internes || "",
          created_at: now,
          updated_at: now,
        };

        try {
          const ins = await supabaseAdmin.from("ecoles").insert(fiche);
          if (ins.error) throw new Error(ins.error.message);

          const userId = await ensureAuthUser(dirEmail, dirPwd);
          await upsertProfil({
            user_id: userId,
            ecole_code: code,
            role: "admin",
            email: dirEmail,
            prenom: dirNom.split(" ")[0] || dirNom,
            nom: dirNom.split(" ").slice(1).join(" "),
          });

          await supabaseAdmin.from("utilisateurs").upsert(
            {
              id: `user-${now}`,
              ecole_code: code,
              email: dirEmail,
              role: "admin",
              prenom: dirNom.split(" ")[0] || dirNom,
              nom: dirNom.split(" ").slice(1).join(" "),
              actif: true,
              user_id: userId,
              created_at: now,
              updated_at: now,
            },
            { onConflict: "id" },
          );

          await supabaseAdmin.from("ecole_config").upsert(
            {
              id: `cfg-${ecoleId}`,
              ecole_code: code,
              nom,
              adresse: fiche.ville,
              telephone: fiche.telephone,
              email: dirEmail,
              devise: fiche.devise,
              matricule_prefix: code,
              code_ecole: code,
              ville: fiche.ville,
              configured: false,
              created_at: now,
              updated_at: now,
            },
            { onConflict: "id" },
          );

          return json({ ok: true, ecole: fiche });
        } catch (e) {
          return bad(e instanceof Error ? e.message : "Erreur inconnue", 500);
        }
      },
    },
  },
});
