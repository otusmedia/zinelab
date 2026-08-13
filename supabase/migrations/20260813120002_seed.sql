-- Seed sales channels for V1

insert into public.sales_channels (code, name, is_active)
values
  ('own_store', 'Loja própria', true),
  ('mercado_livre', 'Mercado Livre', true)
on conflict (code) do update
set name = excluded.name,
    is_active = excluded.is_active;
