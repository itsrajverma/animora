/**
 * Built-in Library assets (flat vector illustrations), grouped in categories like
 * SVGator's library. Each one is a standalone SVG that is imported as a layer group.
 */

export interface Asset {
  id: string;
  name: string;
  svg: string;
}

export interface AssetCategory {
  id: string;
  name: string;
  icon: string;
  assets: Asset[];
}

const svg = (body: string, w = 200, h = 200) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

const CHARACTERS: Asset[] = [
  {
    id: 'man',
    name: 'Bearded man',
    svg: svg(`
<g id="body"><path d="M28 200 C28 150 60 128 100 128 C140 128 172 150 172 200 Z" fill="#5d2a4f"/>
<path d="M78 128 L100 165 L122 128 Z" fill="#e8a679"/><path d="M76 128 L92 152 L100 140 Z M124 128 L108 152 L100 140 Z" fill="#76345f"/>
<path d="M100 150 V200" stroke="#45193a" stroke-width="3"/></g>
<g id="neck"><rect x="88" y="104" width="24" height="28" fill="#e8a679"/></g>
<g id="ears"><circle cx="52" cy="78" r="12" fill="#f5c39b"/><circle cx="148" cy="78" r="12" fill="#f5c39b"/></g>
<g id="head"><path d="M56 58 C56 22 144 22 144 58 V96 C144 130 56 130 56 96 Z" fill="#6b5a52"/>
<rect x="64" y="36" width="72" height="72" rx="20" fill="#f5c39b"/>
<path d="M58 60 C60 30 80 22 100 22 C120 22 140 30 142 60 L142 48 C142 18 58 18 58 48 Z" fill="#6b5a52"/></g>
<g id="beard"><path d="M58 76 C58 128 142 128 142 76 L134 76 C134 96 120 104 100 104 C80 104 66 96 66 76 Z" fill="#5a4a43"/>
<path d="M82 92 C88 84 112 84 118 92 C112 90 106 92 100 96 C94 92 88 90 82 92 Z" fill="#5a4a43"/></g>
<g id="eyes"><circle cx="84" cy="70" r="5" fill="#4a5568"/><circle cx="116" cy="70" r="5" fill="#4a5568"/></g>
<g id="brows"><rect x="72" y="54" width="22" height="7" rx="3.5" fill="#5a4a43"/><rect x="106" y="54" width="22" height="7" rx="3.5" fill="#5a4a43"/></g>`),
  },
  {
    id: 'woman',
    name: 'Woman',
    svg: svg(`
<g id="hair-back"><path d="M44 80 C44 20 156 20 156 80 V150 H44 Z" fill="#2d1e2f"/></g>
<g id="body"><path d="M30 200 C30 152 62 132 100 132 C138 132 170 152 170 200 Z" fill="#2ec4b6"/></g>
<g id="neck"><rect x="88" y="108" width="24" height="28" fill="#c98b6b"/></g>
<g id="head"><rect x="62" y="40" width="76" height="80" rx="34" fill="#e0a882"/></g>
<g id="hair"><path d="M58 76 C58 30 96 26 118 34 C140 40 146 60 144 82 C130 60 104 50 76 62 C68 66 62 70 58 76 Z" fill="#2d1e2f"/></g>
<g id="eyes"><circle cx="86" cy="82" r="5" fill="#2d1e2f"/><circle cx="114" cy="82" r="5" fill="#2d1e2f"/></g>
<g id="mouth"><path d="M90 100 Q100 108 110 100" fill="none" stroke="#a0524d" stroke-width="3.5" stroke-linecap="round"/></g>
<g id="cheeks"><circle cx="78" cy="96" r="6" fill="#f08a8a" opacity="0.5"/><circle cx="122" cy="96" r="6" fill="#f08a8a" opacity="0.5"/></g>`),
  },
  {
    id: 'cat',
    name: 'Cat',
    svg: svg(`
<g id="tail"><path d="M150 160 C190 150 186 100 160 100" fill="none" stroke="#f4a261" stroke-width="12" stroke-linecap="round"/></g>
<g id="body"><ellipse cx="104" cy="160" rx="54" ry="36" fill="#f4a261"/></g>
<g id="ears"><path d="M58 58 L64 18 L92 46 Z M142 58 L136 18 L108 46 Z" fill="#e76f51"/></g>
<g id="head"><circle cx="100" cy="80" r="46" fill="#f4a261"/></g>
<g id="eyes"><ellipse cx="82" cy="78" rx="6" ry="9" fill="#264653"/><ellipse cx="118" cy="78" rx="6" ry="9" fill="#264653"/></g>
<g id="nose"><path d="M94 96 H106 L100 103 Z" fill="#e76f51"/></g>
<g id="whiskers"><path d="M70 100 H44 M70 108 L46 116 M130 100 H156 M130 108 L154 116" stroke="#264653" stroke-width="2.5" stroke-linecap="round"/></g>`),
  },
  {
    id: 'robot',
    name: 'Robot',
    svg: svg(`
<g id="antenna"><path d="M100 22 V44" stroke="#8d99ae" stroke-width="5"/><circle cx="100" cy="18" r="8" fill="#ef233c"/></g>
<g id="head"><rect x="52" y="44" width="96" height="72" rx="18" fill="#8d99ae"/><rect x="64" y="58" width="72" height="42" rx="12" fill="#2b2d42"/></g>
<g id="eyes"><circle cx="84" cy="79" r="9" fill="#4cc9f0"/><circle cx="116" cy="79" r="9" fill="#4cc9f0"/></g>
<g id="body"><rect x="62" y="124" width="76" height="62" rx="14" fill="#edf2f4" stroke="#8d99ae" stroke-width="4"/><circle cx="100" cy="155" r="10" fill="#ef233c"/></g>
<g id="arms"><rect x="34" y="128" width="20" height="46" rx="10" fill="#8d99ae"/><rect x="146" y="128" width="20" height="46" rx="10" fill="#8d99ae"/></g>`),
  },
];

