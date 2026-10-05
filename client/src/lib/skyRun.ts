export type Platform = { id: number; x: number; z: number; size: number; kind: "plain" | "checkpoint" | "finish" | "bounce" };
export type Runner = { x: number; z: number; y: number; vy: number; grounded: boolean; checkpoint: number; won: boolean; falls: number };
export const starterCourse = (): Platform[] => [
  { id: 1, x: 0, z: 0, size: 4, kind: "plain" },
  { id: 2, x: 0, z: -5, size: 3.6, kind: "plain" },
];
export const newRunner = (course: Platform[]): Runner => ({ x: course[0].x, z: course[0].z, y: 0, vy: 0, grounded: true, checkpoint: course[0].id, won: false, falls: 0 });
export function stepRunner(p: Runner, course: Platform[], dx: number, dz: number, jump: boolean, dt: number): Runner {
  if (p.won) return p;
  const next = { ...p }; const t = Math.min(dt, 1 / 30);
  const length = Math.hypot(dx, dz) || 1;
  next.x += dx / length * 5.5 * t; next.z += dz / length * 5.5 * t;
  if (jump && next.grounded) { next.vy = 8; next.grounded = false; }
  next.vy -= 20 * t; next.y += next.vy * t;
  const landing = course.find(b => Math.abs(next.x - b.x) <= b.size / 2 && Math.abs(next.z - b.z) <= b.size / 2);
  if (landing && p.y >= 0 && next.y <= 0 && next.vy <= 0) {
    next.y = 0; next.vy = 0; next.grounded = true;
    if (landing.kind === "checkpoint") next.checkpoint = landing.id;
    if (landing.kind === "finish") next.won = true;
    if (landing.kind === "bounce") { next.vy = 11; next.grounded = false; }
  } else if (!landing || next.y > 0) next.grounded = false;
  if (next.y < -9) {
    const home = course.find(b => b.id === next.checkpoint) ?? course[0];
    Object.assign(next, { x: home.x, z: home.z, y: 0, vy: 0, grounded: true, falls: next.falls + 1 });
  }
  return next;
}
export function readCourse(value: unknown): Platform[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 30) throw new Error("Use a Sky Run save with 1 to 30 platforms.");
  const ids = new Set<number>();
  return value.map(p => {
    if (!p || !Number.isInteger(p.id) || ids.has(p.id) || ![p.x, p.z, p.size].every(Number.isFinite) || Math.abs(p.x)>100 || Math.abs(p.z)>150 || p.size<2 || p.size>7 || !["plain","checkpoint","finish","bounce"].includes(p.kind)) throw new Error("That save has a platform Sky Run cannot read.");
    ids.add(p.id); return { id:p.id, x:p.x, z:p.z, size:p.size, kind:p.kind };
  });
}
