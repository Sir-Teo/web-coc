# Native REA continuation checkpoint — 2026-11-17

This checkpoint adds restore-time static inspection tooling. It makes no new finding
about execution of the original client, the initializer's live inputs, protected code,
or gameplay parity. The prior [loader checkpoint](NATIVE-LOADER-EVIDENCE-20261116.md)
remains the source of the conditional original-binary findings.

## Source recovery status

The available checkout does not contain the original wrapper or the latest private
analysis bundles. Conversation history records successful private Library backups,
but this task has no Library search/read tools and its Library browser is signed out.
No private archive was retrieved, no manifest was reverified, and no original-image
SHA256 was freshly checked in this continuation. Exact backup references and source
bytes are required before the next original-instruction trace.

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

## Next original-binary work

1. Restore the latest private evidence archive and original wrapper. Verify the retained
   full-file hashes, archive integrity and manifest entries, preserving original bytes.
2. Run the metadata audit and independently compare the original file with `readelf`.
   Reconcile discrepancies before treating `0x60e5e8` as the conditional metadata anchor.
3. Start a bounded original-byte prefix trace from that anchor. Preserve unknown TLS,
   indirect-call results and memory inputs symbolically. Establish the provenance of
   state/context fields before connecting them to a candidate slot writer.
4. Keep the selector `0x06e13e43` conditional. Do not force it into the model or turn
   successful synthetic routes into observed initialization, recovered runtime keys or
   gameplay equivalence. Loaded/transformed-target provenance still requires evidence.

No pinned game data, replay rules or native client bytes accompany this checkpoint.
