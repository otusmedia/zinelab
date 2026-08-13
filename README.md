# Zine Lab V1

SaaS multi-tenant de gestão de produtos, estoque, clientes, pedidos e canais (Mercado Livre), com UI wireframe preto e branco.

## Stack

- Next.js (App Router) em `zine-lab/`
- Supabase (Auth, Postgres, RLS, Storage opcional)

## Princípios

- `products` = verdade interna
- `channel_listings` = representação em canal externo
- Tokens OAuth em `channel_connection_secrets` (somente `service_role` / server)
- `customers.external_ids` jsonb é **V1**; evoluir para `customer_external_identities` depois

## Setup

1. Crie um projeto no [Supabase](https://supabase.com).
2. Copie `.env.example` → `.env.local` e preencha URL/keys.
3. Aplique as migrations em `supabase/migrations/` (SQL Editor ou `supabase db push`).
4. Instale e rode:

```bash
cd zine-lab
npm install
npm run dev
```

5. (Opcional) Mercado Livre: crie app em https://developers.mercadolivre.com.br/ e preencha `ML_APP_ID`, `ML_CLIENT_SECRET`, `ML_REDIRECT_URI`.

## Isolamento

Ver `supabase/tests/isolation.sql`. Meta: Org A nunca lê/escreve dados da Org B; secrets nunca voltam no client.

## Escopo V1

Auth + organization + store default · produtos/variantes/estoque · clientes · pedidos com snapshot · OAuth ML · listings + sync_jobs · dashboard.

Fora: loja builder, marketing, suporte IA, Ads, billing.
