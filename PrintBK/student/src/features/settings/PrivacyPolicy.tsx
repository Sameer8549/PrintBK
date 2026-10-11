import React from 'react';
import { Topbar } from '../../components/ui';
import { Screen } from '../../lib/types';

function PrivacyPolicy({ go }: { go: (screen: Screen) => void }) {
  const sections = [
    {
      title: 'What we collect',
      body: 'When you upload files for printing, we temporarily store them on secure servers. Files are automatically deleted within 10 minutes of your order being collected. We do not read, copy, or retain the content of your files beyond what is needed to process your print job.',
    },
    {
      title: 'Phone number',
      body: 'If you provide your phone number during checkout, it is used only to notify you when your print is ready. It is stored locally on your device and is never shared with third parties or stored on our servers.',
    },
    {
      title: 'Order history',
      body: 'Your order history (order ID, file names, total amount) is stored locally on your device using browser storage. It is never uploaded to our servers. You can clear this data at any time from Settings.',
    },
    {
      title: 'No tracking or ads',
      body: 'PrintBK does not use analytics trackers, ad networks, or cookies beyond what is strictly necessary for the app to function. We do not sell or share your data with any third party.',
    },
    {
      title: 'File security',
      body: 'All file uploads are encrypted in transit using HTTPS. Files are stored temporarily on Zoho Catalyst infrastructure and are inaccessible to anyone except the print system. Only shop operators can see your order ID and status — not the file content.',
    },
    {
      title: 'Your rights',
      body: 'You can delete your files immediately from the Order Ticket screen. You can clear all local data from Settings. Since we do not maintain a user account system, there is no personal profile to delete.',
    },
    {
      title: 'Contact',
      body: 'For any privacy concerns, contact the HKBK Student Point shop directly or email the PrintBK team at the contact address displayed at the shop.',
    },
  ];

  return (
    <main className="page" style={{ overflowY: 'auto' }}>
      <Topbar title="Privacy policy" back onBack={() => go("settings")} />
      <div style={{ padding: '20px 24px 48px' }}>
        <p style={{ fontSize: 13, color: 'var(--color-secondary)', marginTop: 0, marginBottom: 24, lineHeight: 1.6 }}>
          Last updated: October 2026 · PrintBK is a student-facing print service app built for HKBK Student Point, Bengaluru.
        </p>
        {sections.map(sec => (
          <div key={sec.title} style={{ marginBottom: 24 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600 }}>{sec.title}</h3>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: 'var(--color-primary)' }}>{sec.body}</p>
          </div>
        ))}
        <div style={{ marginTop: 32, padding: '16px', background: 'var(--color-surface, #fff)', borderRadius: 12, border: '1.5px solid var(--color-border, #e2e8f0)' }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-secondary)', lineHeight: 1.6 }}>
            <b>TL;DR:</b> We only use your files to print them. They're deleted in 10 minutes. We don't track you or share your data. Your phone number (if given) stays on your device only.
          </p>
        </div>
      </div>
    </main>
  );
}
export default PrivacyPolicy;
