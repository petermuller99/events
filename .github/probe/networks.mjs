// Read-only checks of public network endpoints, run from the probe workflow. Prints what
// each service answers so the wallet's settings can be confirmed before they're used.
const gql = async (url, query, variables) => {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query, variables }) });
    return await res.json();
  } catch (e) {
    return { error: e.message };
  }
};
const MAIN = 'https://graphql.mainnet.sui.io/graphql';
const typeQ = `query($n: String!) { __type(name: $n) { name kind
  fields { name type { name kind ofType { name kind } } }
  inputFields { name type { name kind ofType { name } } }
  enumValues { name } possibleTypes { name } } }`;
for (const n of ['MoveType', 'MoveValue', 'Owner', 'AddressOwner', 'TransactionKindInput', 'MoveObjectConnection', 'GasEffects', 'ExecutionError']) {
  const t = (await gql(MAIN, typeQ, { n }))?.data?.__type;
  const ty = (x) => (x ? (x.name ?? `${x.kind}(${ty(x.ofType)})`) : '');
  console.log('== type', n, t ? [...(t.fields ?? []).map((f) => `${f.name}: ${ty(f.type)}`), ...(t.inputFields ?? []).map((f) => `${f.name}: ${ty(f.type)}`), ...(t.enumValues ?? []).map((e) => e.name), ...(t.possibleTypes ?? []).map((p) => `|${p.name}`)].join('; ') : 'missing');
}
const recent = await gql(MAIN, '{ transactions(last: 30) { nodes { digest sender { address } } } }');
const sender = recent?.data?.transactions?.nodes?.map((n) => n.sender?.address).find(Boolean);
console.log('== sender', sender);
if (sender) {
  for (const q of [
    `{ address(address: "${sender}") { balance(coinType: "0x2::sui::SUI") { coinType { repr } totalBalance coinBalance addressBalance } } }`,
    `{ address(address: "${sender}") { objects(first: 3, filter: { type: "0x2::coin::Coin<0x2::sui::SUI>" }) { pageInfo { hasNextPage } nodes { address version digest contents { json type { repr } } } } } }`,
    `{ address(address: "${sender}") { transactions(last: 2, relation: AFFECTED) { nodes { digest sender { address } effects { status timestamp balanceChanges { nodes { owner { address } amount coinType { repr } } } gasEffects { gasSummary { computationCost storageCost storageRebate nonRefundableStorageFee } } } } } } }`,
  ]) {
    console.log('== read', q.slice(0, 100), '\n  ', JSON.stringify(await gql(MAIN, q)).slice(0, 1200));
  }
}
console.log('== missing tx', JSON.stringify(await gql(MAIN, '{ transactionEffects(digest: "11111111111111111111111111111111") { status } }')));
console.log('== bad execute', JSON.stringify(await gql(MAIN, 'mutation { executeTransaction(transactionDataBcs: "AAAA", signatures: ["AAAA"]) { effects { digest status } } }')).slice(0, 500));
