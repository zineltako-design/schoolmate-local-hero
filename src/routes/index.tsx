import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Zean School Manager — Gestion scolaire local-first" },
      {
        name: "description",
        content:
          "Zean School Manager : élèves, notes, bulletins, paiements et comptabilité, 100% hors-ligne avec IndexedDB.",
      },
      { property: "og:title", content: "Zean School Manager" },
      {
        property: "og:description",
        content:
          "Application de gestion scolaire local-first : élèves, notes, bulletins, caisse et comptabilité.",
      },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ href: "/app/index.html" });
  },
  component: () => null,
});
