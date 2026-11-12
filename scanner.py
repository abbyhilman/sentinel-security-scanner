#!/usr/bin/env python3
"""Sentinel native offline CLI. Python standard library, no Node.js or WSL."""

import argparse
import base64
from collections import defaultdict
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import stat
import subprocess
import sys
import tarfile
import tempfile
import unicodedata
import urllib.request
import zipfile


OSV_VERSION = "2.7.0"
GITLEAKS_VERSION = "8.30.1"
OSV_HASHES = {
    "win32-x64": "9964ed64ec9a387391eb4cc006ad5c531154821aef29b793e02c448de4686438",
    "win32-arm64": "3e630381c1f1fd3c9c4d447e6ff2ef6c737083371722773db8337eead0f97962",
    "linux-x64": "160c6253e2922e9e0a6a9771c5c4c40a4b3c6090b34a3cdd5e80c96cc2e4218b",
    "linux-arm64": "4061ef4c021ed3c47f203b818f337e351336cc5cd67c0274fc36bd1dfc728dd7",
    "darwin-x64": "e82c5df7ab0a42dff29a1cd0660711447b56b4c0483ff66ad8634df10fd81a45",
    "darwin-arm64": "d4926ef8da134332543be276dff157e4c170f99ad91fc48e89448a8816bdf70b",
}
GITLEAKS_ASSETS = {
    "win32-x64": (
        "windows_x64.zip",
        "d29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e",
    ),
    "win32-arm64": (
        "windows_arm64.zip",
        "b95f5e4f5c425cedca7ee203d9afd29597e692c4924a12ed42f970537c72cc0f",
    ),
    "linux-x64": (
        "linux_x64.tar.gz",
        "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb",
    ),
    "linux-arm64": (
        "linux_arm64.tar.gz",
        "e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080",
    ),
    "darwin-x64": (
        "darwin_x64.tar.gz",
        "dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709",
    ),
    "darwin-arm64": (
        "darwin_arm64.tar.gz",
        "b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5",
    ),
}
IGNORED = {
    ".git",
    ".sentinel-cache",
    "node_modules",
    "vendor",
    "dist",
    "build",
    "coverage",
    ".next",
    ".output",
    "__pycache__",
    ".venv",
    "venv",
}
LOCKFILES = {
    "package-lock.json": "npm",
    "npm-shrinkwrap.json": "npm",
    "pnpm-lock.yaml": "pnpm",
    "yarn.lock": "yarn",
    "composer.lock": "composer",
}
JS = {".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"}
RULES = [
    (
        {".php"},
        "sentinel.quick.php-dynamic-execution",
        re.compile(r"\b(?:eval|shell_exec|exec|system)\s*\("),
        "Batasi executable dan input; gunakan API library dengan argumen terpisah.",
    ),
    (
        {".php"},
        "sentinel.quick.php-raw-sql-query",
        re.compile(r"\bmysqli_query\s*\("),
        "Gunakan prepared statement dan parameter binding.",
    ),
    (
        JS,
        "sentinel.quick.node-dynamic-evaluation",
        re.compile(r"\b(?:eval\s*\(|new\s+Function\s*\()"),
        "Gunakan JSON.parse atau pemetaan fungsi eksplisit untuk input.",
    ),
    (
        JS,
        "sentinel.quick.node-shell-command",
        re.compile(r"(?<![.\w])(?:child_process\.)?exec(?:Sync)?\s*\((?!\?:)"),
        "Gunakan executable tetap dan argumen terpisah tanpa shell.",
    ),
]


def safe(value):
    return "".join(
        f"\\u{ord(c):04x}" if unicodedata.category(c).startswith("C") or c == "|" else c
        for c in str(value)
    )


def regex_literal(value):
    return re.sub(r"([\\.^$|?*+()\[\]{}])", r"\\\1", value)


def regular(file):
    info = file.lstat()
    return (
        stat.S_ISREG(info.st_mode)
        and not getattr(info, "st_file_attributes", 0) & 0x400
    )


def read_json(file, limit=20 * 1024 * 1024):
    if not regular(file) or file.stat().st_size > limit:
        raise ValueError("Invalid metadata file")
    value = json.loads(file.read_text(encoding="utf-8-sig"))
    if not isinstance(value, dict):
        raise ValueError("Expected a JSON object")
    return value


def digest(file, algorithm="sha256"):
    hasher = hashlib.new(algorithm)
    with file.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(block)
    return hasher.hexdigest()


