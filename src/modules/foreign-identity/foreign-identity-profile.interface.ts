export interface ForeignIdentityProfile {
  fin: string;
  firstName: string;
  lastName: string;
  gender: 'MALE' | 'FEMALE';
  dateOfBirth: string;
  countryOfOrigin: string;
  nationality: string;
  maritalStatus: string;
  issuanceVersion: number;
  isActive: boolean;
}
