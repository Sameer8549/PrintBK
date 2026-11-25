/**
 * UPILerify — Email Sender & Authenticity Validator
 *
 * Prevents email spoofing by verifying that incoming bank alerts originate
 * from whitelisted banking domains and passed cryptographic checks
 * (DKIM, SPF, or DMARC) recorded by Gmail's MX layer.
 *
 * RULES.md Compliance:
 *  - Rule 1 (SRP): Dedicated exclusively to inbound email authenticity.
 *  - Rule 2 (Strict Modularity): Zero external dependencies beyond Node.js.
 *  - Rule 6 (< 300 lines): Focused, compact, and strictly typed.
 */

export interface EmailAuthResult {
  valid: boolean;
  reason?: string;
  senderEmail?: string;
  senderDomain?: string;
  detectedBank?: string;
  authStatus?: {
    spfPass: boolean;
    dkimPass: boolean;
    dmarcPass: boolean;
  };
}

/**
 * Whitelist of verified banking domains recognized by UPILerify.
 * Any alert from a domain not in this list is rejected as untrusted.
 */
export const TRUSTED_BANK_DOMAINS: Record<string, string> = {
  'kotak.com': 'Kotak 811',
  'hdfcbank.net': 'HDFC Bank',
  'hdfcbank.com': 'HDFC Bank',
  'icicibank.com': 'ICICI Bank',
  'sbi.co.in': 'SBI',
  'axisbank.com': 'Axis Bank',
  'paytm.com': 'Paytm Payments Bank',
  'phonepe.com': 'PhonePe',
  'google.com': 'Google Pay',
  'cred.club': 'CRED UPI',
  'indusind.com': 'IndusInd Bank',
  'idfcfirstbank.com': 'IDFC FIRST Bank',
  'pnb.co.in': 'PNB',
  'bankofbaroda.com': 'Bank of Baroda',
  'bankofbaroda.co.in': 'Bank of Baroda',
  'canarabank.com': 'Canara Bank',
  'unionbankofindia.bank': 'Union Bank of India',
  'federalbank.co.in': 'Federal Bank',
};

/**
 * Extracts normalized email address and domain from address structures.
 */
export function extractSenderInfo(fromRaw: any): { address: string; domain: string } {
  let address = '';

  if (typeof fromRaw === 'string') {
    const match = fromRaw.match(/<([^>]+)>/) || fromRaw.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    address = match ? match[1].toLowerCase().trim() : fromRaw.toLowerCase().trim();
  } else if (fromRaw?.value && Array.isArray(fromRaw.value) && fromRaw.value.length > 0) {
    address = (fromRaw.value[0].address || '').toLowerCase().trim();
  } else if (fromRaw?.text) {
    const match = fromRaw.text.match(/<([^>]+)>/) || fromRaw.text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    address = match ? match[1].toLowerCase().trim() : fromRaw.text.toLowerCase().trim();
  }

  const parts = address.split('@');
  const domain = parts.length === 2 ? parts[1].toLowerCase().trim() : '';

  return { address, domain };
}

/**
 * Matches a sender domain against trusted banking domains (including subdomains).
 */
export function matchTrustedBankDomain(domain: string): { trusted: boolean; bankName?: string; rootDomain?: string } {
  if (!domain) return { trusted: false };

  // Exact match or subdomain match (e.g. alerts.hdfcbank.net -> hdfcbank.net)
  for (const [trustedDomain, bankName] of Object.entries(TRUSTED_BANK_DOMAINS)) {
    if (domain === trustedDomain || domain.endsWith(`.${trustedDomain}`)) {
      return { trusted: true, bankName, rootDomain: trustedDomain };
    }
  }

  return { trusted: false };
}

/**
 * Inspects authentication headers (Authentication-Results, Received-SPF, DKIM-Signature).
 */
export function checkAuthenticationHeaders(headers: Map<string, any> | Record<string, any> | undefined): {
  spfPass: boolean;
  dkimPass: boolean;
  dmarcPass: boolean;
} {
  const getHeader = (name: string): string => {
    if (!headers) return '';
    if (typeof (headers as any).get === 'function') {
      const val = (headers as any).get(name.toLowerCase());
      return val ? String(val) : '';
    }
    const val = (headers as Record<string, any>)[name.toLowerCase()] || (headers as Record<string, any>)[name];
    return val ? String(val) : '';
  };

  const authResults = getHeader('authentication-results').toLowerCase();
  const receivedSpf = getHeader('received-spf').toLowerCase();

  const dkimPass = /dkim=pass\b/.test(authResults);
  const spfPass = /spf=pass\b/.test(authResults) || receivedSpf.startsWith('pass');
  const dmarcPass = /dmarc=pass\b/.test(authResults);

  return { spfPass, dkimPass, dmarcPass };
}

/**
 * Validates inbound email sender and cryptographic authenticity.
 */
export function validateEmailSource(
  fromRaw: any,
  headers?: Map<string, any> | Record<string, any>
): EmailAuthResult {
  const { address, domain } = extractSenderInfo(fromRaw);

  if (!address || !domain) {
    return {
      valid: false,
      reason: 'Missing or unparseable sender address in email header.',
    };
  }

  // 1. Domain whitelist check
  const domainMatch = matchTrustedBankDomain(domain);
  if (!domainMatch.trusted) {
    return {
      valid: false,
      reason: `Sender domain "${domain}" is not in the trusted bank registry.`,
      senderEmail: address,
      senderDomain: domain,
    };
  }

  // 2. Cryptographic authentication check (DKIM / SPF)
  const authStatus = checkAuthenticationHeaders(headers);
  const hasValidAuth = authStatus.dkimPass || authStatus.spfPass || authStatus.dmarcPass;

  // Development bypass escape hatch
  if (process.env.ALLOW_UNAUTHENTICATED_EMAILS === 'true') {
    if (!hasValidAuth) {
      console.warn(
        `[UPILerify][SECURITY WARNING] ALLOW_UNAUTHENTICATED_EMAILS enabled. Permitted unverified email from ${address}.`
      );
    }
    return {
      valid: true,
      senderEmail: address,
      senderDomain: domain,
      detectedBank: domainMatch.bankName,
      authStatus,
    };
  }

  if (!hasValidAuth) {
    return {
      valid: false,
      reason: `Email from ${address} failed cryptographic verification (DKIM, SPF, and DMARC did not pass).`,
      senderEmail: address,
      senderDomain: domain,
      detectedBank: domainMatch.bankName,
      authStatus,
    };
  }

  return {
    valid: true,
    senderEmail: address,
    senderDomain: domain,
    detectedBank: domainMatch.bankName,
    authStatus,
  };
}
