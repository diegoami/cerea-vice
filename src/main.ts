import "./ui/style.css";
import { Game } from "./game/Game";

const app = document.querySelector<HTMLElement>("#app")!;
try {
  new Game(app);
} catch (error) {
  console.error(error);
  app.innerHTML =
    '<div class="fatal"><h1>Unable to start the drive</h1><p>This prototype needs a browser with WebGL 2 enabled. Enable hardware acceleration and reload.</p></div>';
}
