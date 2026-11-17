# Native REA continuation checkpoint — 2026-11-17

This checkpoint records verified restoration of a private backup, independent initializer
metadata checks and a bounded symbolic continuation of the original initializer. It does
not establish native execution, the initializer's live inputs, recovered protected code
or gameplay parity. The prior [loader checkpoint](NATIVE-LOADER-EVIDENCE-20261116.md)
provides the earlier conditional anchors; the second-table result is recorded below.

## Source recovery status

The specified private table-loop archive and its original wrapper are restored. Its supplied ZIP SHA256,
ZIP integrity and all twenty manifest entries were independently verified. The wrapper's
retained SHA256 matches; the inherited replay and its 302 raw-field fixtures pass again.
The generic audit below and independent binutils decoding agree on the published initializer
metadata. This verifies the restored inputs against the retained backup, not a fresh signed
APK, actual loaded image, initializer invocation or gameplay behavior.

Private binaries and full instruction traces remain outside this public repository. The
new evidence and replay scripts are retained in a separate private continuation archive.

## Prepared independent metadata audit

[`native_loader_init_audit.py`](../scripts/native_loader_init_audit.py) uses only
Python's standard library. It checks a separately retained full-file SHA256 before
parsing an ARM64, little-endian ELF64 ET_DYN wrapper. It translates addresses through
unique file-backed PT_LOAD mappings and rejects truncated, overlapping or zero-filled
input ranges, conflicting dynamic tags and malformed conventional RELA metadata.

The published checkpoint match requires all of the following: no DT_INIT; an eight-byte
DT_INIT_ARRAY at `0x676898`; a zero original file cell; and exactly one matching entry
in conventional DT_RELA, with symbol zero, R_AARCH64_RELATIVE and addend `0x60e5e8`.
A uniquely resolved relative entry also yields the sixteen original little-endian
prefix words from an aligned, file-backed executable range. This is byte extraction,
not disassembly or execution. Packed relocations, PLT relocation tables, runtime writes,
TLS contents and whether a loader invokes the initializer remain outside the audit.

```sh
python3 scripts/native_loader_init_audit.py /private/path/original-wrapper.so \
  --expected-sha256 RETAINED_ORIGINAL_WRAPPER_SHA256
readelf -W -h -l -d /private/path/original-wrapper.so
readelf -W --use-dynamic -r /private/path/original-wrapper.so
```

Use the independently retained **original wrapper** digest. The APK digest and the
recovered-executable-image `source_sha256` in retained combat oracle JSON identify
different inputs and cannot substitute for that digest. A match is conditional on
normal relocation and no later mutation; it is not an observation of the loaded target.
Exit codes are 0 for the published metadata match, 2 for an authenticated parse with
different metadata, and 1 for authentication failure or unsupported/malformed input.

## Validation performed

```sh
python3 -m unittest discover -s scripts -p 'test_native_loader_init_audit.py' -v
```

Fifteen tests pass using invented, sectionless ELF fixtures. They cover identity failure,
truncation, wrong architecture, zero-fill, overlapping mappings, dynamic mapping disagreement,
missing terminators, duplicate tags/relocations, relocation symbol/type changes, a nonzero
source cell, DT_INIT, alignment, executable ranges and CLI outcomes. Binutils `readelf`
independently decodes the synthetic header, dynamic initializer entries and relative
relocation. This is tool validation, not renewed native-client authentication or REA coverage.

## Conditional second-table continuation

Starting from the original entry, with the first table's first test explicitly constrained
zero, the second phase includes a computed-address qword read before rewriting its current
table cell. It preserves the distinction between the tested entry, a fresh reread, the
computed address and the loaded value. The loaded qword is what the modeled table write
stores; this differs from the earlier table's direct additive rewrite.

Both independent static interpreters agree on 302 explicit case/index fixtures: zero and
nonzero cases for indices 0 through 150. Index zero retains its initialized counter; the
other indices are hypothetical seeds before the bound check, not observed reachable states.
All complete PC lists agree (257,305 positions including repeated prefixes), and 3,750
edge/random arithmetic substitutions agree with the independently checked address formula.
These are fixture counts, not distinct recovered instructions or a native coverage percentage.

