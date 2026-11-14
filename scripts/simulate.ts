// Balance check: no fixed strategy should win 3 stars in most missions.
// Usage: npm run simulate -- [games=1000]
import { bots, playGame } from './bots';

const games = Number(process.argv[2] ?? 1000);

console.log(`Simulating ${games} missions per bot\n`);
console.log('bot               failed   1*     2*     3*     avg medbay  avg max dose');
for (const bot of bots) {
  const stars = [0, 0, 0, 0];
  let medbay = 0;
  let dose = 0;
  for (let seed = 1; seed <= games; seed++) {
    const s = playGame(bot, seed);
    stars[s.outcome!.stars]++;
    medbay += s.medbayVisits;
    dose += Math.max(...s.crew.map((c) => c.doseMSv));
  }
  const pct = (n: number) => `${((100 * n) / games).toFixed(0)}%`.padEnd(7);
  console.log(
    `${bot.name.padEnd(18)}${pct(stars[0])}${pct(stars[1])}${pct(stars[2])}${pct(stars[3])}${(medbay / games).toFixed(2).padEnd(12)}${(dose / games).toFixed(1)} mSv`,
  );
}
console.log('\nPass criteria (draft): no bot gets 3* in most missions; do-nothing loses or gets max 1*;');
console.log('never-shield gets max 2* on stormy periods; sensible survives most often.');
