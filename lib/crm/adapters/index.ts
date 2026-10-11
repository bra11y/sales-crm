import type { Adapter } from "./shared.ts";
import { adaptBihub } from "./bihub.ts";
import { adaptLux, adaptWashcare } from "./presso.ts";

const ADAPTERS: Record<string, Adapter> = {
  washcare: adaptWashcare,
  lux: adaptLux,
  bihub: adaptBihub,
};

export function adapterFor(product: string): Adapter | null {
  return ADAPTERS[product] ?? null;
}

export type { Adapter };