For an in-range nonzero test, the modeled write is followed by a counter increment and a
fresh test of the next cell. A zero test exits without rewriting that cell; the bound exits
without an additional table test. The captured continuations contain no pointer invocation
and stop at an unknown next-cell comparison or a later unresolved load-address boundary.
Actual table contents, readable computed addresses, loaded values, runtime trip count and
later consumers remain unverified. Successful accesses and intact local state are assumptions.
No native ARM64 code was executed and no original-image bytes were modified.

## Table-exit pre-call provenance

The saved private checkpoint and its complete 623-entry manifest were freshly verified
before extending the trace. The table-exit computed address and the qword read from it
remain separate symbolic values stored in different locals; neither is supplied a runtime
value. This continuation reaches another 150-entry table scan. A zero test advances its
counter instead of ending that scan. A nonzero test derives a value from a fresh reread,
then reaches an unsigned comparison with 500.

Explicit predicate fixtures cover both sides of that comparison. The lower branch stops
before its first symbolic byte read. Under the nonzero-entry and unsigned-at-least-500
conditions, the higher branch reaches an indirect-call boundary whose target register holds
the earlier loaded qword, rather than its computed address. The model stops before the call:
no invocation, executable target, callee identity, ABI signature or return value is established.
The first argument register is zero and the second holds a separately computed address;
these register facts do not identify a function. Earlier table zero cases are explicit
conditions; nonzero seeded indices remain hypothetical, and bound cases stop at their guard.

Two static interpreters agree on 604 paired fixtures and all 580,450 PC positions, including
repeated prefixes. A separate arithmetic interpreter checks 8,232 address, derived-value and
argument vectors. Seven corrupted report interpretations are rejected, including target/address
confusion, a fabricated loaded value, a stale reread, a swapped unsigned predicate and a claim
of execution. These are static verifier counts, not native observations or coverage percentages.

Concrete register-width handling and newly reached instruction decoding were corrected before
the complete paired run. Exploratory probes are labeled separately; an exploration-budget
limit is not treated as a runtime hang or a proven loop. Private evidence includes the full
models, traces, assumptions, corrections and inherited archive. No native code was executed,
no original-image bytes were changed, and no production or replay behavior changes follow.

## Lower-byte update, alias limits and a file-state import association

The inherited private archive and all 1,239 manifest entries were freshly verified.
Two separately decoded byte-block models replay the matching 957-position conditional
prefix. They agree on the first handler's in-place one-byte arithmetic update and its
test of the written byte. A later handler has the same byte update under an explicitly
synthetic entry fixture; reachability of that entry is not newly proved.

All 128,000 operand pairs in the stated unsigned-offset/byte domain agree. Storage checks
pass 1,512 aligned hypothetical captured-local alias controls, 6,000 disjoint-capture controls
and 24,000 source-only alias controls. These show why overwriting the original source and
overwriting the local captured target are different hypotheses. If the byte destination
overlaps the captured local, its corresponding byte can change; when it overlaps only the
original source, the earlier captured copy can remain unchanged. These are conditional
storage effects, not observed mappings, native executions or proof of a whole loop or call.

A separate unchanged-file-state hypothesis computes a target-source address associated
with the standard ELF import relocation named `dlsym`. Independent binutils metadata,
raw immediate/ADR fields and file arithmetic agree. The source words and slot are writable;
unchanged runtime data, normal binding and its survival are not established. The main trace
continues to retain unknown runtime values. No live callee, symbol resolution, string,
ABI signature, return value or gameplay parity is inferred from that import-record link.

Seven interpretation controls check sign/increment, the zero test, store width, source/local
alias distinctions and an identity offset. Binary bytes, detailed formulas, models and
results remain in the private continuation archive. Public changes are documentation only.

## Conditional lower-loop control

