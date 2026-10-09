import { addDays, format, subDays } from 'date-fns';
import { createRng, type Rng } from './seed';
import { computeDerivedClinical } from '../domain/scores';
import type {
  Patient, Session, Clinician, GameResult, SlingshotMetrics,
  FlappyMetrics, WaterMetrics, TelemetryFrame, PrescribedExercise,
  EventMarker, MobilityLevel, AffectedSide, StrokeType, Hand,
} from './types';

const SEED = 42;
type Trajectory = 'improving' | 'plateau' | 'regressing' | 'irregular';

interface MockData {
  patients: Patient[];
  sessions: Session[];
  clinicians: Clinician[];
}

export function generateMockData(): MockData {
  const rng = createRng(SEED);

  const clinicians: Clinician[] = [
    { id: 'clin-001', name: 'Dr. Carmen Lopez', role: 'physician' },
    { id: 'clin-002', name: 'Fran Garcia (PT)', role: 'physiotherapist' },
    { id: 'clin-003', name: 'Ana Ruiz (OT)', role: 'occupational-therapist' },
  ];

  const mobilityLevels: MobilityLevel[] = ['agile', 'moderate', 'reduced'];
  const sides: AffectedSide[] = ['left', 'right'];
  const strokeTypes: StrokeType[] = ['ischemic', 'hemorrhagic'];

  const trajectories: Trajectory[] = [];
  for (let i = 0; i < 5; i++) trajectories.push('improving');
  for (let i = 0; i < 3; i++) trajectories.push('plateau');
  for (let i = 0; i < 3; i++) trajectories.push('regressing');
  for (let i = 0; i < 1; i++) trajectories.push('irregular');

  const shuffledTrajectories = rng.shuffle(trajectories);
  const patients: Patient[] = [];
  const allSessions: Session[] = [];

  for (let i = 0; i < 12; i++) {
    const patientId = `pat-${String(i + 1).padStart(3, '0')}`;
    const mobility = mobilityLevels[i % 3];
    const side = sides[i % 2];
    const trajectory = shuffledTrajectories[i];
    const strokeType = rng.pick(strokeTypes);
    const age = rng.nextInt(45, 82);
    const weeksOfData = rng.nextInt(8, 16);
    const totalSessions = rng.nextInt(15, 60);

    const referenceDate = new Date('2026-05-28');
    const strokeDate = subDays(referenceDate, weeksOfData * 7 + rng.nextInt(7, 30));
    const firstSessionDate = addDays(strokeDate, rng.nextInt(5, 14));

    const assignedClinicians = [clinicians[0].id];
    if (rng.next() > 0.4) assignedClinicians.push(rng.pick(clinicians.slice(1)).id);

    const sessions = generateSessions(
      rng, patientId, trajectory, totalSessions, firstSessionDate, referenceDate, side
    );

    const baselineSessionId = sessions[0].id;
    const exercises = generateExercises(rng, patientId, firstSessionDate, referenceDate);
    const events = generateEventMarkers(rng, patientId, firstSessionDate, referenceDate, exercises);

    patients.push({
      id: patientId,
      pseudonym: `PT-${String(rng.nextInt(1000, 9999))}`,
      subjectType: 'patient',
      age,
      sex: rng.pick(['M', 'F', 'other'] as const),
      strokeType,
      strokeDate: format(strokeDate, 'yyyy-MM-dd'),
      affectedSide: side,
      mobility,
      clinicianIds: assignedClinicians,
      baselineSessionId,
      prescribedExercises: exercises,
      eventMarkers: events,
    });

    allSessions.push(...sessions);
  }

  return { patients, sessions: allSessions, clinicians };
}

function generateSessions(
  rng: Rng, patientId: string, trajectory: Trajectory,
  count: number, startDate: Date, endDate: Date, affectedSide: AffectedSide
): Session[] {
  const totalDays = Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
  const sessions: Session[] = [];
  const usedDays = new Set<number>();

  let daysArr: number[] = [];
  if (trajectory === 'irregular') {
    let day = 0;
    while (daysArr.length < count && day < totalDays) {
      if (rng.next() > 0.3) {
        daysArr.push(day);
      }
      day++;
      if (rng.next() < 0.15) day += rng.nextInt(4, 12);
    }
  } else {
    const step = totalDays / count;
    for (let i = 0; i < count; i++) {
      let day = Math.floor(i * step + rng.nextFloat(-1, 1));
      day = Math.max(0, Math.min(totalDays - 1, day));
      while (usedDays.has(day) && day < totalDays) day++;
      if (day < totalDays) {
        usedDays.add(day);
        daysArr.push(day);
      }
    }
  }
  daysArr.sort((a, b) => a - b);

  for (let i = 0; i < daysArr.length; i++) {
    const progress = daysArr.length > 1 ? i / (daysArr.length - 1) : 0;
    const sessionDate = addDays(startDate, daysArr[i]);
    const isLast = i === daysArr.length - 1;

    const games = generateGameResults(rng, trajectory, progress, isLast);
    const derived = computeDerivedClinical(games);

    sessions.push({
      id: `sess-${patientId}-${String(i).padStart(3, '0')}`,
      patientId,
      date: format(sessionDate, 'yyyy-MM-dd'),
      handUsed: affectedSide as Hand,
      games,
      derived,
    });
  }

  return sessions;
}

