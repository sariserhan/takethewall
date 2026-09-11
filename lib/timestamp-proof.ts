/** OpenTimestamps detached proof v1: magic, version, SHA-256 op, digest, calendar tree.
 * Protocol reference: opentimestamps/javascript-opentimestamps detached-timestamp-file.js.
 * A calendar receipt is NOT independently verified Bitcoin confirmation.
 */
export function detachedProof(hash: string, tree: Uint8Array) {
  if (!/^[a-f0-9]{64}$/.test(hash) || tree.length < 1 || tree.length > 10000)
    throw new Error("Invalid timestamp receipt");
  const magic = Uint8Array.from([
    0, 79, 112, 101, 110, 84, 105, 109, 101, 115, 116, 97, 109, 112, 115, 0, 0,
    80, 114, 111, 111, 102, 0, 191, 137, 226, 232, 132, 232, 146, 148, 1, 8,
  ]);
  const digest = Uint8Array.from(
    hash.match(/../g)!.map((s) => parseInt(s, 16)),
  );
  const output = new Uint8Array(magic.length + 32 + tree.length);
  output.set(magic);
  output.set(digest, magic.length);
  output.set(tree, magic.length + 32);
  return output;
}