The byte-testing handler is now connected through the flattened dispatcher to its next
iteration and the stopped indirect-call boundary. Under successful accesses, stable code
and context, no external mutation, and a whole payload interval disjoint from the modeled
local frame, each visited byte is updated in place and its updated low byte is tested.
A zero result reaches the call boundary immediately. A nonzero result increments the
working offset and repeats the same tested-byte handler while the unsigned offset remains
below 500; reaching 500 also reaches the call boundary. The separate, previously synthetic
handler without a byte test is not visited by these conditional paths.

The call argument uses the original starting offset, rather than the final working offset.
Its target is a reload of the earlier captured unknown qword. That preservation depends on
the memory conditions: a payload write into a captured local or a control/pointer local
falls outside this continuation proof. Changing only the original source does not itself
establish that its captured copy changes. No actual stack/image relationship, memory access,
byte contents, trip count, callee identity or target execution is established.

Independent LLVM-text and raw-instruction control models agree on 1,505 paired fixtures.
These cover every permitted starting offset with an immediate updated-byte zero exit and
an all-nonzero path to the bound, every possible next-byte zero exit, and six longer
interior-zero paths. Offsets are hypothetical verifier seeds after the retained symbolic
prefix; zero positions are explicit predicate assumptions. The byte values themselves
remain symbolic. Separately, all 128,000 offset/byte operand pairs validate the full
32-bit register postcondition and low-byte predicate used in composing the byte blocks.
The control instructions are interpreted individually; the verified byte blocks are
summarized, not represented as native instruction execution.

Exact PC lists, loop-local endpoint effects, call arguments, unchanged captured storage,
modular frame-alias conditions and deliberately corrupted conclusion controls are checked.
The inherited private archive, complete manifest and unchanged input sources are verified
again. Detailed scripts, traces and original binary evidence remain private; public changes
contain documentation only.

## Next original-binary work

The restore, metadata comparison, inherited replay, byte storage analysis and conditional
lower-loop control are complete for their stated scopes. Establish actual runtime input,
stack/image layout and binding provenance behind the loaded target, or model alias cases
without carrying over the disjoint-frame conclusion. The continuation stops before the
indirect call. Preserve unknown memory/TLS values and do not invent a callee, return value
or executable-address property from the conditional import association.

Keep selector `0x06e13e43` conditional. Do not force it into the model or turn successful
synthetic routes into observed initialization, recovered runtime keys or gameplay equivalence.
Loaded/transformed-target provenance still requires evidence. No pinned game data, replay
rules, native client bytes or private backup identifiers accompany this public checkpoint.

## Runtime-evidence review and game-fidelity follow-up

A fresh inventory found retained file bytes and static-model artifacts, but no captured
process maps, live registers, target-slot snapshot or connected Android runtime. The
available host is x86-64 and has no Android bridge or ARM64 runner on its command path.
This inventory is scoped to the supplied task workspace and available tools; it does
not establish that runtime evidence does not exist elsewhere.

The unchanged-file `dlsym` import association still cannot establish a live call target.
Resolving it requires authenticated runtime module identity, its load bias and mappings,
the relevant registers/source qwords, and captured-local contents at the call boundary.
Likewise a real stack/image alias conclusion requires observed addresses. Further
conditional traces would not supply those missing observations, so this pass adds none.

The concrete follow-up fixes [offline collector catch-up](TOWNHALL-TIERS.md#offline-collector-catch-up-november-17-2026):
Gold Mines and Elixir Collectors now credit all elapsed productive time up to their
pinned capacity. This is a home-economy correction with regression tests, not new native
execution evidence. Private binaries and detailed inventories remain outside the repo.

The next practical correction fixes [concurrent helper/potion timing](HELPERS.md#concurrent-potions-and-helpers-november-17-2026).
One offline tick now uses the same additive work budget as frequent ticks, with shared
completion caps and corrected post-upgrade income. Fresh hash-checked helper-catalog
reproduction, an independent work-budget oracle and integration regressions validate
this home behavior. Live target/layout provenance and native scheduling remain unknown;
this change adds no native execution or gameplay-parity claim.
