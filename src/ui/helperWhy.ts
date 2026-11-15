// "Why?" for the robot's current hint while planning. Mirrors the order of checks in helperLine (helper.ts),
// so the answer always explains the line the robot is saying right now.
import { cellsAvailable, cfg, effectiveJobs, planTotal, today, type GameState } from '../engine';
import { zeroSols } from './helper';

export function helperWhy(s: GameState): string[] {
  if (s.phase !== 'plan') return [];
  const c = cfg(s), day = today(s), S = c.SYSTEMS;
  const free = cellsAvailable(s) - planTotal(s.plan), pc = s.plan.cells, jobs = effectiveJobs(s);
  const tired = s.crew.find((p) => p.cond === 'tired' && c.HEAVY_JOBS.includes(jobs[p.id]));
  const ill = s.crew.find((p) => p.sick && p.medbay <= 0 && jobs[p.id] !== 'rest');
  const labber = s.crew.find((p) => jobs[p.id] === 'lab'), fixer = s.crew.find((p) => jobs[p.id] === 'fix');
  if (ill) return [
    `${ill.name} is ill. If they work today, they get worse and spend ${c.SICK_WORK_MEDBAY_STEPS} sols in the medbay.`,
    `Give them "rest": ${c.SICK_REST_SOLS_TO_CURE} rest sols in a row make them well. The medic can help with "care".`,
  ];
  if (tired) return [
    `${tired.name} did heavy work (fix, outside) ${c.HEAVY_SOLS_TO_TIRED} sols in a row and is tired.`,
    `Heavy work while tired means an injury: ${c.INJURY_MEDBAY_STEPS} sols in the medbay, and no third star. One rest sol fixes tiredness.`,
  ];
  if (pc.life < S.life.want) return [
    `Life support wants ${S.life.want} cells. Each missing cell costs ${c.AIR_LOSS_PER_MISSING_CELL} air & water tonight.`,
    `If a tank stays empty for ${zeroSols(c.ZERO_SOLS_TO_LOSE)}, Mission Control calls the crew home early.`,
  ];
  if (day.storm && pc.shield < S.shield.want) return [
    'A real solar storm (from NASA DONKI) hits today. Inside, the crew gets extra radiation dose.',
    `Each shield cell cuts that extra dose. With ${S.shield.want} cells the dose inside stays normal. Outside, the shield does not help.`,
  ];
  if (labber && pc.lab === 0) return [
    `${labber.name} is set to work in the lab, but the lab has no power.`,
    `1 lab cell = half speed, ${S.lab.want} cells = full speed. Or give ${labber.name} another job.`,
  ];
  if (labber && s.samples < 1) return [
    `The lab turns samples into discovery cards, but there are no samples yet.`,
    'Samples come from trips outside and from finds. Until then the lab has nothing to study.',
  ];
  if (fixer && !s.problems.some((p) => c.PROBLEMS[p.type].where === 'inside')) return [
    `"Fix" only helps when something inside the station is broken. Right now nothing is.`,
    `${fixer.name} would spend the sol doing nothing. Give them another job, or let them rest.`,
  ];
  if (free > 0) return [
    'Cells are today\'s solar power. A cell you don\'t share is lost at sunset: nothing can store it.',
    'Give the free cells to a system that wants more, for example the greenhouse or life support.',
  ];
  if (s.sol >= c.JOB_UNLOCK_SOL && s.crew.every((p) => jobs[p.id] === 'rest' || jobs[p.id] === 'medbay')) return [
    'Resting people don\'t help the station. Tap a person to give them a job.',
    'Each one is best at one job: botanist grows food, scientist studies samples, medic cares, engineer fixes, pilot goes outside.',
  ];
  return ['The plan looks fine. Every choice still has a price: check "Tonight" before you press Done.'];
}
