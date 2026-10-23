// Microscopic traffic simulation of a divided urban corridor.
//
// Two carriageways run in opposite directions along a common chainage `s`
// (metres from Mehdipatnam). Vehicles follow the Intelligent Driver Model in
// lanes, change lanes when blocked, stop at bus stops, queue at signals and
// reverse direction only at median openings. Riders who face a long detour may
// ride the wrong way along the kerb instead. The same engine runs in the
// browser (the before/after view) and in Node (calibration and the optimiser),
// and is deterministic for a given seed.

export type VType = "2w" | "car" | "auto" | "bus" | "lcv";
export const VTYPES: VType[] = ["2w", "car", "auto", "bus", "lcv"];

export interface Opening {
  s: number;
  pocket: boolean; // waiting pocket so U-turners leave the fast lane
}

export interface Layout {
  openings: Opening[];
  busBays: number[]; // chainages of stops rebuilt with a bay, so buses stop off the kerb lane
  autoBays: boolean; // shared autos pick up off the carriageway
  clearKerb: boolean; // parking and vending removed from the Tolichowki kerb
  signalGreen: number; // main-road green share at both signals
  signalGreens?: Record<string, number>; // per-signal override, by signal name
  busLane?: boolean; // kerb lane reserved for buses and autos
  oneWay?: 0 | 1 | null; // every lane runs one way; the other direction is diverted off the corridor
  fullLanes?: boolean; // no lane drop: the widest lane count runs the whole length
  enforcement?: boolean; // barricades and cameras against wrong-side riding
}

export interface CorridorModel {
  length: number;
  lanes: { from: number; to: number; w: number; e: number }[];
  busStops: { s: number; cw: 0 | 1; name: string; major: boolean }[];
  sideRoads: { s: number; cw: 0 | 1; weight: number }[];
  signals: { s: number; cycle: number; offset: number; cw?: 0 | 1; green?: number; name?: string }[];
  kerbFriction: { from: number; to: number; cw: 0 | 1; speed: number; cause: "parking" | "autos" }[]; // kerb-lane friction
}

export interface Demand {
  through: [number, number]; // veh/h entering at each end (westbound, eastbound)
  side: [number, number]; // veh/h joining from side roads on each carriageway
  reverseShare: number; // share of side-road joiners who need to go the other way
}

export interface Assumptions {
  mix: Record<VType, number>;
  fuelPerKm: Record<VType, number>; // litres per km at steady speed
  idleLitresPerHour: Record<VType, number>;
  wrongSideThreshold: number; // metres of detour before riders start going wrong-side
  wrongSideMax: number; // maximum share of 2W/autos who go wrong-side
  busDwell: [number, number]; // seconds, min-max
  autoDwell: [number, number];
  autoStopShare: number; // share of autos that stop to pick up at a stop
  freeSpeed: number; // km/h desired speed for cars
}

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  mix: { "2w": 0.55, car: 0.25, auto: 0.12, bus: 0.025, lcv: 0.055 },
  fuelPerKm: { "2w": 0.022, car: 0.075, auto: 0.035, bus: 0.3, lcv: 0.12 },
  idleLitresPerHour: { "2w": 0.12, car: 0.6, auto: 0.3, bus: 2.0, lcv: 0.9 },
  wrongSideThreshold: 400,
  wrongSideMax: 0.35,
  busDwell: [25, 70],
  autoDwell: [8, 25],
  autoStopShare: 0.35,
  freeSpeed: 42,
};

interface TypeSpec {
  len: number;
  v0: number; // multiplier on freeSpeed
  T: number;
  a: number;
  b: number;
  s0: number;
}

const SPEC: Record<VType, TypeSpec> = {
  "2w": { len: 2.0, v0: 1.05, T: 0.7, a: 2.2, b: 2.5, s0: 0.8 },
  car: { len: 4.5, v0: 1.0, T: 1.1, a: 1.6, b: 2.2, s0: 1.6 },
  auto: { len: 3.0, v0: 0.75, T: 0.9, a: 1.3, b: 2.0, s0: 1.2 },
  bus: { len: 11.5, v0: 0.85, T: 1.4, a: 0.9, b: 1.8, s0: 2.5 },
  lcv: { len: 6.5, v0: 0.85, T: 1.3, a: 1.0, b: 1.9, s0: 2.0 },
};

export type Plan =
  | { kind: "through" }
  | { kind: "exit"; at: number }
  | { kind: "reverse"; at: number; then: number } // U-turn at `at` (chainage) then exit at `then`
  | { kind: "wrongside"; to: number };