const BUSINESS: Asset[] = [
  {
    id: 'bar-chart',
    name: 'Bar chart',
    svg: svg(`<g id="axis"><path d="M30 30 V170 H176" fill="none" stroke="#334155" stroke-width="6" stroke-linecap="round"/></g>
<g id="bars"><rect x="48" y="110" width="26" height="54" rx="4" fill="#60a5fa"/><rect x="86" y="80" width="26" height="84" rx="4" fill="#3b82f6"/><rect x="124" y="50" width="26" height="114" rx="4" fill="#1d4ed8"/></g>
<g id="trend"><path d="M50 96 L96 68 L120 80 L166 34" fill="none" stroke="#f97316" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></g>`),
  },
  {
    id: 'pie',
    name: 'Pie chart',
    svg: svg(`<g id="pie"><circle cx="100" cy="100" r="70" fill="#a7f3d0"/><path d="M100 100 V30 A70 70 0 0 1 166 122 Z" fill="#10b981"/><path d="M100 100 L166 122 A70 70 0 0 1 72 164 Z" fill="#047857"/></g>
<g id="hole"><circle cx="100" cy="100" r="30" fill="#ffffff"/></g>`),
  },
  {
    id: 'coin',
    name: 'Coin',
    svg: svg(`<g id="coin"><circle cx="100" cy="100" r="72" fill="#f59e0b"/><circle cx="100" cy="100" r="56" fill="#fbbf24"/></g>
<g id="sign"><path d="M116 72 C108 64 84 64 84 82 C84 100 118 96 118 116 C118 134 92 136 82 126 M100 56 V144" fill="none" stroke="#b45309" stroke-width="9" stroke-linecap="round"/></g>`),
  },
  {
    id: 'briefcase',
    name: 'Briefcase',
    svg: svg(`<g id="handle"><path d="M76 60 V44 H124 V60" fill="none" stroke="#7c2d12" stroke-width="10"/></g>
<g id="case"><rect x="30" y="60" width="140" height="104" rx="14" fill="#c2410c"/><rect x="30" y="98" width="140" height="10" fill="#9a3412"/><rect x="90" y="92" width="20" height="22" rx="4" fill="#fde68a"/></g>`),
  },
  {
    id: 'rocket',
    name: 'Rocket',
    svg: svg(`<g id="flame"><path d="M86 150 C86 176 100 192 100 192 C100 192 114 176 114 150 Z" fill="#f97316"/><path d="M93 150 C93 166 100 176 100 176 C100 176 107 166 107 150 Z" fill="#fde047"/></g>
<g id="fins"><path d="M74 118 L52 150 L80 146 Z M126 118 L148 150 L120 146 Z" fill="#ef4444"/></g>
<g id="body"><path d="M100 14 C134 44 134 110 122 152 H78 C66 110 66 44 100 14 Z" fill="#e2e8f0"/></g>
<g id="window"><circle cx="100" cy="76" r="16" fill="#38bdf8" stroke="#64748b" stroke-width="5"/></g>`),
  },
];

