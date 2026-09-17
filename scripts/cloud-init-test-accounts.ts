import { initializeTestAccounts, type TestUsername } from "../src/features/cloud-backup/server/password";

const help = `Initialize the two Life test accounts without contacting a database or provider.

Usage:
  npx tsx scripts/cloud-init-test-accounts.ts
  npx tsx scripts/cloud-init-test-accounts.ts --stdin

Default input: server process environment CLOUD_TEST_KELE_PASSWORD and CLOUD_TEST_WZJ_PASSWORD.
--stdin input: one JSON object with string fields "kele" and "wzj", from a redirected file or pipe.
Terminal stdin is refused so passwords cannot be echoed. Never pass passwords in command arguments.
No .env file is automatically read. Passwords must be nonempty and at most 1024 UTF-8 bytes.

Stdout: .env initialization lines containing CLOUD_AUTH_MODE=test-password and freshly salted
CLOUD_TEST_KELE_PASSWORD_HASH / CLOUD_TEST_WZJ_PASSWORD_HASH. Protect the output as a server secret;
never prefix these variables with NEXT_PUBLIC_. No plaintext password is emitted.
Remove plaintext input variables/files after use. Restart the server after installing/rotating hashes.
First successful login initializes each stable account in CloudStore; rotation does not change its ID.
Existing sessions retain their 30-day lifetime unless logged out/revoked. This mode is only for testing.
`;

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") { process.stdout.write(help); return; }
  if (args.length > 1 || (args.length === 1 && args[0] !== "--stdin")) throw new Error("invalid_arguments");
  let passwords: Record<TestUsername, string>;
  if (args[0] === "--stdin") {
    if (process.stdin.isTTY) throw new Error("terminal_stdin_refused");
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of process.stdin) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      if (size > 16 * 1024) throw new Error("input_limit");
      chunks.push(bytes);
    }
    const input: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("invalid_input");
    const fields = input as Record<string, unknown>;
    if (Object.keys(fields).some((key) => key !== "kele" && key !== "wzj") || typeof fields.kele !== "string" || typeof fields.wzj !== "string") throw new Error("invalid_input");
    passwords = { kele: fields.kele, wzj: fields.wzj };
  } else {
    passwords = { kele: process.env.CLOUD_TEST_KELE_PASSWORD ?? "", wzj: process.env.CLOUD_TEST_WZJ_PASSWORD ?? "" };
    delete process.env.CLOUD_TEST_KELE_PASSWORD;
    delete process.env.CLOUD_TEST_WZJ_PASSWORD;
  }
  process.stdout.write(await initializeTestAccounts(passwords));
}

void main().catch(() => {
  process.exitCode = 1;
  process.stderr.write("Test account initialization failed. Use --help for the environment/stdin contract. Input and credentials are never printed.\n");
});
