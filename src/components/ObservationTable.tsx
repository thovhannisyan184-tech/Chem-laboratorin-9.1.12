import React from 'react';
import { Pipette, Clock, Trash2 } from 'lucide-react';
import { ObservationRecord } from '../types/lab';

interface ObservationTableProps {
  records: ObservationRecord[];
  canRecord: boolean;
  currentTimeFormatted: string;
  onManualRecord: () => void;
  onClearManualRecords: () => void;
}

export const ObservationTable: React.FC<ObservationTableProps> = ({
  records,
  canRecord,
  currentTimeFormatted,
  onManualRecord,
  onClearManualRecords,
}) => {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 shadow-lg">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
        <div>
          <h2 className="text-base font-bold text-white">
            Դիտարկումների աղյուսակ (SO₂-ի տարածման և գույնի փոփոխության գրանցում)
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Աղյուսակը լրացվում է ավտոմատ յուրաքանչյուր 30 վայրկյանը մեկ, կամ սեղմե՛ք «Գրանցել» կոճակը՝ տվյալ պահի գույնը աղյուսակում կաթեցնելու համար։
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onManualRecord}
            disabled={!canRecord}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all whitespace-nowrap ${
              canRecord
                ? 'bg-sky-600 text-white hover:bg-sky-500 shadow-sm cursor-pointer'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
            }`}
          >
            <Pipette className="h-4 w-4 shrink-0" />
            <span>Գրանցել ({currentTimeFormatted})</span>
          </button>

          {records.length > 0 && (
            <button
              type="button"
              onClick={onClearManualRecords}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors whitespace-nowrap"
              title="Մաքրել ձեռքով ավելացված գրանցումները"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Մաքրել ձեռքով գրանցվածները</span>
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-300">
              <th className="py-3 px-4 font-semibold">Ժամանակ</th>
              <th className="py-3 px-4 font-semibold">
                Փոսիկ #1 (Գույն / Վիճակ · Կենտրոն)
              </th>
              <th className="py-3 px-4 font-semibold">
                Փոսիկ #2 (Գույն · Մոտ՝ #2, #4, #6, #8)
              </th>
              <th className="py-3 px-4 font-semibold">
                Փոսիկ #3 (Գույն · Հեռու՝ #3, #5, #7, #9)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {records.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-slate-400">
                  Դիտարկումների գրանցումը կսկսվի Քայլ 3-ում կափարիչը տեղադրելուց հետո (կամ սեղմե՛ք «Գրանցել» կոճակը)։
                </td>
              </tr>
            ) : (
              records.map((rec) => (
                <tr
                  key={rec.id}
                  className="transition-colors hover:bg-slate-800/40"
                >
                  {/* Column 1: Time */}
                  <td className="py-3 px-4 font-mono font-semibold text-white whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                      <span>
                        {rec.formattedTime}{' '}
                        <span className="text-slate-400 font-normal">
                          ({rec.timeSeconds} վրկ)
                        </span>
                      </span>
                      <span className="text-[11px] font-sans font-normal text-slate-400">
                        · {rec.isAuto ? 'Ավտոմատ' : 'Ձեռքով'}
                      </span>
                    </div>
                  </td>

                  {/* Column 2: Well #1 */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="h-5 w-5 shrink-0 rounded-full border border-white/25 shadow-inner"
                        style={{ backgroundColor: rec.well1State.colorHex }}
                      />
                      <div>
                        <div className="font-medium text-slate-100">
                          {rec.well1State.label}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {rec.well1State.subtext}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Column 3: Well #2 (Near wells #2, #4, #6, #8) */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="h-5 w-5 shrink-0 rounded-full border border-white/25 shadow-inner"
                        style={{ backgroundColor: rec.well2State.colorHex }}
                      />
                      <div>
                        <div className="font-medium text-slate-100">
                          {rec.well2State.label}
                        </div>
                        <div className="font-mono text-[11px] text-slate-400">
                          {rec.well2State.colorHex} · pH {rec.well2State.pH}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Column 4: Well #3 (Far wells #3, #5, #7, #9) */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="h-5 w-5 shrink-0 rounded-full border border-white/25 shadow-inner"
                        style={{ backgroundColor: rec.well3State.colorHex }}
                      />
                      <div>
                        <div className="font-medium text-slate-100">
                          {rec.well3State.label}
                        </div>
                        <div className="font-mono text-[11px] text-slate-400">
                          {rec.well3State.colorHex} · pH {rec.well3State.pH}
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};
