import { AsyncLocalStorage } from 'node:async_hooks';
import type { Chain } from '../adapters/types.js';

const scope = new AsyncLocalStorage<ReadonlySet<Chain>>();
const destinations: Record<string, {chain:Chain; path:RegExp; methods:readonly string[]}> = {
  'www.migros.ch': {chain:'migros',path:/^\/(authentication\/public\/v1\/api\/guest|onesearch-oc-seaapi\/public\/v5\/search|product-display\/public\/(v2\/product-detail|web\/v2\/products\/promotion\/search)|store\/public\/v1\/stores\/search|store-availability\/public\/v2\/availabilities\/products\/\d+)$/,methods:['GET','POST']},
  'www.coop.ch': {chain:'coop',path:/^\/rest\/v2\/coopathome\//,methods:['GET']},
  'www.coop-city.ch': {chain:'coopcity',path:/^\/rest\/v2\/city\//,methods:['GET']},
  'api.aldi-suisse.ch': {chain:'aldi',path:/^\/(v3\/product-search|v2\/(products\/[^/]+|service-points))$/,methods:['GET']},
  'app-api.denner.ch': {chain:'denner',path:/^\/api\/(auth\/m\/(signup|signin)|m\/(content\/v2|stores))$/,methods:['GET','POST']},
  'www.lidl.ch': {chain:'lidl',path:/^\/(q\/api\/search|p\/api\/gridboxes\/CH\/(de|fr|it))$/,methods:['GET']},
  'digital-leaflet.lidlplus.com': {chain:'lidl',path:/^\/api\/v1\/CH\/(campaignGroups|campaigns\/[^/]+|products\/[^/]+)$/,methods:['GET']},
  'stores.lidlplus.com': {chain:'lidl',path:/^\/api\/v2\/CH$/,methods:['GET']},
  'www.volgshop.ch': {chain:'volgshop',path:/^\/wp-json\/wc\/store\/v1\/products(?:\/[^/]+)?$/, methods:['GET']},
  'api.ottos.ch': {chain:'ottos',path:/^\/occ\/v2\/ottos\//,methods:['GET']},
};
export function withRetailerScope<T>(chains:readonly Chain[], fn:()=>T):T {
  return scope.run(new Set(chains),fn);
}
export function assertRetailerDestination(input:string,method='GET'):URL {
  const url = new URL(input);
  const rule = destinations[url.hostname];
  if(url.protocol!=='https:' || url.port || url.username || url.password || url.hash || !rule || !rule.path.test(url.pathname) || !rule.methods.includes(method.toUpperCase()))throw new Error('Outbound destination blocked');
  const selected=scope.getStore();
  if(selected && !selected.has(rule.chain))throw new Error('Retailer is outside the explicit selection');
  return url;
}
