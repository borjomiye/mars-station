// The station helper explains, never decides: one line of 15 words or fewer that reacts to the plan,
// and a longer "Why?" for the curious.
import { cellsAvailable, cfg, currentEvent, effectiveJobs, isBlackout, planTotal, plural, today, type GameState } from '../engine';

export function helperLine(s: GameState, picking: boolean): string {
  const c = cfg(s.mode), day = today(s);
  if (s.phase === 'briefing') {
    if (s.sol === 1) return 'Welcome, Captain! Read the morning news, then plan the sol.';
    if (day.storm) return 'A solar storm hits today. Power the shield to keep dose low.';
    if (isBlackout(s)) return 'The Sun blocks the radio today. Earth cannot hear us.';
    return 'Read the morning news, then plan the sol.';
  }
  if (s.phase === 'plan') {
    const free = cellsAvailable(s) - planTotal(s.plan), pc = s.plan.cells, jobs = effectiveJobs(s);
    const tired = s.crew.find((p) => p.cond === 'tired' && c.HEAVY_JOBS.includes(jobs[p.id]));
    const ill = s.crew.find((p) => p.sick && p.medbay <= 0 && jobs[p.id] !== 'rest');
    const labber = s.crew.find((p) => jobs[p.id] === 'lab'), fixer = s.crew.find((p) => jobs[p.id] === 'fix');
    if (ill) return ill.name + ' is ill and must rest, or it gets worse.';
    if (tired) return tired.name + ' is tired. Heavy work will hurt. Give them a rest.';
    if (pc.life < c.SYSTEMS.life.want) return 'Life support is short. Air and water will drop tonight.';
    if (day.storm && pc.shield < c.SYSTEMS.shield.want) return 'Storm today and the shield is weak. Everyone gets extra dose.';
    if (labber && pc.lab < c.SYSTEMS.lab.want) return 'The lab is dark. ' + labber.name + " can't work there without power.";
    if (labber && s.samples < 1) return 'No samples yet. ' + labber.name + ' has nothing to study in the lab.';
    if (fixer && !s.problems.some((p) => c.PROBLEMS[p.type].where === 'inside')) return 'Nothing is broken inside. ' + fixer.name + ' has nothing to fix.';
    if (free > 0) return 'You have ' + plural(free, 'free cell') + '. Unused cells are lost at sunset.';
    if (s.sol >= c.JOB_UNLOCK_SOL && s.crew.every((p) => jobs[p.id] === 'rest' || jobs[p.id] === 'medbay')) return 'Everyone is resting. Give the crew jobs with the buttons.';
    return 'Every choice costs something. Check the plan, then go.';
  }
  if (s.phase === 'event') {
    const ev = currentEvent(s), ch = s.today.choice;
    if (picking) return 'Pick who goes. Check their dose badge first.';
    if (ch && ch.id === 'use_now' && cellsAvailable(s) > planTotal(s.plan)) return 'Extra cells! Go back to the plan to share them.';
    if (ch) return 'Ready? Press Play to run the sol.';
    if (ev && ev.kind === 'chance') return 'A chance! Going outside adds dose. You can let it go.';
    return 'No choice is free. Read the prices, then pick one.';
  }
  if (s.phase === 'results') {
    if (s.counters.airZero || s.counters.foodZero) return 'A tank is empty! One more empty sol ends the mission.';
    return 'Each line shows what changed and why.';
  }
  if (s.phase === 'radio') return 'One message tonight. Earth answers at breakfast.';
  return '';
}

export function whyText(s: GameState): string[] {
  const c = cfg(s.mode), S = c.SYSTEMS, w = c.CELLS_BY_WEATHER;
  if (s.phase === 'briefing') return [
    "Each morning you learn what changed overnight, and Earth answers last night's message.",
    `The sky sets today's energy: clear ${w.clear} cells, hazy ${w.hazy}, dust storm ${w.dust}.`,
    "A solar particle storm raises everyone's dose unless the shield has full power.",
  ];
  if (s.phase === 'plan') return [
    'The systems want more cells than the Sun gives, so something always goes short.',
    `Life support wants ${S.life.want}: each missing cell costs 1 air & water tonight. A 4th cell gives 1 back.`,
    `The shield (${S.shield.want}) only matters when a solar storm hits. The greenhouse grows 1 crop step per cell; ${c.CROP_STEPS_TO_HARVEST} steps = harvest, Food +${c.HARVEST_FOOD}.`,
    `The radio needs ${S.radio.want} cell to send tonight's message. The lab needs ${S.lab.want} cells or no science happens.`,
    'Each person does one job per sol. Specialists do their own job twice as well: engineer fix, medic care, botanist grow, scientist lab, pilot outside.',
    `${c.HEAVY_SOLS_TO_TIRED} heavy sols in a row (fix, outside) make a person tired: half effect until they rest. Heavy work while tired means the medbay.`,
    `Every trip outside adds ${c.DOSE_OUTSIDE_TRIP} mSv to the dose badge. The badge only fills.`,
  ];
  if (s.phase === 'event') return [
    'Trouble has 2 or 3 choices and none is free. Trouble left alone grows where you can see it.',
    'A chance is tempting: go outside (card + sample, but dose and a lost job), scan from the lab (needs lab power and the scientist), or let it go.',
    'At these levels nobody feels ill. Astronauts still keep dose as low as they can, because it adds up over a whole career.',
    'You can go back to the plan and change cells or jobs before you play the sol.',
  ];
  if (s.phase === 'results') return [
    'Every line names a change and its cause. Nothing here is a hidden dice roll: the same plan on the same Mars gives the same result.',
    `If air & water or food stays at 0 for ${c.ZERO_SOLS_TO_LOSE} sols in a row, Mission Control calls the crew home early. Nobody dies.`,
  ];
  if (s.phase === 'radio') return [
    'One message per sol, and only if the radio had a cell. Earth answers at breakfast.',
    'Science only counts for cards that were sent home with the science report.',
    `On sols ${c.BLACKOUT_SOLS.join(' and ')} the Sun sits between Mars and Earth (solar conjunction), so the radio cannot reach Earth.`,
    'Radio signals need 3 to 22 minutes one way, so nobody steers a Mars mission live. (Source: NASA/JPL)',
  ];
  return [];
}