const DEVICES: Asset[] = [
  {
    id: 'phone',
    name: 'Phone',
    svg: svg(`<g id="phone"><rect x="56" y="14" width="88" height="172" rx="16" fill="#1e293b"/><rect x="64" y="30" width="72" height="136" rx="6" fill="#38bdf8"/><rect x="88" y="20" width="24" height="5" rx="2.5" fill="#475569"/></g>
<g id="screen"><rect x="74" y="44" width="52" height="10" rx="5" fill="#e0f2fe"/><rect x="74" y="62" width="36" height="10" rx="5" fill="#e0f2fe"/><circle cx="100" cy="124" r="20" fill="#0ea5e9"/><path d="M95 114 L109 124 L95 134 Z" fill="#fff"/></g>`),
  },
  {
    id: 'laptop',
    name: 'Laptop',
    svg: svg(`<g id="screen"><rect x="36" y="42" width="128" height="88" rx="8" fill="#334155"/><rect x="44" y="50" width="112" height="72" rx="3" fill="#a5b4fc"/></g>
<g id="base"><path d="M18 138 H182 L172 156 H28 Z" fill="#94a3b8"/><rect x="84" y="138" width="32" height="5" rx="2" fill="#64748b"/></g>
<g id="ui"><rect x="54" y="60" width="44" height="8" rx="4" fill="#eef2ff"/><rect x="54" y="76" width="92" height="36" rx="5" fill="#6366f1"/></g>`),
  },
  {
    id: 'monitor',
    name: 'Monitor',
    svg: svg(`<g id="stand"><path d="M84 150 H116 L122 176 H78 Z" fill="#64748b"/><rect x="62" y="174" width="76" height="8" rx="4" fill="#475569"/></g>
<g id="display"><rect x="20" y="30" width="160" height="120" rx="10" fill="#0f172a"/><rect x="30" y="40" width="140" height="96" rx="4" fill="#22c55e"/></g>
<g id="chart"><path d="M42 118 L72 92 L98 104 L130 66 L158 80" fill="none" stroke="#f0fdf4" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></g>`),
  },
  {
    id: 'watch',
    name: 'Smart watch',
    svg: svg(`<g id="strap"><rect x="74" y="10" width="52" height="180" rx="14" fill="#a855f7"/></g>
<g id="case"><rect x="56" y="50" width="88" height="100" rx="24" fill="#1f2937"/><rect x="66" y="60" width="68" height="80" rx="16" fill="#111827"/></g>
<g id="ring"><circle cx="100" cy="100" r="24" fill="none" stroke="#374151" stroke-width="7"/><path d="M100 76 A24 24 0 1 1 78 110" fill="none" stroke="#f43f5e" stroke-width="7" stroke-linecap="round"/></g>`),
  },
];

