export default function GameArtwork({ slug }: { slug: string }) {
  if (!["snake", "2048", "razlom"].includes(slug)) return <svg className={`game-artwork game-artwork-${slug}`} viewBox="0 0 320 168" fill="none" aria-hidden="true"><ArcadeArtwork slug={slug} /></svg>;
  return (
    <svg className={`game-artwork game-artwork-${slug}`} viewBox="0 0 320 168" fill="none" aria-hidden="true">
      {slug === "snake" ? <>
        <path d="M35 31H285M35 66H285M35 101H285M35 136H285M55 20V151M90 20V151M125 20V151M160 20V151M195 20V151M230 20V151M265 20V151" stroke="currentColor" opacity=".08" />
        <path d="M75 119H138V54H200V87H248" stroke="#141414" strokeWidth="29" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M75 113H138V48H200V81H248" stroke="#00f076" strokeWidth="25" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="253" cy="77" r="3" fill="#141414" />
        <circle cx="253" cy="85" r="3" fill="#141414" />
        <rect x="69" y="40" width="20" height="20" rx="6" transform="rotate(14 79 50)" fill="#ff3a44" />
      </> : slug === "2048" ? <>
        <g transform="rotate(-8 160 84)">
          <rect x="66" y="26" width="65" height="65" rx="13" fill="#ffe000" /><text x="98.5" y="68" textAnchor="middle" fill="#141414" fontSize="26" fontFamily="Archivo Black, Arial" fontWeight="700">8</text>
          <rect x="140" y="26" width="65" height="65" rx="13" fill="#ece8dc" /><text x="172.5" y="68" textAnchor="middle" fill="#141414" fontSize="26" fontFamily="Archivo Black, Arial" fontWeight="700">16</text>
          <rect x="103" y="99" width="65" height="65" rx="13" fill="#ff3a44" /><text x="135.5" y="141" textAnchor="middle" fill="#fff6ef" fontSize="26" fontFamily="Archivo Black, Arial" fontWeight="700">4</text>
          <rect x="179" y="90" width="77" height="77" rx="16" fill="#ff7a1f" /><text x="217.5" y="139" textAnchor="middle" fill="#141414" fontSize="30" fontFamily="Archivo Black, Arial" fontWeight="700">32</text>
        </g>
      </> : <>
        {[0, 1, 2].map(row => [0, 1, 2, 3, 4].map(col => <rect key={`${row}-${col}`} x={47 + col * 47} y={25 + row * 24} width="39" height="16" rx="4" fill={row === 0 ? "#ff3a44" : row === 1 ? "#ffe000" : "#00d2ff"} opacity={row === 2 && col === 2 ? 0 : 1} />))}
        <path d="M126 145L185 107L166 79" stroke="#141414" strokeWidth="2" strokeDasharray="4 5" opacity=".55" />
        <circle cx="185" cy="107" r="8" fill="#ece8dc" />
        <rect x="96" y="145" width="72" height="9" rx="4.5" fill="#00f076" />
      </>}
    </svg>
  );
}

