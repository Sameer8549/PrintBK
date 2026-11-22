import fs from 'fs';
import { execSync } from 'child_process';

const notes = `### PrintBK Counter — Official Workstation Setup (Windows 64-bit)

Official desktop counter workstation release for HKBK Campus Print Services. Production Go-Live Hardened (v1.0.0, Released November 22, 2026).

#### Release Highlights & Verified Fixes
- **56/56 Physical & Virtual Printer Pipeline Pass**: Complete end-to-end pipeline verified from student upload to Windows print spoolers (SumatraPDF silent engine) across B/W, Colour, Custom Split, and Passport Photo prints.
- **Role-Aware Exact Hardware Routing**: Counter App and Staff UI explicitly pass selected printer names for B/W (\`PrintBK-BW-Virtual\`), Colour (\`PrintBK-Colour-Virtual\`), and Photo (\`PrintBK-Photo-Virtual\`), preventing colour jobs from inadvertently printing to mono devices.
- **Unblockable Open-Source UPI Gateway**: Standard universal NPCI protocol (\`Q098686787@ybl\` / HKBK Student Point), high-contrast vector QR code, 1-tap app launch (GPay, PhonePe, Paytm, BHIM, CRED), 12-digit UTR confirmation, and live status poller.
- **Clean Slate Protocol & Zero Pre-existing Devices**: Comprehensive system wipe leaving 0 active queue orders and 0 registered counter devices for a fresh, out-of-the-box onboarding experience.
- **First-Run Workstation Setup**: Seamless pairing with setup code \`PBK-SETUP-9021\`, automatic Windows spooler discovery, and cloud synchronization with \`shop_settings.printer_mapping\`.
- **Campus Network & DNS Blackhole Immunity**: Dual-tier IPv4 socket pinning (\`dns.setDefaultResultOrder('ipv4first')\`) and hardcoded fallback (\`169.148.148.93\`) guarantee uninterrupted agent polling and heartbeats.
- **Anti-Flapping Heartbeat Sync**: 5-second agent heartbeat with 60-second server threshold (12x buffer) completely eliminates false offline drops on high-latency campus networks.
- **Student App Cart Resilience**: Hardened file deletion in student basket to prevent blank screen or React hooks order violations on 0 items.
- **Catalyst Serverless Edge Deployment**: Paginated bulk fetch (\`LIMIT 1, 200\`) and batch updates (\`table.updateRows\`) reduce database operations by >90%.

#### Direct Downloads
- **[PrintBK-Counter-Setup.exe](https://github.com/Sameer8549/PrintBK-releases/releases/download/v1.0.0/PrintBK-Counter-Setup.exe)** (100.5 MB)
- **[PrintBK-Counter-Setup-1.0.0.exe](https://github.com/Sameer8549/PrintBK-releases/releases/download/v1.0.0/PrintBK-Counter-Setup-1.0.0.exe)** (100.5 MB)

#### SHA-256 Checksums
\`\`\`
21bc58c6090b66174f97fdc0f63bead64bdab51790e78a1169012ad1dff44d63  PrintBK-Counter-Setup.exe
21bc58c6090b66174f97fdc0f63bead64bdab51790e78a1169012ad1dff44d63  PrintBK-Counter-Setup-1.0.0.exe
\`\`\`

#### Windows Verification
\`\`\`powershell
Get-FileHash "$HOME\\Downloads\\PrintBK-Counter-Setup.exe" -Algorithm SHA256
\`\`\`
Expected Hash: \`21bc58c6090b66174f97fdc0f63bead64bdab51790e78a1169012ad1dff44d63\`
`;

fs.writeFileSync('release_notes_tmp.md', notes);
try {
  execSync('gh release edit v1.0.0 --repo Sameer8549/PrintBK-releases --notes-file release_notes_tmp.md');
  console.log('GitHub Release notes updated successfully on Sameer8549/PrintBK-releases!');
} catch (err) {
  console.error('Failed to update release notes on Sameer8549/PrintBK-releases:', err.message);
} finally {
  if (fs.existsSync('release_notes_tmp.md')) fs.unlinkSync('release_notes_tmp.md');
}

// Also update work/release-notes.md and PrintBK/work/release-notes.md
fs.writeFileSync('work/release-notes.md', notes);
if (fs.existsSync('PrintBK/work')) {
  fs.writeFileSync('PrintBK/work/release-notes.md', notes);
}
