/** Shared scenery, light and haze colours for Cerea and its streamed outskirts.
 * Since 0.10 the greys lean neutral-to-warm (red at least equal to green): warm
 * daylight multiplied by grey-green surfaces is what read as an olive town.
 * See docs/COLOUR_AND_RESOLUTION.md. Sign and plate colours stay in their builders. */
export const ground={town:0x878479,meadow:0x7f875c,stubble:0xa69a64,crop:0x6f8650};
/** Squares (paved open ground) are pale stone, lighter than the asphalt. */
export const paving={road:0x52535a,square:0x9a8e84,verge:0xb7aea0,dash:0xe3dbc1,bay:0x77767a,bayLine:0xf0d7a0,bridgeRail:0x6c6a66};
export const features={water:0x668e94,bank:0xaea996,ballast:0x8a8378,rail:0xaaa9a8};
/** Four neighbourhood façades: ochre, cream, terracotta and grey stucco. */
export const facades=[0xd2a878,0xdcc8a6,0xca9680,0xc4beb2];
/** Shutters per façade: green persiane, walnut, slate blue, oxblood. */
export const shutters=['#556a4a','#6f513f','#4e5f6c','#7a4b3e'];
export const facadeTrim={plinth:'#a08b72',frame:'#e8dac1',glass:'#2f3d47',slat:'#2b2a28',mullion:'#c7b99b',doorGlass:'#7d8d96',simpleWindow:0x4c5a62};
export const props={trunk:0x685744,crown:0x5b7444,post:0x4a5054,lampHead:0xd3c8a5,carBody:0x8d6953,carGlass:0x6f828f,tyre:0x293537,platePole:0x6b6d6e};
export const light={sun:0xffe6c0,sky:0xfff0dc,bounce:0x6f665a};
/** Haze from early/late light to midday; the fog uses the same colour as the horizon. */
export const haze={low:0xc9b29c,high:0xaeb8c0,initial:0xb3b6b4};
export const skyGradient={zenith:'#557e9b',glow:'#e5c69d',below:'#8f8676'};
export const cockpit={vinyl:0x26272a,trim:0x55575a,cloth:0x655d57,rubber:0x141516,chrome:0xb0afae};