export interface Vehicle {
  id: number;
  type: VType;
  cw: 0 | 1; // 0 westbound (s increasing), 1 eastbound (s decreasing)
  cw0: 0 | 1; // carriageway the trip started on
  fromEnd: boolean; // entered at the corridor end (not a side road)
  lane: number;
  x: number; // distance travelled along the current carriageway's direction
  v: number;
  plan: Plan;
  state: "drive" | "dwell" | "uturn-wait" | "pocket" | "wrongside";
  timer: number;
  stopAt: number | null; // x of the next stop this vehicle will make
  t0: number;
  dist: number;
  fuel: number;
  slowTime: number;
  waitTime: number;
  lcCooldown: number;
  len: number;
  v0: number;
  reversed: boolean;
  extraDist: number; // return run beyond the modelled corridor, counted at completion
}

export interface TripRecord {
  type: VType;
  time: number;
  dist: number;
  fuel: number;
  slow: number;
  reversed: boolean;
  wrongside: boolean;
  through: boolean;
  cw0: 0 | 1;
}

export interface Stats {
  trips: number;
  diverted: number; // trips that could not use the corridor (one-way)
  busTimes: number[]; // end-to-end bus trip times
  vehHours: number;
  vehKm: number;
  fuel: number;
  slowHours: number; // vehicle-hours spent below 10 km/h
  wrongside: number;
  uturns: number;
  throughTimes: [number[], number[]];
  avgThroughTime: [number, number];
}

// Small, fast, seedable RNG (mulberry32)
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KMH = 1 / 3.6;

/** Index of the first vehicle at or behind x in a lane sorted by descending x. */
function firstAtOrBehind(arr: Vehicle[], x: number) {
  let lo = 0,
    hi = arr.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (arr[m].x > x) lo = m + 1;
    else hi = m;
  }
  return lo;
}

/** Stable sort, leader first. Lanes arrive almost in order every step, so insertion sort is close to linear. */
function sortByXDesc(arr: Vehicle[]) {
  for (let i = 1; i < arr.length; i++) {
    const cur = arr[i];
    let j = i - 1;
    while (j >= 0 && arr[j].x < cur.x) {
      arr[j + 1] = arr[j];
      j--;
    }
    arr[j + 1] = cur;
  }
}

function insertSorted(lanes: Map<number, Vehicle[]>, v: Vehicle) {
  const k = v.cw * 10 + v.lane;
  const arr = lanes.get(k);
  if (!arr) {
    lanes.set(k, [v]);
    return;
  }
  arr.splice(firstAtOrBehind(arr, v.x), 0, v);
}

export class Simulation {
  readonly L: number;
  t = 0;
  vehicles: Vehicle[] = [];
  trips: TripRecord[] = [];
  private nextId = 1;
  private rand: () => number;
  private spawnAcc: number[] = [0, 0, 0, 0];
  private backlog: [{ t: number; type: VType; lane: number }[], { t: number; type: VType; lane: number }[]] = [[], []];
  private pockets: Map<string, Vehicle[]> = new Map();
  readonly openingsByCw: [number[], number[]];
  uturns = 0;
  wrongsideCount = 0;
  diverted = 0;
  private maxLanes: [number, number];
  get queued() {
    return this.backlog[0].length + this.backlog[1].length;
  }
  warmup: number;

  constructor(
    readonly model: CorridorModel,
    readonly layout: Layout,
    readonly demand: Demand,
    readonly A: Assumptions = DEFAULT_ASSUMPTIONS,
    seed = 1,
    warmup = 300,
  ) {
    this.L = model.length;
    this.rand = rng(seed);
    this.warmup = warmup;
    const op = [...layout.openings].sort((a, b) => a.s - b.s).map((o) => o.s);
    // positions of openings in each carriageway's own travel coordinate
    this.openingsByCw = [op.map((s) => s), op.map((s) => this.L - s).sort((a, b) => a - b)];
    this.maxLanes = [Math.max(...model.lanes.map((l) => l.w)), Math.max(...model.lanes.map((l) => l.e))];
  }

  private get wrongMax() {
    return this.layout.enforcement ? this.A.wrongSideMax * 0.2 : this.A.wrongSideMax;
  }

  private busish(v: { type: VType }) {
    return v.type === "bus" || v.type === "auto";
  }

  private countDiverted() {
    if (this.t > this.warmup) this.diverted++;
  }

