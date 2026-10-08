# SQL heredado: NO ejecutar

Estos ficheros describen el proyecto Supabase anterior (de Marco). El esquema vigente es el de `../migrations/001..008`.

No aplicarlos sobre `FixedGap-prod`: sus políticas son más abiertas que las actuales (por ejemplo `subjects_select` para cualquier autenticado, `conversations_insert WITH CHECK (true)`, `sessions_update` sin `WITH CHECK`) y las funciones `SECURITY DEFINER` no fijan `search_path`. Se conservan solo como referencia histórica.
