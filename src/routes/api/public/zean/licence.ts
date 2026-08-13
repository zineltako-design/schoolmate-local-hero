import { createFileRoute } from "@tanstack/react-router";

/**
 * Activation d'une licence par l'administrateur d'une école.
 * Vérifie la clé dans licences_keys puis passe l'école en statut "actif".
 */
export const Route = createFileRoute("/api/public/zean/licence")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { json, bad, getCaller } = await import("@/lib/zean.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const caller = await getCaller(request);
        if (!caller) return bad("Session requise", 401);
        if (!caller.superadmin && !["admin", "directeur"].includes(caller.role)) {
          return bad("Réservé à l'administrateur de l'école", 403);
        }

        let b: { cle?: string; ecole_code?: string };
        try {
          b = (await request.json()) as typeof b;
        } catch {
          return bad("Requête invalide");
        }

        const cle = (b.cle || "").trim().toUpperCase();
        const ecoleCode = (caller.superadmin ? b.ecole_code || "" : caller.ecole_code)
          .trim()
          .toUpperCase();
        if (!cle) return bad("Clé d'activation requise");
        if (!ecoleCode || ecoleCode === "*") return bad("École introuvable pour ce compte");

        const { data: keys, error } = await supabaseAdmin
          .from("licences_keys")
          .select("*")
          .eq("cle", cle)
          .limit(1);
        if (error) return bad(error.message, 500);

        const licence = keys?.[0];
        if (!licence) return bad("Clé inconnue. Vérifiez la saisie.", 404);
        if (licence.statut === "revoquee") return bad("Cette clé a été révoquée.");
        if (licence.statut === "utilisee" || licence.statut === "active") {
          const dejaPour = (licence.ecole_code || "").toUpperCase();
          if (dejaPour && dejaPour !== ecoleCode) {
            return bad("Cette clé est déjà utilisée par un autre établissement.");
          }
        }
        const reservee = (licence.ecole_code || "").toUpperCase();
        if (reservee && reservee !== ecoleCode) {
          return bad("Cette clé ne correspond pas à votre établissement.");
        }

        const { data: ecoles } = await supabaseAdmin
          .from("ecoles")
          .select("*")
          .eq("code", ecoleCode)
          .limit(1);
        const ecole = ecoles?.[0];
        if (!ecole) return bad("École introuvable dans la base.", 404);

        const now = Date.now();
        const jours = Number(licence.duree_jours) > 0 ? Number(licence.duree_jours) : 365;
        const expiration = new Date(now + jours * 86400000).toISOString();

        const upKey = await supabaseAdmin
          .from("licences_keys")
          .update({
            statut: "utilisee",
            ecole_id: ecole.id,
            ecole_nom: ecole.nom,
            ecole_code: ecoleCode,
            date_activation: new Date(now).toISOString(),
            date_expiration: expiration,
            activee_par: caller.email || "",
            updated_at: now,
          })
          .eq("id", licence.id);
        if (upKey.error) return bad(upKey.error.message, 500);

        const upEcole = await supabaseAdmin
          .from("ecoles")
          .update({
            statut: "actif",
            plan: licence.plan || ecole.plan || "annuel",
            licence_fin: expiration,
            updated_at: now,
          })
          .eq("id", ecole.id);
        if (upEcole.error) return bad(upEcole.error.message, 500);

        await supabaseAdmin.from("abonnements").upsert(
          {
            id: `abo-${now}`,
            ecole_id: ecole.id,
            ecole_nom: ecole.nom,
            ecole_code: ecoleCode,
            licence_key_id: licence.id,
            plan: licence.plan || "annuel",
            montant: licence.montant || 0,
            devise: licence.devise || ecole.devise || "GNF",
            mode_paiement: "cle_activation",
            statut: "paye",
            date_paiement: new Date(now).toISOString(),
            periode_debut: new Date(now).toISOString(),
            periode_fin: expiration,
            reference: cle,
            created_at: now,
            updated_at: now,
          },
          { onConflict: "id" },
        );

        return json({ ok: true, licence_fin: expiration, plan: licence.plan || "annuel" });
      },
    },
  },
});
