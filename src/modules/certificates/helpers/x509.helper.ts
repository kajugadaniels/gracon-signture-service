import * as forge from 'node-forge';
import * as crypto from 'crypto';

export interface CertificateSubject {
  firstName: string;
  lastName: string;
  userId: string;
  subjectInstId: string;
}

export interface BuildCertificateResult {
  certificatePem: string;
  serialNumber: string;
  notBefore: Date;
  notAfter: Date;
  subjectCN: string;
}

/**
 * Builds and self-signs an X.509 v3 personal certificate.
 * Private key is used only inside this function and is not retained.
 * In production (CloudHSM), this function's signing step will be
 * replaced by an HSM PKCS#11 call — everything else stays the same.
 */
export function buildPersonalX509(
  subject: CertificateSubject,
  publicKeyPem: string,
  privateKeyPem: string,
  subjectCountry: string,
  validityYears = 2,
): BuildCertificateResult {
  assertIsoAlpha2Country(subjectCountry);

  const serialNumber = crypto.randomUUID().replace(/-/g, '').toUpperCase();
  const notBefore = new Date();
  const notAfter = new Date();
  notAfter.setFullYear(notAfter.getFullYear() + validityYears);

  const subjectCN = `${subject.firstName} ${subject.lastName}`;

  const cert = forge.pki.createCertificate();
  const pubKey = forge.pki.publicKeyFromPem(publicKeyPem);
  const privKey = forge.pki.privateKeyFromPem(privateKeyPem);

  cert.publicKey = pubKey;
  cert.serialNumber = serialNumber;
  cert.validity.notBefore = notBefore;
  cert.validity.notAfter = notAfter;

  const attrs = [
    { name: 'commonName', value: subjectCN },
    { name: 'organizationName', value: 'ID Verification Platform' },
    { name: 'serialNumber', value: subject.subjectInstId },
    { name: 'countryName', value: subjectCountry },
  ];

  cert.setSubject(attrs);
  cert.setIssuer(attrs); // self-signed — issuer = subject

  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, nonRepudiation: true },
    {
      name: 'subjectAltName',
      altNames: [{ type: 2, value: subject.userId }], // SAN = userId
    },
  ]);

  // Self-sign with the user's private key
  // In production: this call is replaced by HSM signing
  cert.sign(privKey, forge.md.sha256.create());

  const certificatePem = forge.pki.certificateToPem(cert);

  return { certificatePem, serialNumber, notBefore, notAfter, subjectCN };
}

function assertIsoAlpha2Country(subjectCountry: string): void {
  if (!/^[A-Z]{2}$/.test(subjectCountry)) {
    throw new Error(
      `subjectCountry must be a valid ISO alpha-2 code. Received "${subjectCountry}".`,
    );
  }
}
