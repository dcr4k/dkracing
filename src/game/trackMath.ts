import { LicenseTestId, TrackId, TrackProjection, TrackSample } from './types';

export interface ControlPoint {
  x: number;
  y: number;
  z: number;
  width?: number;
}

export interface TrackData {
  id: string;
  name: string;
  environmentType: 'circuit' | 'touge' | 'expressway';
  closed: boolean;
  samples: TrackSample[];
  totalLength: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

// Catmull-Rom centripetal interpolation on 3D points
function catmullRom(p0: ControlPoint, p1: ControlPoint, p2: ControlPoint, p3: ControlPoint, t: number): ControlPoint {
  const t2 = t * t;
  const t3 = t2 * t;
  const interp = (a: number, b: number, c: number, d: number) =>
    0.5 *
    (2 * b +
      (-a + c) * t +
      (2 * a - 5 * b + 4 * c - d) * t2 +
      (-a + 3 * b - 3 * c + d) * t3);

  return {
    x: interp(p0.x, p1.x, p2.x, p3.x),
    y: interp(p0.y, p1.y, p2.y, p3.y),
    z: interp(p0.z, p1.z, p2.z, p3.z),
    width: (p1.width ?? 15) * (1 - t) + (p2.width ?? 15) * t,
  };
}

export function buildTrackFromControlPoints(
  id: string,
  name: string,
  points: ControlPoint[],
  closed: boolean,
  subdivisionsPerSegment = 16,
  environmentType: 'circuit' | 'touge' | 'expressway' = 'circuit',
): TrackData {
  const raw: ControlPoint[] = [];
  const n = points.length;
  const segCount = closed ? n : n - 1;

  for (let i = 0; i < segCount; i++) {
    const p0 = closed ? points[(i - 1 + n) % n] : points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = closed ? points[(i + 1) % n] : points[Math.min(n - 1, i + 1)];
    const p3 = closed ? points[(i + 2) % n] : points[Math.min(n - 1, i + 2)];

    for (let j = 0; j < subdivisionsPerSegment; j++) {
      const t = j / subdivisionsPerSegment;
      raw.push(catmullRom(p0, p1, p2, p3, t));
    }
  }
  if (!closed) {
    raw.push(points[n - 1]);
  }

  const samples: TrackSample[] = [];
  let s = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < raw.length; i++) {
    const prev = closed ? raw[(i - 1 + raw.length) % raw.length] : raw[Math.max(0, i - 1)];
    const curr = raw[i];
    const next = closed ? raw[(i + 1) % raw.length] : raw[Math.min(raw.length - 1, i + 1)];

    if (i > 0) {
      const dx = curr.x - raw[i - 1].x;
      const dy = curr.y - raw[i - 1].y;
      const dz = curr.z - raw[i - 1].z;
      s += Math.hypot(dx, dy, dz);
    }

    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    const tx = dx / len;
    const tz = dz / len;
    // Right normal in right-handed (X right, Z forward): (-tz, tx)
    const nx = -tz;
    const nz = tx;

    // Signed curvature from prev->curr->next
    const v1x = curr.x - prev.x;
    const v1z = curr.z - prev.z;
    const v2x = next.x - curr.x;
    const v2z = next.z - curr.z;
    const l1 = Math.hypot(v1x, v1z) || 1;
    const l2 = Math.hypot(v2x, v2z) || 1;
    const cross = (v1x * v2z - v1z * v2x) / (l1 * l2);
    const segLen = 0.5 * (l1 + l2);
    const curvature = segLen > 0.01 ? cross / segLen : 0;

    minX = Math.min(minX, curr.x);
    maxX = Math.max(maxX, curr.x);
    minZ = Math.min(minZ, curr.z);
    maxZ = Math.max(maxZ, curr.z);

    samples.push({
      s,
      x: curr.x,
      y: curr.y,
      z: curr.z,
      tx,
      tz,
      nx,
      nz,
      curvature,
      width: curr.width ?? 15,
      hasLeftCurb: curvature < -0.0045,
      hasRightCurb: curvature > 0.0045,
    });
  }

