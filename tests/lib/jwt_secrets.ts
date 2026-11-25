// tests/lib/jwt_secrets.ts
// Guessable JWT signing secrets for the AC5 check (a token signed with one of
// these must be REJECTED by a secure app).
//
// TODO (Nazrul): replace this list with the short list from the Invicti post
// and cite it in the paper. Freeze the list before the official batch: a
// changed list means every JWT app's AC5 result must be re-assessed.
// These are public, well-known weak values. None is a real credential.
export const GUESSABLE_JWT_SECRETS: string[] = [
  'secret',
  'jwt_secret',
  'jwtsecret',
  'jwt-secret',
  'your-256-bit-secret',
  'changeme',
  'change-me',
  'password',
  'supersecret',
  'mysecret',
  'my-secret-key',
  'secretkey',
  'default',
  'test',
  'dev',
  'development',
  '123456',
  '12345678',
];
