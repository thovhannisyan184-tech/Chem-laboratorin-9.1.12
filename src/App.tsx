import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  RotateCcw,
  Play,
  Pause,
  FastForward,
  Eye,
  Box,
  CheckCircle2,
  Circle,
  Atom,
  Timer,
} from 'lucide-react';
import {
  CameraPreset,
  LabStep,
  ObservationRecord,
  SafetyItemKey,
  SafetyState,
} from './types/lab';
import {
  createObservationRecord,
  formatTimer,
  getNearWellState,
  getFarWellState,
} from './utils/chemistryEngine';
import { SafetyPanel } from './components/SafetyPanel';
import { LabWorkbenchCanvas } from './components/LabWorkbenchCanvas';
import { ObservationTable } from './components/ObservationTable';
import { KnowledgeCheck } from './components/KnowledgeCheck';

export default function App() {
  // 1. Safety State (All 3 must be clicked to unlock lab equipment)
  const [safety, setSafety] = useState<SafetyState>({
    goggles: false,
    gloves: false,
    coat: false,
  });

  // 2. Sequential Lab Step State
  const [step, setStep] = useState<LabStep>('safety');

  // 3. Simulation Timer (0 to 300 seconds = 05:00)
  const [timeSeconds, setTimeSeconds] = useState<number>(0);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const [timeSpeed, setTimeSpeed] = useState<1 | 5 | 15 | 30>(5);

  // 4. 3D Camera & Molecule View Controls
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('perspective');
  const [showMolecules, setShowMolecules] = useState<boolean>(true);

  // 5. Observation Table Records
  const [records, setRecords] = useState<ObservationRecord[]>([]);
  const recordedAutoIntervalsRef = useRef<Set<number>>(new Set());

  // 6. Knowledge Check Unlock State
  const [knowledgeUnlocked, setKnowledgeUnlocked] = useState<boolean>(false);

  // 7. Live Feedback Banner
  const [feedback, setFeedback] = useState<{
    message: string;
    type: 'info' | 'success' | 'warning';
  }>({
    message:
      'Սկսելու համար ձախ վահանակում սեղմե՛ք բոլոր 3 անվտանգության պատկերակների վրա (Ակնոց, Ձեռնոց, Խալաթ)։',
    type: 'info',
  });

  const handleActionFeedback = useCallback(
    (message: string, type: 'info' | 'success' | 'warning' = 'info') => {
      setFeedback({ message, type });
    },
    []
  );

  // Toggle safety items and unlock step1_scoop when all 3 are active
  const handleToggleSafety = (key: SafetyItemKey) => {
    setSafety((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      const allActive = next.goggles && next.gloves && next.coat;

      if (allActive && step === 'safety') {
        setStep('step1_scoop');
        setFeedback({
          message:
            'Անվտանգության բոլոր պարագաները հագած են։ Լաբորատոր սարքավորումները հայտնվեցին սեղանին։ Քայլ 1․ Drag-and-Drop-ով վերցրե՛ք շպատելը և Na₂SO₃ տարայից վերցրե՛ք սպիտակ փոշին։',
          type: 'success',
        });
      } else if (!allActive && step !== 'safety') {
        // Keep safety active once lab has started, or inform user
        return prev;
      }
      return next;
    });
  };

  // Advance sequential steps
  const handleAdvanceStep = useCallback((nextStep: LabStep) => {
    setStep(nextStep);
    if (nextStep === 'diffusing') {
      setTimeSeconds(0);
      setIsTimerRunning(true);
      recordedAutoIntervalsRef.current = new Set([0]);
      const initialRec = createObservationRecord(0, true, true, true);
      setRecords([initialRec]);
    }
  }, []);

  // Digital Timer Loop (00:00 to 05:00 = 300s) + Automatic 30s Observation Recording
  useEffect(() => {
    if (!isTimerRunning || (step !== 'diffusing' && step !== 'completed')) {
      return;
    }

    const intervalMs = 100;
    const timer = setInterval(() => {
      setTimeSeconds((prev) => {
        const next = Math.min(300, prev + (intervalMs / 1000) * timeSpeed);

        // Check every 30-second milestone (30, 60, 90, 120, 150, 180, 210, 240, 270, 300)
        for (let milestone = 30; milestone <= 300; milestone += 30) {
          if (
            next >= milestone &&
            !recordedAutoIntervalsRef.current.has(milestone)
          ) {
            recordedAutoIntervalsRef.current.add(milestone);
            const autoRec = createObservationRecord(milestone, true, true, true);
            setRecords((curr) => [...curr, autoRec]);
          }
        }

        if (next >= 300) {
          setIsTimerRunning(false);
          setStep('completed');
          setKnowledgeUnlocked(true);
          setFeedback({
            message:
              'Սիմուլյացիան ավարտվեց (05:00 / 300 վրկ)։ Դիտարկե՛ք գույների գրադիենտը սալիկի վրա և լրացրե՛ք «Ստուգի՛ր գիտելիքներդ» բաժնի ռեակցիաների հավասարումները։',
            type: 'success',
          });
        }

        return next;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isTimerRunning, step, timeSpeed]);

  // Manual "Գրանցել" button handler
  const handleManualRecord = () => {
    const hasPowder =
      step !== 'safety' &&
      step !== 'step1_scoop' &&
      step !== 'step1_weigh' &&
      step !== 'step1_transfer';
    const hasAcid =
      step === 'step3_cover' || step === 'diffusing' || step === 'completed';

    const rec = createObservationRecord(timeSeconds, hasPowder, hasAcid, false);
    setRecords((curr) => [...curr, rec]);
    handleActionFeedback(
      `Գրանցվեց դիտարկում ${formatTimer(timeSeconds)} (${Math.round(
        timeSeconds
      )} վրկ) պահին։`,
      'info'
    );
  };

  // Jump +30 seconds helper during diffusion
  const handleJump30Seconds = () => {
    if (step !== 'diffusing' && step !== 'completed') return;
    setTimeSeconds((prev) => {
      const next = Math.min(300, Math.floor(prev / 30) * 30 + 30);
      if (!recordedAutoIntervalsRef.current.has(next)) {
        recordedAutoIntervalsRef.current.add(next);
        const autoRec = createObservationRecord(next, true, true, true);
        setRecords((curr) => [...curr, autoRec]);
      }
      if (next >= 300) {
        setIsTimerRunning(false);
        setStep('completed');
        setKnowledgeUnlocked(true);
      }
      return next;
    });
  };

  // Full Reset
  const handleResetLab = () => {
    setSafety({ goggles: false, gloves: false, coat: false });
    setStep('safety');
    setTimeSeconds(0);
    setIsTimerRunning(false);
    setRecords([]);
    recordedAutoIntervalsRef.current.clear();
    setKnowledgeUnlocked(false);
    setFeedback({
      message:
        'Սիմուլյատորը վերագործարկվեց։ Սեղմե՛ք ձախ վահանակի բոլոր 3 անվտանգության պատկերակների վրա՝ սկսելու համար։',
      type: 'info',
    });
  };

  const nearLive = getNearWellState(timeSeconds);
  const farLive = getFarWellState(timeSeconds);

  const stepList = [
    {
      id: 1,
      title: 'Քայլ 1․ Կշռում և ավելացում (Na₂SO₃)',
      desc: 'Շպատելով վերցրե՛ք Na₂SO₃ փոշին, դրե՛ք կշեռքի թերթոնին (0,1 գ) և լցրե՛ք կենտրոնական #1 փոսիկի մեջ։',
      done:
        step === 'step2_draw_acid' ||
        step === 'step2_add_acid' ||
        step === 'step3_cover' ||
        step === 'diffusing' ||
        step === 'completed',
      active:
        step === 'step1_scoop' ||
        step === 'step1_weigh' ||
        step === 'step1_transfer',
    },
    {
      id: 2,
      title: 'Քայլ 2․ Թթվի ավելացում (10% H₂SO₄)',
      desc: 'Պիպետով վերցրե՛ք 0,1 մլ 10% H₂SO₄ լուծույթ և կաթեցրե՛ք #1 փոսիկի մեջ (Na₂SO₃ փոշու վրա)։',
      done:
        step === 'step3_cover' || step === 'diffusing' || step === 'completed',
      active: step === 'step2_draw_acid' || step === 'step2_add_acid',
    },
    {
      id: 3,
      title: 'Քայլ 3․ Ծածկում թափանցիկ կափարիչով',
      desc: 'Վերցրե՛ք թափանցիկ պլաստիկե կափարիչը և ծածկե՛ք բազմափոսիկ սալիկը՝ SO₂-ի դիֆուզիան սկսելու համար։',
      done: step === 'diffusing' || step === 'completed',
      active: step === 'step3_cover',
    },
  ];

  return (
    <div className="min-h-screen bg-[#0B111E] text-slate-100 flex flex-col">
      {/* Top Bar Contract: Zone 1 (Brand) — Zone 2 (Nav Links) — Zone 3 (Primary Action) */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-800/90 bg-[#0B111E]/95 px-6 py-3.5 backdrop-blur-md">
        <a
          href="#workbench"
          className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap"
        >
          Քիմիա 8 · Վիրտուալ Լաբորատորիա
        </a>

        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-300">
          <a
            href="#workbench"
            className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap"
          >
            Լաբորատոր սեղան
          </a>
          <a
            href="#diffusion-guide"
            className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap"
          >
            Ֆիզիկաքիմիական ընթացք
          </a>
          <a
            href="#observations"
            className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap"
          >
            Դիտարկումների աղյուսակ
          </a>
          <a
            href="#knowledge-check"
            className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap"
          >
            Ստուգի՛ր գիտելիքներդ
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleResetLab}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/90 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition-colors whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Սկսել նորից</span>
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-5 sm:px-6 space-y-6">
        {/* Title & Topic Header */}
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div>
            <div className="text-xs font-medium text-sky-400">
              8-րդ դասարանի քիմիա · Գործնական աշխատանք · § 1.9
            </div>
            <h1 className="mt-1 font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Ծծմբի (IV) օքսիդի տարածման ուսումնասիրություն
            </h1>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span>Նյութեր՝ Na₂SO₃ (պինդ) · 10% H₂SO₄ · Մեթիլ նարնջագույն</span>
          </div>
        </div>

        {/* Two-Zone Sandbox Layout: Left Control & Safety Deck + Right 3D Workbench Stage */}
        <div
          id="workbench"
          className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start"
        >
          {/* Left Column (4 cols on lg): Safety Icons + Sequential Steps + Live Color Gradient */}
          <div className="lg:col-span-4 space-y-5">
            {/* 1. Safety Checklist Panel */}
            <SafetyPanel
              safety={safety}
              onToggleSafety={handleToggleSafety}
            />

            {/* 2. Interactive User Actions Sequence */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 shadow-lg">
              <h2 className="mb-3 border-b border-slate-800 pb-2.5 text-sm font-bold text-white">
                2. Գործողությունների հաջորդականություն
              </h2>
              <div className="space-y-3">
                {stepList.map((st) => (
                  <div
                    key={st.id}
                    className={`rounded-lg border p-3 transition-all ${
                      st.done
                        ? 'border-emerald-500/40 bg-emerald-950/20'
                        : st.active
                        ? 'border-sky-500/70 bg-sky-950/30 ring-1 ring-sky-500/30'
                        : 'border-slate-800 bg-slate-950/40 opacity-65'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-white">
                        {st.title}
                      </span>
                      {st.done ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                      ) : (
                        <Circle
                          className={`h-4 w-4 shrink-0 ${
                            st.active ? 'text-sky-400' : 'text-slate-600'
                          }`}
                        />
                      )}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-300">
                      {st.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Physicochemical Diffusion & Color Gradient Reference */}
            <div
              id="diffusion-guide"
              className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 shadow-lg space-y-3"
            >
              <h2 className="border-b border-slate-800 pb-2.5 text-sm font-bold text-white">
                3. Ֆիզիկաքիմիական գործընթաց և գույնի գրադիենտ
              </h2>

              <div className="space-y-2 text-xs text-slate-300">
                <div className="rounded-lg bg-slate-950/70 p-2.5 font-mono text-[11px] text-sky-300">
                  Ռեակցիա #1 (#1 փոսիկում)․
                  <div className="mt-1 text-white font-bold">
                    Na₂SO₃ + H₂SO₄ → Na₂SO₄ + H₂O + SO₂↑
                  </div>
                </div>
                <div className="rounded-lg bg-slate-950/70 p-2.5 font-mono text-[11px] text-sky-300">
                  Ռեակցիա #2 (Հարևան #2–#9 փոսիկներում)․
                  <div className="mt-1 text-white font-bold">
                    SO₂ + H₂O ⇄ H₂SO₃ (pH-ը նվազում է)
                  </div>
                </div>
              </div>

              {/* Live Comparison of Near vs Far Wells */}
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
                  <div className="text-[11px] text-slate-400">
                    Մոտ փոսիկներ (#2, #4, #6, #8)
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span
                      className="h-5 w-5 shrink-0 rounded-full border border-white/30"
                      style={{ backgroundColor: nearLive.colorHex }}
                    />
                    <div className="min-w-0">
                      <div className="truncate text-xs font-bold text-white font-mono">
                        {nearLive.colorHex}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        pH ≈ {nearLive.pH}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
                  <div className="text-[11px] text-slate-400">
                    Հեռու փոսիկներ (#3, #5, #7, #9)
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span
                      className="h-5 w-5 shrink-0 rounded-full border border-white/30"
                      style={{ backgroundColor: farLive.colorHex }}
                    />
                    <div className="min-w-0">
                      <div className="truncate text-xs font-bold text-white font-mono">
                        {farLive.colorHex}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        pH ≈ {farLive.pH}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column (8 cols on lg): Digital Timer Bar + 3D Interactive Canvas Stage */}
          <div className="lg:col-span-8 space-y-4">
            {/* Top HUD Bar: Digital Timer (00:00 -> 05:00) + Speed Controls + 3D View Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/95 px-4 py-3 shadow-lg">
              {/* Digital Stopwatch */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-slate-950 px-3.5 py-1.5">
                  <Timer className="h-4 w-4 text-emerald-400" />
                  <span className="font-mono text-xl font-bold tracking-wider text-emerald-400 tabular-nums">
                    {formatTimer(timeSeconds)}
                  </span>
                  <span className="font-mono text-xs text-slate-400">
                    / 05:00 ({Math.round(timeSeconds)} վրկ)
                  </span>
                </div>

                {/* Timer Playback & Speed Controls (active once covered) */}
                {(step === 'diffusing' || step === 'completed') && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setIsTimerRunning((r) => !r)}
                      disabled={timeSeconds >= 300}
                      className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-40 cursor-pointer"
                    >
                      {isTimerRunning ? (
                        <>
                          <Pause className="h-3.5 w-3.5 text-amber-400" />
                          <span>Դադար</span>
                        </>
                      ) : (
                        <>
                          <Play className="h-3.5 w-3.5 text-emerald-400" />
                          <span>Շարունակել</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleJump30Seconds}
                      disabled={timeSeconds >= 300}
                      className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-sky-300 hover:bg-slate-700 disabled:opacity-40 cursor-pointer whitespace-nowrap"
                      title="Անցնել հաջորդ 30 վայրկյանին"
                    >
                      <FastForward className="h-3.5 w-3.5" />
                      <span>+30 վրկ</span>
                    </button>

                    <div className="flex items-center rounded-lg border border-slate-800 bg-slate-950 p-0.5">
                      {([1, 5, 15, 30] as const).map((spd) => (
                        <button
                          key={spd}
                          type="button"
                          onClick={() => setTimeSpeed(spd)}
                          className={`rounded-md px-2 py-1 font-mono text-[11px] font-semibold transition-colors cursor-pointer ${
                            timeSpeed === spd
                              ? 'bg-sky-600 text-white'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {spd}x
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 3D Camera Angle & Molecular Particle Toggle */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center rounded-lg border border-slate-800 bg-slate-950 p-1">
                  <button
                    type="button"
                    onClick={() => setCameraPreset('perspective')}
                    className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      cameraPreset === 'perspective'
                        ? 'bg-slate-800 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Box className="h-3.5 w-3.5 text-sky-400" />
                    <span>3D տեսք</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCameraPreset('top')}
                    className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      cameraPreset === 'top'
                        ? 'bg-slate-800 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Eye className="h-3.5 w-3.5 text-sky-400" />
                    <span>Վերևից</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCameraPreset('closeup')}
                    className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      cameraPreset === 'closeup'
                        ? 'bg-slate-800 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>Մոտիկից</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowMolecules((m) => !m)}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    showMolecules
                      ? 'border-sky-500/50 bg-sky-500/15 text-sky-300'
                      : 'border-slate-800 bg-slate-950 text-slate-400'
                  }`}
                >
                  <Atom className="h-3.5 w-3.5" />
                  <span>SO₂ մասնիկներ</span>
                </button>
              </div>
            </div>

            {/* Contextual Instruction & Feedback Banner */}
            <div
              className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs font-medium ${
                feedback.type === 'success'
                  ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-200'
                  : feedback.type === 'warning'
                  ? 'border-amber-500/40 bg-amber-950/30 text-amber-200'
                  : 'border-sky-500/40 bg-sky-950/30 text-sky-200'
              }`}
            >
              <span>{feedback.message}</span>
              {(step === 'diffusing' || step === 'completed') && (
                <span className="shrink-0 font-mono text-xs font-bold text-white">
                  {timeSeconds < 30
                    ? 'Փուլ 1․ Սկզբնական տարածում (0–30 վրկ)'
                    : timeSeconds < 120
                    ? 'Փուլ 2․ Մոտ փոսիկների կարմրում (30–120 վրկ)'
                    : timeSeconds < 300
                    ? 'Փուլ 3․ Հեռավոր փոսիկների գունափոխում (120–300 վրկ)'
                    : 'Ավարտված է (300 վրկ)'}
                </span>
              )}
            </div>

            {/* 3D Interactive Canvas Stage */}
            <LabWorkbenchCanvas
              safety={safety}
              step={step}
              timeSeconds={timeSeconds}
              cameraPreset={cameraPreset}
              showMolecules={showMolecules}
              onAdvanceStep={handleAdvanceStep}
              onActionFeedback={handleActionFeedback}
            />
          </div>
        </div>

        {/* Section 5: Observation Table */}
        <div id="observations">
          <ObservationTable
            records={records}
            canRecord={safety.goggles && safety.gloves && safety.coat}
            currentTimeFormatted={formatTimer(timeSeconds)}
            onManualRecord={handleManualRecord}
            onClearManualRecords={() =>
              setRecords((curr) => curr.filter((r) => r.isAuto))
            }
          />
        </div>

        {/* Section 6: Knowledge Check (Reaction Equations Verification) */}
        <div id="knowledge-check">
          <KnowledgeCheck
            isUnlocked={knowledgeUnlocked}
            onUnlockEarly={() => setKnowledgeUnlocked(true)}
          />
        </div>
      </main>
    </div>
  );
}
