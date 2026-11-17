// Read-only checks of public network endpoints, run by hand from the probe workflow.
// Prints what each service answers so the wallet's settings can be confirmed.
const post = async (url, body) => {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const text = await res.text();
    return `${res.status} ${text.slice(0, 400)}`;
  } catch (e) {
    return `ERR ${e.message}`;
  }
};
const get = async (url) => {
  try {
    const res = await fetch(url);
    const text = await res.text();
    return `${res.status} ${text.slice(0, 300)}`;
  } catch (e) {
    return `ERR ${e.message}`;
  }
};
const rpc = (method, params = []) => ({ jsonrpc: '2.0', id: 1, method, params });
const SUI_ADDR = '0x0000000000000000000000000000000000000000000000000000000000000005';

for (const [name, url] of [
  ['sui mainnet json-rpc', 'https://fullnode.mainnet.sui.io:443'],
  ['sui testnet json-rpc', 'https://fullnode.testnet.sui.io:443'],
]) {
  console.log(`== ${name}`);
  console.log(' chainId', await post(url, rpc('sui_getChainIdentifier')));
  console.log(' gasPrice', await post(url, rpc('suix_getReferenceGasPrice')));
  console.log(' balance', await post(url, rpc('suix_getBalance', [SUI_ADDR, '0x2::sui::SUI'])));
  console.log(' coins', await post(url, rpc('suix_getCoins', [SUI_ADDR, '0x2::sui::SUI', null, 2])));
  console.log(' txs', await post(url, rpc('suix_queryTransactionBlocks', [{ filter: { ToAddress: SUI_ADDR } }, null, 1, true])));
}
for (const [name, url] of [
  ['sui mainnet graphql', 'https://graphql.mainnet.sui.io/graphql'],
  ['sui testnet graphql', 'https://graphql.testnet.sui.io/graphql'],
]) {
  console.log(`== ${name}`);
  console.log(' ', await post(url, { query: '{ chainIdentifier epoch { epochId referenceGasPrice } }' }));
}
for (const [name, url] of [
  ['cronos mainnet', 'https://evm.cronos.org'],
  ['cronos testnet', 'https://evm-t3.cronos.org'],
]) {
  console.log(`== ${name}`);
  console.log(' chainId', await post(url, rpc('eth_chainId')));
  console.log(' block', await post(url, rpc('eth_getBlockByNumber', ['latest', false])).then((s) => s.slice(0, 200)));
  console.log(' gasPrice', await post(url, rpc('eth_gasPrice')));
  console.log(' priority', await post(url, rpc('eth_maxPriorityFeePerGas')));
  console.log(' multicall3', await post(url, rpc('eth_getCode', ['0xcA11bde05977b3631167028862bE2a173976CA11', 'latest'])).then((s) => s.slice(0, 80)));
}
console.log('== coingecko');
console.log(' prices', await get('https://api.coingecko.com/api/v3/simple/price?ids=sui,crypto-com-chain&vs_currencies=usd'));
const list = await fetch('https://api.coingecko.com/api/v3/coins/list?include_platform=true').then((r) => r.json()).catch(() => []);
const count = (p) => list.filter((c) => c.platforms && c.platforms[p]).length;
console.log(' platforms cronos', count('cronos'), 'sui', count('sui'));
console.log('== explorers/faucets');
for (const u of [
  'https://explorer.cronos.org/',
  'https://explorer.cronos.org/testnet/',
  'https://cronos.org/faucet',
  'https://suiscan.xyz/mainnet/home',
  'https://faucet.sui.io/',
]) console.log(' ', u, (await get(u)).slice(0, 4));