  // chainage <-> carriageway coordinate
  sOf(cw: 0 | 1, x: number) {
    return cw === 0 ? x : this.L - x;
  }
  xOf(cw: 0 | 1, s: number) {
    return cw === 0 ? s : this.L - s;
  }

  /** Lanes physically built on a carriageway at chainage s, whichever way they run. */
  roadLanes(side: 0 | 1, s: number) {
    if (this.layout.fullLanes) return this.maxLanes[side];
    let seg = this.model.lanes[this.model.lanes.length - 1];
    for (const l of this.model.lanes)
      if (s >= l.from && s < l.to) {
        seg = l;
        break;
      }
    return side === 0 ? seg.w : seg.e;
  }

  lanesAt(cw: 0 | 1, x: number) {
    const s = this.sOf(cw, x);
    const ow = this.layout.oneWay;
    if (ow === 0 || ow === 1) return cw === ow ? this.roadLanes(0, s) + this.roadLanes(1, s) : 0;
    return this.roadLanes(cw, s);
  }

  private pickType(): VType {
    let r = this.rand();
    for (const k of VTYPES) {
      r -= this.A.mix[k];
      if (r <= 0) return k;
    }
    return "car";
  }

  private nextOpeningAhead(cw: 0 | 1, x: number) {
    for (const o of this.openingsByCw[cw]) if (o > x + 15) return o;
    return null;
  }

  private makeVehicle(cw: 0 | 1, x: number, lane: number, plan: Plan, type: VType): Vehicle {
    const spec = SPEC[type];
    return {
      id: this.nextId++,
      type,
      cw,
      cw0: cw,
      fromEnd: x === 0,
      lane,
      x,
      v: Math.min(8, spec.v0 * this.A.freeSpeed * KMH),
      plan,
      state: plan.kind === "wrongside" ? "wrongside" : "drive",
      timer: 0,
      stopAt: null,
      t0: this.t,
      dist: 0,
      fuel: 0,
      slowTime: 0,
      waitTime: 0,
      lcCooldown: 0,
      len: spec.len,
      v0: spec.v0 * this.A.freeSpeed * KMH * (0.9 + 0.2 * this.rand()),
      reversed: false,
      extraDist: 0,
    };
  }

  /** Does this vehicle's next stop have an off-carriageway bay? */
  private usesBay(v: Vehicle) {
    if (v.stopAt === null) return false;
    if (v.type === "auto") return this.layout.autoBays;
    if (v.type !== "bus") return false;
    const s = this.sOf(v.cw, v.stopAt);
    return this.layout.busBays.some((b) => Math.abs(b - s) < 6);
  }

  private spaceFree(cw: 0 | 1, lane: number, x: number, ahead: number, behind: number) {
    for (const o of this.vehicles) {
      if (o.cw !== cw || o.lane !== lane || o.state === "pocket" || o.state === "wrongside") continue;
      if (o.x > x - behind && o.x - o.len < x + ahead) return false;
    }
    return true;
  }

  private assignStop(v: Vehicle) {
    v.stopAt = null;
    const isBus = v.type === "bus";
    const isAuto = v.type === "auto" && this.rand() < this.A.autoStopShare;
    if (!isBus && !isAuto) return;
    const ow = this.layout.oneWay;
    for (const st of this.model.busStops) {
      if (st.cw !== v.cw && ow !== v.cw) continue;
      const xs = this.xOf(v.cw, st.s);
      if (xs > v.x + 30) {
        if (isBus || st.major) {
          v.stopAt = xs;
          return;
        }
      }
    }
  }

