/**
 * 30 hand-pixeled 16×16 avatar heads, ported verbatim from
 * `reference/sprites.jsx`. Each character occupation has a unique
 * sprite + per-instance palette; the palette keys are intentionally
 * idiosyncratic per avatar (e.g. some use `H` for hair, others for
 * headphones) — that lets the original artist tune colors without
 * shared-key collisions.
 *
 * Order is stable: this array's index is the canonical avatar id.
 * Downstream code (`character-mapping.ts` in Tier 6, character grid,
 * navbar pill) can refer to entries by `id` string or by ordinal.
 */

import type { Palette } from "@/lib/pixel/sprite";

export interface AvatarDef {
  readonly id: string;
  readonly name: string;
  readonly sprite: string;
  readonly palette: Palette;
}

export const AVATARS: readonly AvatarDef[] = [
  {
    id: "designer",
    name: "UI 設計師",
    sprite: `
....AAAAAAAA....
...AOOOOOOOOA...
..AOPPPOPPPPOA..
.AOPPPPPPPPPPOA.
.AOWWOPOOOOWWOA.
.AOPWPOPPOPWPPOA
AOPPPPPPPPPPPPOA
AOPPNNPPPPNNPPOA
AOPPPPPPPPPPPPOA
AOPPPRPPRPPPPOA.
.AOPPPRRRPPPPOA.
.AOPPPPPPPPPPOA.
..AOPPPPPPPPOA..
...AOOOOOOOOA...
....A.....A.....
....A.....A.....
`,
    palette: { A: "#0a0524", O: "#1a0f3d", P: "#f4c7a8", W: "#fff", N: "#1a0f3d", R: "#ec4899" },
  },
  {
    id: "frontend",
    name: "前端工程師",
    sprite: `
....AAAAAAAA....
...AOOOOOOOOA...
..AHOOOOOOOOOHA.
.AHOOFFFFFFFFHOA
AHHFFFFFFFFFFHOA
AHHFFGGFFFGGFFOA
AHGGFFGGFFFGGFOA
AHFFGGGGFFGGGFOA
AHFFFNFFFFNFFFOA
AHFFFFFFFFFFFFOA
.AOFFFFRRFFFFOA.
.AOOFFFFFFFFOOA.
..AOOFFFFFFOOA..
...AOOOOOOOOA...
....A.....A.....
....A.....A.....
`,
    palette: { A: "#0a0524", O: "#1a0f3d", F: "#fb923c", G: "#0a0524", N: "#0a0524", H: "#a78bfa", R: "#fcd34d" },
  },
  {
    id: "novelist",
    name: "小說作家",
    sprite: `
....AAAAAAAA....
...AGGGGGGGGA...
..AGGGGGGGGGGA..
.AGGGGGGGGGGGGA.
.AGGGWWGGGWWGGA.
AGGGGWBGGGBWGGGA
AGGGGWWGGGWWGGGA
AGGGGGGGGGGGGGGA
AGGGGGGGGGGGGGGA
AGGRGRGGGGRGRGGA
.AGGGRGGGGGGRGGA
.AGGGGRRRRRGGGGA
..AGGGGGGGGGGGA.
...AGGGGGGGGA...
....A.....A.....
....A.....A.....
`,
    palette: { A: "#0a0524", G: "#86efac", W: "#fff", B: "#0a0524", R: "#16a34a" },
  },
  {
    id: "researcher",
    name: "研究員",
    sprite: `
....AAAAAAAA....
...ATTTTTTTTA...
..ATTBBTTBBTTA..
.ATBYBBBTBBBYBA.
.ATBYYBBBBBYYBA.
ATBYYNBBBBBNYYBA
ATBYYYBBBBBYYYBA
ATBYYBBOOBBBYYBA
ATTBBBOPPOBBBBTA
ATTBBBOOOOBBBBTA
.ATBBBBBBBBBBBA.
.ATBBBBBBBBBBBA.
..ATTBBBBBBBTTA.
...ATTTTTTTTA...
....TT....TT....
....TT....TT....
`,
    palette: { A: "#0a0524", T: "#3f3a5a", B: "#7c6f9e", Y: "#fcd34d", N: "#0a0524", O: "#fb923c", P: "#0a0524" },
  },
  {
    id: "musician",
    name: "音樂製作人",
    sprite: `
....AAAAAAAA....
.HHHOOOOOOOOHHH.
.HSSOSSSSSSOSSH.
.HSSOPPPPPPOSSH.
HHSSOPYYYYPOSSHH
HSSSOPYWWYPOSSSH
HSSSOPPNNPPOSSSH
HSSSOPPPPPPOSSSH
.HSSOPPPPPPOSSH.
.HSSOPRRRRPOSSH.
..SOOPPPPPPOOS..
...OPPPPPPPPO...
....OOOOOOOO....
....O......O....
....O......O....
....O......O....
`,
    palette: { A: "#0a0524", O: "#1a0f3d", P: "#f4c7a8", Y: "#0a0524", W: "#fff", N: "#0a0524", R: "#ec4899", S: "#1a0f3d", H: "#22d3ee" },
  },
  {
    id: "photo",
    name: "攝影師",
    sprite: `
....AAAAAAAA....
...AOOOOOOOOA...
..AOBBBOBBBBOA..
.AOBBBBBBBBBBOA.
.AOBWWBOBWWBOA.
AOBBWBOBOBWBBOA
AOBBBBBOOBBBBOA
AOBBBBBOOBBBBOA
AOBBBPPPPPBBBOA
AOBBBPMMMPBBBOA
.AOBBPMMMPBBOA.
.AOOBPPPPPBOOA.
..AOOBBBBBBOOA.
...AOOOOOOOOA...
....A.....A.....
....A.....A.....
`,
    palette: { A: "#0a0524", O: "#3a2820", B: "#8b6f47", W: "#fff", P: "#0a0524", M: "#fcd34d" },
  },
  {
    id: "philo",
    name: "哲學家",
    sprite: `
....AAAAAAAA....
...APPPPPPPPA...
..APPVVPPVVPPA..
.APVYVPPPVYVPPA.
.APVYYVPPVYYVPA.
APVYNYVPPVYNYVPA
APVYYYVPPVYYYVPA
APVYYVOOVVYYVPA
APPVVOPPOVVPPPA
APPVOPPPPOVVPPA
.APPVPPVVPPVPPA.
.APPPPPVVPPPPPA.
..APPPVVVVPPPPA.
...APPPPPPPPA...
....P.....P.....
....P.....P.....
`,
    palette: { A: "#0a0524", P: "#6d28d9", V: "#a78bfa", Y: "#fcd34d", N: "#0a0524", O: "#fb923c" },
  },
  {
    id: "barista",
    name: "咖啡師",
    sprite: `
....AAAAAAAA....
...ABBBBBBBBA...
..ABBBBBBBBBBA..
.ABBBBBBBBBBBBA.
.ABNNBBBBBBNNBA.
ABBBBBBBBBBBBBA
ABBWWBBBBBWWBBA
ABBBBBBBBBBBBBA
ABBBBBBNBBBBBBA
ABBBBPPNPPBBBBA
.ABBBPPPPPPBBA.
.ABBBBPPPPBBBA.
..ABBBBBBBBBBA.
...ABBBBBBBBA...
....B.....B.....
....B.....B.....
`,
    palette: { A: "#0a0524", B: "#7c4a2a", N: "#fcd34d", W: "#fff", P: "#fff" },
  },
  {
    id: "chef",
    name: "廚藝者",
    sprite: `
....WWWWWWWW....
...WWWWWWWWWW...
..WAAAAAAAAAAW..
.AAYYYYYYYYYYAA.
.AYYMMYYYMMYYYA.
AYYYMBYYYBMYYYYA
AYYYMMYYYMMYYYYA
AYYYYYBNBYYYYYA
AYYYYYBBBYYYYYA
AYYYYRRRRRYYYYA
.AYYYYRRRYYYYA.
.AYYYYYRYYYYYA.
..AYYYYYYYYYYA.
...AYYYYYYYYA...
....A.....A.....
....A.....A.....
`,
    palette: { W: "#fff", A: "#0a0524", Y: "#fbbf24", M: "#fff", B: "#0a0524", N: "#fb923c", R: "#dc2626" },
  },
  {
    id: "data",
    name: "資料科學家",
    sprite: `
....AAAAAAAA....
.AAABBAAAABBAAA.
ABBBBBBBBBBBBBBA
ABBWWWWWWWWWWBBA
ABWWWWWWWWWWWWA
AWWBBWWWWBBWWWA
AWWBNBWWBNBWWWA
AWWBBBWWBBBWWWA
AWWWWWBBWWWWWWA
AWWWWWBBWWWWWWA
.AWWBBBWWBBBWWA
.AWWWWWWWWWWWWA
..AAAAAAAAAAAA.
...AWWWWWWWWA...
....A.....A.....
....A.....A.....
`,
    palette: { A: "#0a0524", B: "#0a0524", W: "#fff", N: "#fcd34d" },
  },
  {
    id: "gamer",
    name: "玩遊戲",
    sprite: `
....AAAAAAAA....
...AYYYYYAA.....
..APYYYYAAPA....
.APPPYAPPPPA....
.AWWWPPPPPPA....
APPPPPPPPPPPA...
APPPPPPPPPPPPA..
AWWPPPCCPPCCPPA.
APPPPCNCPPCNCPA.
APPPPCCPPCCPPPA.
.APPPPPPPPPPPA..
.APPPPMMMPPPPA..
..APPPMMMPPPPA..
...APPPPPPPPA...
....P.....P.....
....P.....P.....
`,
    palette: { A: "#0a0524", P: "#f4c7a8", Y: "#fcd34d", W: "#fff", C: "#22d3ee", N: "#0a0524", M: "#ec4899" },
  },
  {
    id: "crypto",
    name: "幣圈炒貨者",
    sprite: `
....AAAAAAAA....
...AGGGGGGGGA...
..AGGGGGGGGGGA..
.AGGYGGGGGYGGA.
.AGGYNGGGYNGGGA.
AGGYYGGGYYYGGGA
AGYYGGGGGGYYGGA
AGGGGGGGGGGGGGA
AGGRRRRRRRRGGGA
AGRWWRWWRWWRGGA
.AGRWWRWWRWWRGA
.AGGRRRRRRRRGGA
..AGGGGGGGGGGGA
...AGGGGGGGGA...
....G.....G.....
....G.....G.....
`,
    palette: { A: "#0a0524", G: "#4ade80", Y: "#fcd34d", N: "#0a0524", R: "#0a0524", W: "#fff" },
  },
  {
    id: "blackhat",
    name: "駭客顧問",
    sprite: `
....AAAAAAAA....
.AABBBBBBBBBBAA.
ABBBBBBBBBBBBBA
ABBRRBBBBBRRBBA
ABBRYBBBBBYRBBA
ABBBBBBBBBBBBBA
ABBBBNNNNBBBBBA
ABBBNNYYNNBBBBA
ABBBNYYYYNBBBBA
ABBBNNNNNNBBBBA
.ABBBBBBBBBBBA.
.ABBYYBBBYYBBA.
..ABBBBBBBBBBA.
...ABBBBBBBBA...
....B.....B.....
....B.....B.....
`,
    palette: { A: "#0a0524", B: "#1a0f3d", R: "#ec4899", Y: "#fcd34d", N: "#fb923c" },
  },
  {
    id: "ux",
    name: "UX 研究員",
    sprite: `
....AAAAAAAA....
...ACCCCCCCCA...
..ACCCCCCCCCCA..
.ACCCCCCCCCCCCA.
.ACWWCCCCCWWCCA.
ACCWBCCCCCBWCCA
ACCWWCCCCCWWCCA
ACCCCCCNNCCCCCA
ACCCCCCNNCCCCCA
ACCCRCCCCCRCCCA
.ACCCRRRRRCCCA.
.ACCCCCCCCCCCA.
..ACCCCCCCCCCA.
...ACCCCCCCCA...
....C.....C.....
....C.....C.....
`,
    palette: { A: "#0a0524", C: "#22d3ee", W: "#fff", B: "#0a0524", N: "#fbbf24", R: "#0a0524" },
  },
  {
    id: "writer",
    name: "文案作家",
    sprite: `
....AAAAAAAA....
...APPPPPPPPA...
..APPPPPPPPPPA..
.APPPPPPPPPPPPA.
.APWWPPPPPWWPA.
APPWBPPPPPBWPPA
APPWWPPPPPWWPPA
APPPPPPPPPPPPPA
APPPRRRRRRRPPPA
APPRRRRRRRRRPPA
.APRPRPRPRPRPPA
.APRPRPRPRPRPPA
..ARRRRRRRRRR..
...APPPPPPPPA...
....P.....P.....
....P.....P.....
`,
    palette: { A: "#0a0524", P: "#c084fc", W: "#fff", B: "#0a0524", R: "#a855f7" },
  },
  {
    id: "pm",
    name: "產品經理",
    sprite: `
....AAAAAAAA....
.AAYOYYOYYOYOAA.
AYYOYOYOOYOYOYA
AYYYYYOOOOYYYYA
AYWWYYOOOOYYWYA
AYWBYOOOOOOYBYA
AYWWYOOOOOOYWYA
AYYYYYOONNOYYYA
AYYYYOOOOOOYYA
AYYYYRYNNYRYYYA
.AYYRRRRRRRYYA.
.AYYYRRRRRYYYA.
..AYYYYYYYYYYA.
...AYYYYYYYYA...
....Y.....Y.....
....Y.....Y.....
`,
    palette: { A: "#0a0524", Y: "#fb923c", O: "#0a0524", W: "#fff", B: "#0a0524", N: "#0a0524", R: "#fff" },
  },
  {
    id: "marketing",
    name: "行銷企劃",
    sprite: `
....AAAAAAAA....
...AYYYYYYYAA...
..AYYRRRRRYYYAA.
.AYRRYYYYYRRYA.
.AYRYYYYYYYYRA.
AYYYYYYYYYYYYA
AYYYBYYYYYBYYA
AYYBBBYYYYBBYA
AYYYBYNNYYBYYA
AYYYYYNNYYYYYA
.AYYYORRRYYYYA
.AYYYORRROYYYA
..AYYYORROYYYY
...AYYYYYYYYA...
....Y.....Y.....
....Y.....Y.....
`,
    palette: { A: "#0a0524", Y: "#fbbf24", R: "#dc2626", B: "#0a0524", N: "#fff", O: "#fb923c" },
  },
  {
    id: "lang",
    name: "語言學習者",
    sprite: `
....AAAAAAAA....
...AYYYYYYYYA...
..AYYGGGGYYYA...
.AYYGGGGGGYYA...
.AYGGGGGGGYYA...
AYYGGGGGGGYYA...
AYGGBYYGGGYYA...
AYGGBNYGGGYYA...
AYGGGGYGGGYOOA..
AYGGGGGGGGYYOOA.
.AYGGGGGGGYYYA..
.AYGGGGGGGGYYA..
..AYGGGGGGGYYA..
...AYYYYYYYYA...
....Y.....Y.....
....Y.....Y.....
`,
    palette: { A: "#0a0524", Y: "#86efac", G: "#22c55e", B: "#fff", N: "#0a0524", O: "#fb923c" },
  },
  {
    id: "astro",
    name: "天文愛好者",
    sprite: `
....AAAAAAAA....
...AOOOOOOOOA...
..AOOSSSSOOSOA..
.AOSSSOSSSSOSA.
.AOSSSSSSSOSSSA
AOSSOSSSSSOSSSA
AOSSSSSSSSSSSA
AOSSSSSSSSSSSA
AOSSSSSWWWWSSA
AOSSSSWWWWWSSSA
.AOSSWWMMWWSSA.
.AOSSWMMWSSSSA.
..AOSWWWWSOOSA.
...AOOOOOOOOA...
....O.....O.....
....O.....O.....
`,
    palette: { A: "#0a0524", O: "#1a0f3d", S: "#312e81", W: "#fcd34d", M: "#fb923c" },
  },
  {
    id: "eco",
    name: "環境設計師",
    sprite: `
....AAAAAAAA....
...AGGGGGGGGA...
..AGGEEEEGGGGA..
.AGGEEEGGGGGGGA.
.AGEEGGGGGGGGGA.
AGEEGGGGGGGGGGA
AGEEGGEEGGGGGGA
AGEEEEEEEGGGGGA
AGGEEEEEEGGGGGA
AGGGEEEEEEEGGGA
.AGGEEEEEEEEGA.
.AGGEEEEEEEGGA.
..AGGGEEEEGGGGA
...AGGGGGGGGA...
....G.....G.....
....G.....G.....
`,
    palette: { A: "#0a0524", G: "#65a30d", E: "#86efac" },
  },
  {
    id: "health",
    name: "護師",
    sprite: `
....AAAAAAAA....
...AWWWWWWWWA...
..AWWWWWWWWWWA..
.AWWWRWWWWRWWA.
.AWWWRRWWRRWWA.
AWWWWRRWWRRWWA
AWWWWWBWWWWWWA
AWWWWWBNBWWWWA
AWWWWBNNNBWWWA
AWWWWBNNNBWWWA
.AWWWBBBBBBWA.
.AWWWWBBBBWWWA.
..AWWWWWWWWWWA.
...AWWWWWWWWA...
....W.....W.....
....W.....W.....
`,
    palette: { A: "#0a0524", W: "#f5f3ff", R: "#ec4899", B: "#dc2626", N: "#fff" },
  },
  {
    id: "teacher",
    name: "教師",
    sprite: `
.BBBBBBBBBBBBBB.
BBYYBBBBBBBBYYBB
.BBBBBBBBBBBBBB.
...AAAAAAAAAA...
..AOOOOOOOOOOA..
.AOPPPPPPPPPPOA.
.AOPWWPPPPWWPOA.
AOPPWBPPPPBWPPOA
AOPPWWPPPPWWPOA
AOPPPPPPPPPPPOA
AOPPPPNNNNPPPOA
.AOPPPNYYNPPPOA
.AOOPPPNNPPPOOA
..AOOOOOOOOOOA..
...O........O...
...O........O...
`,
    palette: { B: "#1a0f3d", Y: "#fcd34d", A: "#0a0524", O: "#1a0f3d", P: "#f4c7a8", W: "#fff", N: "#dc2626" },
  },
  {
    id: "lawyer",
    name: "律師",
    sprite: `
....AAAAAAAA....
...AOOOOOOOOA...
..AOOOOOOOOOOA..
.AOPPPPPPPPPPOA.
.AOPWWOPPOWWPOA.
AOPPWBOPPOBWPPOA
AOPPPPOPPOPPPOA
AOPPPPOPPOPPPOA
AOPPPPRRRPPPPOA
AOPPPPRRRPPPPOA
.AOPPPRRRRPPPA.
.AOOPPPPPPPOOA.
..AOOOOOOOOOOA.
...AOOOOOOOOA...
....A.....A.....
....A.....A.....
`,
    palette: { A: "#0a0524", O: "#1a0f3d", P: "#e4c0a8", W: "#fff", B: "#0a0524", R: "#fcd34d" },
  },
  {
    id: "athlete",
    name: "運動員",
    sprite: `
....AAAAAAAA....
...AOOOOOOOOA...
..AOPPPPPPPPOA..
.AOPPPPPPPPPPOA.
.AOPWWPPPPWWPA.
AOPPWBPPPPBWPPOA
AOPPWWPPPPWWPOA
AOPPPPRRRRPPPOA
AOPPPPRRRRPPPOA
AOPPPPPPPPPPPOA
.AOPPCPPPPCPPOA
.AOOPCCPCPCCPOA
..AOOPPPPPPPOOA
...AOOOOOOOOA...
....O.....O.....
....O.....O.....
`,
    palette: { A: "#0a0524", O: "#1a0f3d", P: "#f4c7a8", W: "#fff", B: "#0a0524", R: "#22d3ee", C: "#1a0f3d" },
  },
  {
    id: "student",
    name: "學生",
    sprite: `
....AAAAAAAA....
...AOOOOOOOOA...
..AOBBOOOOBBOOA.
.AOBBBOOOOBBBOA.
.AOPPPPPPPPPPOA.
AOPPWWPPPPWWPOA
AOPPWBPPPPBWPOA
AOPPWWPPPPWWPOA
AOPPPPPPPPPPPOA
AOPPPPRRRRPPPOA
.AOPPPRRRRPPPA.
.AOORRRRRRRROA.
..AYYYRRRRRYYYA.
...AYYYRRRYYYYA.
....A.....A.....
....A.....A.....
`,
    palette: { A: "#0a0524", O: "#1a0f3d", B: "#fcd34d", P: "#f4c7a8", W: "#fff", R: "#0a0524", Y: "#22d3ee" },
  },
  {
    id: "content",
    name: "內容創作者",
    sprite: `
.BBBBBBBBBBBBBB.
BWBWBWBWBWBWBWBB
BBWBWBWBWBWBWBB.
.BBBBBBBBBBBBBB.
...AAAAAAAAAA...
..AOPPPPPPPPOA..
.AOPPWWPPPWWPOA.
.AOPPWBPPPBWPOA.
AOPPWWPPPPWWPOA
AOPPPPPNNPPPPOA
AOPPPPPNNPPPPOA
.AOPPPRRRRRPPA.
.AOOPPPPPPPPOOA
..AOOOOOOOOOOA..
...O........O...
...O........O...
`,
    palette: { B: "#1a0f3d", W: "#fff", A: "#0a0524", O: "#1a0f3d", P: "#f4c7a8", N: "#0a0524", R: "#ec4899" },
  },
  {
    id: "psych",
    name: "心理師",
    sprite: `
....AAAAAAAA....
...APPPPPPPPA...
..APPRRPPRRPPA..
.APRRRRPRRRRPA.
.APRRPRRRRPRRPA.
APRRRRRRRRRRRPA
APRRPRRRRRRPRPA
APRRRRRPPPRRPA
APRRPRRRRRRPRPA
APRRRRRRRRRRRPA
.APRRPRRRRPRRPA.
.APRRRRRRRRRPA.
..APPRRRRRRPPA.
...APPPPPPPPA...
....P.....P.....
....P.....P.....
`,
    palette: { A: "#0a0524", P: "#0a0524", R: "#ec4899" },
  },
  {
    id: "accountant",
    name: "會計師",
    sprite: `
....AAAAAAAA....
...AWWWWWWWWA...
..AWWWWWWWWWWA..
.AWWWWWWWWWWWWA.
.AWWWBBWBBWBBWA.
AWWWWBBWBBWBBWA
AWWWWBBWBBWBBWA
AWWWWBBWBBWBBWA
AWGGGBBWBBWBBWA
AWGGGGRRWBBWBBA
.AWGGGGGRRWBBA.
.AWGGGGGGGWBBA.
..AWWWWWWWWWBBA
...AWWWWWWWWA...
....W.....W.....
....W.....W.....
`,
    palette: { A: "#0a0524", W: "#f5f3ff", B: "#22d3ee", G: "#86efac", R: "#dc2626" },
  },
  {
    id: "astronaut",
    name: "太空人",
    sprite: `
....AAAAAAAA....
...AWWWWWWWWA...
..AWCCCCCCCCWA..
.AWCBBBBBBBBCWA.
.AWCBBBBBBBBCWA.
AWCBBBPPPPBBCWA
AWCBBPPPPPPBBCWA
AWCBBPWWWWPBBCWA
AWCBBPWWWWPBBCWA
AWCBBBPPPPBBCWA
.AWCBBBBBBBBCWA.
.AWCBBBBBBBBCWA.
..AWCCCCCCCCWA..
...AWWWWWWWWA...
....A.....A.....
....A.....A.....
`,
    palette: { A: "#0a0524", W: "#f5f3ff", C: "#a78bfa", B: "#1a0f3d", P: "#22d3ee" },
  },
  {
    id: "mystery",
    name: "？？？",
    sprite: `
....AAAAAAAA....
...A........A...
..A..........A..
.A............A.
.A...YYYYYY...A.
A...YY....YY...A
A...YY....YY...A
A........YY...A
A.......YY....A
A......YY.....A
.A....YY.....A.
.A....YY.....A.
..A...........A.
...A...YY...A...
....A.....A.....
....AAAAAAAAA...
`,
    palette: { A: "#1a0f3d", Y: "#a78bfa" },
  },
];

export function avatarById(id: string): AvatarDef | undefined {
  return AVATARS.find((a) => a.id === id);
}

export function avatarByIndex(idx: number): AvatarDef {
  const safe = ((idx % AVATARS.length) + AVATARS.length) % AVATARS.length;
  return AVATARS[safe];
}
