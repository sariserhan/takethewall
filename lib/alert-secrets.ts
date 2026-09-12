import {claimSecret} from "./claim-secrets";
export const alertConfirmation=(seed:string)=>claimSecret("milestone-confirm:"+seed);
export const alertUnsubscribe=(seed:string)=>claimSecret("milestone-unsubscribe:"+seed);