  private spawn(dt: number) {
    const d = this.demand;
    // through traffic at each end; arrivals that cannot enter wait upstream and keep their arrival time
    for (const cw of [0, 1] as const) {
      this.spawnAcc[cw] += (d.through[cw] / 3600) * dt;
      const lanes = this.lanesAt(cw, 0);
      while (this.spawnAcc[cw] >= 1) {
        this.spawnAcc[cw] -= 1;
        if (lanes === 0) {
          this.countDiverted(); // this direction is closed: the trip goes another way
          continue;
        }
        const type = this.pickType();
        const lane =
          type === "bus"
            ? 0
            : this.layout.busLane && type !== "auto" && lanes > 1
              ? 1 + Math.floor(this.rand() * (lanes - 1))
              : Math.floor(this.rand() * lanes);
        this.backlog[cw].push({ t: this.t, type, lane });
      }
      for (let tries = 0; tries < lanes * 2 && this.backlog[cw].length; tries++) {
        const arr = this.backlog[cw][0];
        let lane = arr.lane;
        if (!this.spaceFree(cw, lane, 0, 7, 0)) {
          const alt = [...Array(lanes).keys()].find(
            (l) =>
              (arr.type !== "bus" || l === 0) &&
              !(this.layout.busLane && l === 0 && !this.busish(arr)) &&
              this.spaceFree(cw, l, 0, 7, 0),
          );
          if (alt === undefined) break;
          lane = alt;
        }
        this.backlog[cw].shift();
        const type = arr.type;
        // most through traffic runs end to end; some leaves at side roads
        let plan: Plan = { kind: "through" };
        if (this.rand() < 0.3) {
          const exits = this.model.sideRoads.filter((r) => r.cw === cw);
          const ex = exits[Math.floor(this.rand() * exits.length)];
          if (ex) plan = { kind: "exit", at: this.xOf(cw, ex.s) };
        }
        const v = this.makeVehicle(cw, 0, lane, plan, type);
        v.t0 = arr.t;
        this.assignStop(v);
        this.vehicles.push(v);
      }
    }
    // side-road joiners
    const roads = this.model.sideRoads;
    const total = [0, 0];
    for (const r of roads) total[r.cw] += r.weight;
    for (const cw of [0, 1] as const) {
      this.spawnAcc[2 + cw] += (d.side[cw] / 3600) * dt;
      while (this.spawnAcc[2 + cw] >= 1) {
        this.spawnAcc[2 + cw] -= 1;
        let r = this.rand() * total[cw];
        let road = roads[0];
        for (const rd of roads) {
          if (rd.cw !== cw) continue;
          r -= rd.weight;
          road = rd;
          if (r <= 0) break;
        }
        const ow = this.layout.oneWay;
        if (ow === 0 || ow === 1) {
          this.spawnOneWayJoiner(ow, road.s, cw !== ow);
          continue;
        }
        const x = this.xOf(cw, road.s);
        if (x > this.L - 40) continue;
        const picked = this.pickType();
        const type: VType = picked === "bus" ? "car" : picked;
        if (!this.spaceFree(cw, 0, x, 6, 6)) continue;
        let plan: Plan = { kind: "through" };
        let pendingReturn = 0;
        if (this.rand() < d.reverseShare) {
          // wants the other direction: drive ahead to the next opening, U-turn, then run back
          const at = this.nextOpeningAhead(cw, x);
          // with no opening left, the only legal way back is a U-turn at the junction past the corridor end
          const detour = 2 * ((at ?? this.L) - x);
          const canWrongSide = type === "2w" || type === "auto";
          const pWrong = canWrongSide ? this.wrongMax * Math.min(1, Math.max(0, (detour - this.A.wrongSideThreshold) / 800)) : 0;
          const destS = this.rand() < 0.75 ? (cw === 0 ? 0 : this.L) : this.model.sideRoads[Math.floor(this.rand() * roads.length)].s;
          if (this.rand() < pWrong) {
            plan = { kind: "wrongside", to: this.xOf(cw, destS) };
            this.wrongsideCount++;
          } else if (at === null) {
            plan = { kind: "through" };
            pendingReturn = this.L - x;
          } else {
            const otherCw = (1 - cw) as 0 | 1;
            const xAfter = this.xOf(otherCw, this.sOf(cw, at));
            const xDest = this.xOf(otherCw, destS);
            plan = { kind: "reverse", at, then: xDest > xAfter + 20 ? xDest : this.L };
          }
        } else if (this.rand() < 0.4) {
          const exits = roads.filter((rd) => rd.cw === cw && this.xOf(cw, rd.s) > x + 60);
          const ex = exits[Math.floor(this.rand() * exits.length)];
          if (ex) plan = { kind: "exit", at: this.xOf(cw, ex.s) };
        }
        const v = this.makeVehicle(cw, x, 0, plan, type);
        v.extraDist = pendingReturn;
        v.v = 2;
        if (plan.kind === "wrongside") {
          v.v = 4;
          v.state = "wrongside";
        }
        this.assignStop(v);
        this.vehicles.push(v);
      }
    }
  }