def platform_key():
    architecture = {
        "amd64": "x64",
        "x86_64": "x64",
        "aarch64": "arm64",
        "arm64": "arm64",
    }.get(platform.machine().lower())
    key = f"{sys.platform}-{architecture}"
    if key not in OSV_HASHES:
        raise ValueError("Platform engine belum didukung.")
    return key


def download(url, destination, expected=None, max_bytes=1024 * 1024 * 1024):
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=destination.parent) as folder:
        pending = Path(folder) / "download"
        request = urllib.request.Request(
            url, headers={"User-Agent": "Sentinel-native/1"}
        )
        with urllib.request.urlopen(request, timeout=120) as response, pending.open(
            "xb"
        ) as output:
            size = 0
            while block := response.read(1024 * 1024):
                size += len(block)
                if size > max_bytes:
                    raise ValueError("Unduhan melewati batas.")
                output.write(block)
        if expected and digest(pending) != expected:
            raise ValueError("Checksum unduhan tidak cocok.")
        os.replace(pending, destination)


def engine_paths(cache):
    key = platform_key()
    suffix, checksum = GITLEAKS_ASSETS[key]
    archive = cache / "offline" / f"gitleaks_{GITLEAKS_VERSION}_{suffix}"
    executable = (
        cache
        / "osv"
        / OSV_VERSION
        / key
        / ("osv-scanner.exe" if os.name == "nt" else "osv-scanner")
    )
    return key, archive, checksum, executable


def prepare(cache):
    key, archive, checksum, executable = engine_paths(cache)
    if not archive.exists() or digest(archive) != checksum:
        download(
            f"https://github.com/gitleaks/gitleaks/releases/download/v{GITLEAKS_VERSION}/{archive.name}",
            archive,
            checksum,
            128 * 1024 * 1024,
        )
    if not executable.exists() or digest(executable) != OSV_HASHES[key]:
        system = "windows" if sys.platform == "win32" else sys.platform
        architecture = "amd64" if key.endswith("x64") else "arm64"
        asset = f"osv-scanner_{system}_{architecture}" + (
            ".exe" if os.name == "nt" else ""
        )
        download(
            f"https://github.com/google/osv-scanner/releases/download/v{OSV_VERSION}/{asset}",
            executable,
            OSV_HASHES[key],
            256 * 1024 * 1024,
        )
    executable.chmod(0o700)
    offline = cache / "offline"
    offline.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="db-", dir=offline) as folder:
        directory = Path(folder)
        manifest = {
            "directory": directory.name,
            "preparedAt": datetime.now(timezone.utc).isoformat(),
            "databases": [],
        }
        for ecosystem in ("npm", "Packagist"):
            print(f"Persiapan database publik {ecosystem}...", file=sys.stderr)
            url = f"https://storage.googleapis.com/storage/v1/b/osv-vulnerabilities/o/{ecosystem}%2Fall.zip"
            with urllib.request.urlopen(url, timeout=30) as response:
                metadata = json.loads(response.read(1024 * 1024))
            generation = str(metadata["generation"])
            if not generation.isdigit() or int(metadata["size"]) > 1024 * 1024 * 1024:
                raise ValueError("Metadata unduhan tidak valid.")
            target = directory / "osv-scalibr" / ecosystem / "all.zip"
            download(
                f"https://storage.googleapis.com/osv-vulnerabilities/{ecosystem}/all.zip?generation={generation}",
                target,
            )
            md5 = base64.b64encode(bytes.fromhex(digest(target, "md5"))).decode()
            if (
                target.stat().st_size != int(metadata["size"])
                or md5 != metadata["md5Hash"]
            ):
                raise ValueError("Database tidak lolos pemeriksaan integritas.")
            manifest["databases"].append(
                {
                    "ecosystem": ecosystem,
                    "sha256": digest(target),
                    "size": target.stat().st_size,
                }
            )
        snapshot = offline / ("db-" + os.urandom(8).hex())
        snapshot.mkdir()
        for ecosystem in ("npm", "Packagist"):
            source = directory / "osv-scalibr" / ecosystem / "all.zip"
            destination = snapshot / "osv-scalibr" / ecosystem / "all.zip"
            destination.parent.mkdir(parents=True)
            os.replace(source, destination)
        manifest["directory"] = snapshot.name
        pending = directory / "manifest.json"
        pending.write_text(json.dumps(manifest), encoding="utf-8")
        os.replace(pending, offline / "database.json")
    print("Gitleaks, OSV, database: CACHED")


