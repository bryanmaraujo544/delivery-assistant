# Deploy

**Dois serviços**, cada um no que faz melhor:

| Artefato | Onde | Por quê |
|---|---|---|
| **Front** (`dist/`) | **Vercel** | CDN, cache de borda e **preview deploy por PR** |
| **API** (`dist-server/main.js`) | **Railway** (~US$ 5/mês) | Fastify é processo de longa duração, não função sob demanda |

O preço de separar é CORS e uma variável a mais — ambos resolvidos abaixo.

---

## 0. Testar no celular SEM deploy

Não é preciso publicar nada para usar num aparelho real — basta a mesma Wi-Fi.

```bash
npm run api:dev    # terminal 1
npm run dev        # terminal 2
ip -4 addr show scope global | grep -oE 'inet [0-9.]+'
```

No celular, abra `http://SEU_IP:5173`. Funciona sem configurar nada porque o
Vite escuta em `0.0.0.0`, o front deriva o endereço da API do host de onde veio,
e o CORS em dev aceita faixas de **IP privado** (público segue bloqueado).

**Limitação:** sem HTTPS o navegador não instala o PWA. Para testar a instalação
na tela de início — o spike 2, ainda aberto — é preciso HTTPS: use um túnel
(`cloudflared tunnel --url http://localhost:5173`) ou faça o deploy.

---

## 1. API na Railway

1. **railway.app** → *New Project* → *Deploy from GitHub repo* → `delivery-assistant`
2. A Railway lê o `railway.json`: build `npm run build:server`, start `npm start`,
   healthcheck em `/health` (que faz um `select 1` real no Postgres)
3. *Variables*:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | string do Neon **com** `-pooler` |
| `AUTH_SECRET` | 32+ caracteres — `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `NODE_ENV` | `production` |
| `CORS_ORIGINS` | ver abaixo — **sem isto o navegador bloqueia tudo** |
| `RESEND_API_KEY` | *opcional*: só o login por OTP usa. Sem ela, senha funciona normal |
| `EMAIL_REMETENTE` | obrigatória **se** houver `RESEND_API_KEY` |

`PORT` é injetada pela Railway — não defina.

4. *Settings → Networking* → gerar domínio público.

### `CORS_ORIGINS` e os preview deploys

Cada PR na Vercel ganha uma URL nova (`precifica-a1b2c3.vercel.app`), então uma
lista fixa quebraria todos os previews. O curinga resolve **sem** abrir a API
para qualquer projeto hospedado na Vercel:

```
CORS_ORIGINS=https://precifica.vercel.app,https://precifica-*.vercel.app
```

O `*` casa apenas com `[a-z0-9-]`, e o padrão é ancorado. Verificado:
`precifica-a1b2c3.vercel.app` e `precifica-git-feat-x.vercel.app` passam;
`projeto-de-outra-pessoa.vercel.app` é bloqueado.

---

## 2. Front na Vercel

1. **vercel.com** → *Add New Project* → importe o mesmo repositório
2. O `vercel.json` já define build, output, fallback de SPA e cache
3. Em *Environment Variables*, defina:

```
VITE_API_URL = https://SUA-API.up.railway.app
```

**É lida em BUILD TIME.** Definir depois do build não tem efeito — precisa
existir antes, e mudar exige rebuild. Se faltar, o build do front **falha alto
de propósito**, em vez de publicar um app que tenta falar com `localhost` e
quebra em toda tela sem dizer por quê.

### Cache: o service worker não pode ser cacheado

O `vercel.json` marca `/sw.js` como `must-revalidate` e os `/assets/*` como
`immutable`. Assets têm hash no nome e podem viver para sempre; **o service
worker não** — se ficar preso numa versão antiga, a usuária continua rodando um
app velho depois do deploy, sem forma de sair disso.

---

## 3. Migrations — rodar você, antes do primeiro acesso

**Não rodam no deploy**, de propósito: migration automática é forma conhecida de
derrubar produção, e este projeto já apanhou de um `ALTER` que o `drizzle-kit`
gerou inválido e que **falhou em silêncio**.

```bash
DATABASE_URL_UNPOOLED="<string direta do Neon>" npm run db:migrate
```

Depois **confira as tabelas no banco** — não confie na ausência de erro. O seed
de unidades (`drizzle/seed-unidades.sql`) roda **uma vez**; sem ele as FKs de
unidade não resolvem e nada é gravável.

---

## 4. Checklist antes de considerar no ar

- [ ] Migrations aplicadas e **conferidas no banco**
- [ ] Seed de unidades rodado uma vez
- [ ] `/health` respondendo na URL da Railway
- [ ] `VITE_API_URL` definida na Vercel **antes** do build
- [ ] `CORS_ORIGINS` com o domínio de produção **e** o curinga de preview
- [ ] Criar conta por senha e conferir que a sincronização sobe os dados
- [ ] Abrir no celular e **instalar na tela de início** — é o spike 2, ainda aberto
- [ ] Confirmar que o onboarding pede os preços e que o custo muda ao corrigir

---

## Nota de custo

Railway não tem free tier real em 2026: **US$ 5/mês de mínimo** no Hobby, com
consumo por cima. Vercel serve o front no plano free. Se o custo da API
incomodar, **Render** tem free tier de verdade — hiberna após 15 min e acorda em
~1 min, tolerável aqui porque o app é offline-first e ninguém espera a API. A
troca não exige mudança de código.
