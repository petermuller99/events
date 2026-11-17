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
const TEST = 'https://graphql.testnet.sui.io/graphql';

const typeQ = `query($n: String!) { __type(name: $n) { name kind
  fields { name args { name type { name kind ofType { name kind ofType { name kind ofType { name } } } } } type { name kind ofType { name kind ofType { name kind ofType { name } } } } }
  inputFields { name type { name kind ofType { name kind ofType { name } } } }
  enumValues { name } } }`;
const show = (t) => {
  if (!t) return 'missing';
  const ty = (x) => (x ? (x.name ?? `${x.kind}(${ty(x.ofType)})`) : '');
  const parts = [];
  for (const f of t.fields ?? []) parts.push(`${f.name}(${f.args.map((a) => `${a.name}:${ty(a.type)}`).join(',')}): ${ty(f.type)}`);
  for (const f of t.inputFields ?? []) parts.push(`${f.name}: ${ty(f.type)}`);
  for (const e of t.enumValues ?? []) parts.push(e.name);
  return `${t.name} [${t.kind}]\n    ` + parts.join('\n    ');
};
for (const n of [
  'Query', 'Mutation', 'Address', 'Balance', 'Coin', 'MoveObject', 'Object', 'ObjectFilter',
  'Transaction', 'TransactionEffects', 'ExecutionResult', 'TransactionFilter', 'ExecutionStatus',
  'BalanceChange', 'GasInput', 'Epoch', 'SimulationResult', 'AddressTransactionRelationship', 'TransactionKind',
]) {
  const r = await gql(MAIN, typeQ, { n });
  console.log('== type', show(r?.data?.__type), r.errors ? JSON.stringify(r.errors).slice(0, 200) : '');
}

// A recent real transaction and its sender, to try reads against.
const recent = await gql(MAIN, '{ transactions(last: 1) { nodes { digest sender { address } } } }');
console.log('== recent', JSON.stringify(recent).slice(0, 400));
const sender = recent?.data?.transactions?.nodes?.[0]?.sender?.address;
if (sender) {
  for (const q of [
    `{ address(address: "${sender}") { balance(coinType: "0x2::sui::SUI") { coinType { repr } totalBalance } } }`,
    `{ address(address: "${sender}") { balance(coinType: "0x2::sui::SUI") { totalBalance } } }`,
    `{ address(address: "${sender}") { objects(first: 3, filter: { type: "0x2::coin::Coin<0x2::sui::SUI>" }) { nodes { address version digest contents { json } } } } }`,
    `{ address(address: "${sender}") { coins(first: 3) { nodes { address version digest coinBalance } } } }`,
    `{ address(address: "${sender}") { transactions(last: 2) { nodes { digest effects { status timestamp balanceChanges { nodes { owner { address } amount coinType { repr } } } } } } } }`,
  ]) {
    console.log('== read', q.slice(0, 90), '\n  ', JSON.stringify(await gql(MAIN, q)).slice(0, 700));
  }
}
const digest = recent?.data?.transactions?.nodes?.[0]?.digest;
if (digest) {
  console.log('== tx', JSON.stringify(await gql(MAIN, `{ transaction(digest: "${digest}") { digest effects { status } } }`)).slice(0, 300));
}
console.log('== testnet', JSON.stringify(await gql(TEST, '{ chainIdentifier epoch { referenceGasPrice } }')));