def database(cache):
    manifest = read_json(cache / "offline" / "database.json", 1024 * 1024)
    if not re.fullmatch(r"db-[A-Za-z0-9_\-]+", manifest["directory"]):
        raise ValueError("Invalid database manifest")
    folder = cache / "offline" / manifest["directory"]
    for ecosystem in ("npm", "Packagist"):
        entry = next(
            item for item in manifest["databases"] if item["ecosystem"] == ecosystem
        )
        file = folder / "osv-scalibr" / ecosystem / "all.zip"
        if not regular(file) or digest(file) != entry["sha256"]:
            raise ValueError("Invalid database checksum")
    return folder, manifest["preparedAt"]


def inventory(root, skip_worktrees):
    source, lockfiles, skipped_worktrees = [], [], []
    skipped = 0
    stack = [root]
    visited = 0
    while stack:
        folder = stack.pop()
        marker = folder / ".git"
        if (
            skip_worktrees
            and folder != root
            and marker.exists()
            and regular(marker)
            and marker.stat().st_size < 65536
        ):
            text = marker.read_text(encoding="utf-8").rstrip().replace("\\", "/")
            if re.fullmatch(r"gitdir: (?:[^\r\n]*/)?worktrees/[^/\r\n]+", text):
                skipped_worktrees.append(folder)
                continue
        with os.scandir(folder) as entries:
            for entry in entries:
                visited += 1
                if visited > 200000:
                    raise ValueError(
                        "Batas 200.000 entri tercapai; pilih folder repo yang lebih spesifik."
                    )
                info = entry.stat(follow_symlinks=False)
                if entry.is_symlink() or getattr(info, "st_file_attributes", 0) & 0x400:
                    skipped += 1
                    continue
                file = Path(entry.path)
                if entry.is_dir(follow_symlinks=False):
                    if entry.name not in IGNORED:
                        stack.append(file)
                elif entry.is_file(follow_symlinks=False):
                    if entry.name in LOCKFILES:
                        lockfiles.append(file)
                    elif file.suffix.lower() in JS | {".php"}:
                        source.append(file)
    if len(source) > 10000 or len(lockfiles) > 100:
        raise ValueError(
            "Batas 10.000 file source atau 100 lockfile tercapai; pilih satu repo."
        )
    return sorted(source), sorted(lockfiles), sorted(skipped_worktrees), skipped


def scan_patterns(root, files):
    findings, skipped = [], 0
    for file in files:
        if not regular(file) or file.stat().st_size > 1024 * 1024:
            skipped += 1
            continue
        content = file.read_text(encoding="utf-8", errors="replace")
        for extensions, rule, pattern, prevention in RULES:
            if file.suffix.lower() not in extensions:
                continue
            for match in pattern.finditer(content):
                findings.append(
                    {
                        "file": file.relative_to(root).as_posix(),
                        "line": content.count("\n", 0, match.start()) + 1,
                        "ruleId": rule,
                        "engine": "native-pattern",
                        "evidence": "review",
                        "prevention": prevention,
                    }
                )
                if len(findings) > 1000:
                    raise ValueError("Batas 1.000 temuan pola tercapai.")
    return findings, skipped


