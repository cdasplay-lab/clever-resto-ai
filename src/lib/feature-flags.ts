import { supabase } from "@/integrations/supabase/client";

// Atomic top-level merge into restaurants.feature_flags via the
// merge_feature_flags RPC. The old pattern (select → spread → update) raced:
// two in-flight toggles clobbered each other's keys.
export async function mergeFeatureFlags(
  restaurantId: string,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await (supabase.rpc as CallableFunction)("merge_feature_flags", {
    _restaurant_id: restaurantId,
    _patch: patch,
  });
  if (error) throw error;
  return (data as Record<string, unknown>) ?? null;
}