const FOOD: Asset[] = [
  {
    id: 'bottle',
    name: 'Water bottle',
    svg: svg(`<g id="cap"><rect x="84" y="12" width="32" height="20" rx="4" fill="#2563eb"/></g>
<g id="bottle"><path d="M80 32 H120 V50 C138 62 140 74 140 90 V178 C140 186 134 190 126 190 H74 C66 190 60 186 60 178 V90 C60 74 62 62 80 50 Z" fill="#bae6fd"/></g>
<g id="water"><path d="M62 110 C82 100 118 120 138 110 V178 C138 184 134 188 126 188 H74 C66 188 62 184 62 178 Z" fill="#38bdf8"/></g>
<g id="label"><rect x="60" y="126" width="80" height="26" fill="#ffffff" opacity="0.6"/></g>`),
  },
  {
    id: 'milk',
    name: 'Glass of milk',
    svg: svg(`<g id="glass"><path d="M56 30 H144 L132 186 H68 Z" fill="#e0f2fe" opacity="0.8"/></g>
<g id="milk"><path d="M62 70 H138 L130 180 H70 Z" fill="#fffbeb"/></g>
<g id="shine"><path d="M70 44 L76 170" stroke="#ffffff" stroke-width="6" stroke-linecap="round" opacity="0.8"/></g>`),
  },
  {
    id: 'tea',
    name: 'Cup of tea',
    svg: svg(`<g id="steam"><path d="M80 60 C70 46 90 40 80 24 M104 60 C94 46 114 40 104 24" fill="none" stroke="#cbd5e1" stroke-width="5" stroke-linecap="round"/></g>
<g id="handle"><path d="M146 96 C172 96 172 136 146 136" fill="none" stroke="#f59e0b" stroke-width="10"/></g>
<g id="cup"><path d="M40 80 H152 C152 140 132 170 96 170 C60 170 40 140 40 80 Z" fill="#fbbf24"/><ellipse cx="96" cy="80" rx="56" ry="10" fill="#92400e"/></g>
<g id="saucer"><ellipse cx="96" cy="176" rx="72" ry="10" fill="#f59e0b"/></g>`),
  },
  {
    id: 'burger',
    name: 'Burger',
    svg: svg(`<g id="bun-top"><path d="M30 96 C30 50 170 50 170 96 Z" fill="#f59e0b"/><circle cx="76" cy="72" r="3" fill="#fef3c7"/><circle cx="104" cy="64" r="3" fill="#fef3c7"/><circle cx="128" cy="76" r="3" fill="#fef3c7"/></g>
<g id="lettuce"><path d="M26 100 Q46 112 66 100 T106 100 T146 100 T176 100 V108 H26 Z" fill="#22c55e"/></g>
<g id="patty"><rect x="30" y="108" width="140" height="24" rx="12" fill="#78350f"/></g>
<g id="cheese"><path d="M34 106 H166 L150 120 L134 108 Z" fill="#facc15"/></g>
<g id="bun-bottom"><rect x="30" y="134" width="140" height="26" rx="12" fill="#f59e0b"/></g>`),
  },
  {
    id: 'pizza',
    name: 'Pizza slice',
    svg: svg(`<g id="slice"><path d="M100 186 L32 40 C78 18 122 18 168 40 Z" fill="#fcd34d"/></g>
<g id="crust"><path d="M32 40 C78 18 122 18 168 40 L162 54 C120 34 80 34 38 54 Z" fill="#d97706"/></g>
<g id="pepperoni"><circle cx="86" cy="76" r="12" fill="#dc2626"/><circle cx="120" cy="96" r="11" fill="#dc2626"/><circle cx="96" cy="130" r="10" fill="#dc2626"/></g>`),
  },
];

const NATURE: Asset[] = [
  {
    id: 'tree',
    name: 'Tree',
    svg: svg(`<g id="trunk"><rect x="90" y="120" width="20" height="66" rx="4" fill="#92400e"/></g>
<g id="leaves"><circle cx="100" cy="70" r="46" fill="#16a34a"/><circle cx="66" cy="104" r="32" fill="#22c55e"/><circle cx="134" cy="104" r="32" fill="#22c55e"/></g>`),
  },
  {
    id: 'sun',
    name: 'Sun',
    svg: svg(`<g id="rays" stroke="#f59e0b" stroke-width="10" stroke-linecap="round"><path d="M100 14 V36 M100 164 V186 M14 100 H36 M164 100 H186 M39 39 L55 55 M145 145 L161 161 M39 161 L55 145 M145 55 L161 39"/></g>
<g id="sun"><circle cx="100" cy="100" r="46" fill="#fbbf24"/></g>`),
  },
  {
    id: 'cloud',
    name: 'Cloud',
    svg: svg(`<g id="cloud"><path d="M52 150 C24 150 18 112 46 104 C42 70 84 56 102 80 C116 56 162 64 158 102 C186 104 186 150 156 150 Z" fill="#e2e8f0"/></g>
<g id="drops" fill="#60a5fa"><path d="M70 164 l-6 14 a6 6 0 0 0 12 0 Z M104 164 l-6 14 a6 6 0 0 0 12 0 Z M138 164 l-6 14 a6 6 0 0 0 12 0 Z"/></g>`),
  },
  {
    id: 'flower',
    name: 'Flower',
    svg: svg(`<g id="stem"><path d="M100 110 V190" stroke="#16a34a" stroke-width="8"/><path d="M100 160 C80 150 70 160 64 170 C80 172 92 168 100 160 Z" fill="#22c55e"/></g>
<g id="petals" fill="#f472b6"><circle cx="100" cy="50" r="24"/><circle cx="140" cy="78" r="24"/><circle cx="126" cy="122" r="24"/><circle cx="74" cy="122" r="24"/><circle cx="60" cy="78" r="24"/></g>
<g id="center"><circle cx="100" cy="88" r="20" fill="#fde047"/></g>`),
  },
  {
    id: 'mountains',
    name: 'Mountains',
    svg: svg(`<g id="sky"><rect width="200" height="200" rx="16" fill="#bfdbfe"/></g>
<g id="back"><path d="M0 170 L70 70 L130 150 Z" fill="#64748b"/></g>
<g id="front"><path d="M60 170 L130 50 L200 170 Z" fill="#475569"/><path d="M130 50 L148 80 L136 76 L126 86 L114 78 Z" fill="#f8fafc"/></g>
<g id="ground"><rect y="166" width="200" height="34" fill="#16a34a"/></g>`),
  },
];

