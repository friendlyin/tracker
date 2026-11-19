Code shared by the PWA (`src/`) and the Worker (`worker/`): zod schemas, domain types, and pure
calculation logic (weekly set budget, water accumulation, nutrition targets). Keep it free of
browser- and Worker-specific APIs so it can run on both sides and be unit-tested.
