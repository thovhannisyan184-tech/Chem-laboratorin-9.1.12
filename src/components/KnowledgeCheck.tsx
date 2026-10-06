import React, { useState } from 'react';
import { CheckCircle2, HelpCircle, RotateCcw, Sparkles, AlertCircle } from 'lucide-react';

interface KnowledgeCheckProps {
  isUnlocked: boolean;
  onUnlockEarly: () => void;
}

interface SlotState {
  eq1_1: string; // Na2SO3
  eq1_2: string; // H2SO4
  eq1_3: string; // Na2SO4
  eq1_4: string; // H2O
  eq1_5: string; // SO2
  eq2_1: string; // SO2
  eq2_2: string; // H2O
  eq2_3: string; // H2SO3
}

const EXPECTED_ANSWERS: Record<keyof SlotState, string[]> = {
  eq1_1: ['NA2SO3', 'NA₂SO₃', '1NA2SO3', '1NA₂SO₃'],
  eq1_2: ['H2SO4', 'H₂SO₄', '1H2SO4', '1H₂SO₄'],
  eq1_3: ['NA2SO4', 'NA₂SO₄', '1NA2SO4', '1NA₂SO₄'],
  eq1_4: ['H2O', 'H₂O', '1H2O', '1H₂O'],
  eq1_5: ['SO2', 'SO₂', '1SO2', '1SO₂'],
  eq2_1: ['SO2', 'SO₂', '1SO2', '1SO₂'],
  eq2_2: ['H2O', 'H₂O', '1H2O', '1H₂O'],
  eq2_3: ['H2SO3', 'H₂SO₃', '1H2SO3', '1H₂SO₃'],
};

const FORMULA_BANK = [
  { label: 'Na₂SO₃', name: 'Նատրիումի սուլֆիտ' },
  { label: 'H₂SO₄', name: 'Ծծմբական թթու' },
  { label: 'Na₂SO₄', name: 'Նատրիումի սուլֆատ' },
  { label: 'H₂O', name: 'Ջուր' },
  { label: 'SO₂', name: 'Ծծմբի (IV) օքսիդ' },
  { label: 'H₂SO₃', name: 'Ծծմբային թթու' },
];

function normalizeFormula(val: string): string {
  return val.trim().replace(/\s+/g, '').toUpperCase();
}

