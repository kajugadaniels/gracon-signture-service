import * as crypto from 'crypto';
import * as forge from 'node-forge';
import { buildPersonalX509 } from './x509.helper';

function generatePemKeyPair() {
  const pair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  return {
    publicKeyPem: pair.publicKey,
    privateKeyPem: pair.privateKey,
  };
}

function readSubjectField(
  cert: forge.pki.Certificate,
  fieldName: string,
): string | undefined {
  return cert.subject.attributes.find((attribute) => {
    return attribute.shortName === fieldName || attribute.name === fieldName;
  })?.value;
}

function readSubjectIdentifier(
  cert: forge.pki.Certificate,
): string | undefined {
  return cert.subject.attributes.find((attribute) => {
    return (
      attribute.name === 'serialNumber' ||
      attribute.shortName === 'serialNumber' ||
      attribute.type === '2.5.4.5'
    );
  })?.value;
}

describe('buildPersonalX509', () => {
  const { publicKeyPem, privateKeyPem } = generatePemKeyPair();

  it('sets C=RW when subjectCountry is RW', () => {
    const result = buildPersonalX509(
      {
        firstName: 'Alice',
        lastName: 'Citizen',
        userId: 'user-1',
        subjectInstId: '1199912345678901',
      },
      publicKeyPem,
      privateKeyPem,
      'RW',
      2,
    );
    const cert = forge.pki.certificateFromPem(result.certificatePem);

    expect(readSubjectField(cert, 'C')).toBe('RW');
  });

  it('sets C=KE when subjectCountry is KE', () => {
    const result = buildPersonalX509(
      {
        firstName: 'Ishimwe',
        lastName: 'Patrick',
        userId: 'user-2',
        subjectInstId: '2199180000001234',
      },
      publicKeyPem,
      privateKeyPem,
      'KE',
      2,
    );
    const cert = forge.pki.certificateFromPem(result.certificatePem);

    expect(readSubjectField(cert, 'C')).toBe('KE');
  });

  it('populates the identifier in the certificate subject', () => {
    const result = buildPersonalX509(
      {
        firstName: 'Ishimwe',
        lastName: 'Patrick',
        userId: 'user-3',
        subjectInstId: '2199180000001234',
      },
      publicKeyPem,
      privateKeyPem,
      'KE',
      2,
    );
    const cert = forge.pki.certificateFromPem(result.certificatePem);

    expect(readSubjectIdentifier(cert)).toBe('2199180000001234');
  });

  it('rejects invalid country codes', () => {
    expect(() =>
      buildPersonalX509(
        {
          firstName: 'Bad',
          lastName: 'Country',
          userId: 'user-4',
          subjectInstId: '2199180000001234',
        },
        publicKeyPem,
        privateKeyPem,
        'KEN',
        2,
      ),
    ).toThrow('subjectCountry must be a valid ISO alpha-2 code');

    expect(() =>
      buildPersonalX509(
        {
          firstName: 'Bad',
          lastName: 'Country',
          userId: 'user-5',
          subjectInstId: '2199180000001234',
        },
        publicKeyPem,
        privateKeyPem,
        '1',
        2,
      ),
    ).toThrow('subjectCountry must be a valid ISO alpha-2 code');
  });
});
