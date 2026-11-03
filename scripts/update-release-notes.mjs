import fs from 'fs';
import { execSync } from 'child_process';

const notes = `### PrintBK Counter — Official Workstation Setup (Windows 64-bit)

Official desktop counter workstation release for HKBK Campus Print Services.

#### Release Highlights
- **Engine Size**: Ultra-compact 100.5 MB bundle (down from legacy 367 MB).
- **Embedded Print Agent**: Automatic Windows printer discovery, B/W, Colour, and Photo print spooling with zero configuration.
- **Photo Printing**: Standardized A4 glossy photo paper routing with automatic rotation and borderless positioning.
- **Offline Resilience**: IPv4 preference for university networks, main-frame failure auto-retry, resilient reconnection.
- **Workstation Concurrency**: Multi-PC atomic print lease locking prevents duplicate print jobs across staff counters.

#### Direct Downloads
- **[PrintBK-Counter-Setup.exe](https://github.com/Sameer8549/PrintBK-releases/releases/download/v1.0.0/PrintBK-Counter-Setup.exe)** (100.5 MB)
- **[PrintBK-Counter-Setup-1.0.0.exe](https://github.com/Sameer8549/PrintBK-releases/releases/download/v1.0.0/PrintBK-Counter-Setup-1.0.0.exe)** (100.5 MB)

#### SHA-256 Checksums
\`\`\`
57d59495d2d29ce722d7eac29332389779e61a422857fc4210f86337d32514db  PrintBK-Counter-Setup.exe
57d59495d2d29ce722d7eac29332389779e61a422857fc4210f86337d32514db  PrintBK-Counter-Setup-1.0.0.exe
\`\`\`

#### Windows Verification
\`\`\`powershell
Get-FileHash "$HOME\\Downloads\\PrintBK-Counter-Setup.exe" -Algorithm SHA256
\`\`\`
Expected Hash: \`57d59495d2d29ce722d7eac29332389779e61a422857fc4210f86337d32514db\`
`;

fs.writeFileSync('release_notes_tmp.md', notes);
execSync('gh release edit v1.0.0 --repo Sameer8549/PrintBK-releases --notes-file release_notes_tmp.md');
fs.unlinkSync('release_notes_tmp.md');
console.log('GitHub Release notes updated successfully!');
