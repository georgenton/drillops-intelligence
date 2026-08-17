export const geologyReferenceVersion = "Referencia mineralógica v1 · 17-ago-2026";

export const geologyReference = [
  { lithology: "Toba", typicalMinerals: "Vidrio volcánico, feldespato, cuarzo", mineralMohsRange: "2–7", note: "Muy variable; requiere declaración del geólogo." },
  { lithology: "Diorita", typicalMinerals: "Plagioclasa, hornblenda, piroxeno", mineralMohsRange: "5–7", note: "Rango mineralógico orientativo, no dureza única de roca." },
  { lithology: "Andesita", typicalMinerals: "Plagioclasa, piroxeno, anfíbol", mineralMohsRange: "5–6,5", note: "Confirmar alteración y mineral dominante en campo." },
  { lithology: "Cuarcita", typicalMinerals: "Cuarzo dominante", mineralMohsRange: "≈7", note: "La textura y fracturación afectan la perforabilidad." },
] as const;
