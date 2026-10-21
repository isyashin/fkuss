import {test} from "@playwright/test";
import {Client} from "pg";
/** Эти спеки проверяют включённую программу; обычный сайт остаётся opt-in. */
export function enabledLoyaltyFixture(){
 let original:unknown;
 async function patch(value:unknown){const db=new Client({connectionString:process.env.DATABASE_URL});await db.connect();try{await db.query(`UPDATE "Settings" SET value=jsonb_set(jsonb_set(value,'{loyalty}',$1::jsonb),'{_rev}',to_jsonb(COALESCE((value->>'_rev')::bigint,0)+1)) WHERE key='settings'`,[JSON.stringify(value)]);}finally{await db.end();}}
 test.beforeEach(async()=>{const db=new Client({connectionString:process.env.DATABASE_URL});await db.connect();try{original=(await db.query(`SELECT value->'loyalty' AS loyalty FROM "Settings" WHERE key='settings'`)).rows[0].loyalty;}finally{await db.end();}await patch({...original as object,enabled:true});});
 test.afterEach(async()=>{if(original!==undefined)await patch(original);original=undefined;});
}
