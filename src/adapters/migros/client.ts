import axios from 'axios';
import { Agent } from 'node:https';
import { assertRetailerDestination } from '../../util/outbound.js';
const base='https://www.migros.ch';
const client=axios.create({httpsAgent:new Agent({minVersion:'TLSv1.3'}),timeout:15_000,maxRedirects:0,maxContentLength:16_000_000,maxBodyLength:65_536,proxy:false});
/** Minimal anonymous facade; no account login, files, telemetry, or wrapper dependency. */
export class MigrosAPI {
  private token:string|undefined;
  private async request(path:string, body?:unknown) {
    const method=body===undefined?'GET':'POST';
    const url=assertRetailerDestination(base+path,method);
    const headers:Record<string,string>={accept:'application/json','User-Agent':'Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0'};
    if(this.token)headers.leshopch=this.token;
    if(body!==undefined)headers['Content-Type']='application/json';
    try {return await client.request({url:url.href,method,headers,data:body});}
    catch(e) {throw new Error(axios.isAxiosError(e)&&e.response?`HTTP ${e.response.status}`:'Migros public API unavailable');}
  }
  account={oauth2:{loginGuestToken:async()=>{
    this.token=undefined;
    const r=await this.request('/authentication/public/v1/api/guest?authorizationNotRequired=true');
    if(typeof r.headers.leshopch!=='string')throw new Error('Anonymous guest token unavailable');
    this.token=r.headers.leshopch;return {token:this.token};
  }}};
  products={
    productSearch:{searchProduct:async (body:Record<string,unknown>)=> (await this.request('/onesearch-oc-seaapi/public/v5/search',{regionId:'national',language:'de',productIds:[],sortFields:[],sortOrder:'asc',algorithm:'DEFAULT',...body})).data},
    productDisplay:{
      getProductDetails:async (opts:Record<string,unknown>)=>{
        const params=new URLSearchParams({warehouseId:'1',storeType:'OFFLINE',region:'national'});
        for(const [k,v] of Object.entries(opts))if(v!==undefined)params.set(k,Array.isArray(v)?v.join(','):String(v));
        return (await this.request('/product-display/public/v2/product-detail?'+params)).data;
      },
      getProductPromotionSearch:async(body:Record<string,unknown>)=>(await this.request('/product-display/public/web/v2/products/promotion/search',{storeType:'OFFLINE',period:'CURRENT',language:'de',filters:{},sortFields:['categoryLevel'],sortOrder:'asc',from:0,until:100,region:'national',warehouse:'1',...body})).data,
    },
    productStock:{getProductSupply:async (opts:{pids:string;costCenterIds:string})=>{
      if(!/^\d+$/.test(opts.pids)||!/^\d+(,\d+)*$/.test(opts.costCenterIds))throw new Error('Invalid stock identifiers');
      return (await this.request(`/store-availability/public/v2/availabilities/products/${opts.pids}?${new URLSearchParams({costCenterIds:opts.costCenterIds})}`)).data;
    }},
  };
  stores={searchStores:async(opts:{query:string})=>(await this.request('/store/public/v1/stores/search?'+new URLSearchParams({query:opts.query}))).data};
}
