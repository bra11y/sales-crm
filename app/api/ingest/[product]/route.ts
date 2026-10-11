import { handleIngest } from "@/lib/crm/ingest";
import { supabaseCrmDb } from "@/lib/crm/supabase-db";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function secretFor(product: string) {
  if (!/^[a-z0-9-]{1,40}$/.test(product)) return undefined;
  return process.env[`CRM_SECRET_${product.toUpperCase().replaceAll("-", "_")}`];
}

export async function POST(request: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const admin = createSupabaseAdminClient();
  if (!admin) return Response.json({ error: "The CRM database is not configured." }, { status: 503 });

  const result = await handleIngest({
    product,
    rawBody: await request.text(),
    timestamp: request.headers.get("x-crm-timestamp"),
    signature: request.headers.get("x-crm-signature"),
    nowSeconds: Math.floor(Date.now() / 1000),
    secret: secretFor(product),
    db: supabaseCrmDb(admin),
  });
  return Response.json(result.body, { status: result.status });
}