function trajectoryMultiplier(trajectory: Trajectory, progress: number, rng: Rng): number {
  const noise = rng.nextFloat(-0.05, 0.05);
  switch (trajectory) {
    case 'improving': return 0.3 + progress * 0.6 + noise;
    case 'plateau': return 0.5 + noise * 2;
    case 'regressing': return 0.7 - progress * 0.4 + noise;
    case 'irregular': return rng.nextFloat(0.2, 0.8);
  }
}

function generateGameResults(rng: Rng, trajectory: Trajectory, progress: number, includeFrames: boolean): GameResult[] {
  const t = trajectoryMultiplier(trajectory, progress, rng);

  const slingshot: SlingshotMetrics = {
    maxPinchOpen: clamp(t * 0.9 + rng.nextFloat(-0.1, 0.1), 0, 1),
    maxPullDistance: clamp(t * 400 + rng.nextFloat(-50, 50), 50, 500),
    pullTremor: clamp((1 - t) * 5 + rng.nextFloat(-0.5, 0.5), 0.5, 6),
    accuracyRatio: clamp(t * 0.8 + rng.nextFloat(-0.1, 0.1), 0.05, 1),
    totalShots: rng.nextInt(8, 20),
  };

  const flappy: FlappyMetrics = {
    maxExtension: clamp(t * 0.85 + rng.nextFloat(-0.1, 0.1), 0.1, 1),
    maxFlexion: clamp(t * 0.9 + rng.nextFloat(-0.1, 0.1), 0.1, 1),
    activationCount: Math.round(clamp(t * 50 + rng.nextFloat(-5, 5), 5, 60)),
    fatigueIndex: clamp(-(1 - t) * 25 + rng.nextFloat(-3, 3), -30, 0),
    smoothnessJerk: clamp((1 - t) * 5 + rng.nextFloat(-0.5, 0.5), 0.5, 6),
  };

  const water: WaterMetrics = {
    maxSupination: clamp(t * 80 + rng.nextFloat(-5, 5), 10, 90),
    maxPronation: clamp(t * 75 + rng.nextFloat(-5, 5), 10, 90),
    smoothnessJerk: clamp((1 - t) * 5 + rng.nextFloat(-0.5, 0.5), 0.5, 6),
    waterAccuracy: clamp(t * 90 + rng.nextFloat(-5, 5), 10, 100),
    poisonError: clamp((1 - t) * 40 + rng.nextFloat(-5, 5), 0, 50),
    averagePouringTime: clamp((1 - t) * 4000 + 800 + rng.nextFloat(-200, 200), 500, 5000),
  };

  const games: GameResult[] = [
    { game: 'slingshot', durationMs: rng.nextInt(60000, 180000), metrics: slingshot },
    { game: 'flappy', durationMs: rng.nextInt(60000, 180000), metrics: flappy },
    { game: 'water', durationMs: rng.nextInt(60000, 180000), metrics: water },
  ];

  if (includeFrames) {
    games.forEach(g => {
      g.frames = generateFrames(rng, g);
    });
  }

  return games;
}

