import path from "node:path";
import { buildSync } from "esbuild";
import { test, expect } from "@playwright/test";

// Mount the real React component. The SDK model reproduces Yandex's closed ring
// (four input vertices become five coordinates), without a key/network dependency.
const bundle = buildSync({
  absWorkingDir: process.cwd(), bundle: true, write: false, format: "iife",
  platform: "browser", jsx: "automatic", tsconfig: path.resolve("tsconfig.json"),
  define: { "process.env.NODE_ENV": '"production"' },
  stdin: { loader: "tsx", resolveDir: process.cwd(), sourcefile: "geo-map-harness.tsx", contents: `
    import { useState } from "react";
    import { createRoot } from "react-dom/client";
    import { ZoneMap } from "./src/app/admin/(protected)/delivery/zone-map";
    function Harness() {
      const [zones,setZones]=useState([{name:"Test",enabled:true,tariffs:[{from:0,price:0}],polygon:[[55.6,37.3],[55.9,37.3],[55.9,37.9],[55.6,37.9]]}]);
      const [selected,setSelected]=useState(0),[stop,setStop]=useState(0),[busy,setBusy]=useState(false);
      return <><ZoneMap ymapsKey="sdk-model" zones={zones} selectedIndex={selected}
        restaurantCenter={null} onZonesChange={setZones} onSelect={setSelected}
        drawToken={0} stopDrawToken={0} stopEditToken={stop}
        onBusyChange={state=>setBusy(state.editing||state.drawing)} />
        <output data-testid="mode">{busy?"editing":"idle"}</output>
        <output data-testid="vertices">{zones[0].polygon.length}</output>
        <button onClick={()=>setStop(n=>n+1)}>Finish geometry</button>
        <button disabled={busy}>Apply</button>
        <button onClick={()=>setSelected(null)}>Deselect</button>
        <button onClick={()=>setSelected(0)}>Select zone</button></>;
    }
    createRoot(document.getElementById("app")).render(<Harness/>);
  ` },
}).outputFiles[0].text;

const sdk = `
  window.__geoEditStarts=0;
  const bus=()=>({add(){},remove(){}});
  class MapModel { geoObjects={add(){},remove(){},getBounds(){return null;}};
    behaviors={enable(){},disable(){}};getCenter(){return [55.75,37.6];}
    setBounds(){} setCenter(){} destroy(){} }
  class PolygonModel {
    constructor(coords){
      const rings=JSON.parse(JSON.stringify(coords)),ring=rings[0];
      if(ring?.length && JSON.stringify(ring[0])!==JSON.stringify(ring[ring.length-1]))ring.push([...ring[0]]);
      this.geometry={getCoordinates:()=>rings,setCoordinates(){},events:bus()};
      this.events=bus();this.options={set(){}};this.properties={set(){}};
      this.editor={startEditing(){window.__geoEditStarts++;},stopEditing(){},startDrawing(){},stopDrawing(){},events:bus()};
    }
  }
  window.ymaps={Map:MapModel,Polygon:PolygonModel,Placemark:class{}};
  window.__ymapsOnload();
`;

test("finishing the map editor stays idle after the SDK closes its ring", async ({ page }) => {
  await page.route("https://api-maps.yandex.ru/**",route=>route.fulfill({contentType:"text/javascript",body:sdk}));
  await page.setContent('<div id="app"></div>');
  await page.addScriptTag({content:bundle});
  await expect(page.getByTestId("mode")).toHaveText("editing");
  await page.getByRole("button",{name:"Finish geometry",exact:true}).click();
  await expect(page.getByTestId("vertices")).toHaveText("5");
  // Covers a later React effect and the coordinate debounce, not just a transient idle frame.
  await page.waitForTimeout(850);
  await expect(page.getByTestId("mode")).toHaveText("idle");
  await expect(page.getByRole("button",{name:"Apply",exact:true})).toBeEnabled();
  expect(await page.evaluate(()=> (window as unknown as {__geoEditStarts:number}).__geoEditStarts)).toBe(1);
  await page.getByRole("button",{name:"Deselect",exact:true}).click();
  await page.getByRole("button",{name:"Select zone",exact:true}).click();
  await expect(page.getByTestId("mode")).toHaveText("editing");
});
