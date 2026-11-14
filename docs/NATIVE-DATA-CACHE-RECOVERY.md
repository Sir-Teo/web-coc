# Native data cache recovery

This restores the exact previously uploaded `src/game/native-data.ts` Git blob
`e76712644de02198b63eacedb50c521c532f3ab8`. Its bytes were retrieved from the
repository blob API and independently checked using Git's blob hash framing.
This recovers one source file, not the missing original commit metadata or the
complete later optimization branch.

The change replaces repeated `table/name` string construction with a per-table
map keyed by the existing name string. Source tables, inheritance, freezing,
row selection and pinned client data are unchanged. No replay version changes.

The independent `native-data-cache-recovery.test.ts` checks all 675 records and
4,444 inherited rows across twelve pinned tables, cached/frozen object identity,
level clamping, duplicate names across tables and missing-record errors. All
three tests pass against both the baseline implementation and recovered file.

These are correctness checks, not a newly measured performance result. Whole
battle or browser performance requires separate-process comparisons with equal
workloads and matching state digests; concurrent recovery checks are unsuitable
for a speedup claim. This cache recovery adds no native reverse-engineering
coverage or live Android parity evidence.
