'use strict';
class BillingRouter { constructor(){this.adapters=new Map();} register(name,adapter){if(!/^[a-z0-9_-]{2,40}$/.test(name)||!adapter||typeof adapter.reconcile!=='function')throw new Error('BILLING_ADAPTER_INVALID');this.adapters.set(name,adapter);return name;} providers(){return [...this.adapters.keys()];} async reconcile(name,ctx,payload){const a=this.adapters.get(name);if(!a)throw new Error('BILLING_PROVIDER_UNAVAILABLE');return a.reconcile(ctx,payload);} }
module.exports={BillingRouter};
