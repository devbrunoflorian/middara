# Page 2 credit sidecar v1

This is the first production sidecar before expanding the Playtesters-only pilot to all 17 audited credit categories. It maps just source `block_40` to Playtesters label/body fields and uses the existing stable Playtesters keys.

It was archived because the next schema supports multiple semantic units inside one source block. In particular, six middle-column categories share source block `block_39`; retaining the single-unit sidecar here allows straightforward rollback and documents the exact pre-expansion mapping. No translations or database rows are included.

To restore the pilot, copy `credit_units.v1.json` back to `apps/web/public/pages/page_002/credit_units.json` and restore the singular metadata loader/render path from the matching git snapshot if required.
