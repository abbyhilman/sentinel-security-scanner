# Scanner adapters

Pure TypeScript parsers normalize scanner JSON into the versioned Sentinel contract. They never execute tools, inspect repository contents beyond supplied manifest metadata, or retain raw scanner output. Gitleaks `Match`, `Secret`, and `Line` fields are deliberately ignored.

The adapter package runs on Node.js 22+ and uses Web Crypto for stable SHA-256 fingerprints. Scanner and ruleset versions are supplied by the workflow; unknown provenance stays explicit.

Report v1 uses `osv`, `composer`, and `sca`. The [ingestion migration](../../supabase/migrations/20261028000200_atomic_report_ingestion.sql) maps them to database enums and expands `scannerSources` into one source row per scanner. Fingerprints use scanner rule/path/line for source findings and package/advisory identity for dependency findings. Raw source lines are not included.

Severity mappings are deliberately narrow: Semgrep `ERROR/WARNING/INFO` becomes `high/medium/info`; OSV and Composer retain only recognized source labels; Gitleaks and unknown labels stay `unknown`. These values are not computed CVSS scores.
