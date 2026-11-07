import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createServer} from '../src/index.js';
import {AdapterRegistry} from '../src/adapters/registry.js';
import {CHAINS,resolveChains,locationSchema} from '../src/selection.js';
import {assertRetailerDestination,withRetailerScope} from '../src/util/outbound.js';
import {httpJson,_resetHttpState} from '../src/util/http.js';
import {geocode} from '../src/services/geocoding.js';
import type {Chain,StoreAdapter} from '../src/adapters/types.js';
const urls:Record<Chain,string>={migros:'https://www.migros.ch/store/public/v1/stores/search',coop:'https://www.coop.ch/rest/v2/coopathome/products/milk',aldi:'https://api.aldi-suisse.ch/v3/product-search',denner:'https://app-api.denner.ch/api/m/content/v2',lidl:'https://www.lidl.ch/q/api/search',volgshop:'https://www.volgshop.ch/wp-json/wc/store/v1/products',ottos:'https://api.ottos.ch/occ/v2/ottos/products/search',coopcity:'https://www.coop-city.ch/rest/v2/city/products/search'};
let client:Client;let server:Awaited<ReturnType<typeof createServer>>;
beforeEach(()=>{_resetHttpState();vi.stubGlobal('fetch',vi.fn(async()=>new Response('{}',{headers:{'Content-Type':'application/json'}})));});
afterEach(async()=>{await client?.close();await server?.close();vi.unstubAllGlobals();});
async function connect(malicious=false){
  const registry=new AdapterRegistry();
  for(const chain of CHAINS)registry.register({chain,capabilities:{productSearch:true,productDetail:true,storeSearch:true,promotions:true,perStoreStock:false,perStorePricing:false},
    searchProducts:async()=>{await httpJson(malicious&&chain==='coop'?urls.denner:urls[chain]);return {ok:true,data:[]};},
    getProduct:async()=>({ok:true,data:null}),searchStores:async()=>({ok:true,data:[]}),getPromotions:async()=>({ok:true,data:[]}),
  } as StoreAdapter);
  server=await createServer(registry);client=new Client({name:'privacy-test',version:'1.0.0'});
  const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(a);await client.connect(b);
}
async function invalid(name:string,args:Record<string,unknown>){try{const r=await client.callTool({name,arguments:args});expect(r.isError).toBe(true);}catch(e){expect(String(e)).toMatch(/error|invalid|selection/i);}}
describe('MCP privacy boundary',()=>{
  it('provides privacy and selection instructions directly during MCP initialization',async()=>{await connect();expect(client.getInstructions()).toMatch(/explicitly selected/);expect(client.getInstructions()).toMatch(/never include chat history/);});
  it('requires explicit selection before any network request for every multi-retailer tool',async()=>{
    await connect();
    for(const [name,args] of Object.entries({search_products:{query:'milk'},get_promotions:{},find_stores:{near:{zip:'8001'}},health_check:{},plan_shopping:{items:[{query:'milk'}],near:{zip:'8001'},strategy:'single_store'}}))await invalid(name,args);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('supports exactly one, several, or all retailers, without default fan-out',async()=>{
    await connect();
    for(const chains of [['coop'],['coop','aldi'],'all'] as const){
      vi.mocked(fetch).mockClear();
      const r=await client.callTool({name:'search_products',arguments:{query:'milk',chains}});
      expect(r.isError).not.toBe(true);
      const d=JSON.parse((r.content as any)[0].text);
      expect(Object.keys(d.byChain).sort()).toEqual(resolveChains(chains as any).sort());
      const hosts=vi.mocked(fetch).mock.calls.map(c=>new URL(String(c[0])).host).sort();
      expect(hosts).toEqual(resolveChains(chains as any).map(c=>new URL(urls[c]).host).sort());
    }
  });
  it('rejects missing, empty, unknown and mixed all/list choices',async()=>{
    await connect();
    for(const chains of [[],['unknown'],['all','coop'],null])await invalid('search_products',{query:'milk',chains});
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects address inputs, including mixed ZIP/address, before network access',async()=>{
    await connect();
    for(const near of [{address:'Synthetic Street 1'},{zip:'8001',address:'Synthetic Street 1'}])await invalid('find_stores',{near,chains:['coop']});
    expect(locationSchema.safeParse({address:'Synthetic Street 1'}).success).toBe(false);
    expect((await geocode({address:'Synthetic Street 1'})).ok).toBe(false);
    expect((await geocode({zip:'8001'})).ok).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('blocks a misrouted adapter from contacting an unselected retailer',async()=>{
    await connect(true);await invalid('search_products',{query:'milk',chains:['coop']});expect(fetch).not.toHaveBeenCalled();
  });
  it('checks retailer scope before using the shared cache',async()=>{
    await withRetailerScope(['denner'],()=>httpJson(urls.denner,{cacheKey:'public-cache'}));
    vi.mocked(fetch).mockClear();
    await expect(withRetailerScope(['coop'],()=>httpJson(urls.denner,{cacheKey:'public-cache'}))).rejects.toThrow(/selection/);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('blocks geocoders, arbitrary hosts, local services, insecure URLs and auth paths',()=>{
    for(const url of ['https://nominatim.openstreetmap.org/search?q=x','https://example.com/collect','https://127.0.0.1/','https://169.254.169.254/latest/meta-data/','http://www.coop.ch/rest/v2/coopathome/products/x','https://user:pass@www.coop.ch/rest/v2/coopathome/products/x','https://www.migros.ch/authentication/private/login'])expect(()=>assertRetailerDestination(url)).toThrow();
  });
  it('disables redirects and browser credentials on all fetch requests',async()=>{
    await withRetailerScope(['coop'],()=>httpJson(urls.coop));
    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({redirect:'error',credentials:'omit'});
  });
});
