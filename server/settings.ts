// Every setting the server and the standalone worker read from their environment, in one list: what
// each one takes, and when it must be given. checkSettings runs before either starts, so a missing
// or malformed setting stops the start with a message naming it, never a failure at the first
// request that needs it. The check only gates the start: each setting is still read where it is used.

type Env = Record<string, string | undefined>;

/** Which process is starting: the server (pnpm start, pnpm dev) or a worker (pnpm worker) */
export type Starting = 'server' | 'worker';

interface Setting {
  /** What it takes, for the message that names it */
  takes: string;
  /** Whether a value it was given is one it takes */
  valid: (value: string) => boolean;
  /** Why it must be given, with the rest of the environment as it is, or null when it needn't be */
  needed?: (env: Env, starting: Starting) => string | null;
}

const anything = () => true;
const oneOf =
  (...values: string[]) =>
  (value: string) =>
    values.includes(value);

/** An address with one of the protocols, such as `https:` */
function address(value: string, ...protocols: string[]) {
  try {
    return protocols.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

/** Set, as the server reads them: an empty value is no value */
function given(env: Env, name: string) {
  return Boolean(env[name]);
}

export const SETTINGS: Record<string, Setting> = {
  // The server
  PORT: {
    takes: "a port number from 0 to 65535, or a pipe's path",
    valid: (value) => (/^\d+$/.test(value) ? Number(value) <= 65535 : /[\\/]/.test(value)),
  },
  RECOIL_VITE_DEV: { takes: '1 (Vite serves the sources, as pnpm dev does) or 0', valid: oneOf('1', '0') },
  RECOIL_DB_PATH: { takes: "the spec database's path", valid: anything },
  RECOIL_SPECS_PATH: { takes: "client/specs.json's path", valid: anything },
  RECOIL_UPLOAD_TMP_DIR: { takes: 'the folder uploads are staged in', valid: anything },
  RECOIL_UPLOAD_SECRET: { takes: 'the secret that signs upload grants', valid: anything },
  PYTHON: { takes: 'the command that runs Python for the analyses', valid: anything },

  // The job queue
  REDIS_URL: {
    takes: 'a redis:// or rediss:// address',
    valid: (value) => address(value, 'redis:', 'rediss:'),
    needed: (_env, starting) =>
      starting === 'worker' ? 'the standalone worker only works with the Redis/BullMQ queue' : null,
  },
  RECOIL_QUEUE_PREFIX: { takes: "the prefix of the queue's Redis keys", valid: anything },
  RECOIL_EMBEDDED_WORKER: { takes: 'true or false', valid: oneOf('true', 'false') },
  RECOIL_WORKER_CONCURRENCY: {
    takes: 'a whole number of jobs, 1 or more',
    valid: (value) => /^[1-9]\d*$/.test(value),
  },

  // Capture storage
  STORAGE_PROVIDER: { takes: 'local or s3', valid: oneOf('local', 's3') },
  RECOIL_CAPTURES_DIR: { takes: 'the folder local captures are kept in', valid: anything },
  STORAGE_PUBLIC_URL: {
    takes: 'a path from the site, such as /captures, or an http(s) address',
    valid: (value) => value.startsWith('/') || address(value, 'http:', 'https:'),
  },
  S3_BUCKET: {
    takes: "the bucket's name",
    valid: anything,
    needed: (env) => (env.STORAGE_PROVIDER === 's3' ? 'STORAGE_PROVIDER=s3 keeps the captures in it' : null),
  },
  S3_ENDPOINT: { takes: 'an http(s) address', valid: (value) => address(value, 'http:', 'https:') },
  S3_REGION: { takes: 'a region, such as us-east-1', valid: anything },
  S3_FORCE_PATH_STYLE: { takes: 'true or false', valid: oneOf('true', 'false') },
  // Both keys, or neither (the AWS SDK's credential chain then): one alone would be dropped
  S3_ACCESS_KEY_ID: {
    takes: 'an access key id',
    valid: anything,
    needed: (env) =>
      given(env, 'S3_SECRET_ACCESS_KEY') ? 'S3_SECRET_ACCESS_KEY needs it (the two keys go together)' : null,
  },
  S3_SECRET_ACCESS_KEY: {
    takes: 'a secret access key',
    valid: anything,
    needed: (env) => (given(env, 'S3_ACCESS_KEY_ID') ? 'S3_ACCESS_KEY_ID needs it (the two keys go together)' : null),
  },
  S3_AUTO_CREATE_BUCKET: { takes: 'true or false', valid: oneOf('true', 'false') },
  S3_CORS_ORIGINS: {
    takes: '* or http(s) origins, separated by commas',
    valid: (value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .every((origin) => origin === '*' || address(origin, 'http:', 'https:')),
  },
};

/**
 * What is wrong with the settings for a start, a line each: none when it can go ahead. A value is
 * never repeated back: an address can hold a password, and the message goes to the log.
 */
export function settingProblems(env: Env, starting: Starting): string[] {
  const problems: string[] = [];
  for (const [name, setting] of Object.entries(SETTINGS)) {
    const value = env[name];
    if (value) {
      if (!setting.valid(value)) problems.push(`${name} is set to a value it doesn't take: it takes ${setting.takes}.`);
      continue;
    }
    const why = setting.needed?.(env, starting);
    if (why) problems.push(`${name} is not set, and ${why}: it takes ${setting.takes}.`);
  }
  return problems;
}

/** Stop the start when a setting is missing or malformed, naming each one */
export function checkSettings(starting: Starting, env: Env = process.env) {
  const problems = settingProblems(env, starting);
  if (!problems.length) return;
  console.error(
    [
      `The ${starting} cannot start: ${problems.length === 1 ? 'one setting needs' : `${problems.length} settings need`} fixing.`,
      ...problems.map((problem) => `  ${problem}`),
      'Set them in the environment or in .env (.env.example says what each one does).',
    ].join('\n'),
  );
  process.exit(1);
}