function ArcadeArtwork({ slug }: { slug: string }) {
  if (slug === "pong") return <>
    <path d="M160 15V153" stroke="#555" strokeWidth="3" strokeDasharray="7 8" />
    <rect x="55" y="66" width="13" height="66" rx="6" fill="#00f076" /><rect x="252" y="25" width="13" height="66" rx="6" fill="#ff3a44" />
    <path d="M90 118L220 54" stroke="currentColor" opacity=".3" strokeDasharray="5 5" /><circle cx="185" cy="70" r="12" fill="#ffe000" />
  </>;
  if (slug === "reaction") return <>
    <circle cx="160" cy="90" r="56" fill="#00f076" stroke="#141414" strokeWidth="5" /><path d="M160 55V91L184 107M145 18H175M160 18V33" stroke="#141414" strokeWidth="7" strokeLinecap="round" />
    <path d="M71 54L85 67M235 58L249 45" stroke="#ff3a44" strokeWidth="8" strokeLinecap="round" />
  </>;
  if (slug === "simon") return <>
    {["#00f076", "#ff3a44", "#ffe000", "#00d2ff"].map((color, i) => <rect key={color} x={88 + i % 2 * 77} y={15 + Math.floor(i / 2) * 77} width="68" height="68" rx="15" fill={color} opacity={i === 2 ? 1 : .55} />)}
    <path d="M109 125H133M121 113V137" stroke="#141414" strokeWidth="5" />
  </>;
  if (slug === "memory") return <>
    {[0, 1, 2, 3].map(i => <g key={i} transform={`translate(${41 + i * 62},${i % 2 ? 42 : 21}) rotate(${i % 2 ? 8 : -8} 27 48)`}><rect width="52" height="94" rx="9" fill={i === 0 || i === 3 ? "#ffe000" : "#ece8dc"} stroke="#141414" strokeWidth="3" /><text x="26" y="60" textAnchor="middle" fill="#141414" fontSize="33">{i === 0 || i === 3 ? "★" : "?"}</text></g>)}
  </>;
  if (slug === "whack-a-mole") return <>
    {[0, 1, 2, 3, 4, 5].map(i => <ellipse key={i} cx={78 + i % 3 * 82} cy={75 + Math.floor(i / 3) * 63} rx="30" ry="12" fill="#141414" opacity=".8" />)}
    <path d="M137 72V51C137 21 183 21 183 51V72" fill="#b27c45" /><circle cx="150" cy="47" r="4" fill="#141414" /><circle cx="170" cy="47" r="4" fill="#141414" /><ellipse cx="160" cy="60" rx="8" ry="5" fill="#ff797f" />
  </>;
  if (slug === "word-scramble") return <>
    {["И", "Г", "Р", "А"].map((letter, i) => <g key={letter} transform={`translate(${36 + i * 64},${50 + (i % 2 ? -13 : 8)}) rotate(${i % 2 ? 7 : -7} 28 30)`}><rect width="56" height="66" rx="9" fill={i % 2 ? "#ffe000" : "#00f076"} stroke="#141414" strokeWidth="3" /><text x="28" y="47" textAnchor="middle" fill="#141414" fontFamily="Arial" fontWeight="700" fontSize="39">{letter}</text></g>)}
  </>;
  if (slug === "tic-tac-toe") return <>
    <path d="M133 20V149M186 20V149M81 63H239M81 106H239" stroke="#141414" strokeWidth="4" />
    <path d="M94 30L119 54M119 30L94 54M149 73L173 98M173 73L149 98M199 116L224 141M224 116L199 141" stroke="#00ba64" strokeWidth="7" strokeLinecap="round" />
    <circle cx="211" cy="42" r="13" stroke="#ff3a44" strokeWidth="7" /><circle cx="107" cy="128" r="13" stroke="#ff3a44" strokeWidth="7" />
  </>;
  if (slug === "connect-four") return <>
    <rect x="68" y="17" width="185" height="137" rx="12" fill="#202020" />
    {Array.from({ length: 30 }, (_, i) => <circle key={i} cx={89 + i % 6 * 29} cy={35 + Math.floor(i / 6) * 25} r="9" fill={i > 15 ? ["#00f076", "#ff3a44", "#00f076"][i % 3] : "#555"} />)}
    <path d="M118 135L204 60" stroke="#ffe000" strokeWidth="4" strokeLinecap="round" />
  </>;
  const mines = slug === "minesweeper", lights = slug === "lights-out";
  const columns = lights ? 5 : 4;
  return <>
    {Array.from({ length: columns * (lights ? 3 : 4) }, (_, i) => {
      const x = (320 - columns * 34) / 2 + i % columns * 34, y = 16 + Math.floor(i / columns) * 34;
      const visible = mines ? i < 10 : lights ? [1, 3, 5, 6, 9, 11].includes(i) : i !== 15;
      return <g key={i}><rect x={x} y={y} width="29" height="29" rx="4" fill={visible ? lights ? "#ffe000" : "#ece8dc" : "#383838"} stroke="#141414" /><text x={x + 14.5} y={y + 22} textAnchor="middle" fill="#141414" fontSize="19" fontFamily="Arial" fontWeight="700">{lights ? "" : mines ? i === 6 ? "⚑" : visible ? i % 3 || "" : "" : slug === "sudoku" ? [1, 0, 0, 4, 0, 4, 1, 0, 0, 1, 4, 0, 4, 0, 0, 1][i] || "" : i === 15 ? "" : i + 1}</text></g>;
    })}
  </>;
}
