import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  // Migrations exigem conexao DIRETA (sem -pooler): o modo transaction do
  // PgBouncer nao suporta os comandos de DDL/sessao que o drizzle-kit emite.
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '',
  },
})
