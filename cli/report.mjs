export const guidance = {
  'sentinel.quick.php-dynamic-execution': {
    title: 'Eksekusi dinamis PHP',
    prevention:
      'Telusuri asal input. Ganti eval dengan logika eksplisit; gunakan API library untuk operasi sistem. Jika proses eksternal diperlukan, batasi executable dan argumen dengan allowlist.',
    reference:
      'https://cheatsheetseries.owasp.org/cheatsheets/OS_Command_Injection_Defense_Cheat_Sheet.html',
  },
  'sentinel.quick.php-raw-sql-query': {
    title: 'Query SQL mentah',
    prevention:
      'Gunakan prepared statement dan parameter binding. Validasi nama tabel atau kolom dinamis dengan allowlist. Uji input yang mengandung karakter SQL.',
    reference:
      'https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html',
  },
  'sentinel.quick.node-dynamic-evaluation': {
    title: 'Evaluasi kode dinamis',
    prevention:
      'Telusuri asal input ke eval atau Function. Gunakan JSON.parse untuk data JSON atau pemetaan fungsi eksplisit. Uji penolakan input yang tidak diizinkan.',
    reference:
      'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/eval',
  },
  'sentinel.quick.node-shell-command': {
    title: 'Pemanggilan shell',
    prevention:
      'Utamakan API library. Jika perlu proses eksternal, gunakan executable tetap dan argumen terpisah tanpa shell, validasi allowlist, dan batasi izin proses.',
    reference:
      'https://cheatsheetseries.owasp.org/cheatsheets/OS_Command_Injection_Defense_Cheat_Sheet.html',
  },
};

function safe(value) {
  return String(value).replace(
    /[\p{Cc}\p{Cf}|]/gu,
    (character) => `\\u${character.codePointAt(0).toString(16).padStart(4, '0')}`,
  );
}

function wrap(value, width) {
  const characters = Array.from(safe(value));
  const lines = [];
  for (let offset = 0; offset < characters.length; offset += width)
    lines.push(characters.slice(offset, offset + width).join(''));
  return lines.length ? lines : [''];
}

function table(headers, rows, widths) {
  const border = '+' + widths.map((width) => '-'.repeat(width + 2)).join('+') + '+';
  const lines = [border];
  for (const [index, row] of [headers, ...rows].entries()) {
    const cells = row.map((value, column) => wrap(value, widths[column]));
    for (let line = 0; line < Math.max(...cells.map((cell) => cell.length)); line++) {
      lines.push(
        '| ' +
          cells
            .map((cell, column) => {
              const text = cell[line] ?? '';
              return text + ' '.repeat(widths[column] - Array.from(text).length);
            })
            .join(' | ') +
          ' |',
      );
    }
    if (index === 0) lines.push(border);
  }
  lines.push(border);
  return lines.join('\n');
}

function renderDependencyUpdates(updates, width) {
  const labels = {
    direct: 'Langsung',
    transitive: 'Transitif',
    declared: 'Dideklarasikan; verifikasi versi dan workspace',
    unknown: 'Rantai dependency belum diketahui',
  };
  const lines = ['', 'LANGKAH UPDATE MANUAL (jalankan dari folder lockfile)'];
  for (const update of updates.slice(0, 10)) {
    lines.push(
      '',
      ...wrap(
        `${update.package}@${update.version} — ${labels[update.kind]} (${update.file})`,
        width,
      ),
    );
    for (const { advisoryId, fixedVersions } of update.advisories.slice(0, 3))
      lines.push(
        ...wrap(`  ${advisoryId}: ${fixedVersions.join(', ') || 'Fix belum diketahui'}`, width),
      );
    if (update.advisories.length > 3)
      lines.push(`  ${update.advisories.length - 3} advisory lain tersedia di JSON.`);
    for (const { manifest, section, range } of update.declarations)
      lines.push(
        ...wrap(`  Deklarasi: ${manifest} (${section}${range ? `, ${range}` : ''})`, width),
      );
    for (const parent of update.parents.slice(0, 5)) {
      lines.push(
        ...wrap(`  Induk: ${parent.package}${parent.range ? ` (${parent.range})` : ''}`, width),
      );
      if (parent.outsideRange?.length)
        lines.push(...wrap(`    Di luar rentang induk: ${parent.outsideRange.join(', ')}`, width));
    }
    if (update.parents.length > 5)
      lines.push(`  ${update.parents.length - 5} induk lain tersedia di JSON.`);
    for (const command of update.commands) lines.push(`  Telusuri: ${safe(command)}`);
    for (const step of update.steps) lines.push(...wrap(`  - ${step}`, width));
    if (update.updateCommand)
      lines.push(`  Contoh setelah verifikasi: ${safe(update.updateCommand)}`);
  }
  if (updates.length > 10)
    lines.push(`${updates.length - 10} rencana lain: gunakan --output untuk hasil lengkap.`);
  lines.push(
    '',
    ...wrap(
      'Periksa batas versi paket induk, runtime, dan peer dependency. Perintah update manual mungkin memerlukan registry atau cache paket.',
      width,
    ),
  );
  return lines;
}

