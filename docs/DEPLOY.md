# Deploy

**Um serviço só.** O Fastify serve a API e o front no mesmo processo:
`npm run build:all` gera `dist/` (front) e `dist-server/main.js` (servidor), e
`npm start` sobe os dois juntos.

Chegamos aqui depois de planejar dois deploys (CDN + Railway). Juntar eliminou
CORS, `VITE_API_URL`, o segundo host e o segundo deploy. O custo — front saindo
de um Node em vez de CDN — não aparece nesta escala.

---

## 0. Testar no celular SEM deploy

Não é preciso publicar nada para usar o app num aparelho real — basta estar na
mesma Wi-Fi. É assim que se testa PWA em iPhone (instalar na tela de início) e
o comportamento de mão suja/tela pequena que nenhum screenshot revela.

```bash
# terminal 1 — API
npm run api:dev

# terminal 2 — front
npm run dev

# descobrir o IP da máquina
ip -4 addr show scope global | grep -oE 'inet [0-9.]+'
```

No celular, abra **`http://SEU_IP:5173`** (ex.: `http://192.168.1.13:5173`).

Funciona sem configurar nada porque:
- o Vite escuta em `0.0.0.0` (`server.host: true`);
- o front **deriva o endereço da API do host de onde ele mesmo foi servido** —
  fixar `localhost` faria o celular chamar a si próprio;
- o CORS em dev aceita faixas de **IP privado** (10.x, 172.16–31.x, 192.168.x).
  IP público continua bloqueado mesmo em dev.

**Limitação real:** sem HTTPS, o navegador não instala o PWA nem libera câmera e
microfone. Para testar a instalação na tela de início — que é o spike 2, ainda
aberto — é preciso HTTPS: use um túnel (`cloudflared tunnel --url
http://localhost:5173`) ou faça o deploy.

## 1. Deploy no Railway (um serviço só)

O Fastify serve **a API e o front** no mesmo processo. Isso elimina CORS,
`VITE_API_URL`, o segundo host e o segundo deploy — e a Railway dá HTTPS, o que
torna o PWA instalável.

### Passo a passo

1. **railway.app** → *New Project* → *Deploy from GitHub repo* → selecione
   `bryanmaraujo544/delivery-assistant`.
2. A Railway lê o `railway.json` sozinha:
   - build: `npm run build:all` (front + bundle do servidor)
   - start: `npm start`
   - healthcheck: `/health`, que faz um `select 1` real no Postgres
3. Em *Variables*, cole as variáveis abaixo.
4. Em *Settings → Networking*, gere o domínio público.

### Variáveis de ambiente

| Variável | Valor | Observação |
|---|---|---|
| `DATABASE_URL` | string do Neon **com** `-pooler` | a aplicação usa o pooler |
| `AUTH_SECRET` | 32+ caracteres aleatórios | `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `NODE_ENV` | `production` | |
| `RESEND_API_KEY` | *(opcional)* | só o login por OTP usa. Sem ela o app sobe e o login por **senha** funciona normal |
| `EMAIL_REMETENTE` | *(opcional)* | obrigatória **se** houver `RESEND_API_KEY` |

`PORT` é injetada pela Railway — não defina.
`CORS_ORIGINS` **não é mais necessária**: mesma origem.

### Migrations — rodar você, antes do primeiro acesso

**Não rodam sozinhas no deploy**, de propósito: migration automática é forma
conhecida de derrubar produção, e este projeto já apanhou de um `ALTER` que o
`drizzle-kit` gerou inválido e que **falhou em silêncio**.

```bash
DATABASE_URL_UNPOOLED="<string direta do Neon>" npm run db:migrate
```

Depois **confira as tabelas no banco** — não confie na ausência de erro. O seed
de unidades (`drizzle/seed-unidades.sql`) precisa rodar **uma vez**; sem ele as
FKs de unidade não resolvem e nada é gravável.

## 2. Checklist antes de considerar no ar

- [ ] Migrations aplicadas e **conferidas no banco**
- [ ] Seed de unidades rodado uma vez
- [ ] `/health` respondendo na URL pública do Railway
- [ ] Abrir a URL no celular e **instalar na tela de início** (HTTPS libera isso) — é o spike 2, ainda aberto
- [ ] Criar conta por senha e conferir que a sincronização sobe os dados
- [ ] Confirmar que o onboarding pede os preços e que o custo muda ao corrigir

---

## Nota de custo

Railway não tem free tier real em 2026: são **US$ 5/mês de mínimo** no plano
Hobby, com consumo cobrado por cima. Se o custo incomodar, **Render** tem free
tier de verdade — hiberna após 15 min e acorda em ~1 min, o que é tolerável
aqui justamente porque o app é offline-first e ninguém espera a API. A troca
não exige mudança de código: o mesmo bundle roda nos dois.