def execute_json(args, folder, env=None, accepted_codes=(0, 1)):
    with tempfile.TemporaryFile() as output:
        result = subprocess.run(
            args,
            cwd=folder,
            stdout=output,
            stderr=subprocess.DEVNULL,
            env=env,
            timeout=180,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        if result.returncode not in accepted_codes or output.tell() > 32 * 1024 * 1024:
            raise ValueError("Engine failed or output exceeded limit")
        output.seek(0)
        return json.load(output)


def relative_file(root, value):
    if not isinstance(value, str) or "\x00" in value:
        raise ValueError("Invalid finding path")
    file = Path(value)
    file = file if file.is_absolute() else root / file
    return file.resolve().relative_to(root).as_posix()


def gitleaks(root, cache, excluded):
    result = {
        "engine": "gitleaks",
        "version": GITLEAKS_VERSION,
        "status": "failed",
        "findings": [],
    }
    try:
        _, archive, checksum, _ = engine_paths(cache)
        if not regular(archive) or digest(archive) != checksum:
            raise ValueError("Invalid engine archive")
        with tempfile.TemporaryDirectory(prefix="native-gitleaks-") as folder:
            executable = Path(folder) / (
                "gitleaks.exe" if os.name == "nt" else "gitleaks"
            )
            if archive.suffix == ".zip":
                with zipfile.ZipFile(archive) as contents:
                    data = contents.read(executable.name)
            else:
                with tarfile.open(archive) as contents:
                    member = contents.getmember(executable.name)
                    if not member.isfile() or member.size > 128 * 1024 * 1024:
                        raise ValueError("Invalid archive member")
                    data = contents.extractfile(member).read()
            executable.write_bytes(data)
            executable.chmod(0o700)
            separator = r"[/\\]" if os.name == "nt" else "/"
            paths = [
                r"(^|[/\\])("
                + "|".join(regex_literal(name) for name in sorted(IGNORED))
                + r")([/\\]|$)"
            ]
            for directory in excluded:
                literal = separator.join(
                    regex_literal(part) for part in str(directory).split(os.sep)
                )
                paths.append("^" + literal + "(" + separator + "|$)")
            config = Path(folder) / "gitleaks.toml"
            config.write_text(
                'title="Sentinel native"\n[extend]\nuseDefault=true\n[[allowlists]]\npaths='
                + json.dumps(paths, ensure_ascii=True)
                + "\n",
                encoding="utf-8",
            )
            args = [
                str(executable),
                "dir",
                "--config",
                str(config),
                "--gitleaks-ignore-path",
                folder,
                "--ignore-gitleaks-allow",
                "--redact=100",
                "--report-format=json",
                "--report-path=-",
                "--exit-code=0",
                "--no-banner",
                "--no-color",
                "--log-level=error",
                "--max-target-megabytes=1",
                "--timeout=120",
                str(root),
            ]
            raw = execute_json(args, folder, accepted_codes=(0,))
            if raw is None:
                raw = []
            if not isinstance(raw, list) or len(raw) > 10000:
                raise ValueError("Invalid Gitleaks output")
            for item in raw:
                if not isinstance(item, dict):
                    raise ValueError("Invalid finding")
                rule, line = item.get("RuleID"), item.get("StartLine")
                if (
                    not isinstance(rule, str)
                    or not re.fullmatch(r"[A-Za-z0-9._-]{1,200}", rule)
                    or type(line) is not int
                    or line < 0
                ):
                    raise ValueError("Invalid finding metadata")
                result["findings"].append(
                    {
                        "engine": "gitleaks",
                        "file": relative_file(root, item["File"]),
                        "line": line if line else None,
                        "ruleId": rule,
                        "evidence": "review",
                    }
                )
        result["findings"].sort(
            key=lambda finding: (
                finding["file"],
                finding["line"] or 0,
                finding["ruleId"],
            )
        )
        result["status"] = "success"
    except (
        OSError,
        ValueError,
        KeyError,
        StopIteration,
        subprocess.SubprocessError,
        tarfile.TarError,
        zipfile.BadZipFile,
    ):
        result["findings"] = []
        result["reason"] = (
            "Gitleaks gagal. Periksa cache, checksum, runtime, atau batas output. Persiapkan cache dengan --prepare."
        )
    return result


def release(version):
    return (
        tuple(map(int, version.split(".")))
        if isinstance(version, str) and re.fullmatch(r"\d+\.\d+\.\d+", version)
        else None
    )


def metadata(value, maximum=256):
    if (
        not isinstance(value, str)
        or not value
        or len(value) > maximum
        or any(unicodedata.category(c).startswith("C") for c in value)
    ):
        raise ValueError("Invalid advisory metadata")
    return value


def parse_advisories(raw, root):
    findings, count, skipped = [], 0, 0
    if not isinstance(raw, dict) or not isinstance(raw.get("results"), list):
        raise ValueError("Invalid OSV output")
    for entry in raw["results"]:
        file = relative_file(root, entry["source"]["path"])
        for package in entry["packages"]:
            identity = package["package"]
            name, ecosystem, version = (
                metadata(identity[key]) for key in ("name", "ecosystem", "version")
            )
            if ecosystem not in ("npm", "Packagist"):
                continue
            if re.search(r"[?&]source=LOCAL(?:&|$)", identity.get("purl", "")):
                skipped += 1
                continue
            count += 1
            for advisory in package.get("vulnerabilities", []):
                identifier = metadata(advisory["id"], 120)
                if not re.fullmatch(r"[A-Za-z0-9._-]+", identifier):
                    raise ValueError("Invalid advisory ID")
                candidates = set()
                for affected in advisory["affected"]:
                    if (
                        affected.get("package", {}).get("name") != name
                        or affected.get("package", {}).get("ecosystem") != ecosystem
                    ):
                        continue
                    for version_range in affected.get("ranges", []):
                        if version_range.get("type") not in ("SEMVER", "ECOSYSTEM"):
                            continue
                        for event in version_range.get("events", []):
                            fixed = event.get("fixed")
                            if (
                                release(fixed)
                                and release(version)
                                and release(fixed) > release(version)
                            ):
                                candidates.add(fixed)
                severity = str(
                    advisory.get("database_specific", {}).get("severity", "unknown")
                ).lower()
                findings.append(
                    {
                        "file": file,
                        "package": name,
                        "ecosystem": ecosystem,
                        "version": version,
                        "advisoryId": identifier,
                        "severity": (
                            severity
                            if severity
                            in ("critical", "high", "medium", "moderate", "low")
                            else "unknown"
                        ),
                        "fixedVersions": sorted(candidates, key=release),
                        "reference": f"https://osv.dev/vulnerability/{identifier}",
                    }
                )
    return findings, count, skipped


def safe_name(name, composer=False):
    segment = r"[A-Za-z0-9][A-Za-z0-9._-]*"
    pattern = (
        segment + "/" + segment if composer else "(?:@" + segment + "/)?" + segment
    )
    return (
        isinstance(name, str)
        and len(name) <= 214
        and re.fullmatch(pattern, name) is not None
    )


def declarations(manifest, composer=False):
    sections = (
        ("require", "require-dev")
        if composer
        else (
            "dependencies",
            "devDependencies",
            "optionalDependencies",
            "peerDependencies",
        )
    )
    return [
        (name, section, spec)
        for section in sections
        if isinstance(manifest.get(section, {}), dict)
        for name, spec in manifest.get(section, {}).items()
        if safe_name(name, composer) and isinstance(spec, str)
    ]


def clean_range(spec):
    return (
        spec
        if isinstance(spec, str) and re.fullmatch(r"[v0-9xX*<>=~^.| ,+\-]{1,100}", spec)
        else None
    )


def outside_simple_range(spec, candidate):
    match = re.fullmatch(r"([~^]?)(\d+\.\d+\.\d+)", spec or "")
    if not match or not release(candidate):
        return False
    operator, minimum = match.groups()
    floor, version = release(minimum), release(candidate)
    if version == floor:
        return False
    if version < floor or not operator:
        return True
    if operator == "~":
        return version[:2] != floor[:2]
    boundary = next((index for index, part in enumerate(floor) if part), 2)
    return version[: boundary + 1] != floor[: boundary + 1]


def npm_target(packages, location, name):
    current = location
    while True:
        key = (current + "/" if current else "") + "node_modules/" + name
        if key in packages:
            return packages[key]
        if not current:
            return {}
        current = current.rsplit("/", 1)[0] if "/" in current else ""


def update_plans(root, findings):
    groups = defaultdict(list)
    for finding in findings:
        groups[
            (
                finding["file"],
                finding["ecosystem"],
                finding["package"],
                finding["version"],
            )
        ].append(finding)
    contexts, plans = {}, []
    for (file, ecosystem, name, version), advisories in groups.items():
        manager = LOCKFILES.get(Path(file).name)
        composer = ecosystem == "Packagist"
        if file not in contexts:
            folder = (root / file).parent
            try:
                manifest = read_json(
                    folder / ("composer.json" if composer else "package.json"),
                    1024 * 1024,
                )
            except (OSError, ValueError):
                manifest = {}
            try:
                lock = read_json(root / file) if manager in ("npm", "composer") else {}
            except (OSError, ValueError):
                lock = {}
            contexts[file] = manifest, lock
        manifest, lock = contexts[file]
        direct = [
            dict(section=section, range=clean_range(spec))
            for dep, section, spec in declarations(manifest, composer)
            if dep == name
        ]
        parents = []
        if manager == "npm":
            packages = lock.get("packages", {})
            direct = [
                entry
                for entry in direct
                if npm_target(packages, "", name).get("version") == version
            ]
            for location, entry in packages.items():
                if (
                    not isinstance(entry, dict)
                    or entry.get("link")
                    or "node_modules/" not in location
                ):
                    continue
                parent = location.rsplit("node_modules/", 1)[-1]
                if not safe_name(parent):
                    continue
                if npm_target(packages, location, name).get("version") != version:
                    continue
                for dep, section, spec in declarations(entry):
                    if dep == name and section != "devDependencies":
                        parents.append({"package": parent, "range": clean_range(spec)})
        elif composer:
            for entry in lock.get("packages", []) + lock.get("packages-dev", []):
                if safe_name(entry.get("name"), True) and name in entry.get(
                    "require", {}
                ):
                    parents.append(
                        {
                            "package": entry["name"],
                            "range": clean_range(entry["require"][name]),
                        }
                    )
        kind = (
            "direct"
            if direct and manager in ("npm", "composer")
            else "transitive" if parents else "declared" if direct else "unknown"
        )
        candidates = sorted(
            {fixed for advisory in advisories for fixed in advisory["fixedVersions"]},
            key=release,
        )
        for parent in parents:
            outside = (
                [
                    candidate
                    for candidate in candidates
                    if outside_simple_range(parent["range"], candidate)
                ]
                if manager == "npm"
                else []
            )
            if outside:
                parent["outsideRange"] = outside
        why = {
            "npm": "npm explain",
            "pnpm": "pnpm why --recursive",
            "yarn": "yarn why",
            "composer": "composer why --tree --locked",
        }.get(manager)
        commands = [f"{why} {name}"] if why and safe_name(name, composer) else []
        steps = [
            "Pilih kandidat fix yang kompatibel dengan runtime dan seluruh advisory."
        ]
        if kind == "transitive":
            steps.append(
                "Telusuri rantai ke dependency langsung. Perbarui paket induk yang menerima versi perbaikan; evaluasi override terarah jika diperlukan."
            )
        elif kind == "direct":
            steps.append(
                "Perbarui deklarasi dependency pada bagian manifest yang sama."
            )
        else:
            steps.append(
                "Verifikasi workspace dan rantai dependency melalui perintah penelusuran sebelum memilih paket yang di-update."
            )
        if any(not a["fixedVersions"] for a in advisories):
            steps.append(
                "Sebagian advisory belum memiliki kandidat fix; periksa mitigasi atau pengganti paket."
            )
        steps.append(
            "Regenerasi lockfile dengan package manager proyek, uji aplikasi, lalu scan offline lagi."
        )
        plans.append(
            {
                "file": file,
                "package": name,
                "version": version,
                "ecosystem": ecosystem,
                "manager": manager,
                "kind": kind,
                "declarations": direct,
                "parents": list(
                    {json.dumps(p, sort_keys=True): p for p in parents}.values()
                ),
                "commands": commands,
                "steps": steps,
                "advisories": [
                    {"advisoryId": a["advisoryId"], "fixedVersions": a["fixedVersions"]}
                    for a in advisories
                ],
            }
        )
    return plans


def audit_dependencies(root, lockfiles, cache):
    result = {
        "engine": "OSV-Scanner",
        "version": OSV_VERSION,
        "status": "skipped",
        "findings": [],
        "updates": [],
        "networkMode": "offline",
        "lockfileCount": len(lockfiles),
        "checkedLockfileCount": 0,
        "failedLockfiles": [],
        "packageCount": 0,
        "skippedLocalPackages": 0,
    }
    if not lockfiles:
        result["reason"] = "Lockfile yang didukung tidak ditemukan."
        return result
    try:
        key, _, _, executable = engine_paths(cache)
        if not regular(executable) or digest(executable) != OSV_HASHES[key]:
            raise ValueError("Invalid OSV engine")
        folder, snapshot = database(cache)
        result["databasePreparedAt"] = snapshot
        with tempfile.TemporaryDirectory(prefix="native-osv-") as temporary:
            config = Path(temporary) / "osv-scanner.toml"
            config.write_text("", encoding="utf-8")
            env = dict(
                os.environ,
                OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY=str(folder),
                OSV_SCALIBR_LOCAL_DB_CACHE_DIRECTORY=str(folder),
            )
            for file in lockfiles:
                try:
                    if not regular(file) or file.stat().st_size > 20 * 1024 * 1024:
                        raise ValueError("Invalid lockfile")
                    args = [
                        str(executable),
                        "scan",
                        "source",
                        "--offline",
                        "--format=json",
                        "--all-packages",
                        "--no-resolve",
                        "--no-call-analysis=go",
                        "--no-call-analysis=rust",
                        "--config=" + str(config),
                        "--lockfile",
                        str(file),
                    ]
                    found, checked, skipped = parse_advisories(
                        execute_json(args, temporary, env), root
                    )
                except (
                    OSError,
                    ValueError,
                    KeyError,
                    TypeError,
                    StopIteration,
                    subprocess.SubprocessError,
                ):
                    result["failedLockfiles"].append(file.relative_to(root).as_posix())
                    continue
                result["checkedLockfileCount"] += 1
                result["findings"].extend(found)
                result["packageCount"] += checked
                result["skippedLocalPackages"] += skipped
        result["updates"] = update_plans(root, result["findings"])
        result["status"] = "success" if result["packageCount"] else "skipped"
        if result["failedLockfiles"]:
            result["status"] = "failed"
            result["reason"] = (
                "Sebagian lockfile gagal diaudit; hasil lockfile lainnya dipertahankan. Lihat failedLockfiles."
            )
        elif not result["packageCount"]:
            result["reason"] = (
                "Tidak ada paket yang dapat diaudit; entri lokal/tanpa resolved dapat dilewati OSV."
            )
    except (
        OSError,
        ValueError,
        KeyError,
        TypeError,
        StopIteration,
        subprocess.SubprocessError,
    ):
        result["status"] = "failed"
        result["reason"] = (
            "Audit OSV gagal (cache, checksum, runtime, atau output). Jalankan --prepare saat online."
        )
    return result


def scan(root, cache, skip_worktrees=False):
    source, lockfiles, excluded, skipped_links = inventory(root, skip_worktrees)
    findings, skipped_large = scan_patterns(root, source)
    print("Menjalankan Gitleaks native...", file=sys.stderr)
    secrets = gitleaks(root, cache, excluded)
    print("Menjalankan OSV offline...", file=sys.stderr)
    audit = audit_dependencies(root, lockfiles, cache)
    ruleset_digest = hashlib.sha256(
        json.dumps([(rule, pattern.pattern) for _, rule, pattern, _ in RULES]).encode()
    ).hexdigest()
    return {
        "schemaVersion": 1,
        "mode": "local-native-offline",
        "networkMode": "offline",
        "coverage": "limited",
        "scannedFiles": len(source) - skipped_large,
        "skippedLargeFiles": skipped_large,
        "skippedLinks": skipped_links,
        "skippedWorktrees": [p.relative_to(root).as_posix() for p in excluded],
        "findings": findings,
        "sourceEngines": [
            {
                "engine": "native-pattern",
                "version": "1",
                "rulesetDigest": ruleset_digest,
                "status": "success",
                "findings": findings,
            },
            secrets,
            {
                "engine": "semgrep",
                "status": "not_requested",
                "findings": [],
                "reason": "Jalur Python memakai pola source bawaan. Analisis Semgrep tidak dijalankan.",
            },
        ],
        "dependencyAudit": audit,
        "notice": "Cakupan terbatas; pola bukan bukti eksploitasi. Riwayat Git dan Composer Audit terpisah belum diperiksa. Tidak ada temuan bukan bukti aman.",
    }


def exit_code(report):
    if report["dependencyAudit"]["status"] == "failed" or any(
        e["status"] == "failed" for e in report["sourceEngines"]
    ):
        return 2
    return int(
        bool(
            report["findings"]
            or report["dependencyAudit"]["findings"]
            or any(e["findings"] for e in report["sourceEngines"])
        )
    )


def print_table(headers, rows, widths):
    border = "+" + "+".join("-" * (width + 2) for width in widths) + "+"
    print(border)
    for row in [headers] + rows:
        cells = [
            [
                safe(value)[i : i + width]
                for i in range(0, max(1, len(safe(value))), width)
            ]
            for value, width in zip(row, widths)
        ]
        for index in range(max(map(len, cells))):
            print(
                "| "
                + " | ".join(
                    (cell[index] if index < len(cell) else "").ljust(width)
                    for cell, width in zip(cells, widths)
                )
                + " |"
            )
        print(border)


def render(report):
    print("SENTINEL - NATIVE OFFLINE (Python)")
    print("CAKUPAN ENGINE")
    for engine in report["sourceEngines"] + [report["dependencyAudit"]]:
        print(
            f"  {safe(engine['engine'])}: {safe(engine['status']).upper()} ({len(engine['findings'])} temuan)"
        )
        if engine.get("reason"):
            print("    " + safe(engine["reason"]))
    print("WORKTREE DILEWATI")
    for directory in report["skippedWorktrees"]:
        print("  " + safe(directory))
    print("TEMUAN SOURCE DAN SECRET (perlu review)")
    rows = report["findings"] + report["sourceEngines"][1]["findings"]
    print_table(
        ["Engine", "Lokasi", "Rule"],
        [
            [f["engine"], f"{f['file']}:{f['line'] or '?'}", f["ruleId"]]
            for f in rows[:20]
        ],
        [14, 42, 32],
    )
    if len(rows) > 20:
        print(f"{len(rows) - 20} temuan lain tersedia lewat --output.")
    audit = report["dependencyAudit"]
    if audit.get("failedLockfiles"):
        print("LOCKFILE GAGAL DIAUDIT")
        for file in audit["failedLockfiles"]:
            print("  " + safe(file))
    print("PEMBARUAN DEPENDENCY")
    print_table(
        ["Paket terpasang", "Advisory", "Kandidat fix"],
        [
            [
                f"{f['package']}@{f['version']}",
                f["advisoryId"],
                ", ".join(f["fixedVersions"]) or "Belum diketahui",
            ]
            for f in audit["findings"][:20]
        ],
        [32, 24, 32],
    )
    if audit.get("databasePreparedAt"):
        print("Snapshot database: " + safe(audit["databasePreparedAt"]))
    print("LANGKAH UPDATE MANUAL (dari folder lockfile)")
    for plan in audit["updates"][:10]:
        print(
            f"  {safe(plan['package'])}@{safe(plan['version'])} [{plan['kind']}] ({safe(plan['file'])})"
        )
        for parent in plan["parents"][:5]:
            print(
                f"    Induk: {safe(parent['package'])} ({safe(parent['range'] or 'rentang tidak ditampilkan')})"
            )
            if parent.get("outsideRange"):
                print("    Di luar rentang induk: " + ", ".join(parent["outsideRange"]))
        for command in plan["commands"]:
            print("    " + safe(command))
        for step in plan["steps"]:
            print("    - " + step)
    if len(audit["updates"]) > 10:
        print(f"{len(audit['updates']) - 10} rencana lain tersedia lewat --output.")
    print("PENCEGAHAN")
    for prevention in sorted({f["prevention"] for f in report["findings"]}):
        print("  " + prevention)
    if report["sourceEngines"][1]["findings"]:
        print(
            "  Verifikasi indikasi secret, rotasi kredensial yang terpapar, dan tinjau riwayat Git."
        )
    print("RINGKASAN AKHIR")
    print(
        f"{report['scannedFiles']} file source; {len(report['findings'])} pola; {len(report['sourceEngines'][1]['findings'])} indikasi secret; {audit['lockfileCount']} lockfile; {audit['packageCount']} paket; {len(audit['findings'])} advisory."
    )
    print(
        "Status: "
        + (
            "SEBAGIAN GAGAL"
            if exit_code(report) == 2
            else "SELESAI DENGAN CAKUPAN TERBATAS"
        )
    )
    print(report["notice"])


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Sentinel native offline scanner. Python 3.10+, tanpa Node.js atau WSL."
    )
    parser.add_argument("target", nargs="?", help="Folder repository lokal")
    parser.add_argument(
        "--prepare",
        action="store_true",
        help="Unduh engine dan database publik; tanpa target repository",
    )
    parser.add_argument(
        "--offline", action="store_true", help="Cache lokal saja (default saat scan)"
    )
    parser.add_argument(
        "--skip-worktrees",
        action="store_true",
        help="Lewati linked Git worktree di dalam target",
    )
    parser.add_argument("--output", type=Path, help="Report JSON baru, tersanitasi")
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=Path(__file__).resolve().parent / ".sentinel-cache",
    )
    args = parser.parse_args(argv)
    if args.prepare and (
        args.target or args.offline or args.output or args.skip_worktrees
    ):
        parser.error(
            "--prepare berdiri sendiri; jalankan scan offline setelah cache siap."
        )
    if not args.prepare and not args.target:
        parser.error("Masukkan folder target, atau gunakan --prepare.")
    try:
        cache = args.cache_dir.resolve()
        if args.prepare:
            prepare(cache)
            return 0
        target = Path(args.target)
        if (
            target.is_symlink()
            or getattr(target.lstat(), "st_file_attributes", 0) & 0x400
            or not target.is_dir()
        ):
            raise ValueError("Target harus folder lokal biasa.")
        if args.output and args.output.exists():
            raise ValueError("File laporan sudah ada; gunakan nama baru.")
        report = scan(target.resolve(), cache, args.skip_worktrees)
        if args.output:
            with args.output.open("x", encoding="utf-8") as output:
                json.dump(report, output, ensure_ascii=True, indent=2)
                output.write("\n")
        render(report)
        return exit_code(report)
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        print(
            "Sentinel gagal. Periksa target, izin, batas inventory, dan path report. Tidak ada kesimpulan aman.",
            file=sys.stderr,
        )
        return 2


if __name__ == "__main__":
    sys.exit(main())
