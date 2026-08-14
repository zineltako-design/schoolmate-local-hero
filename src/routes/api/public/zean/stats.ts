import { createFileRoute } from "@tanstack/react-router";

/**
 * Recalcule les compteurs réels (élèves / utilisateurs) de chaque école
 * depuis la base partagée, met à jour la table `ecoles` et renvoie le détail.
 * Réservé au SuperAdmin.
 */
export const Route = createFileRoute("/api/public/zean/stats")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { json, bad, getCaller } = await import("@/lib/zean.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const caller = await getCaller(request);
        if (!caller) return bad("Session requise", 401);
        if (!caller.superadmin) return bad("Réservé au SuperAdmin", 403);

        const [ecolesRes, elevesRes, usersRes] = await Promise.all([
          supabaseAdmin.from("ecoles").select("id, code, nb_eleves, nb_utilisateurs"),
          supabaseAdmin.from("eleves").select("ecole_code"),
          supabaseAdmin.from("utilisateurs").select("ecole_code, actif"),
        ]);
        if (ecolesRes.error) return bad(ecolesRes.error.message, 500);

        const compte = (rows: { ecole_code: string | null }[] | null) => {
          const map = new Map<string, number>();
          for (const r of rows || []) {
            const k = (r.ecole_code || "").trim().toUpperCase();
            if (!k) continue;
            map.set(k, (map.get(k) || 0) + 1);
          }
          return map;
        };

        const eleves = compte(elevesRes.data);
        const users = compte((usersRes.data || []).filter((u) => u.actif !== false));

        const now = Date.now();
        const detail: Record<string, { nb_eleves: number; nb_utilisateurs: number }> = {};
        let totalEleves = 0;
        let totalUsers = 0;

        for (const e of ecolesRes.data || []) {
          const code = (e.code || "").trim().toUpperCase();
          const nbE = eleves.get(code) || 0;
          const nbU = users.get(code) || 0;
          detail[code] = { nb_eleves: nbE, nb_utilisateurs: nbU };
          totalEleves += nbE;
          totalUsers += nbU;
          if (Number(e.nb_eleves) !== nbE || Number(e.nb_utilisateurs) !== nbU) {
            await supabaseAdmin
              .from("ecoles")
              .update({ nb_eleves: nbE, nb_utilisateurs: nbU, updated_at: now })
              .eq("id", e.id);
          }
        }

        return json({ ok: true, detail, total_eleves: totalEleves, total_utilisateurs: totalUsers });
      },
    },
  },
});
