export type MemberRole = "owner" | "admin" | "member";

export type Organization = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
};

export type Store = {
  id: string;
  organization_id: string;
  name: string;
  is_default: boolean;
  timezone: string;
};

export type Product = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  status: "draft" | "active" | "archived";
  created_at: string;
};

export type ProductVariant = {
  id: string;
  organization_id: string;
  product_id: string;
  sku: string;
  name: string | null;
  price: number;
  compare_at_price: number | null;
  status: string;
};

export type InventoryRow = {
  id: string;
  organization_id: string;
  store_id: string;
  product_variant_id: string;
  quantity: number;
  reserved: number;
  reorder_point: number;
};

export type Customer = {
  id: string;
  organization_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  /** V1 convenience. Evolve to customer_external_identities when multi-channel ids matter. */
  external_ids: Record<string, string>;
};

export type Order = {
  id: string;
  organization_id: string;
  customer_id: string | null;
  status: string;
  subtotal: number;
  discount_total: number;
  shipping_total: number;
  tax_total: number;
  total: number;
  currency: string;
  placed_at: string;
};

export type ChannelConnection = {
  id: string;
  organization_id: string;
  sales_channel_id: string;
  external_account_id: string | null;
  status: string;
  connected_at: string | null;
};

export type ChannelListing = {
  id: string;
  organization_id: string;
  channel_connection_id: string;
  product_id: string;
  product_variant_id: string | null;
  external_id: string | null;
  status: string;
  last_error: string | null;
};

export type SyncJob = {
  id: string;
  organization_id: string;
  type: string;
  status: string;
  error_message: string | null;
  created_at: string;
};
