import { updateInventoryAction } from "@/app/actions/products";
import { requireOrganization } from "@/lib/tenancy";

export default async function InventoryPage() {
  const { supabase, organization } = await requireOrganization();

  const { data: rows } = await supabase
    .from("inventory")
    .select(
      "id, quantity, reserved, reorder_point, product_variants(sku, name, products(name))",
    )
    .eq("organization_id", organization.id)
    .order("updated_at", { ascending: false });

  return (
    <div>
      <h1>Estoque</h1>
      <p className="muted">Saldo por store_id + product_variant_id (loja padrão)</p>

      <table style={{ marginTop: 16 }}>
        <thead>
          <tr>
            <th>Produto</th>
            <th>SKU</th>
            <th>Qtd</th>
            <th>Reservado</th>
            <th>Reposição</th>
            <th>Alerta</th>
            <th>Ajustar</th>
          </tr>
        </thead>
        <tbody>
          {(rows ?? []).map((row) => {
            const variant = row.product_variants as unknown as {
              sku: string;
              name: string | null;
              products: { name: string } | null;
            } | null;
            const low = row.quantity <= row.reorder_point;
            return (
              <tr key={row.id}>
                <td>{variant?.products?.name ?? "—"}</td>
                <td>{variant?.sku}</td>
                <td>{row.quantity}</td>
                <td>{row.reserved}</td>
                <td>{row.reorder_point}</td>
                <td>{low ? "REPOR" : "ok"}</td>
                <td>
                  <form
                    action={updateInventoryAction}
                    style={{ display: "flex", gap: 4, alignItems: "center" }}
                  >
                    <input type="hidden" name="inventory_id" value={row.id} />
                    <input
                      name="quantity"
                      type="number"
                      defaultValue={row.quantity}
                      style={{ width: 72 }}
                    />
                    <input
                      name="reorder_point"
                      type="number"
                      defaultValue={row.reorder_point}
                      style={{ width: 72 }}
                    />
                    <button type="submit">Salvar</button>
                  </form>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