  let totalLength = s;
  if (closed && raw.length > 1) {
    const first = raw[0];
    const last = raw[raw.length - 1];
    totalLength += Math.hypot(first.x - last.x, first.y - last.y, first.z - last.z);
  }

  // Smooth curb flags slightly so curbs don't flicker for 1 segment
  for (let i = 0; i < samples.length; i++) {
    const p = samples[(i - 1 + samples.length) % samples.length];
    const n2 = samples[(i + 1) % samples.length];
    if (Math.abs(samples[i].curvature) > 0.004) {
      if (samples[i].curvature > 0) {
        samples[i].hasRightCurb = true;
        samples[i].hasLeftCurb = Math.abs(samples[i].curvature) > 0.012;
      } else {
        samples[i].hasLeftCurb = true;
        samples[i].hasRightCurb = Math.abs(samples[i].curvature) > 0.012;
      }
    } else if (p.hasLeftCurb && n2.hasLeftCurb) {
      samples[i].hasLeftCurb = true;
    } else if (p.hasRightCurb && n2.hasRightCurb) {
      samples[i].hasRightCurb = true;
    }
  }

  return {
    id,
    name,
    environmentType,
    closed,
    samples,
    totalLength,
    bounds: { minX, maxX, minZ, maxZ },
  };
}

// 1. Circuito Grand Prix (~1.55 km — fast, technical GT4-inspired GP loop)
const GRAND_PRIX_POINTS: ControlPoint[] = [
  { x: 0, y: 0, z: 0, width: 16 },
  { x: 0, y: 0, z: 125, width: 16 },
  { x: 26, y: 1.5, z: 222, width: 15.5 },
  { x: 110, y: 4.5, z: 274, width: 15 },
  { x: 205, y: 5.5, z: 248, width: 15 },
  { x: 272, y: 3.5, z: 178, width: 15 },
  { x: 246, y: 1.5, z: 88, width: 14.5 },
  { x: 164, y: 1.0, z: 45, width: 14.5 },
  { x: 188, y: 2.0, z: -40, width: 14.5 },
  { x: 260, y: 2.5, z: -130, width: 15 },
  { x: 218, y: 1.5, z: -226, width: 15.5 },
  { x: 122, y: 0.5, z: -242, width: 16 },
  { x: 60, y: 0.2, z: -168, width: 15 },
  { x: 18, y: 0, z: -96, width: 16 },
];

// 2. Serra Touge (~1.38 km — tight mountain drift circuit with elevation & rhythmic hairpins)
const SERRA_TOUGE_POINTS: ControlPoint[] = [
  { x: 0, y: 0, z: 0, width: 13.5 },
  { x: 0, y: 0.6, z: 82, width: 13.5 },
  { x: 42, y: 3.4, z: 145, width: 13.2 },
  { x: 108, y: 6.8, z: 140, width: 13.0 }, // Hairpin 1 crest
  { x: 118, y: 9.2, z: 72, width: 13.0 },
  { x: 172, y: 11.4, z: 42, width: 13.0 }, // Tight uphill left-right
  { x: 235, y: 12.2, z: 82, width: 13.2 },
  { x: 256, y: 10.6, z: 8, width: 13.2 },
  { x: 204, y: 8.2, z: -55, width: 13.0 }, // Downhill drift esses
  { x: 242, y: 6.0, z: -132, width: 13.2 },
  { x: 175, y: 3.5, z: -182, width: 13.5 }, // Wide drift hairpin
  { x: 96, y: 2.0, z: -148, width: 13.5 },
  { x: 54, y: 0.8, z: -96, width: 13.5 },
  { x: 12, y: 0, z: -56, width: 13.5 },
];