const ICONS: Asset[] = [
  {
    id: 'bell',
    name: 'Bell',
    svg: svg(`<g id="bell"><path d="M100 28 C66 28 54 56 54 86 V122 L40 142 H160 L146 122 V86 C146 56 134 28 100 28 Z" fill="#fbbf24"/><circle cx="100" cy="158" r="14" fill="#f59e0b"/></g>
<g id="badge"><circle cx="148" cy="46" r="20" fill="#ef4444"/></g>`),
  },
  {
    id: 'pin',
    name: 'Location pin',
    svg: svg(`<g id="shadow"><ellipse cx="100" cy="182" rx="34" ry="8" fill="#000" opacity="0.15"/></g>
<g id="pin"><path d="M100 176 C100 176 44 116 44 76 C44 44 70 20 100 20 C130 20 156 44 156 76 C156 116 100 176 100 176 Z" fill="#ef4444"/><circle cx="100" cy="76" r="22" fill="#fff"/></g>`),
  },
  {
    id: 'check',
    name: 'Check badge',
    svg: svg(`<g id="circle"><circle cx="100" cy="100" r="76" fill="#22c55e"/></g>
<g id="check"><path d="M64 102 L90 128 L140 74" fill="none" stroke="#fff" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/></g>`),
  },
  {
    id: 'play',
    name: 'Play button',
    svg: svg(`<g id="button"><rect x="20" y="40" width="160" height="120" rx="30" fill="#ef4444"/></g>
<g id="triangle"><path d="M84 70 L134 100 L84 130 Z" fill="#fff"/></g>`),
  },
  {
    id: 'envelope',
    name: 'Mail',
    svg: svg(`<g id="envelope"><rect x="24" y="50" width="152" height="104" rx="12" fill="#6366f1"/></g>
<g id="flap"><path d="M28 58 L100 112 L172 58" fill="none" stroke="#e0e7ff" stroke-width="8" stroke-linejoin="round"/></g>`),
  },
  {
    id: 'gear',
    name: 'Gear',
    svg: svg(`<g id="gear"><path d="M88 20 H112 L116 42 L134 50 L152 36 L168 52 L154 70 L162 88 L184 92 V116 L162 120 L154 138 L168 156 L152 172 L134 158 L116 166 L112 188 H88 L84 166 L66 158 L48 172 L32 156 L46 138 L38 120 L16 116 V92 L38 88 L46 70 L32 52 L48 36 L66 50 L84 42 Z" fill="#64748b"/><circle cx="100" cy="104" r="28" fill="#f1f5f9"/></g>`),
  },
];

export const ASSET_CATEGORIES: AssetCategory[] = [
  { id: 'characters', name: 'Characters', icon: 'user', assets: CHARACTERS },
  { id: 'business', name: 'Business', icon: 'chart', assets: BUSINESS },
  { id: 'devices', name: 'Devices', icon: 'device', assets: DEVICES },
  { id: 'food', name: 'Food & drinks', icon: 'cup', assets: FOOD },
  { id: 'nature', name: 'Nature', icon: 'leaf', assets: NATURE },
  { id: 'icons', name: 'Icons', icon: 'bell', assets: ICONS },
];
