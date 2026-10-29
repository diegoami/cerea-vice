import "./ui/style.css";
import { version } from "../package.json";
import { createGame } from "./game/Game";
import { DistrictLoadError, loadSelectedDistrict, selectDistrict } from "./world/load";

const app = document.querySelector<HTMLElement>("#app")!;
async function start() {
  try {
    app.innerHTML='<div class="fatal"><h1>Opening the district…</h1></div>';
    const {context,towns}=await loadSelectedDistrict();
    if(new URLSearchParams(window.location.search).has("tile-lab")){
      app.replaceChildren();const {runTileLab}=await import("./diagnostics/TileLab");runTileLab(app,context);return;
    }
    const {Game}=createGame(context,towns);
    document.title = `Cerea Vice ${version} · ${context.district.name}`;
    app.replaceChildren();
    new Game(app);
  } catch (error) {
    console.error(error);
    if(error instanceof DistrictLoadError){
      // A broken entry must not lock the player out: offer the other listed districts.
      const others=error.registry.towns.filter((town)=>town.id!==error.town.id);
      app.innerHTML=`<div class="fatal"><h1>Unable to open ${error.town.name}</h1><p>Its map file (maps/${error.town.map}) is missing or damaged. Saves are kept. Choose another district:</p><div class="district-switch">${others.map((town)=>`<button type="button" data-district="${town.id}">${town.name}</button>`).join("")}</div></div>`;
      app.querySelectorAll<HTMLButtonElement>("[data-district]").forEach((button)=>button.addEventListener("click",()=>selectDistrict(others,button.dataset.district!)));
      app.querySelector<HTMLButtonElement>("[data-district]")?.focus();
      return;
    }
    const listProblem=error instanceof Error&&error.message.startsWith("District list:");
    app.innerHTML=`<div class="fatal"><h1>Unable to start the drive</h1><p>${listProblem?`${(error as Error).message}. Reinstall or rebuild the game files.`:"Check that the district files are available and WebGL 2 hardware acceleration is enabled, then restart the application."}</p></div>`;
  }
}
void start();
