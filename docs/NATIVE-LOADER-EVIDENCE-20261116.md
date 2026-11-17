# Native loader evidence checkpoint

Date: 2026-11-16

This is a documentation-only checkpoint of independently reviewed static analysis.
It does not change gameplay, rendering, pinned data or replay behavior. No native
target code was executed, and no gameplay-parity or FPS improvement is claimed.

## Verified conditional findings

- **JNI_OnLoad return path:** after a hypothetical normal callee return, assuming
  intact wrapper stack memory and preserved callee-saved registers, a 64-instruction
  continuation returns the zero-extended low 32 bits of the supplied callee result
  and restores entry SP and X19-X30. Primary checks passed 20,016 cases; independent
  LLVM-decoded checks passed another 3,006.
- **Additional target-slot writer:** a bounded original-byte path from
  `0x63f110` reaches store `0x63f1fc` in 76 instructions. It separately reads
  C from context+96, A from context+160 and B from context+168, then stores
  `(C + B - A) mod 2^64` to image-bias+`0x68ff58`. Primary checks passed
  10,004 cases and independent checks passed 4,101. This is a fourth candidate
  writer, not a complete runtime writer inventory.
- **Conditional selector:** incoming W9=`0x06e13e43` at dispatcher
  `0x6209ec` takes 17 memory-free instructions through branch `0x626568`
  to that writer entry. A symbolic first-boundary partition covers all 32-bit
  states; only this singleton reaches the entry before a boundary. Independent
  analysis agrees on all interval outcomes and stop addresses and passed
  1,419 representative replays. Its 43 intervals and the primary 50 intervals
  differ only by additional splitting of equivalent cyclic regions.
- **Bounded negative producer result:** original aligned executable bytes contain
  16 direct B and 10 B.cond candidates targeting `0x6209ec`. For each direct B
  and the immediate fallthrough, at most 32 instructions were inspected, keeping
  only the contiguous suffix after the last control transfer. All 17 suffixes
  yield finite W9 sets excluding `0x06e13e43`. An independent raw-field review
  reproduced the census, windows and value sets. Conditional edges were
  inventoried, not established as independent state producers.

## Limits and next step

These results require their stated original-code, successful-access and local
state assumptions. A first-boundary partition is not a whole-function proof:
another input can encounter memory or other processing, change state and reenter.
The producer search does not cover arbitrary indirect or mid-suffix entry,
runtime-modified code or every possible state producer. It does not prove dead
code or impossible execution.

The selected runtime writer, actual context values, stored-pointer survival,
loaded/transformed target representation and native registration remain
unresolved. Do not force the selecting constant into a model and present the
result as observed initialization. The next useful native investigation concerns
alternative entry or loaded-code provenance.

## Preservation and verification

Full evidence bundles, test scripts and independent reviews are retained
privately; downloaded client binaries and private access identifiers are not
published here. The latest producer-search archive was freshly retrieved after
upload: its complete SHA256, ZIP integrity and every manifest entry matched.
The preceding selector archive was also restored and its primary and independent
replays rerun successfully.

This public file records findings, not a standalone reproducible binary test
suite. Application-wide checks were not rerun for this documentation-only change;
the evidence-specific checks above are the verification performed.

## Alternative-entry and initialization follow-up

An independent raw-field review checked all original file-backed executable
aligned immediate B/BL/B.cond/CB/TB encodings targeting the 17 selected route
instructions and the writer entry. There are 29 syntactic edges: 26 to the
main dispatcher entry and three already-known route branches. No additional
direct interior entrance appeared in this narrowly defined scan.

No selected-address match appeared among 15,167 standard RELA addends, exact ADR
references or eight-byte-aligned absolute qwords in file-backed PT_LOAD bytes.
These tests do not exclude computed, encoded, unaligned, symbol-resolved or
runtime-modified references and do not prove dead code.

The conventional ELF metadata supplies a positive anchor: DT_INIT is absent;
DT_INIT_ARRAY has one zero-valued file cell at `0x676898`, with a unique
symbol-zero RELATIVE relocation adding `0x60e5e8`. If applied normally and
unchanged, it nominates image-bias+`0x60e5e8` as an initializer. This is not an
observed invocation. Sixteen original prefix words were authenticated; raw
stack-save/allocation and TPIDR_EL0 register fields were independently checked,
without executing the prefix or inventing TLS values.

The next native step is justified state/context provenance from this metadata
anchor, not an assumed selector. The new private evidence archive was freshly
retrieved and passed full-byte SHA256, ZIP integrity and every manifest check.
No production or replay changes accompany this follow-up.

## Continuation tooling (2026-11-17)

The [continuation checkpoint](NATIVE-REA-CONTINUATION-20261117.md) adds a hash-checked
static ELF initializer audit and fifteen synthetic tests, including an independent
binutils metadata check. The original wrapper and private bundles were not restored
in that continuation. This adds preparation and a recovery plan, not new original-byte
findings, native execution evidence or gameplay parity.

## Restored second-table continuation (2026-11-17)

The [continuation checkpoint](NATIVE-REA-CONTINUATION-20261117.md) now records independent
restoration checks and a new bounded static result. The second table includes a computed-address
qword read before its table write, unlike the first table's direct additive rewrite. Two
separate interpreters agree on all 302 explicit case/index fixtures and all full PC lists;
3,750 arithmetic substitutions agree with the independently checked address formula.

The first-table zero case is an explicit condition; nonzero seeded indices are hypothetical.
Captured paths establish no pointer invocation. Actual inputs, live memory accesses, later
consumers and gameplay parity remain unverified. Full binary evidence stays private, and no
production or replay behavior changes accompany this checkpoint.
