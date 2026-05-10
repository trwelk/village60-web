<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## List / directory pages

New dashboard pages that show a filtered, paginated list (residents, homes, charges, tasks, etc.) **must** use the `VillageList` shell from `src/components/VillageList.tsx`.

### What VillageList provides

- **`VillageList`** — layout root with optional `toolbar`, `filters` card, `error` alert, `loading` state, built-in `pagination` (via `VillageListPagination`), and a body that can be table-wrapped or plain (`wrapBody="table" | "none"`).
- **`VillageListPagination`** — "Showing X–Y of Z" range + Prev/Next buttons. Accepts URL-driven or React-state pagination handlers. Also usable standalone for ledger pages that manage their own card layout.
- **`VillageListFilter`** — labeled filter control wrapper (consistent `village-field-label` + flex column).
- **`VillageListEmpty`** — empty-state row (`<tr>` for tables, `<p>` for card stacks).

### When to use what

| Pattern | Component |
|---------|-----------|
| Full directory page (toolbar + filters + pagination + table/cards) | `VillageList` |
| Ledger page with custom card layout but standard pagination | `VillageListPagination` standalone |
| Individual filter inside a filters row | `VillageListFilter` |
| Empty-state message in a table or card list | `VillageListEmpty` |

### Do NOT

- Hand-roll `from`/`to`/`canPrev`/`canNext` pagination logic — `VillageListPagination` computes these.
- Duplicate the "Showing X–Y of Z" sentence outside of `VillageListPagination`.
- Copy pagination button classes inline — use the shared component.

See `features/village_list_shell_design.md` for the full design rationale and migration history.
