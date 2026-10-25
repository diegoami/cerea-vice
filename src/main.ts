import "./ui/style.css";
import { district } from "./world/district";
import { Game } from "./game/Game";
import { loadSelectedDistrict } from "./world/load";

const app = document.querySelector<HTMLElement>("#app")!;
async function start() {
  try {
    app.innerHTML='<div class="fatal"><h1>Opening the district…</h1></div>';
    await loadSelectedDistrict();
    document.title = `Cerea Vice · ${district.name}`;
    app.replaceChildren();
    new Game(app);
  } catch (error) {
    console.error(error);
    app.innerHTML='<div class="fatal"><h1>Unable to start the drive</h1><p>Check that the district files are available and WebGL 2 hardware acceleration is enabled, then reload.</p></div>';
  }
}
void start();