  /** One-way mode: side-road traffic joins the open carriageway; trips for the closed direction go elsewhere. */
  private spawnOneWayJoiner(open: 0 | 1, s: number, farSide: boolean) {
    const x = this.xOf(open, s);
    if (x > this.L - 40) return;
    const picked = this.pickType();
    const type: VType = picked === "bus" ? "car" : picked;
    if (this.rand() < this.demand.reverseShare) {
      // wants the closed direction: some two-wheelers and autos ride against the one-way, the rest divert
      if ((type === "2w" || type === "auto") && this.rand() < this.wrongMax) {
        const v = this.makeVehicle(open, x, 0, { kind: "wrongside", to: 0 }, type);
        v.v = 4;
        v.state = "wrongside";
        this.wrongsideCount++;
        this.vehicles.push(v);
      } else this.countDiverted();
      return;
    }
    const lanes = this.lanesAt(open, x);
    const lane = farSide ? lanes - 1 : 0; // joiners from the far side enter the far edge
    if (!this.spaceFree(open, lane, x, 6, 6)) return;
    let plan: Plan = { kind: "through" };
    if (this.rand() < 0.4) {
      const exits = this.model.sideRoads.filter((rd) => this.xOf(open, rd.s) > x + 60);
      const ex = exits[Math.floor(this.rand() * exits.length)];
      if (ex) plan = { kind: "exit", at: this.xOf(open, ex.s) };
    }
    const v = this.makeVehicle(open, x, lane, plan, type);
    v.v = 2;
    this.assignStop(v);
    this.vehicles.push(v);
  }

  private signalRed(sig: { s: number; cycle: number; offset: number; green?: number; name?: string }) {
    const share = sig.green ?? (sig.name ? this.layout.signalGreens?.[sig.name] : undefined) ?? this.layout.signalGreen;
    const green = share * sig.cycle;
    const ph = (((this.t + sig.offset) % sig.cycle) + sig.cycle) % sig.cycle;
    return ph >= green;
  }

  /** Free-road speed limit at a position (kerb friction from parking and vendors). */
  private kerbLimit(v: Vehicle) {
    if (v.lane !== 0) return Infinity;
    const s = this.sOf(v.cw, v.x);
    let lim = Infinity;
    for (const f of this.model.kerbFriction) {
      if ((f.cause === "parking" && this.layout.clearKerb) || (f.cause === "autos" && this.layout.autoBays)) continue;
      if (f.cw === v.cw && s >= f.from && s <= f.to) lim = Math.min(lim, f.speed * KMH);
    }
    return lim;
  }

