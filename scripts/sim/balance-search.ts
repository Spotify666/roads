import { readFileSync } from "node:fs";
import { GOALS, evaluate, optimise, type Weights } from "../../src/sim/optimize";
import { TODAY } from "../../src/sim/pilot";
// reuse the quick-model inputs written by the optimiser
const r = JSON.parse(readFileSync("data/pilot_results.partial.json", "utf8"));
void r;