// 3. Via Expressa Noturna (~2.12 km — wide metropolitan Wangan-style high-speed expressway loop)
const NIGHT_EXPRESSWAY_POINTS: ControlPoint[] = [
  { x: 0, y: 0, z: 0, width: 18.5 },
  { x: 0, y: 0, z: 195, width: 18.5 },       // Long Wangan start straight
  { x: 45, y: 1.8, z: 345, width: 18.5 },    // High-speed sweeping entry
  { x: 165, y: 3.5, z: 420, width: 18.0 },   // Fast elevated viaduct right
  { x: 315, y: 4.0, z: 380, width: 18.0 },
  { x: 405, y: 2.5, z: 255, width: 18.0 },   // Long full-throttle sweeper
  { x: 395, y: 1.5, z: 75, width: 18.0 },    // Back expressway straight
  { x: 355, y: 1.0, z: -120, width: 18.0 },
  { x: 290, y: 2.2, z: -270, width: 18.0 },  // Fast bay-bridge chicane
  { x: 160, y: 2.6, z: -315, width: 18.0 },
  { x: 55, y: 1.2, z: -245, width: 18.5 },   // Final sweeping exit onto straight
  { x: 8, y: 0, z: -125, width: 18.5 },
];

const trackCache = new Map<TrackId, TrackData>();

export function getTrackById(trackId: TrackId): TrackData {
  const existing = trackCache.get(trackId);
  if (existing) return existing;

  let built: TrackData;
  if (trackId === 'serra_touge') {
    built = buildTrackFromControlPoints(
      'serra_touge',
      'Serra Touge',
      SERRA_TOUGE_POINTS,
      true,
      18,
      'touge',
    );
  } else if (trackId === 'night_expressway') {
    built = buildTrackFromControlPoints(
      'night_expressway',
      'Via Expressa Noturna',
      NIGHT_EXPRESSWAY_POINTS,
      true,
      18,
      'expressway',
    );
  } else {
    built = buildTrackFromControlPoints(
      'grand_prix',
      'Circuito Grand Prix',
      GRAND_PRIX_POINTS,
      true,
      18,
      'circuit',
    );
  }

  trackCache.set(trackId, built);
  return built;
}

export function getAutumnValleyTrack(): TrackData {
  return getTrackById('grand_prix');
}

export function getLicenseTrack(licenseId: LicenseTestId): TrackData {
  if (licenseId === 'B-1') {
    return buildTrackFromControlPoints(
      'license_b1',
      'Licença B-1 · Reta 400m',
      [
        { x: 0, y: 0, z: -30, width: 16 },
        { x: 0, y: 0, z: 100, width: 16 },
        { x: 0, y: 0, z: 240, width: 16 },
        { x: 0, y: 0, z: 360, width: 16 },
        { x: 0, y: 0, z: 480, width: 16 },
      ],
      false,
      16,
      'circuit',
    );
  }

  if (licenseId === 'B-2') {
    return buildTrackFromControlPoints(
      'license_b2',
      'Licença B-2 · Curva em U',
      [
        { x: 0, y: 0, z: -20, width: 15.5 },
        { x: 0, y: 0, z: 90, width: 15.5 },
        { x: 8, y: 0.5, z: 175, width: 15.5 },
        { x: 56, y: 1.5, z: 218, width: 15.5 },
        { x: 112, y: 1.5, z: 188, width: 15.5 },
        { x: 122, y: 0.6, z: 112, width: 15.5 },
        { x: 122, y: 0, z: 15, width: 15.5 },
        { x: 122, y: 0, z: -60, width: 15.5 },
      ],
      false,
      18,
      'circuit',
    );
  }

  return buildTrackFromControlPoints(
    'license_b3',
    'Licença B-3 · Chicane Técnica',
    [
      { x: 0, y: 0, z: -20, width: 15 },
      { x: 0, y: 0, z: 95, width: 15 },
      { x: -34, y: 0.8, z: 185, width: 14.5 },
      { x: -8, y: 1.4, z: 270, width: 14.5 },
      { x: 48, y: 1.2, z: 345, width: 14.5 },
      { x: 22, y: 0.4, z: 435, width: 15 },
      { x: 18, y: 0, z: 540, width: 15.5 },
      { x: 18, y: 0, z: 620, width: 15.5 },
    ],
    false,
    18,
    'circuit',
  );
}

