# Translation-key impact map (read-only)

This report maps sample semantic units to the currently shipped DOM blocks and editor keys. It does not migrate data or activate new units.

## Mapping method

- Confirmed the key formula in `PageRenderer.tsx`: `page_${pageNumber}_block_${blockIdx}`, where `blockIdx` is the current DOM `blocks` array index.
- Matched each sample unit's source bbox to the current production DOM block with the greatest area containment. A mapping is accepted only when one block contains at least 98% of the unit bbox and is the unique best match.
- Cross-checked that the chosen DOM block's original `block_N` ID appears in the unit's source block lineage. The legacy DOM may merge several source blocks, so lineage alone cannot produce the editor array index or a one-to-one semantic mapping.

## Coverage and fanout

| Page | Sample units | Unique mapped | Ambiguous | Existing keys touched | Fanout keys | Max units per key |
|---:|---:|---:|---:|---:|---:|---:|
| 2 | 17 | 17 | 0 | 12 | 1 | 6 |
| 3 | 39 | 39 | 0 | 31 | 7 | 3 |
| 101 | 197 | 197 | 0 | 3 | 3 | 74 |

## Existing keys with multiple candidate units

- **`page_101_block_0` → 74 units:** `p101-c1-r001` Abilities 47; `p101-c1-r002` Any time 47; `p101-c1-r003` Tokens 95; `p101-c1-r004` Token Limitations 70; +70 more
- **`page_101_block_1` → 74 units:** `p101-c2-r001` Exit 19; `p101-c2-r002` Familiars 76; `p101-c2-r003` Farthest 62; `p101-c2-r004` Figures 38; +70 more
- **`page_101_block_2` → 49 units:** `p101-c3-r001` Re-Specing 87; `p101-c3-r002` Restore Adventurers 18; `p101-c3-r003` Rewards 14; `p101-c3-r004` Rounding Numbers 71; +45 more
- **`page_2_block_16` → 6 units:** `p2-credit-08` Character Art: Alex Hansen, Benjamin Schulz, ; `p2-credit-09` 3D Art: Jakub Szal, Jon Troy Nickel, Layna D ; `p2-credit-10` Writing and Storyboard: Ashley Lundberg, Broo; `p2-credit-11` Editing and Proofreading: Ashley Lundberg, Ia; +2 more
- **`page_3_block_1` → 2 units:** `p3-toc-00` Summary of Components; `p3-toc-01` Choosing a Game Mode
- **`page_3_block_13` → 2 units:** `p3-toc-15` CONVICTION AND UPGRADES; `p3-toc-16` An Adventurer's Turn
- **`page_3_block_23` → 2 units:** `p3-toc-26` SPELL ACTION; `p3-toc-27` Combatants
- **`page_3_block_25` → 2 units:** `p3-toc-29` INTELLIGENT COMBATANTS; `p3-toc-30` Other Important Rules
- **`page_3_block_3` → 2 units:** `p3-toc-03` ADVENTURE MODE; `p3-toc-04` Playing Encounters
- **`page_3_block_31` → 3 units:** `p3-toc-36` ALTERNATE, VARIATIONS, AND LOOT LVL; `p3-toc-37` Abraxis Battle Dice; `p3-toc-38` Variants
- **`page_3_block_5` → 2 units:** `p3-toc-06` TILES AND TERRAIN; `p3-toc-07` Adventurers and Items

## Ambiguous or unmatched units

- None under the bbox matching rule.

## Consequences

- Any key with multiple semantic units is a one-to-many split. Reusing that key for each new unit would collide in Payload and in the browser's per-key draft map; the old combined translation cannot be split automatically without translation-aware segmentation.
- Page 3 units expose labels only; their printed page references are separate source lineage and should not be silently folded into the translated label. Dotted leaders are page artwork.
- Page 2 credit categories are separate semantic units, but current combined blocks can group neighboring categories. Label/body style preservation is a separate editor/schema requirement.
- Page 101 rows fan out from column-sized legacy blocks. These are not safe to activate under current keys without a compatibility strategy.
- This audit does not inspect browser `localStorage`; local drafts remain an unverified persistence surface.
- The full 253-unit mapping, including every legacy key, source block, bbox score, and text, is in `tmp/layout-sample/key-impact-map.json`.

## Current-schema database snapshot

A read-only query of `apps/admin/apps-admin.db` found 0 records for the 46 sampled existing keys (0 keys matched). This describes only this local database snapshot; it says nothing about browser-local drafts or another deployed database.

## Safe next step

Keep the sample semantic units inactive. Design a sidecar or versioned key scheme that leaves old keys readable and preserves the full old translation as a recoverable source value. Test a single page 2 credit category in the app before any key migration or batch extraction.
