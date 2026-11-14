// Balance check: npm run simulate -- 300
// Plays N missions per bot and mode and prints how many end with 0/1/2/3 stars.
import { balanceReport } from './bots';

const n = Number(process.argv[2]) || 100;
const rows = balanceReport(n);
const pad = (v: string | number, w: number) => String(v).padEnd(w);

console.log(`Missions per row: ${n}\n`);
console.log(pad('bot / mode', 22) + pad('0*', 6) + pad('1*', 6) + pad('2*', 6) + pad('3*', 6) + pad('ship', 6) + pad('science', 9) + pad('minAir', 8) + pad('minFood', 9) + pad('maxDose', 9) + 'medbay');
for (const [name, r] of Object.entries(rows)) {
  console.log(pad(name, 22) + r.stars.map((x) => pad(x, 6)).join('') + pad(r.reachedShip, 6) + pad(r.avgScience, 9) + pad(r.avgMinAir, 8) + pad(r.avgMinFood, 9) + pad(r.avgMaxDose, 9) + r.avgMedbaySols);
}

// Guard rails for CI: the game must stay winnable, losable, and the third star must stay hard.
const fail: string[] = [];
for (const mode of ['cadet', 'commander']) {
  const careful = rows['careful / ' + mode], sloppy = rows['sloppy / ' + mode], lazy = rows['lazy / ' + mode];
  if (careful.reachedShip < n * 0.9) fail.push(`${mode}: a careful player must bring the crew home (got ${careful.reachedShip}/${n})`);
  if (careful.stars[3] > n * 0.6) fail.push(`${mode}: three stars are too easy for a careful player (${careful.stars[3]}/${n})`);
  if (careful.stars[3] === 0) fail.push(`${mode}: three stars are impossible even for a careful player`);
  if (sloppy.stars[3] > n * 0.15) fail.push(`${mode}: mistakes are not punished (sloppy bot got 3 stars ${sloppy.stars[3]}/${n})`);
  if (lazy.reachedShip > 0) fail.push(`${mode}: doing nothing must not survive (${lazy.reachedShip}/${n})`);
}
if (fail.length) {
  console.error('\nBalance problems:\n- ' + fail.join('\n- '));
  process.exit(1);
}
console.log('\nBalance guard rails: OK');