export function renderReport(report, columns = 100) {
  const width = Math.max(60, Math.min(columns, 120));
  const lines = ['SENTINEL - HASIL PEMERIKSAAN', ''];
  const sourceEngines = report.sourceEngines ?? [];
  if (report.networkMode === 'offline')
    lines.push('Mode OFFLINE: cache lokal; tanpa unduhan atau query advisory.', '');
  lines.push('TEMUAN SOURCE (kecocokan pola; status: perlu review)');
  if (!report.findings.length) lines.push('Tidak ada kecocokan pola pada file yang diperiksa.');
  else
    lines.push(
      table(
        ['No', 'Lokasi file:baris', 'Jenis'],
        report.findings
          .slice(0, 20)
          .map((finding, index) => [
            index + 1,
            `${finding.file}:${finding.line}`,
            guidance[finding.ruleId].title,
          ]),
        [3, width - 35, 22],
      ),
    );
  if (report.findings.length > 20)
    lines.push(
      `${report.findings.length - 20} temuan source lainnya: gunakan --output untuk hasil lengkap.`,
    );

  const audit = report.dependencyAudit;
  lines.push(
    '',
    'CAKUPAN ENGINE',
    table(
      ['Engine', 'Status'],
      [
        ['Pola bawaan', 'SELESAI - pencocokan teks'],
        [`OSV${audit.version ? ` ${audit.version}` : ''}`, audit.status.toUpperCase()],
        ...['semgrep', 'gitleaks'].map((engine) => {
          const execution = sourceEngines.find((item) => item.engine === engine);
          return [
            execution
              ? `${engine} ${execution.version}`
              : engine === 'semgrep'
                ? 'Semgrep'
                : 'Gitleaks',
            execution ? execution.status.toUpperCase() : 'BELUM DIJALANKAN',
          ];
        }),
        ['Composer Audit', 'BELUM DIJALANKAN'],
      ],
      [17, width - 24],
    ),
  );
  if (audit.reason) lines.push(safe(audit.reason));
  if (audit.databasePreparedAt)
    lines.push(
      `Snapshot database offline: ${safe(audit.databasePreparedAt)}. Advisory setelah snapshot belum tercakup.`,
    );
  for (const execution of sourceEngines) {
    if (execution.reason) lines.push(`${execution.engine}: ${safe(execution.reason)}`);
    if (execution.scope) lines.push(`${execution.engine}: ${safe(execution.scope)}`);
  }
  if (audit.skippedLocalPackages)
    lines.push(`${audit.skippedLocalPackages} entri paket lokal/tanpa resolved tidak diaudit OSV.`);

  const engineFindings = sourceEngines.flatMap((engine) => engine.findings);
  if (sourceEngines.length) {
    lines.push('', 'TEMUAN SEMGREP DAN GITLEAKS (perlu review)');
    if (engineFindings.length)
      lines.push(
        table(
          ['Engine', 'Lokasi file:baris', 'Rule ID'],
          engineFindings
            .slice(0, 20)
            .map((finding) => [finding.engine, `${finding.file}:${finding.line}`, finding.ruleId]),
          [8, width - 44, 26],
        ),
      );
    else lines.push('Tidak ada temuan engine yang tersedia. Periksa status setiap engine di atas.');
    if (engineFindings.length > 20)
      lines.push(`${engineFindings.length - 20} temuan engine lain: gunakan --output.`);
  }

  lines.push('', 'PEMBARUAN DEPENDENCY');
  if (audit.status !== 'success') {
    lines.push('Paket dan versi perbaikan belum dapat ditentukan.');
    if (audit.status === 'not_requested' && report.networkMode !== 'offline')
      lines.push('Tambahkan --dependencies untuk audit lockfile melalui OSV.');
  } else if (!audit.findings.length) {
    lines.push('Tidak ada advisory yang cocok pada paket yang diperiksa saat audit ini.');
  } else {
    lines.push(
      table(
        ['Paket @ terpasang', 'Advisory / level', 'Kandidat fix'],
        audit.findings
          .slice(0, 20)
          .map((finding) => [
            `${finding.package}@${finding.version}`,
            `${finding.advisoryId} / ${finding.severity}`,
            finding.fixedVersions.join(', ') || 'Belum diketahui',
          ]),
        [
          Math.floor((width - 10) * 0.38),
          Math.floor((width - 10) * 0.35),
          width - 10 - Math.floor((width - 10) * 0.38) - Math.floor((width - 10) * 0.35),
        ],
      ),
    );
    if (audit.findings.length > 20)
      lines.push(`${audit.findings.length - 20} advisory lainnya: gunakan --output.`);
    for (const finding of audit.findings.slice(0, 20))
      lines.push(`${safe(finding.package)}: ${finding.reference} (${safe(finding.file)})`);
    lines.push(
      'Kandidat fix adalah batas perbaikan per advisory, bukan jaminan versi aman untuk semua advisory.',
      'Pilih cabang versi yang kompatibel, perbarui dependency langsung atau induk dependency transitif,',
      'regenerasi lockfile melalui package manager proyek, lalu jalankan test aplikasi dan audit ulang.',
      'Versi prerelease atau fix yang tidak tercatat perlu pemeriksaan manual.',
    );
    if (audit.updates?.length) lines.push(...renderDependencyUpdates(audit.updates, width));
  }
  lines.push('', 'PENCEGAHAN DAN TINDAK LANJUT');
  const ruleIds = [...new Set(report.findings.map((finding) => finding.ruleId))];
  if (!ruleIds.length)
    lines.push('Lanjutkan review source, audit dependency, dan pemeriksaan secret.');
  for (const id of ruleIds) {
    const item = guidance[id];
    lines.push(
      `${item.title} (${id}):`,
      ...wrap(item.prevention, width),
      `Referensi: ${item.reference}`,
    );
  }
  if (ruleIds.length)
    lines.push(
      'Konfirmasi konteks setiap kecocokan: komentar, string, atau contoh dapat ikut cocok.',
    );
  if (engineFindings.some((finding) => finding.engine === 'gitleaks'))
    lines.push(
      'Indikasi secret: verifikasi dan cabut/rotasi credential yang aktif, periksa penyalahgunaan dan riwayat Git, lalu simpan credential di secret manager. Nilai secret tidak disertakan dalam report.',
    );
  if (engineFindings.some((finding) => finding.engine === 'semgrep'))
    lines.push(
      'Temuan Semgrep: tinjau aliran input, gunakan API aman serta parameter binding, lalu jalankan test perbaikan. Deteksi aturan belum membuktikan eksploitasi.',
    );
  if (report.output) lines.push('', `Report JSON: ${safe(report.output)}`);
  lines.push(
    '',
    'RINGKASAN AKHIR',
    `${report.scannedFiles} file diperiksa; ${report.findings.length} temuan source untuk ditinjau.`,
    `${report.skippedDirectories} folder diabaikan; ${report.skippedLargeFiles} file besar/berubah dan ${report.skippedLinks} symlink dilewati.`,
    `Dependency: ${audit.status.toUpperCase()}; ${audit.packageCount ?? 0} entri paket diperiksa; ${audit.findings.length} kecocokan advisory.`,
    ...(sourceEngines.length
      ? [
          `Semgrep/Gitleaks: ${engineFindings.length} temuan engine untuk ditinjau. Riwayat Git belum dipindai.`,
        ]
      : []),
    ...(audit.status === 'success'
      ? [
          `${new Set(audit.findings.map((finding) => `${finding.ecosystem}/${finding.package}@${finding.version}`)).size} paket/versi terdampak advisory; ${audit.findings.filter((finding) => !finding.fixedVersions.length).length} advisory tanpa kandidat fix yang dapat ditentukan.`,
        ]
      : []),
    `Status: ${audit.status === 'failed' || sourceEngines.some((engine) => engine.status === 'failed') ? 'SEBAGIAN GAGAL' : 'SELESAI DENGAN CAKUPAN TERBATAS'}.`,
    'Tidak ada temuan bukan bukti aman. Temuan belum membuktikan eksploitasi.',
  );
  return lines.join('\n');
}