  step(dt: number) {
    this.t += dt;
    this.spawn(dt);

    // index by carriageway/lane, sorted leader-first (descending x)
    const lanesMap = new Map<number, Vehicle[]>();
    const wrong: Vehicle[] = [];
    for (const v of this.vehicles) {
      if (v.state === "pocket") continue;
      if (v.state === "wrongside") {
        wrong.push(v);
        continue;
      }
      const k = v.cw * 10 + v.lane;
      const arr = lanesMap.get(k);
      if (arr) arr.push(v);
      else lanesMap.set(k, [v]);
    }
    for (const arr of lanesMap.values()) sortByXDesc(arr);

    const leaderOf = (v: Vehicle, lane: number): Vehicle | null => {
      const arr = lanesMap.get(v.cw * 10 + lane);
      if (!arr) return null;
      let i = firstAtOrBehind(arr, v.x) - 1;
      while (i >= 0 && arr[i] === v) i--;
      return i >= 0 ? arr[i] : null;
    };
    const followerOf = (v: Vehicle, lane: number): Vehicle | null => {
      const arr = lanesMap.get(v.cw * 10 + lane);
      if (!arr) return null;
      let i = firstAtOrBehind(arr, v.x);
      while (i < arr.length && arr[i] === v) i++;
      return i < arr.length ? arr[i] : null;
    };
    const moveLane = (v: Vehicle, lane: number) => {
      const from = lanesMap.get(v.cw * 10 + v.lane);
      if (from) {
        const i = from.indexOf(v);
        if (i >= 0) from.splice(i, 1);
      }
      v.lane = lane;
      insertSorted(lanesMap, v);
    };

    const idm = (v: Vehicle, gap: number, dv: number, vmax: number) => {
      const sp = SPEC[v.type];
      const v0 = Math.min(v.v0, vmax);
      const sStar = sp.s0 + Math.max(0, v.v * sp.T + (v.v * dv) / (2 * Math.sqrt(sp.a * sp.b)));
      const r = v.v / Math.max(v0, 0.1);
      const q = sStar / Math.max(gap, 0.1);
      return sp.a * (1 - r * r * r * r - q * q);
    };

    // obstacles ahead of v in its lane that are not vehicles: stop lines, own stop, lane end, wrong-side riders
    const obstacleGap = (v: Vehicle) => {
      let gap = Infinity;
      // red signals
      for (const sig of this.model.signals) {
        if (sig.cw !== undefined && sig.cw !== v.cw) continue;
        const xs = this.xOf(v.cw, sig.s);
        if (xs > v.x && xs - v.x < 80 && this.signalRed(sig)) {
          // vehicles already committed (cannot stop) pass
          const stopDist = (v.v * v.v) / (2 * SPEC[v.type].b);
          if (xs - v.x > stopDist * 0.6) gap = Math.min(gap, xs - v.x);
        }
      }
      // own planned stop (bus stop / auto pick-up)
      if (v.stopAt !== null && v.stopAt > v.x) {
        const bay = this.usesBay(v);
        // the gap includes the standstill distance so the vehicle halts right at the stop
        if (!bay && v.lane === 0) gap = Math.min(gap, v.stopAt - v.x + SPEC[v.type].s0);
      }
      // U-turn: stop at the opening, only from the fast (median) lane
      if (v.plan.kind === "reverse" && !v.reversed && v.lane === this.lanesAt(v.cw, v.x) - 1) {
        const d = v.plan.at - v.x;
        if (d > 0) gap = Math.min(gap, d + SPEC[v.type].s0);
      }
      // lane ends (lane drop)
      const lanesAhead = this.lanesAt(v.cw, v.x + 40);
      if (v.lane >= lanesAhead) {
        for (let d = 10; d <= 60; d += 10) {
          if (this.lanesAt(v.cw, v.x + d) <= v.lane) {
            gap = Math.min(gap, d);
            break;
          }
        }
      }
      // wrong-side riders coming at you in the kerb lane
      if (v.lane === 0) {
        for (const w of wrong) {
          if (w.cw !== v.cw) continue;
          const d = w.x - v.x;
          if (d > 0 && d < 25) gap = Math.min(gap, d + 6);
        }
      }
      return gap;
    };

    const toRemove = new Set<Vehicle>();

    for (const v of this.vehicles) {
      v.lcCooldown -= dt;
      if (v.state === "pocket") {
        v.waitTime += dt;
        v.fuel += (this.A.idleLitresPerHour[v.type] / 3600) * dt;
        v.slowTime += dt;
        continue;
      }
      if (v.state === "wrongside") {
        // rides against traffic along the kerb at ~15 km/h
        const plan = v.plan as { kind: "wrongside"; to: number };
        v.x -= 4.2 * dt;
        v.dist += 4.2 * dt;
        v.fuel += (this.A.fuelPerKm[v.type] * 4.2 * dt) / 1000;
        if (v.x <= plan.to || v.x <= 0) toRemove.add(v);
        continue;
      }
      if (v.state === "dwell") {
        v.timer -= dt;
        v.v = 0;
        v.fuel += (this.A.idleLitresPerHour[v.type] / 3600) * dt;
        if (v.timer <= 0) {
          v.state = "drive";
          v.stopAt = null;
          if (v.type === "auto") this.assignStop(v);
        }
        continue;
      }
      if (v.state === "uturn-wait") {
        v.v = 0;
        v.waitTime += dt;
        v.slowTime += dt;
        v.fuel += (this.A.idleLitresPerHour[v.type] / 3600) * dt;
        if (this.tryUturn(v, lanesMap)) continue;
        continue;
      }

      // --- driving ---
      const lead = leaderOf(v, v.lane);
      let gap = lead ? lead.x - lead.len - v.x : Infinity;
      let dv = lead ? v.v - lead.v : 0;
      const og = obstacleGap(v);
      if (og < gap) {
        gap = og;
        dv = v.v;
      }
      const vmax = this.kerbLimit(v);
      let acc = idm(v, gap, dv, vmax);
      acc = Math.max(acc, -8);

      // lane changing: mandatory moves first
      if (v.lcCooldown <= 0) {
        const lanesHere = this.lanesAt(v.cw, v.x);
        let target: number | null = null;
        const wantMedian = v.plan.kind === "reverse" && !v.reversed && v.plan.at - v.x < 180;
        const wantKerb =
          (v.stopAt !== null && v.stopAt - v.x < 120) ||
          (v.plan.kind === "exit" && v.plan.at - v.x < 120) ||
          (v.reversed && v.plan.kind === "reverse" && v.plan.then - v.x < 120 && v.plan.then < this.L);
        const laneEnding = v.lane >= this.lanesAt(v.cw, v.x + 60);
        const leaveBusLane = !!this.layout.busLane && v.lane === 0 && !this.busish(v) && !wantKerb && lanesHere > 1;
        if (wantMedian && v.lane < lanesHere - 1) target = v.lane + 1;
        else if ((wantKerb || laneEnding) && v.lane > 0) target = v.lane - 1;
        else if (leaveBusLane) target = 1;
        else if (gap < 25 && (lead?.v ?? 0) < v.v0 * 0.6) {
          // discretionary: try the faster neighbour
          const opts = [v.lane + 1, v.lane - 1].filter(
            (l) =>
              l >= 0 &&
              l < lanesHere &&
              !(this.layout.busLane && l === 0 && !this.busish(v)) &&
              !(l === 0 && v.type !== "bus" && this.rand() < 0.3),
          );
          let best = 0.4;
          for (const l of opts) {
            const ld = leaderOf(v, l);
            const g = ld ? ld.x - ld.len - v.x : Infinity;
            const a2 = idm(v, Math.min(g, 200), ld ? v.v - ld.v : 0, vmax);
            if (a2 - acc > best) {
              best = a2 - acc;
              target = l;
            }
          }
        }
        if (target !== null) {
          const ld = leaderOf(v, target);
          const fl = followerOf(v, target);
          const gapF = ld ? ld.x - ld.len - v.x : Infinity;
          const gapB = fl ? v.x - v.len - fl.x : Infinity;
          // a stopped vehicle that must move over squeezes in (others let it in, zipper style)
          const forced = (wantMedian || wantKerb || laneEnding || leaveBusLane) && v.v < 2;
          const need = forced ? 1.0 : v.type === "2w" ? 1.5 : 3;
          const behind = forced ? 1.0 : need + (fl ? Math.max(0, fl.v - v.v) * 1.2 : 0);
          if (gapF > need && gapB > behind) {
            moveLane(v, target);
            v.lcCooldown = 1.5 + this.rand();
          } else v.lcCooldown = 0.3;
        }
      }

      const vNew = Math.max(0, v.v + acc * dt);
      const dx = Math.max(0, (v.v + vNew) * 0.5 * dt);
      v.x += dx;
      v.v = vNew;
      v.dist += dx;
      v.fuel += (this.A.fuelPerKm[v.type] * dx) / 1000 + (v.v < 0.5 ? (this.A.idleLitresPerHour[v.type] / 3600) * dt : 0) + (acc > 0 ? acc * dt * 0.00002 * SPEC[v.type].len : 0);
      if (v.v < 10 * KMH) v.slowTime += dt;

      // events
      const usesBay = this.usesBay(v);
      if (v.stopAt !== null && v.x >= v.stopAt - 1 && (v.v < 1.5 || usesBay)) {
        const [a, b] = v.type === "bus" ? this.A.busDwell : this.A.autoDwell;
        v.state = "dwell";
        v.timer = a + (b - a) * this.rand();
        if (usesBay) {
          // pulls into a bay: off the lane until done
          v.state = "pocket";
          this.parkInBay(v);
        }
        continue;
      }
      if (v.stopAt !== null && v.x > v.stopAt + 5) v.stopAt = null; // missed (in another lane)
      if (v.plan.kind === "reverse" && !v.reversed && v.x >= v.plan.at - 1) {
        const lanesHere = this.lanesAt(v.cw, v.x);
        const at = v.plan.at;
        if (v.lane !== lanesHere - 1) {
          // could not reach the fast lane in time: carry on to the next opening
          if (v.x > at + 2) {
            const next = this.nextOpeningAhead(v.cw, v.x);
            if (next === null) {
              v.extraDist = this.L - v.x;
              v.plan = { kind: "through" };
            }
            else v.plan = { ...v.plan, at: next };
          }
        } else {
          v.x = at;
          v.v = 0;
          const pocket = this.layout.openings.find((o) => Math.abs(this.xOf(v.cw, o.s) - at) < 3)?.pocket;
          if (pocket) {
            const key = `${v.cw}:${Math.round(v.x)}`;
            const q = this.pockets.get(key) ?? [];
            if (q.length < 5) {
              q.push(v);
              this.pockets.set(key, q);
              v.state = "pocket";
              continue;
            }
          }
          v.state = "uturn-wait";
        }
        continue;
      }
      if (v.plan.kind === "exit" && v.x >= v.plan.at) toRemove.add(v);
      else if (v.reversed && v.plan.kind === "reverse" && v.x >= v.plan.then) toRemove.add(v);
      else if (v.x >= this.L) toRemove.add(v);
    }

    // release pockets (U-turners in pockets wait for a gap) and bays
    for (const [key, q] of this.pockets) {
      if (!q.length) continue;
      const head = q[0];
      if (key.startsWith("bay")) {
        for (const v of [...q]) {
          v.timer -= dt;
          if (v.timer <= 0 && this.spaceFree(v.cw, 0, v.x, 6, 10)) {
            q.splice(q.indexOf(v), 1);
            v.state = "drive";
            v.lane = 0;
            v.v = 1;
            v.stopAt = null;
          }
        }
        continue;
      }
      head.state = "uturn-wait";
      if (this.tryUturn(head, lanesMap)) q.shift();
      else head.state = "pocket";
    }

    // complete trips
    if (toRemove.size) {
      for (const v of toRemove) {
        if (this.t > this.warmup) {
          // the return run beyond the corridor end, at free speed
          const back = v.extraDist;
          this.trips.push({
            type: v.type,
            time: this.t - v.t0 + (back ? back / v.v0 + 20 : 0),
            dist: v.dist + back,
            fuel: v.fuel + (this.A.fuelPerKm[v.type] * back) / 1000,
            slow: v.slowTime,
            reversed: v.plan.kind === "reverse" || back > 0,
            wrongside: v.plan.kind === "wrongside",
            through: v.plan.kind === "through" && v.fromEnd && v.x >= this.L - 1,
            cw0: v.cw0,
          });
        }
      }
      this.vehicles = this.vehicles.filter((v) => !toRemove.has(v));
    }
  }

