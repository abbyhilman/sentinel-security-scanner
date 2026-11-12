import contextlib
import base64
import hashlib
import io
import json
import re
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import scanner


class NativeScannerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()

    def write(self, name, text):
        file = self.root / name
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(text, encoding="utf-8")
        return file

    def test_offline_cli_never_downloads_or_runs_application_scripts(self):
        self.write("app.js", 'eval("TEST_ONLY_SECRET");\n')
        self.write(
            "package.json", json.dumps({"scripts": {"install": "SHOULD_NOT_RUN"}})
        )
        output = self.root / "report.json"
        before = (self.root / "app.js").read_bytes()
        with patch.object(
            scanner.urllib.request,
            "urlopen",
            side_effect=AssertionError("Network forbidden"),
        ) as network:
            with patch.object(
                scanner.subprocess,
                "run",
                side_effect=AssertionError("Unexpected engine execution"),
            ):
                with contextlib.redirect_stdout(
                    io.StringIO()
                ) as terminal, contextlib.redirect_stderr(io.StringIO()):
                    code = scanner.main(
                        [
                            str(self.root),
                            "--offline",
                            "--cache-dir",
                            str(self.root / "empty-cache"),
                            "--output",
                            str(output),
                        ]
                    )
        self.assertEqual(code, 2)
        self.assertFalse(network.called)
        text = output.read_text() + terminal.getvalue()
        self.assertNotIn("TEST_ONLY_SECRET", text)
        report = json.loads(output.read_text())
        self.assertEqual(report["sourceEngines"][0]["status"], "success")
        self.assertEqual(report["sourceEngines"][1]["status"], "failed")
        self.assertEqual(report["sourceEngines"][2]["status"], "not_requested")
        self.assertEqual((self.root / "app.js").read_bytes(), before)

    def test_preparation_keeps_snapshot_compatible_with_existing_node_cache(self):
        key, archive, _, executable = scanner.engine_paths(self.root)
        for file in (archive, executable):
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(b"fixture engine")
        checksum = hashlib.sha256(b"fixture engine").hexdigest()
        hashes = dict(scanner.OSV_HASHES)
        hashes[key] = checksum
        assets = dict(scanner.GITLEAKS_ASSETS)
        assets[key] = (assets[key][0], checksum)
        payload = b"fixture database"
        metadata = json.dumps(
            {
                "generation": "123",
                "size": len(payload),
                "md5Hash": base64.b64encode(hashlib.md5(payload).digest()).decode(),
            }
        ).encode()

        def download(url, destination, expected=None, max_bytes=1024 * 1024 * 1024):
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(payload)

        with patch.object(scanner, "OSV_HASHES", hashes), patch.object(
            scanner, "GITLEAKS_ASSETS", assets
        ), patch.object(
            scanner.urllib.request,
            "urlopen",
            side_effect=lambda *a, **kw: io.BytesIO(metadata),
        ), patch.object(
            scanner, "download", side_effect=download
        ), contextlib.redirect_stdout(
            io.StringIO()
        ), contextlib.redirect_stderr(
            io.StringIO()
        ):
            scanner.prepare(self.root)
        manifest = json.loads((self.root / "offline/database.json").read_text())
        self.assertIsNotNone(re.fullmatch(r"db-[A-Za-z0-9]+", manifest["directory"]))
        folder, snapshot = scanner.database(self.root)
        self.assertTrue((folder / "osv-scalibr/npm/all.zip").is_file())
        self.assertEqual(snapshot, manifest["preparedAt"])

    def test_worktree_scope_keeps_sibling_and_submodule_and_explicit_target(self):
        self.write("app.js", "const ok = true;\n")
        self.write(
            "tmp/review [1]/.git", "gitdir: D:\\project\\.git\\worktrees\\review\n"
        )
        self.write("tmp/review [1]/app.js", "eval(input);\n")
        self.write("tmp/review [1]/package-lock.json", "{}")
        self.write("tmp/review [1]-notes/app.js", "eval(input);\n")
        self.write("modules/widget/.git", "gitdir: ../../.git/modules/widget\n")
        self.write("modules/widget/app.js", "eval(input);\n")
        self.write("node_modules/skip/app.js", "eval(input);\n")
        source, locks, excluded, _ = scanner.inventory(self.root, True)
        self.assertEqual(len(source), 3)
        self.assertEqual(locks, [])
        self.assertEqual(excluded, [self.root / "tmp/review [1]"])
        self.assertEqual(len(scanner.inventory(self.root, False)[0]), 4)
        self.assertEqual(
            len(scanner.inventory(self.root / "tmp/review [1]", True)[0]), 1
        )

    def test_source_patterns_are_sanitized_and_regex_exec_is_ignored(self):
        file = self.write(
            "app.ts",
            'const result = /x/.exec(value);\nchild_process.exec(input);\neval("PRIVATE");',
        )
        findings, skipped = scanner.scan_patterns(self.root, [file])
        self.assertEqual([f["line"] for f in findings], [3, 2])
        self.assertEqual(skipped, 0)
        self.assertNotIn("PRIVATE", json.dumps(findings))
        self.assertEqual(scanner.safe("bad\x1b\n|"), "bad\\u001b\\u000a\\u007c")

    def test_gitleaks_drops_raw_values_and_uses_literal_exclusion(self):
        _, archive, checksum, _ = scanner.engine_paths(self.root)
        archive.parent.mkdir(parents=True)
        archive.write_bytes(b"test archive")
        digest = hashlib.sha256(b"test archive").hexdigest()
        assets = dict(scanner.GITLEAKS_ASSETS)
        suffix, _ = assets[scanner.platform_key()]
        assets[scanner.platform_key()] = (suffix, digest)
        from unittest.mock import MagicMock

        fake_archive = MagicMock()
        fake_archive.__enter__.return_value.read.return_value = b"fixture executable"
        member = tarfile.TarInfo("gitleaks")
        member.size = 18
        fake_archive.__enter__.return_value.getmember.return_value = member
        fake_archive.__enter__.return_value.extractfile.return_value.read.return_value = (
            b"fixture executable"
        )
        excluded = self.root / "tmp/review [1]"
        self.write("app.js", "const x = true;")

        def execute(args, folder, env=None, accepted_codes=(0,)):
            config = (Path(folder) / "gitleaks.toml").read_text()
            self.assertIn("--redact=100", args)
            self.assertNotIn("\\ ", config)
            return [
                {
                    "File": str(self.root / "app.js"),
                    "StartLine": 0,
                    "RuleID": "generic-api-key",
                    "Secret": "PRIVATE_VALUE",
                    "Match": "PRIVATE_SOURCE",
                }
            ]

        with patch.object(scanner, "GITLEAKS_ASSETS", assets), patch.object(
            scanner.zipfile, "ZipFile", return_value=fake_archive
        ), patch.object(
            scanner.tarfile, "open", return_value=fake_archive
        ), patch.object(
            scanner, "execute_json", side_effect=execute
        ):
            result = scanner.gitleaks(self.root, self.root, [excluded])
        self.assertEqual(result["status"], "success")
        self.assertIsNone(result["findings"][0]["line"])
        self.assertNotIn("PRIVATE", json.dumps(result))

    def test_advisory_parser_preserves_versions_and_rejects_outside_paths(self):
        advisory = {
            "id": "GHSA-test-0001",
            "affected": [
                {
                    "package": {"name": "math", "ecosystem": "npm"},
                    "ranges": [
                        {
                            "type": "SEMVER",
                            "events": [{"fixed": "0.16.0"}, {"fixed": "0.18.2"}],
                        }
                    ],
                }
            ],
        }
        raw = {
            "results": [
                {
                    "source": {"path": str(self.root / "package-lock.json")},
                    "packages": [
                        {
                            "package": {
                                "name": "math",
                                "ecosystem": "npm",
                                "version": "0.16.47",
                            },
                            "vulnerabilities": [advisory],
                        }
                    ],
                }
            ]
        }
        findings, count, skipped = scanner.parse_advisories(raw, self.root)
        self.assertEqual((count, skipped), (1, 0))
        self.assertEqual(findings[0]["fixedVersions"], ["0.18.2"])
        raw["results"][0]["source"]["path"] = str(self.root.parent / "outside.json")
        with self.assertRaises(ValueError):
            scanner.parse_advisories(raw, self.root)

    def test_real_unicode_folder_names_are_preserved_and_terminal_escaped(self):
        file = self.write("folder\ufeffwith-marker/app.js", "const ok = true;")
        self.assertEqual(
            scanner.relative_file(self.root, str(file)),
            "folder\ufeffwith-marker/app.js",
        )
        self.assertNotIn(
            "\ufeff", scanner.safe(scanner.relative_file(self.root, str(file)))
        )
        self.assertIn(
            "\\ufeff", scanner.safe(scanner.relative_file(self.root, str(file)))
        )
        with self.assertRaises(ValueError):
            scanner.relative_file(self.root, "bad\x00path")

    def test_update_guidance_distinguishes_nested_versions_and_unknown_package_managers(
        self,
    ):
        self.write(
            "package.json",
            json.dumps({"dependencies": {"math": "^1.0.0", "diagram": "^2.0.0"}}),
        )
        self.write(
            "package-lock.json",
            json.dumps(
                {
                    "packages": {
                        "node_modules/math": {"version": "1.0.0"},
                        "node_modules/diagram": {
                            "version": "2.0.0",
                            "dependencies": {"math": "^0.16.0"},
                        },
                        "node_modules/diagram/node_modules/math": {
                            "version": "0.16.47"
                        },
                    }
                }
            ),
        )
        common = {
            "ecosystem": "npm",
            "package": "math",
            "advisoryId": "GHSA-test-0001",
            "fixedVersions": ["0.18.2"],
        }
        findings = [
            dict(common, file="package-lock.json", version="0.16.47"),
            dict(common, file="package-lock.json", version="1.0.0"),
            dict(common, file="pnpm-lock.yaml", version="1.0.0"),
        ]
        nested, direct, pnpm = scanner.update_plans(self.root, findings)
        self.assertEqual(nested["kind"], "transitive")
        self.assertEqual(
            nested["parents"],
            [{"package": "diagram", "range": "^0.16.0", "outsideRange": ["0.18.2"]}],
        )
        self.assertEqual(direct["kind"], "direct")
        self.assertEqual(pnpm["kind"], "declared")
        self.assertEqual(pnpm["commands"], ["pnpm why --recursive math"])

    def test_database_checksum_and_engine_failure_do_not_claim_success(self):
        self.write(
            "offline/database.json",
            json.dumps({"directory": "../../outside", "databases": []}),
        )
        with self.assertRaises(ValueError):
            scanner.database(self.root)
        lock = self.write("package-lock.json", "{}")
        with patch.object(
            scanner.urllib.request,
            "urlopen",
            side_effect=AssertionError("Network forbidden"),
        ):
            result = scanner.audit_dependencies(self.root, [lock], self.root)
        self.assertEqual(result["status"], "failed")
        with patch.object(
            scanner.subprocess,
            "run",
            side_effect=subprocess.TimeoutExpired("engine", 1),
        ):
            with self.assertRaises(subprocess.TimeoutExpired):
                scanner.execute_json(["engine"], self.root)

    def test_invalid_lockfile_keeps_other_audit_results_and_reports_partial_failure(
        self,
    ):
        key, _, _, executable = scanner.engine_paths(self.root)
        executable.parent.mkdir(parents=True)
        executable.write_bytes(b"fixture engine")
        hashes = dict(scanner.OSV_HASHES)
        hashes[key] = hashlib.sha256(b"fixture engine").hexdigest()
        bad = self.write("bad/pnpm-lock.yaml", "invalid lockfile")
        good = self.write("good/package-lock.json", "{}")
        raw = {
            "results": [
                {
                    "source": {"path": str(good)},
                    "packages": [
                        {
                            "package": {
                                "name": "demo",
                                "ecosystem": "npm",
                                "version": "1.0.0",
                            },
                            "vulnerabilities": [],
                        }
                    ],
                }
            ]
        }
        with patch.object(scanner, "OSV_HASHES", hashes), patch.object(
            scanner, "database", return_value=(self.root, "fixture snapshot")
        ), patch.object(
            scanner, "execute_json", side_effect=[ValueError("fixture rejected"), raw]
        ):
            result = scanner.audit_dependencies(self.root, [bad, good], self.root)
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["failedLockfiles"], ["bad/pnpm-lock.yaml"])
        self.assertEqual(result["checkedLockfileCount"], 1)
        self.assertEqual(result["packageCount"], 1)

    def test_command_entrypoint_rejects_invalid_mode_and_existing_report(self):
        script = Path(scanner.__file__).resolve()
        result = subprocess.run(
            [sys.executable, str(script), "--prepare", str(self.root)],
            capture_output=True,
        )
        self.assertEqual(result.returncode, 2)
        output = self.write("report.json", "original")
        with contextlib.redirect_stderr(io.StringIO()):
            code = scanner.main([str(self.root), "--output", str(output)])
        self.assertEqual(code, 2)
        self.assertEqual(output.read_text(), "original")


if __name__ == "__main__":
    unittest.main()
