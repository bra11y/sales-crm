import { createBrowserClient } from "@supabase/ssr";

// For uploads straight from the browser to private storage. Uses the public key only;
// row-level security and the storage policies decide what each person can touch.
let client: ReturnType<typeof createBrowserClient> | null = null;
export function supabaseBrowser() {
  client ??= createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
  return client;
}
