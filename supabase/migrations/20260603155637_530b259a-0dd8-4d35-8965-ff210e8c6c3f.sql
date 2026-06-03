
-- Ensure unique key the upsert in sync_customer_memory_on_order relies on.
CREATE UNIQUE INDEX IF NOT EXISTS customer_memory_unique_handle
  ON public.customer_memory (restaurant_id, channel, customer_handle);

-- Wire the existing sync function as an AFTER INSERT/UPDATE trigger on orders.
DROP TRIGGER IF EXISTS trg_orders_sync_customer_memory ON public.orders;
CREATE TRIGGER trg_orders_sync_customer_memory
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_customer_memory_on_order();
