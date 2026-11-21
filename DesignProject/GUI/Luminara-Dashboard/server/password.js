// Password hashing (bcrypt via the pure-JavaScript "bcryptjs" package), password rules and temporary passwords.
import crypto from 'node:crypto';

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX_BYTES = 72; // bcrypt only uses the first 72 bytes, so longer passwords are refused, not silently cut

const COMMON = new Set([
  'password', 'password1', 'password123', '1234567890', '12345678910', 'qwertyuiop', 'qwerty12345', 'letmein123',
  'welcome123', 'admin12345', 'administrator', 'luminara123', 'changeme123', 'iloveyou123',
]);

// Returns a list of problems (empty = acceptable). `context` lets us refuse a password that is just the username/e-mail.
export const passwordProblems = (pw, context = {}) => {
  const problems = [];
  if (typeof pw !== 'string' || pw.length === 0) return ['Enter a password.'];
  if (pw.length < PASSWORD_MIN) problems.push(`Use at least ${PASSWORD_MIN} characters.`);
  if (Buffer.byteLength(pw, 'utf8') > PASSWORD_MAX_BYTES) problems.push(`Use at most ${PASSWORD_MAX_BYTES} bytes (about 72 characters).`);
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) problems.push('Include at least one letter and one number.');
  if (/^\s|\s$/.test(pw)) problems.push('Do not start or end the password with a space.');
  const lower = pw.toLowerCase();
  if (COMMON.has(lower)) problems.push('That password is too common.');
  const bits = [context.username, context.email?.split('@')[0]].filter((s) => s && s.length >= 3).map((s) => s.toLowerCase());
  if (bits.some((b) => lower.includes(b))) problems.push('The password must not contain the username or e-mail name.');
  return problems;
};

// 14 random characters, no look-alikes (0/O, 1/l/I). Always passes the policy above.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
export const generateTemporaryPassword = (length = 14) => {
  for (;;) {
    let out = '';
    for (let i = 0; i < length; i += 1) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
    if (/[A-Za-z]/.test(out) && /[0-9]/.test(out) && !COMMON.has(out.toLowerCase())) return out;
  }
};

// The real hasher. bcryptjs is loaded on first use so the rest of the server (and most tests) do not need it installed.
export const createBcryptHasher = ({ rounds = 12 } = {}) => {
  let lib;
  const load = async () => {
    if (!lib) {
      try {
        lib = (await import('bcryptjs')).default;
      } catch {
        throw new Error('The "bcryptjs" package is not installed. Run: npm install');
      }
    }
    return lib;
  };
  let dummy; // hash of a random string: compared against when the user does not exist, so timing does not reveal valid usernames
  return {
    hash: async (plain) => (await load()).hash(plain, rounds),
    verify: async (plain, hash) => {
      const b = await load();
      return b.compare(plain, hash);
    },
    verifyDummy: async (plain) => {
      const b = await load();
      dummy ||= await b.hash(crypto.randomBytes(16).toString('hex'), rounds);
      await b.compare(plain, dummy);
      return false;
    },
  };
};
