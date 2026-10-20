"use client";

export type CaptureMeasurement = { label: string; value: string; unit: string };
export function CaptureMeasurements({ title, rows, setRows }: {
  title: string;
  rows: CaptureMeasurement[];
  setRows: (rows: CaptureMeasurement[]) => void;
}) {
  return <fieldset className="span-2"><legend>{title}</legend>
    {rows.map((row, index) => <div className="record-grid" key={index}>
      {(["label", "value", "unit"] as const).map(key => <label key={key}>
        {{ label: "Concepto", value: "Valor", unit: "Unidad declarada (opcional)" }[key]}
        <input aria-label={`${title} ${index + 1} ${key}`} type={key === "value" ? "number" : "text"} min={key === "value" ? 0 : undefined} step="any" maxLength={100}
          value={row[key]} required={key !== "unit"}
          onChange={event => setRows(rows.map((value, position) => position === index ? { ...value, [key]: event.target.value } : value))}/>
      </label>)}
      <button type="button" onClick={() => setRows(rows.filter((_, position) => position !== index))}>Quitar {title.toLowerCase()} {index + 1}</button>
    </div>)}
    <button type="button" onClick={() => setRows([...rows, { label: "", value: "", unit: "" }])}>Añadir {title.toLowerCase()}</button>
    <p>Registra sólo lo observado en esta guardia. Sin unidad declarada, el sistema no convierte ni suma entre unidades distintas.</p>
  </fieldset>;
}
