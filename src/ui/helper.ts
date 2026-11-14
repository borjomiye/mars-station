import { cellsAvailable, cfg, currentEvent, effectiveJobs, isBlackout, planTotal, plural, today, type GameState } from '../engine';
import { t } from '../engine/text';

export function helperLine(s: GameState, picking: boolean): string {
  const c = cfg(s.mode), day = today(s);
  if (s.phase === 'briefing') {
    if (s.sol === 1) return t('helper.welcomeCaptainReadTheMorning');
    if (day.storm) return t('helper.aSolarStormHitsToday');
    if (isBlackout(s)) return t('helper.theSunBlocksTheRadio');
    return t('helper.readTheMorningNewsThen');
  }
  if (s.phase === 'plan') {
    const free = cellsAvailable(s) - planTotal(s.plan), pc = s.plan.cells, jobs = effectiveJobs(s);
    const tired = s.crew.find((p) => p.cond === 'tired' && c.HEAVY_JOBS.includes(jobs[p.id]));
    const ill = s.crew.find((p) => p.sick && p.medbay <= 0 && jobs[p.id] !== 'rest');
    const labber = s.crew.find((p) => jobs[p.id] === 'lab'), fixer = s.crew.find((p) => jobs[p.id] === 'fix');
    if (ill) return t('helper.isIllAndMustRest', { name: ill.name });
    if (tired) return t('helper.isTiredHeavyWorkWill', { name: tired.name });
    if (pc.life < c.SYSTEMS.life.want) return t('helper.lifeSupportIsShortAir');
    if (day.storm && pc.shield < c.SYSTEMS.shield.want) return t('helper.stormTodayAndTheShield');
    if (labber && pc.lab < c.SYSTEMS.lab.want) return t('helper.theLabIsDarkCan', { name: labber.name });
    if (labber && s.samples < 1) return t('helper.noSamplesYetHasNothing', { name: labber.name });
    if (fixer && !s.problems.some((p) => c.PROBLEMS[p.type].where === 'inside')) return t('helper.nothingIsBrokenInsideHas', { name: fixer.name });
    if (free > 0) return t('helper.youHaveUnusedCellsAre', { free: plural(free, t('helper.freeCell')) });
    if (s.sol >= c.JOB_UNLOCK_SOL && s.crew.every((p) => jobs[p.id] === 'rest' || jobs[p.id] === 'medbay')) return t('helper.everyoneIsRestingGiveThe');
    return t('helper.everyChoiceCostsSomethingCheck');
  }
  if (s.phase === 'event') {
    const ev = currentEvent(s), ch = s.today.choice;
    if (picking) return t('helper.pickWhoGoesCheckTheir');
    if (ch && ch.id === 'use_now' && cellsAvailable(s) > planTotal(s.plan)) return t('helper.extraCellsGoBackTo');
    if (ch) return t('helper.readyPressPlayToRun');
    if (ev && ev.kind === 'chance') return t('helper.aChanceGoingOutsideAdds');
    return t('helper.noChoiceIsFreeRead');
  }
  if (s.phase === 'results') {
    if (s.counters.airZero || s.counters.foodZero) return t('helper.aTankIsEmptyOne');
    return t('helper.eachLineShowsWhatChanged');
  }
  if (s.phase === 'radio') return t('helper.oneMessageTonightEarthAnswers');
  return '';
}

export function whyText(s: GameState): string[] {
  const c = cfg(s.mode), S = c.SYSTEMS, w = c.CELLS_BY_WEATHER;
  if (s.phase === 'briefing') return [
    t('helper.eachMorningYouLearnWhat'),
    t('helper.theSkySetsTodayS', { clear: w.clear, hazy: w.hazy, dust: w.dust }),
    t('helper.aSolarParticleStormRaises'),
  ];
  if (s.phase === 'plan') return [
    t('helper.theSystemsWantMoreCells'),
    t('helper.lifeSupportWantsEachMissing', { want: S.life.want }),
    t('helper.theShieldOnlyMattersWhen', { want: S.shield.want, cropStepsToHarvest: c.CROP_STEPS_TO_HARVEST, harvestFood: c.HARVEST_FOOD }),
    t('helper.theRadioNeedsCellTo', { want: S.radio.want, want2: S.lab.want }),
    t('helper.eachPersonDoesOneJob'),
    t('helper.heavySolsInARow', { heavySolsToTired: c.HEAVY_SOLS_TO_TIRED }),
    t('helper.everyTripOutsideAddsMsv', { doseOutsideTrip: c.DOSE_OUTSIDE_TRIP }),
  ];
  if (s.phase === 'event') return [
    t('helper.troubleHas2Or3'),
    t('helper.aChanceIsTemptingGo'),
    t('helper.atTheseLevelsNobodyFeels'),
    t('helper.youCanGoBackTo'),
  ];
  if (s.phase === 'results') return [
    t('helper.everyLineNamesAChange'),
    t('helper.ifAirWaterOrFood', { zeroSolsToLose: c.ZERO_SOLS_TO_LOSE }),
  ];
  if (s.phase === 'radio') return [
    t('helper.oneMessagePerSolAnd'),
    t('helper.scienceOnlyCountsForCards'),
    t('helper.onSolsTheSunSits', { names: c.BLACKOUT_SOLS.join(' and ') }),
    t('helper.radioSignalsNeed3To'),
  ];
  return [];
}