function generateFrames(rng: Rng, game: GameResult): TelemetryFrame[] {
  const frames: TelemetryFrame[] = [];
  const totalFrames = Math.floor(game.durationMs / 100);
  const frameCount = Math.min(totalFrames, 300);

  for (let i = 0; i < frameCount; i++) {
    const t = i / frameCount;
    const frame: TelemetryFrame = {
      timestamp: Math.floor(t * game.durationMs),
      phase: t < 0.1 ? 'warmup' : t > 0.9 ? 'cooldown' : 'active',
    };

    if (game.game === 'slingshot') {
      const m = game.metrics as SlingshotMetrics;
      frame.isPinching = rng.next() > 0.3;
      frame.pinchRatio = frame.isPinching ? m.maxPinchOpen * rng.nextFloat(0.5, 1) : 0;
      frame.pullX = rng.nextFloat(-m.maxPullDistance, m.maxPullDistance) * 0.5;
      frame.pullY = rng.nextFloat(-m.maxPullDistance, m.maxPullDistance) * 0.3;
      frame.score = Math.floor(t * m.totalShots * m.accuracyRatio);
    } else if (game.game === 'flappy') {
      const m = game.metrics as FlappyMetrics;
      frame.fistStrength = rng.nextFloat(1 - m.maxExtension, m.maxFlexion);
      frame.fistStrength *= 1 - (t * Math.abs(m.fatigueIndex) / 100);
    } else {
      const m = game.metrics as WaterMetrics;
      frame.pitcherRotationZ = rng.nextFloat(-m.maxPronation, m.maxSupination) * (Math.PI / 180);
      frame.round = Math.floor(t * 5) + 1;
      frame.glassTargetVolume = 70 + rng.nextFloat(-10, 10);
      frame.glassCurrentVolume = frame.glassTargetVolume * m.waterAccuracy / 100 * rng.nextFloat(0.8, 1.2);
      frame.glassPoisonVolume = m.poisonError * rng.nextFloat(0, 0.3);
    }

    frames.push(frame);
  }

  return frames;
}

function generateExercises(rng: Rng, _patientId: string, startDate: Date, endDate: Date): PrescribedExercise[] {
  const domains: PrescribedExercise['targetDomain'][] = ['proximal-grip', 'distal-flex-ext', 'prono-supination'];
  const exerciseNames: Record<string, string[]> = {
    'proximal-grip': ['Pinza con resistencia', 'Apertura progresiva', 'Agarre de masa'],
    'distal-flex-ext': ['Flexión con banda', 'Extensión activa', 'Puño-apertura repetido'],
    'prono-supination': ['Giros con peso', 'Prono-supinación libre', 'Vertido controlado'],
  };

  const count = rng.nextInt(2, 5);
  const exercises: PrescribedExercise[] = [];

  for (let i = 0; i < count; i++) {
    const domain = domains[i % 3];
    const names = exerciseNames[domain];
    const name = rng.pick(names);
    const exStart = addDays(startDate, rng.nextInt(0, 14));
    const hasEnd = rng.next() > 0.5;
    const exEnd = hasEnd ? addDays(exStart, rng.nextInt(21, 60)) : undefined;
    const actualEnd = exEnd && exEnd < endDate ? exEnd : endDate;

    const adherenceLog: { date: string; completed: boolean }[] = [];
    let day = exStart;
    while (day <= actualEnd) {
      if (rng.next() > 0.25) {
        adherenceLog.push({ date: format(day, 'yyyy-MM-dd'), completed: rng.next() > 0.2 });
      }
      day = addDays(day, 1);
    }

    exercises.push({
      id: `ex-${i}-${rng.nextInt(1000, 9999)}`,
      name,
      targetDomain: domain,
      frequencyPerWeek: rng.pick([3, 4, 5, 7]),
      intensity: rng.pick(['low', 'medium', 'high']),
      startDate: format(exStart, 'yyyy-MM-dd'),
      endDate: exEnd ? format(exEnd, 'yyyy-MM-dd') : undefined,
      adherenceLog,
    });
  }

  return exercises;
}

function generateEventMarkers(
  rng: Rng, _patientId: string, startDate: Date, endDate: Date,
  exercises: PrescribedExercise[]
): EventMarker[] {
  const markers: EventMarker[] = [];
  const types: EventMarker['type'][] = ['medication', 'exercise-change', 'botox', 'clinical-note', 'other'];
  const count = rng.nextInt(1, 6);

  for (let i = 0; i < count; i++) {
    const dayOffset = rng.nextInt(7, Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
    const date = addDays(startDate, dayOffset);
    const type = i === 0 && exercises.length > 1 ? 'exercise-change' : rng.pick(types);

    let label: string;
    switch (type) {
      case 'medication': label = rng.pick(['Inicio de Baclofeno', 'Ajuste de dosis', 'Cambio a Tizanidina']); break;
      case 'exercise-change': label = rng.pick(['Cambio de rutina de ejercicios', 'Aumento de intensidad', 'Nueva rutina']); break;
      case 'botox': label = 'Infiltración de toxina botulínica'; break;
      case 'clinical-note': label = rng.pick(['Revisión neurológica', 'Evaluación funcional', 'Control de evolución']); break;
      default: label = rng.pick(['Alta hospitalaria', 'Cambio de turno', 'Incorporación de cuidador']);
    }

    markers.push({
      id: `evt-${rng.nextInt(10000, 99999)}`,
      date: format(date, 'yyyy-MM-dd'),
      type,
      label,
    });
  }

  return markers.sort((a, b) => a.date.localeCompare(b.date));
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
