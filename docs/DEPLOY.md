# Deploy

São **dois artefatos com naturezas diferentes**, e por isso dois destinos:

| Artefato | O que é | Onde vai |
|---|---|---|
| **Front** (`dist/`) | Arquivos estáticos gerados por `npm run build` | Qualquer CDN — Cloudflare Pages, Vercel, Netlify (todos free) |
| **API** (`dist-server/main.js`) | Processo Node que precisa ficar ligado | **Railway** (~US$ 5/mês) |

A API não pode ir junto com o front porque Fastify é um processo de longa duração, não uma função sob demanda. Foi a fatura consciente de escolher Fastify em vez de serverless.

---

## 1. API no Railway

### Variáveis de ambiente

Configure no painel do Railway (Variables). **Nenhuma delas vai para o repositório.**

| Variável | Valor | Observação |
|---|---|---|
| `DATABASE_URL` | string do Neon **com** `-pooler` | a aplicação usa o pooler |
| `DATABASE_URL_UNPOOLED` | a mesma **sem** `-pooler` | só para migrations |
| `AUTH_SECRET` | 32+ caracteres aleatórios | `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `RESEND_API_KEY` | chave do Resend | **obrigatória** com `NODE_ENV=production` — a API se recusa a subir sem ela. Criar com permissão **Sending access**, restrita ao domínio — ver abaixo |
| `EMAIL_REMETENTE` | `Precifica <login@seu-dominio.com>` | o domínio precisa estar verificado no Resend |
| `CORS_ORIGINS` | URL do front, ex.: `https://precifica.pages.dev` | **sem isso o navegador bloqueia todas as chamadas** |
| `NODE_ENV` | `production` | faz o envio de e-mail falhar alto em vez de cair no console |

`PORT` é injetada pelo Railway — não defina.

### Como sobe

O `railway.json` já configura tudo:
- **build**: `npm run build:server` (esbuild → bundle único de ~31 kb)
- **start**: `npm start` (`node dist-server/main.js`)
- **healthcheck**: `/health`, que faz um `select 1` real no Postgres

O servidor já escuta em `0.0.0.0` e lê `process.env.PORT` — requisito de qualquer container.

### Chave do Resend: use **Sending access**, não Full access

O Resend oferece dois níveis:

| Nível | O que permite |
|---|---|
| **Full access** | criar, ler, atualizar e apagar **qualquer** recurso — inclusive domínios e outras chaves de API |
| **Sending access** | **só enviar e-mail**, e pode ser restrita a um domínio específico |

**Use `Sending access` + restrição de domínio.** O código chama exatamente uma
coisa do Resend — `resend.emails.send()` em `server/email.ts` — e nada mais.
Nenhuma API de domínios, chaves, audiências ou contatos.

Consequência prática: se a chave vazar (log, dump de env, commit acidental), o
atacante consegue mandar e-mail em nome do seu domínio — ruim, mas contornável
revogando a chave. Com **Full access** ele conseguiria também **apagar seu
domínio verificado e criar outras chaves**, o que transforma um incidente
recuperável em perda de controle da conta.

A restrição de domínio só fica disponível se a permissão for `Sending access` —
escolher Full access desabilita esse campo.

### Migrations

**Não rodam sozinhas no deploy**, de propósito: migration automática em cada
deploy é uma forma conhecida de derrubar produção com um `ALTER` mal gerado —
e este projeto já apanhou disso uma vez (o drizzle-kit gerou um `ALTER ... SET
DATA TYPE uuid` sem `USING`, que o Postgres recusa, e falhou em silêncio).

Rode você, apontando para o banco de produção:

```bash
DATABASE_URL_UNPOOLED="<string direta do Neon>" npm run db:migrate
```

Depois **confira no banco** que as tabelas existem — não confie na ausência de mensagem de erro.

O seed de unidades (`drizzle/seed-unidades.sql`) precisa rodar **uma vez**; sem ele as FKs de unidade não resolvem e nada é gravável.

---

## 2. Front no CDN

```bash
npm run build          # gera dist/
```

Publique `dist/` em Cloudflare Pages, Vercel ou Netlify (plano free serve).

**Duas configurações obrigatórias:**

1. **`VITE_API_URL`** apontando para a URL pública do Railway. É lida em build
   time, então precisa estar definida **antes** do `npm run build` na
   plataforma. Sem ela o app tenta `http://localhost:3333` e não fala com nada.

2. **Fallback de SPA**: toda rota desconhecida deve servir `index.html`. Sem
   isso, abrir `/fichas` direto (ou recarregar a página) devolve 404, porque o
   roteamento é do lado do cliente. Cloudflare Pages e Netlify fazem isso
   automaticamente; na Vercel pode precisar de um rewrite.

---

## 3. Checklist antes de considerar no ar

- [ ] Migrations aplicadas e **conferidas no banco**
- [ ] Seed de unidades rodado uma vez
- [ ] `CORS_ORIGINS` com a URL real do front (o navegador bloqueia calado se estiver errado)
- [ ] Domínio verificado no Resend e um e-mail de teste recebido de verdade
- [ ] `/health` respondendo na URL pública do Railway
- [ ] Login completo por um celular real, não só pelo desktop
- [ ] **Preços do catálogo semente substituídos** — hoje são placeholders inventados, marcados como estimados na UI. Ver `APRENDIZADOS.md § G`

---

## Nota de custo

Railway não tem free tier real em 2026: são **US$ 5/mês de mínimo** no plano
Hobby, com consumo cobrado por cima. Se o custo incomodar, **Render** tem free
tier de verdade — hiberna após 15 min e acorda em ~1 min, o que é tolerável
aqui justamente porque o app é offline-first e ninguém espera a API. A troca
não exige mudança de código: o mesmo bundle roda nos dois.