export const KnowledgeCheck: React.FC<KnowledgeCheckProps> = ({
  isUnlocked,
  onUnlockEarly,
}) => {
  const [slots, setSlots] = useState<SlotState>({
    eq1_1: '',
    eq1_2: '',
    eq1_3: '',
    eq1_4: '',
    eq1_5: '',
    eq2_1: '',
    eq2_2: '',
    eq2_3: '',
  });

  const [activeSlotKey, setActiveSlotKey] = useState<keyof SlotState>('eq1_1');
  const [checked, setChecked] = useState(false);

  const isSlotCorrect = (key: keyof SlotState): boolean => {
    const norm = normalizeFormula(slots[key]);
    return EXPECTED_ANSWERS[key].includes(norm);
  };

  const allCorrect = (Object.keys(EXPECTED_ANSWERS) as (keyof SlotState)[]).every(
    (k) => isSlotCorrect(k)
  );

  const handleChangeSlot = (key: keyof SlotState, value: string) => {
    setChecked(false);
    setSlots((prev) => ({ ...prev, [key]: value }));
  };

  const handleDropOrClickChip = (formula: string) => {
    setChecked(false);
    setSlots((prev) => {
      const updated = { ...prev, [activeSlotKey]: formula };
      // Automatically advance focus to the next empty slot
      const keys = Object.keys(prev) as (keyof SlotState)[];
      const nextEmpty = keys.find((k) => k !== activeSlotKey && !updated[k]);
      if (nextEmpty) {
        setActiveSlotKey(nextEmpty);
      }
      return updated;
    });
  };

  const handleFillHint = () => {
    setChecked(false);
    setSlots({
      eq1_1: 'Na₂SO₃',
      eq1_2: 'H₂SO₄',
      eq1_3: 'Na₂SO₄',
      eq1_4: 'H₂O',
      eq1_5: 'SO₂',
      eq2_1: 'SO₂',
      eq2_2: 'H₂O',
      eq2_3: 'H₂SO₃',
    });
  };

  const handleReset = () => {
    setChecked(false);
    setSlots({
      eq1_1: '',
      eq1_2: '',
      eq1_3: '',
      eq1_4: '',
      eq1_5: '',
      eq2_1: '',
      eq2_2: '',
      eq2_3: '',
    });
    setActiveSlotKey('eq1_1');
  };

  if (!isUnlocked) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/75 p-5 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-sky-400">
              <HelpCircle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                6. Ստուգի՛ր գիտելիքներդ · Ռեակցիաների հավասարումների ստուգում
              </h2>
              <p className="text-xs text-slate-400">
                Այս բաժինն ավտոմատ կբացվի սիմուլյացիայի ավարտին (300 վայրկյանից հետո), կամ կարող եք բացել հիմա։
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onUnlockEarly}
            className="rounded-lg border border-sky-500/40 bg-sky-500/15 px-4 py-2 text-xs font-semibold text-sky-300 hover:bg-sky-500/25 transition-colors whitespace-nowrap"
          >
            Բացել «Ստուգի՛ր գիտելիքներդ» բաժինը
          </button>
        </div>
      </section>
    );
  }

  const renderSlotInput = (
    key: keyof SlotState,
    placeholder: string,
    widthClass = 'w-28'
  ) => {
    const isFocused = activeSlotKey === key;
    const correct = checked && isSlotCorrect(key);
    const wrong = checked && !isSlotCorrect(key);

    return (
      <input
        type="text"
        value={slots[key]}
        placeholder={placeholder}
        onFocus={() => setActiveSlotKey(key)}
        onChange={(e) => handleChangeSlot(key, e.target.value)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const droppedFormula = e.dataTransfer.getData('text/plain');
          if (droppedFormula) {
            handleChangeSlot(key, droppedFormula);
          }
        }}
        className={`${widthClass} rounded-lg border px-2.5 py-2 text-center font-mono text-sm font-bold transition-all focus:outline-none ${
          correct
            ? 'border-emerald-500 bg-emerald-950/50 text-emerald-300'
            : wrong
            ? 'border-rose-500 bg-rose-950/50 text-rose-300'
            : isFocused
            ? 'border-sky-400 bg-slate-800 text-white ring-2 ring-sky-500/30'
            : 'border-slate-700 bg-slate-950/80 text-slate-100 hover:border-slate-600'
        }`}
      />
    );
  };

  return (
    <section className="rounded-xl border border-sky-500/40 bg-slate-900/95 p-6 shadow-xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-lg font-bold text-white">
            Ստուգի՛ր գիտելիքներդ · Ռեակցիաների հավասարումների ստուգում
          </h2>
          <p className="mt-1 text-xs text-slate-300">
            Լրացրե՛ք երկու ռեակցիաների բաց թողնված նյութերը դատարկ վանդակներում (կարող եք Drag-and-Drop անել կամ սեղմել ներքևի քիմիական բանաձևերի վրա, կամ մուտքագրել ստեղնաշարով)։
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleFillHint}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors whitespace-nowrap"
          >
            Ցույց տալ ճիշտ պատասխանը
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors whitespace-nowrap"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Մաքրել</span>
          </button>
        </div>
      </div>

      {/* Draggable / Clickable Formula Bank */}
      <div className="mb-5 rounded-lg border border-slate-800 bg-slate-950/60 p-3.5">
        <div className="mb-2 text-xs font-medium text-slate-400">
          Քիմիական նյութերի բանկ (քաշե՛ք դատարկ վանդակի մեջ կամ սեղմե՛ք՝ ընտրված վանդակում տեղադրելու համար)․
        </div>
        <div className="flex flex-wrap gap-2">
          {FORMULA_BANK.map((item) => (
            <button
              key={item.label}
              type="button"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', item.label);
              }}
              onClick={() => handleDropOrClickChip(item.label)}
              className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-1.5 text-xs transition-all hover:border-sky-400 hover:bg-slate-800 cursor-grab active:cursor-grabbing"
            >
              <span className="font-mono font-bold text-sky-300">
                {item.label}
              </span>
              <span className="text-slate-400">· {item.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Equations Form */}
      <div className="space-y-5">
        {/* Equation 1 */}
        <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
          <div className="mb-2.5 text-xs font-semibold text-sky-400">
            1. Ռեակցիա #1 (#1 կենտրոնական փոսիկում՝ ծծմբի (IV) օքսիդի ստացումը)․
          </div>
          <div className="flex flex-wrap items-center gap-2.5 font-mono text-base">
            {renderSlotInput('eq1_1', '[Na₂SO₃]')}
            <span className="text-slate-400 font-bold">+</span>
            {renderSlotInput('eq1_2', '[H₂SO₄]')}
            <span className="text-sky-400 font-bold">→</span>
            {renderSlotInput('eq1_3', '[Na₂SO₄]')}
            <span className="text-slate-400 font-bold">+</span>
            {renderSlotInput('eq1_4', '[H₂O]', 'w-24')}
            <span className="text-slate-400 font-bold">+</span>
            <div className="flex items-center gap-1">
              {renderSlotInput('eq1_5', '[SO₂]', 'w-24')}
              <span className="text-lg font-bold text-amber-400">↑</span>
            </div>
          </div>
        </div>

        {/* Equation 2 */}
        <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
          <div className="mb-2.5 text-xs font-semibold text-sky-400">
            2. Ռեակցիա #2 (Հարևան փոսիկներում՝ SO₂ գազի լուծումը ջրում և թթվային միջավայրի առաջացումը)․
          </div>
          <div className="flex flex-wrap items-center gap-2.5 font-mono text-base">
            {renderSlotInput('eq2_1', '[SO₂]', 'w-28')}
            <span className="text-slate-400 font-bold">+</span>
            {renderSlotInput('eq2_2', '[H₂O]', 'w-28')}
            <span className="text-sky-400 font-bold text-lg">⇄</span>
            {renderSlotInput('eq2_3', '[H₂SO₃]', 'w-32')}
          </div>
        </div>
      </div>

      {/* Action & Feedback Footer */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-slate-800 pt-4">
        <button
          type="button"
          onClick={() => setChecked(true)}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-emerald-500 transition-colors cursor-pointer whitespace-nowrap"
        >
          <Sparkles className="h-4 w-4" />
          <span>Ստուգել հավասարումները</span>
        </button>

        {checked && (
          <div
            className={`flex items-center gap-2.5 rounded-lg border px-4 py-2.5 text-xs font-semibold ${
              allCorrect
                ? 'border-emerald-500/50 bg-emerald-950/40 text-emerald-300'
                : 'border-rose-500/50 bg-rose-950/40 text-rose-300'
            }`}
          >
            {allCorrect ? (
              <>
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                <span>
                  Գերազանց է։ Երկու քիմիական ռեակցիաների հավասարումներն էլ ճիշտ են լրացված։
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                <span>
                  Կան սխալ կամ չլրացված վանդակներ (նշված են կարմիրով)։ Ստուգե՛ք և փորձե՛ք կրկին։
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
