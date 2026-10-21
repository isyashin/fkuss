import {describe,it,expect} from "vitest";
import {settingsSchema} from "@/lib/content-schema";
import source from "../content/settings.json";
describe("loyalty master switch defaults",()=>{
 it.each([undefined,{cashbackPercent:5,maxSpendPercent:20},{}])("без явного включения программа выключена",loyalty=>{
  expect(settingsSchema.parse({...source,loyalty}).loyalty.enabled).toBe(false);
 });
 it("сохраняет явный opt-in владельца",()=>{expect(settingsSchema.parse({...source,loyalty:{enabled:true,cashbackPercent:7,maxSpendPercent:25}}).loyalty).toEqual({enabled:true,cashbackPercent:7,maxSpendPercent:25});});
 it("не превращает строковое false во включённую программу",()=>{expect(settingsSchema.safeParse({...source,loyalty:{enabled:"false"}}).success).toBe(false);});
});
