## Shared restaurant access
- Use restaurant-scoped `user_roles` admin rows and RLS policies for shared dashboards; keep ownership unchanged and preserve existing command-level permissions.
- Shared-account access regression tests use externally minted sessions, never credentials or tokens stored in source.