  private parkInBay(v: Vehicle) {
    const key = `bay:${v.cw}:${Math.round(v.x)}`;
    const q = this.pockets.get(key) ?? [];
    const [a, b] = v.type === "bus" ? this.A.busDwell : this.A.autoDwell;
    v.timer = a + (b - a) * this.rand();
    q.push(v);
    this.pockets.set(key, q);
  }

  /** Cross to the other carriageway if the opposing fast lane has a gap. */
  private tryUturn(v: Vehicle, lanesMap: Map<number, Vehicle[]>) {
    if (v.plan.kind !== "reverse") return false;
    const other = (1 - v.cw) as 0 | 1;
    const xo = this.xOf(other, this.sOf(v.cw, v.x));
    const lanesO = this.lanesAt(other, xo);
    const lane = lanesO - 1;
    const arr = lanesMap.get(other * 10 + lane) ?? [];
    const critical = v.type === "2w" ? 2.5 : v.type === "bus" || v.type === "lcv" ? 5 : 4;
    for (const o of arr) {
      // the space the turner would occupy must be physically free...
      if (o.x > xo - v.len - 1.5 && o.x - o.len < xo + 1.5) return false;
      // ...and moving traffic must be far enough away; queued traffic lets turners nose in
      const d = xo - v.len - o.x;
      if (d > 0 && o.v > 2 && d < o.v * critical + 4) return false;
    }
    v.cw = other;
    v.x = xo;
    v.lane = lane;
    v.v = 2.5;
    v.reversed = true;
    v.state = "drive";
    v.dist += 12; // the turn itself
    this.uturns++;
    insertSorted(lanesMap, v);
    return true;
  }

  run(seconds: number, dt = 0.25) {
    const n = Math.round(seconds / dt);
    for (let i = 0; i < n; i++) this.step(dt);
    return this;
  }

  stats(): Stats {
    const tr = this.trips;
    const thr: [number[], number[]] = [[], []];
    let vehHours = 0,
      vehKm = 0,
      fuel = 0,
      slow = 0,
      wrong = 0,
      ut = 0;
    for (const t of tr) {
      vehHours += t.time / 3600;
      vehKm += t.dist / 1000;
      fuel += t.fuel;
      slow += t.slow / 3600;
      if (t.wrongside) wrong++;
      if (t.reversed) ut++;
    }
    // end-to-end times per direction, comparable with TomTom's corridor travel time
    for (const t of tr) if (t.through) thr[t.cw0].push(t.time);
    const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    return {
      trips: tr.length,
      diverted: this.diverted,
      busTimes: tr.filter((t) => t.type === "bus" && t.through).map((t) => t.time),
      vehHours,
      vehKm,
      fuel,
      slowHours: slow,
      wrongside: wrong,
      uturns: ut,
      throughTimes: thr,
      avgThroughTime: [avg(thr[0]), avg(thr[1])],
    };
  }
}
