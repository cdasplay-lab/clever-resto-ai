export async function heartbeat(
  db: any,
  service: string,
  restaurantId: string | null,
  status: "ok" | "degraded" | "down" = "ok",
  details: Record<string, unknown> = {},
) {
  try {
    await db.rpc("record_service_heartbeat", {
      _service: service,
      _restaurant_id: restaurantId,
      _status: status,
      _details: details,
    });
  } catch (_) {
    /* monitoring never breaks customer traffic */
  }
}