export function getSampleAtS(track: TrackData, sRaw: number): TrackSample {
  const { samples, totalLength, closed } = track;
  let s = sRaw;
  if (closed) {
    s = ((s % totalLength) + totalLength) % totalLength;
  } else {
    s = Math.max(0, Math.min(totalLength, s));
  }

  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].s <= s) lo = mid;
    else hi = mid;
  }

  const a = samples[lo];
  const b = samples[hi];
  const span = Math.max(0.0001, b.s - a.s);
  const t = Math.max(0, Math.min(1, (s - a.s) / span));

  const tx = a.tx + (b.tx - a.tx) * t;
  const tz = a.tz + (b.tz - a.tz) * t;
  const tLen = Math.hypot(tx, tz) || 1;
  const utx = tx / tLen;
  const utz = tz / tLen;

  return {
    s,
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    tx: utx,
    tz: utz,
    nx: -utz,
    nz: utx,
    curvature: a.curvature + (b.curvature - a.curvature) * t,
    width: a.width + (b.width - a.width) * t,
    hasLeftCurb: a.hasLeftCurb,
    hasRightCurb: a.hasRightCurb,
  };
}

export function projectPointToTrack(track: TrackData, x: number, z: number, hintIndex?: number): TrackProjection {
  const { samples, closed } = track;
  const n = samples.length;
  let bestIdx = 0;
  let bestDistSq = Infinity;

  if (hintIndex !== undefined && hintIndex >= 0 && hintIndex < n) {
    const window = 24;
    for (let offset = -window; offset <= window; offset++) {
      const idx = closed ? (hintIndex + offset + n) % n : Math.max(0, Math.min(n - 1, hintIndex + offset));
      const dx = x - samples[idx].x;
      const dz = z - samples[idx].z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = idx;
      }
    }
  }

  if (bestDistSq > 400) {
    for (let i = 0; i < n; i++) {
      const dx = x - samples[i].x;
      const dz = z - samples[i].z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = i;
      }
    }
  }

  const sp = samples[bestIdx];
  const dx = x - sp.x;
  const dz = z - sp.z;
  const along = dx * sp.tx + dz * sp.tz;
  const lateralOffset = dx * sp.nx + dz * sp.nz;
  const halfWidth = sp.width * 0.5;
  const absLat = Math.abs(lateralOffset);
  const onCurb = absLat >= halfWidth - 0.85 && absLat <= halfWidth + 1.05;
  const onTrack = absLat <= halfWidth + 0.9;

  let s = sp.s + along;
  if (closed) {
    s = ((s % track.totalLength) + track.totalLength) % track.totalLength;
  } else {
    s = Math.max(0, Math.min(track.totalLength, s));
  }

  const nextIdx = closed ? (bestIdx + 1) % n : Math.min(n - 1, bestIdx + 1);
  const prevIdx = closed ? (bestIdx - 1 + n) % n : Math.max(0, bestIdx - 1);
  const neighbor = along >= 0 ? samples[nextIdx] : samples[prevIdx];
  const segDist = Math.hypot(neighbor.x - sp.x, neighbor.z - sp.z) || 1;
  const frac = Math.min(1, Math.abs(along) / segDist);
  const heightY = sp.y + (neighbor.y - sp.y) * frac;

  return {
    s,
    lateralOffset,
    sampleIndex: bestIdx,
    heightY,
    tx: sp.tx,
    tz: sp.tz,
    nx: sp.nx,
    nz: sp.nz,
    halfWidth,
    onTrack,
    onCurb,
  };
}
