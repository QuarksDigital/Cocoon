import seed from "@/data/products.json";

export type Category = "linear" | "square" | "round" | "rooftop";

export type Product = {
  slug: string;
  name: string;
  variant: string;
  category: Category;
  image: string;
  /** full-bleed scene photo rather than a cut-out on white */
  photo?: boolean;
  summary: string;
  sizes: string[];
  material: string;
  featured?: boolean;
  order: number;
};

export const fallbackProducts = (seed as Product[]).slice().sort((a, b) => a.order - b.order);

export const CATEGORIES: { key: Category | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "linear", label: "Linear" },
  { key: "square", label: "Square" },
  { key: "round", label: "Round" },
  { key: "rooftop", label: "Rooftop" },
];

/** Fetch from the Express API; fall back to bundled data if it is offline. */
export async function fetchProducts(signal?: AbortSignal): Promise<Product[]> {
  const res = await fetch("/api/products", { signal });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const json = (await res.json()) as { data: Product[] };
  if (!Array.isArray(json.data) || json.data.length === 0) throw new Error("empty");
  return json.data;
}
