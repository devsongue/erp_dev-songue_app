import "dotenv/config";
import { defineConfig } from "@prisma/config";

// `env("DATABASE_URL")` leve une erreur si la variable manque, ce qui faisait
// echouer `prisma generate` (postinstall, build) sur une machine sans .env alors
// que la generation du client n'a pas besoin de la base. Seules les commandes
// qui s'y connectent (migrate, studio) exigent une vraie URL.
export default defineConfig({
  schema: "./prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
