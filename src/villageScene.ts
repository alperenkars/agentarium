import { drawCharacter } from "./characters";
export const WORLD_W = 960,
  WORLD_H = 600;
export const homes = [
  [155, 385],
  [310, 440],
  [455, 360],
  [562, 470],
  [727, 392],
  [826, 465],
  [230, 535],
  [666, 535],
];
export function residentPosition(index: number, time: number, moving: boolean) {
  const [x, y] = homes[index];
  return {
    x: x + (moving ? Math.round(Math.sin(time * 0.36 + index * 1.8) * 8) : 0),
    y: y + (moving ? Math.round(Math.sin(time * 0.27 + index) * 3) : 0),
  };
}
export function paintVillage(c: CanvasRenderingContext2D) {
  c.imageSmoothingEnabled = false;
  const r = (x: number, y: number, w: number, h: number, color: string) => {
    c.fillStyle = color;
    c.fillRect(x, y, w, h);
  };
  const p = (pts: number[][], color: string) => {
    c.fillStyle = color;
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    c.fill();
  };
  const rand = (n: number) => {
    const a = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return a - Math.floor(a);
  };
  // Layered coastal sky and distant mountains.
  r(0, 0, 960, 600, "#89bfd7");
  r(0, 65, 960, 70, "#a7cfdc");
  r(0, 135, 960, 100, "#bddcde");
  r(688, 62, 43, 43, "#f5dfac");
  r(681, 72, 57, 24, "#f5dfac");
  function cloud(x: number, y: number, s: number) {
    r(x, y, 62 * s, 7 * s, "#e1e7d8");
    r(x + 9 * s, y - 5 * s, 38 * s, 5 * s, "#e8ecdc");
    r(x + 19 * s, y - 11 * s, 20 * s, 6 * s, "#edf0df");
  }
  cloud(145, 73, 1.2);
  cloud(415, 43, 0.8);
  cloud(761, 136, 0.7);
  p(
    [
      [0, 177],
      [52, 119],
      [89, 144],
      [152, 84],
      [205, 143],
      [260, 108],
      [320, 179],
    ],
    "#8faeb1",
  );
  p(
    [
      [174, 192],
      [261, 128],
      [315, 145],
      [364, 99],
      [428, 147],
      [476, 125],
      [551, 188],
    ],
    "#a1bec0",
  );
  p(
    [
      [529, 193],
      [628, 124],
      [675, 161],
      [740, 108],
      [830, 183],
      [925, 121],
      [960, 149],
      [960, 242],
    ],
    "#91b1b3",
  );
  p(
    [
      [129, 113],
      [152, 84],
      [176, 112],
      [158, 106],
      [147, 114],
    ],
    "#d9dfd1",
  );
  r(0, 191, 960, 131, "#599eb3");
  r(0, 207, 960, 4, "#8cb8bf");
  r(0, 229, 960, 5, "#7dabba");
  for (let i = 0; i < 170; i++) {
    const x = Math.floor(rand(i) * 960),
      y = 197 + Math.floor(rand(i + 240) * 105);
    r(x, y, 3 + rand(i + 510) * 18, 1, i % 3 ? "#8cb7bd" : "#bdd4cd");
  }
  // Boats beyond the village.
  p(
    [
      [469, 225],
      [511, 225],
      [504, 232],
      [475, 232],
    ],
    "#86685a",
  );
  r(489, 183, 2, 43, "#735f53");
  p(
    [
      [488, 187],
      [471, 218],
      [488, 218],
    ],
    "#ede0ba",
  );
  p(
    [
      [493, 193],
      [508, 218],
      [493, 218],
    ],
    "#c58b74",
  );
  // Green shoreline and continuous village ground.
  p(
    [
      [0, 279],
      [131, 260],
      [278, 278],
      [391, 267],
      [566, 290],
      [719, 267],
      [960, 283],
      [960, 600],
      [0, 600],
    ],
    "#7c9563",
  );
  r(0, 312, 960, 288, "#849963");
  p(
    [
      [0, 381],
      [280, 318],
      [572, 324],
      [960, 367],
      [960, 553],
      [0, 527],
    ],
    "#b8aa88",
  );
  p(
    [
      [0, 402],
      [304, 345],
      [591, 346],
      [960, 391],
      [960, 529],
      [0, 510],
    ],
    "#c8ba98",
  );
  p(
    [
      [419, 320],
      [475, 320],
      [590, 600],
      [424, 600],
    ],
    "#c8ba98",
  );
  // Cobblestones are deliberately sparse and palette-bound.
  for (let i = 0; i < 690; i++) {
    const x = Math.floor(rand(i + 1400) * 960),
      y = 330 + Math.floor(rand(i + 2100) * 270);
    if ((y > 380 && y < 510) || (x > 430 && x < 560)) {
      const w = 7 + Math.floor(rand(i + 530) * 10);
      r(x, y, w, 2, i % 3 ? "#b6a989" : "#dacdad");
      if (i % 4 === 0) r(x, y - 3, w - 2, 2, "#cfc2a2");
    } else {
      r(x, y, 2, 3, i % 2 ? "#718957" : "#94a96e");
    }
  }
  function shrub(x: number, y: number, s = 1) {
    r(x - 18 * s, y - 8 * s, 36 * s, 17 * s, "#496a4a");
    r(x - 22 * s, y - 3 * s, 44 * s, 10 * s, "#496a4a");
    r(x - 16 * s, y - 13 * s, 29 * s, 17 * s, "#64844f");
    r(x - 10 * s, y - 16 * s, 18 * s, 12 * s, "#809957");
    r(x - 13 * s, y - 8 * s, 7 * s, 4 * s, "#91aa64");
    r(x + 7 * s, y, 8 * s, 4 * s, "#789451");
  }
  function tree(x: number, y: number, s = 1) {
    r(x - 7 * s, y - 54 * s, 13 * s, 58 * s, "#6b5947");
    r(x - 4 * s, y - 50 * s, 5 * s, 51 * s, "#927854");
    p(
      [
        [x - 3 * s, y - 27 * s],
        [x - 22 * s, y - 45 * s],
        [x - 18 * s, y - 48 * s],
        [x + 2 * s, y - 33 * s],
      ],
      "#927854",
    );
    const clusters = [
      [-24, -67, 1.1],
      [17, -68, 1.1],
      [0, -95, 1.25],
      [-3, -60, 1],
    ];
    for (const [dx, dy, scale] of clusters)
      shrub(x + dx * s, y + dy * s, s * scale);
    r(x - 11 * s, y - 105 * s, 13 * s, 3 * s, "#9db870");
  }
  function window(x: number, y: number, w = 27, h = 36) {
    r(x - 3, y - 3, w + 6, h + 6, "#654c41");
    r(x, y, w, h, "#466373");
    r(x + 2, y + 2, w - 4, h - 4, "#8eafb1");
    r(x + 3, y + 3, 6, h - 6, "#bad1c3");
    r(x + w / 2 - 1, y, 3, h, "#d0b58c");
    r(x, y + h * 0.48, w, 3, "#d0b58c");
    r(x - 4, y + h, w + 8, 4, "#a0825b");
  }
  function house(
    x: number,
    y: number,
    w: number,
    h: number,
    roof: string,
    light: string,
    title: string,
  ) {
    r(x + 9, y + 8, w, h, "#65735b");
    r(x, y, w, h, "#d4c5a1");
    r(x + w - 19, y, 19, h, "#b8a784");
    r(x, y + h - 13, w, 13, "#8c8270");
    r(x + 5, y, 6, h - 13, "#9f8260");
    r(x + w - 27, y, 6, h - 13, "#9f8260");
    p(
      [
        [x - 17, y + 4],
        [x + 9, y - 49],
        [x + w - 29, y - 49],
        [x + w + 15, y + 4],
      ],
      "#514b49",
    );
    p(
      [
        [x - 12, y],
        [x + 11, y - 44],
        [x + w - 31, y - 44],
        [x + w + 8, y],
      ],
      roof,
    );
    for (let row = 0; row < 6; row++) {
      const yy = y - 39 + row * 7;
      const left = x + 9 - row * 3;
      const width = w - 45 + row * 7;
      r(left, yy, width, 2, light);
      for (let col = 0; col < width; col += 17)
        r(left + col + (row % 2 ? 7 : 0), yy, 1, 7, "#665650");
    }
    r(x - 17, y + 2, w + 33, 5, "#534b42");
    r(x - 10, y + 8, w + 20, 3, "#aa8c64");
    r(x + w - 53, y - 61, 17, 36, "#b29b84");
    r(x + w - 57, y - 65, 25, 6, "#d4b99a");
    r(x + w - 53, y - 49, 17, 2, "#8d7a68");
    window(x + 22, y + 27);
    window(x + w - 60, y + 27);
    r(x + w / 2 - 17, y + h - 67, 34, 54, "#645443");
    r(x + w / 2 - 13, y + h - 62, 26, 49, "#96774e");
    r(x + w / 2 - 9, y + h - 58, 18, 18, "#566b6a");
    r(x + w / 2 + 6, y + h - 32, 3, 3, "#e3c887");
    r(x + w / 2 - 22, y + h - 13, 44, 7, "#d9c7a1");
    r(x + w / 2 - 28, y + h - 6, 56, 6, "#b6a786");
    r(x + w / 2 - 42, y + 13, 84, 16, "#705946");
    r(x + w / 2 - 40, y + 15, 80, 12, "#e1d0a5");
    c.fillStyle = "#5d5545";
    c.font = "7px monospace";
    c.textAlign = "center";
    c.fillText(title, x + w / 2, y + 24);
  }
  tree(31, 315, 1.5);
  tree(921, 329, 1.5);
  house(65, 196, 181, 125, "#a35f51", "#c47d60", "THE WORKSHOP");
  house(697, 209, 186, 126, "#617e81", "#82a0a0", "THE ARCHIVE");
  // Notice board and its shingled cap.
  r(333, 255, 7, 80, "#755b43");
  r(401, 255, 7, 80, "#755b43");
  r(329, 247, 82, 67, "#644e3e");
  r(334, 252, 72, 56, "#9a8057");
  p(
    [
      [322, 246],
      [338, 230],
      [402, 230],
      [417, 246],
    ],
    "#537b6e",
  );
  r(323, 246, 95, 4, "#38594f");
  r(342, 261, 24, 29, "#e4d6aa");
  r(371, 259, 25, 17, "#f0dfb7");
  r(375, 281, 20, 20, "#d5c399");
  for (let i = 0; i < 3; i++) {
    r(346, 266 + i * 5, 15, 1, "#a59471");
    r(375, 264 + i * 4, 16, 1, "#a59471");
  }
  // Dock and fishing posts.
  p(
    [
      [494, 256],
      [582, 256],
      [618, 317],
      [481, 317],
    ],
    "#8f795d",
  );
  for (let y = 259; y < 316; y += 7)
    r(486 + (316 - y) * 0.15, y, 122 - (316 - y) * 0.8, 2, "#b5a080");
  r(487, 281, 6, 37, "#705c47");
  r(600, 281, 6, 40, "#705c47");
  r(483, 280, 13, 4, "#bda67b");
  r(597, 280, 13, 4, "#bda67b");
  // Fountain, with concentric stone tiers.
  p(
    [
      [581, 313],
      [607, 301],
      [640, 301],
      [665, 313],
      [665, 333],
      [642, 346],
      [604, 346],
      [581, 333],
    ],
    "#7e8781",
  );
  p(
    [
      [585, 313],
      [607, 304],
      [640, 304],
      [661, 313],
      [640, 328],
      [607, 328],
    ],
    "#cfccb0",
  );
  p(
    [
      [593, 314],
      [610, 308],
      [637, 308],
      [653, 314],
      [637, 322],
      [610, 322],
    ],
    "#7dafb3",
  );
  r(618, 284, 10, 29, "#b9bdab");
  r(614, 282, 18, 5, "#e1dbc0");
  r(621, 274, 4, 9, "#92c4c7");
  r(616, 291, 2, 15, "#b8d7ce");
  r(631, 293, 2, 16, "#b8d7ce");
  function lamp(x: number, y: number) {
    r(x - 3, y - 48, 6, 49, "#4a554c");
    r(x - 7, y - 3, 14, 5, "#596356");
    r(x - 7, y - 67, 14, 20, "#4a554c");
    r(x - 4, y - 63, 8, 12, "#f0d49a");
    r(x - 2, y - 61, 4, 9, "#ffebba");
    p(
      [
        [x - 10, y - 67],
        [x, y - 75],
        [x + 10, y - 67],
      ],
      "#4a554c",
    );
  }
  lamp(271, 348);
  lamp(682, 345);
  // Crates, barrels, seats, and flowering borders.
  for (let j = 0; j < 3; j++) {
    const x = 78 + j * 21;
    r(x, 325, 18, 22, "#866645");
    r(x + 2, 327, 14, 18, "#b79760");
    r(x, 330, 18, 2, "#6d6250");
    r(x, 341, 18, 2, "#6d6250");
    r(x + 6, 327, 1, 18, "#d0b17b");
  }
  r(769, 337, 65, 6, "#ad8758");
  r(772, 323, 59, 11, "#bd9663");
  r(774, 331, 4, 22, "#715c46");
  r(825, 331, 4, 22, "#715c46");
  for (const [x, y] of [
    [53, 362],
    [236, 322],
    [683, 328],
    [874, 359],
    [51, 537],
    [155, 561],
    [776, 555],
    [923, 533],
  ]) {
    shrub(x, y, 1.1);
    for (let k = 0; k < 6; k++) {
      const xx = x - 16 + k * 6,
        yy = y - 9 + (k % 3) * 4;
      r(xx, yy, 3, 3, k % 2 ? "#e5b680" : "#d58d83");
      r(xx + 1, yy + 1, 1, 1, "#f7ddaa");
    }
  }
  // Foreground framing makes the world extend beyond the viewport.
  tree(-8, 533, 1.7);
  tree(950, 544, 1.8);
  shrub(61, 609, 2);
  shrub(878, 610, 2.3);
  p(
    [
      [0, 575],
      [148, 588],
      [154, 600],
      [0, 600],
    ],
    "#627c55",
  );
  p(
    [
      [788, 596],
      [960, 570],
      [960, 600],
    ],
    "#627c55",
  );
}
const spriteCache = new Map<string, HTMLCanvasElement>();
export function paintResidents(
  c: CanvasRenderingContext2D,
  shapes: number[],
  time: number,
  moving: boolean,
) {
  shapes
    .map((shape, i) => ({ shape, ...residentPosition(i, time, moving) }))
    .sort((a, b) => a.y - b.y)
    .forEach(({ shape, x, y }) => {
      c.fillStyle = "#736f5a55";
      c.fillRect(x - 26, y - 5, 52, 8);
      c.fillRect(x - 19, y - 8, 38, 13);
      const tick = moving ? time : 0;
      const key = `${shape}:${Math.sin(tick * 2.2 + shape) > 0.65}:${Math.sin(tick * 0.7 + shape) > 0.994}`;
      let sprite = spriteCache.get(key);
      if (!sprite) {
        sprite = document.createElement("canvas");
        sprite.width = 40;
        sprite.height = 52;
        drawCharacter(sprite.getContext("2d")!, shape, 20, 52, tick, 1);
        spriteCache.set(key, sprite);
      }
      c.imageSmoothingEnabled = false;
      c.drawImage(sprite, Math.round(x - 33), Math.round(y - 86), 66, 86);
    });
}
