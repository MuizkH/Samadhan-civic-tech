import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcrypt";
import { randomUUID } from "crypto";

/**
 * Demo-grade seed.
 *
 * Idempotent in two senses: reference data is upserted, and every generated
 * issue carries a deterministic public_ref (SAM-SEED-0001…), so a re-run
 * skips what already exists instead of duplicating it. The generator is
 * driven by a fixed-seed PRNG, so the same dataset comes out every time.
 */

const prisma = new PrismaClient();
const BCRYPT_ROUNDS = 12;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required seed env var: ${name}`);
  return v;
}

/** Deterministic PRNG so the demo dataset is reproducible across runs. */
function mulberry32(seed: number) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260813);

const randInt = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];

/**
 * `city` is the jurisdiction the department's single seeded admin account is
 * posted to — staff reads are scoped to it, so this decides which half of the
 * dataset that login can see.
 *
 * Split across both seeded cities rather than pinned to one so the isolation is
 * demonstrable: log in as the water admin (Bhopal) and the parks admin
 * (Indore) and the two queues share no issues, while the super admin sees
 * both. Override per department with SEED_<CODE>_ADMIN_CITY.
 *
 * water_supply and roads are deliberately in the SAME city: the compound
 * coordination demo in seedCoordination.ts is one Bhopal issue needing both
 * departments in sequence, and splitting that pair would hide half of it from
 * each admin.
 *
 * The consequence of one admin per department is that each department is only
 * staffed in one city — Indore's roads backlog has no dept_admin and is
 * visible only to the super admin. Adding a second admin row per department
 * with the other city is all that is needed to close that gap.
 */
const DEPARTMENTS = [
  { code: "water_supply", nameEn: "Jal Board / Water Corporation", nameHi: "जल बोर्ड", adminCity: "Bhopal" },
  {
    code: "roads",
    nameEn: "Public Works Department (PWD)",
    nameHi: "लोक निर्माण विभाग",
    adminCity: "Bhopal",
  },
  {
    code: "sanitation",
    nameEn: "Municipal Solid Waste Management",
    nameHi: "नगर निगम स्वच्छता विभाग",
    adminCity: "Bhopal",
  },
  {
    code: "electricity",
    nameEn: "State Electricity Board / DISCOM",
    nameHi: "राज्य विद्युत बोर्ड",
    adminCity: "Indore",
  },
  { code: "parks", nameEn: "Horticulture Department", nameHi: "उद्यान विभाग", adminCity: "Indore" },
  {
    code: "buildings",
    nameEn: "Building & Construction Department",
    nameHi: "भवन एवं निर्माण विभाग",
    adminCity: "Indore",
  },
  {
    code: "metro",
    nameEn: "Metro Transit Authority (Bhopal Metro)",
    nameHi: "मेट्रो ट्रांजिट अथॉरिटी (भोपाल मेट्रो)",
    adminCity: "Bhopal",
  },
];

const CATEGORIES = [
  {
    code: "water",
    nameEn: "Water Supply",
    nameHi: "जल आपूर्ति",
    dept: "water_supply",
    priority: 2,
    radius: 100,
    window: 72,
  },
  {
    code: "sanitation",
    nameEn: "Sanitation",
    nameHi: "स्वच्छता",
    dept: "sanitation",
    priority: 3,
    radius: 75,
    window: 48,
  },
  {
    code: "electricity",
    nameEn: "Electricity",
    nameHi: "बिजली",
    dept: "electricity",
    priority: 1,
    radius: 100,
    window: 24,
  },
  { code: "roads", nameEn: "Roads", nameHi: "सड़कें", dept: "roads", priority: 3, radius: 50, window: 168 },
  {
    code: "parks",
    nameEn: "Parks & Gardens",
    nameHi: "पार्क और बगीचे",
    dept: "parks",
    priority: 4,
    radius: 75,
    window: 168,
  },
  {
    code: "buildings",
    nameEn: "Buildings",
    nameHi: "भवन",
    dept: "buildings",
    priority: 2,
    radius: 50,
    window: 168,
  },
  {
    code: "metro",
    nameEn: "Metro Transit & Stations",
    nameHi: "मेट्रो ट्रांजिट और स्टेशन",
    dept: "metro",
    priority: 2,
    radius: 100,
    window: 48,
  },
];

// Demonstrates multi-department routing via data, not code: sanitation
// issues also notify the roads department (garbage often blocks roadways).
const EXTRA_ROUTING_RULES: {
  categoryCode: string;
  departmentCode: string;
  role: "supporting" | "notify";
  priority: number;
}[] = [{ categoryCode: "sanitation", departmentCode: "roads", role: "notify", priority: 5 }];

/**
 * Real ward / arterial-road points so reverse geocoding returns a
 * recognisable address instead of open farmland.
 */
const WARD_POINTS = [
  { city: "Bhopal", area: "MP Nagar Zone-I", lat: 23.233, lng: 77.434 },
  { city: "Bhopal", area: "Arera Colony", lat: 23.2145, lng: 77.4304 },
  { city: "Bhopal", area: "New Market, TT Nagar", lat: 23.2334, lng: 77.4008 },
  { city: "Bhopal", area: "Kolar Road", lat: 23.1765, lng: 77.42 },
  { city: "Bhopal", area: "Habibganj", lat: 23.2295, lng: 77.437 },
  { city: "Bhopal", area: "Shahpura", lat: 23.197, lng: 77.436 },
  { city: "Bhopal", area: "Bairagarh", lat: 23.2795, lng: 77.33 },
  { city: "Bhopal", area: "Ayodhya Bypass Road", lat: 23.286, lng: 77.461 },
  { city: "Bhopal", area: "Govindpura", lat: 23.265, lng: 77.479 },
  { city: "Bhopal", area: "Lalghati", lat: 23.283, lng: 77.383 },
  { city: "Indore", area: "Vijay Nagar", lat: 22.753, lng: 75.8937 },
  { city: "Indore", area: "Palasia Square", lat: 22.7244, lng: 75.8839 },
  { city: "Indore", area: "Rajwada", lat: 22.7177, lng: 75.8545 },
  { city: "Indore", area: "Sudama Nagar", lat: 22.689, lng: 75.829 },
  { city: "Indore", area: "Annapurna Road", lat: 22.696, lng: 75.842 },
  { city: "Indore", area: "Bhawarkuan", lat: 22.691, lng: 75.865 },
  { city: "Indore", area: "Scheme No. 54", lat: 22.748, lng: 75.886 },
  { city: "Indore", area: "Rau", lat: 22.639, lng: 75.808 },
  { city: "Indore", area: "MR-10 Road", lat: 22.766, lng: 75.888 },
  { city: "Indore", area: "Old Palasia", lat: 22.728, lng: 75.879 },
];

/** Target counts out of 120 — roads 30%, sanitation 25%, water 20%, electricity 12%, parks 8%, buildings 5%. */
const CATEGORY_MIX: { code: string; count: number }[] = [
  { code: "roads", count: 36 },
  { code: "sanitation", count: 30 },
  { code: "water", count: 24 },
  { code: "electricity", count: 14 },
  { code: "parks", count: 10 },
  { code: "buildings", count: 6 },
  { code: "metro", count: 12 },
];

/**
 * Per-department resolution speed, in hours. Deliberately distinct so the
 * department comparison in /analytics/departments is meaningful: DISCOM
 * turns streetlights around in a day, PWD takes weeks on road works, and
 * building repairs run longest.
 */
const RESOLUTION_HOURS: Record<string, { min: number; max: number }> = {
  electricity: { min: 3, max: 26 },
  sanitation: { min: 10, max: 72 },
  water_supply: { min: 20, max: 120 },
  parks: { min: 60, max: 220 },
  roads: { min: 100, max: 400 },
  buildings: { min: 220, max: 800 },
  metro: { min: 2, max: 24 },
};

/** Existing civic photos in frontend/public, cycled per category. */
const PHOTO_POOL = [
  "/broken%20road.webp",
  "/hospital%20waste.webp",
  "/water.webp",
  "/electricity.webp",
  "/metro.jpg",
];
const CATEGORY_PHOTO: Record<string, string> = {
  roads: "/broken%20road.webp",
  sanitation: "/hospital%20waste.webp",
  water: "/water.webp",
  electricity: "/electricity.webp",
  metro: "/metro.jpg",
};

const TITLES: Record<string, string[]> = {
  water: [
    "Water pipeline leak on the main road",
    "No water supply for three days",
    "Contaminated water coming from the tap",
    "Drain overflowing onto the street",
    "Waterlogging after every shower",
    "Broken stormwater drain cover",
  ],
  sanitation: [
    "Overflowing garbage bin",
    "Garbage not collected for a week",
    "Open dumping near residential area",
    "Blocked sewer line spilling onto the road",
    "Dead animal not cleared",
  ],
  electricity: [
    "Streetlight outage on residential lane",
    "Frequent power cuts through the evening",
    "Exposed live wire near the park",
    "Transformer sparking at the junction",
  ],
  roads: [
    "Large pothole near the market road",
    "Road caved in after the rains",
    "Broken footpath tiles",
    "Missing manhole cover on the carriageway",
    "Speed breaker worn away completely",
    "Road divider damaged after a collision",
  ],
  parks: [
    "Overgrown park needs maintenance",
    "Broken play equipment in the park",
    "Park lighting not working",
    "Boundary fence broken, stray cattle entering",
  ],
  buildings: [
    "Crack in the municipal building wall",
    "Unsafe staircase railing at the ward office",
    "Water seepage in the community hall",
  ],
  metro: [
    "Escalator not working at metro station",
    "Ticket vending machine malfunctioning",
    "Litter on the metro platform",
    "Metro coach air conditioning failing",
    "Smart card reader gate error",
    "Broken display board at platform",
  ],
};

const DESCRIPTIONS: Record<string, string[]> = {
  water: [
    "Water has been leaking continuously for several days and the road surface is starting to give way.",
    "Residents in the lane have had no supply since Monday and are buying tankers privately.",
    "The water smells foul and is discoloured; several families have reported stomach illness.",
  ],
  sanitation: [
    "The bin has not been emptied in over a week and waste is spilling onto the footpath.",
    "Stray dogs are scattering the garbage across the lane every morning.",
    "There is a strong smell and flies around the area, especially near the school gate.",
  ],
  electricity: [
    "The lane has been completely dark after sunset, which feels unsafe for women returning home.",
    "Power goes out for two to three hours every evening during peak time.",
    "A wire is hanging low over the footpath and children play directly underneath it.",
  ],
  roads: [
    "The pothole is deep enough that two-wheelers have already skidded here twice this month.",
    "After the last rain the surface collapsed and traffic is now down to a single lane.",
    "Pedestrians are forced onto the carriageway because the footpath is unusable.",
  ],
  parks: [
    "The grass has not been cut in months and the walking track is no longer usable.",
    "A swing has broken at the joint and the sharp edge is exposed where children play.",
    "None of the lights work, so the park is unusable after dark.",
  ],
  buildings: [
    "A visible crack has appeared along the load-bearing wall and appears to be widening.",
    "The railing is loose and moves when held; someone will fall from it eventually.",
    "Damp has spread across the ceiling and plaster is coming away in pieces.",
  ],
  metro: [
    "The escalator at Platform 2 is completely stopped, causing heavy congestion during peak hours.",
    "The machine is accepting cash but not dispensing tickets or smart cards.",
    "Multiple plastic cups and trash are scattered across the platform seating area.",
    "The AC in coach C3 is not working and it is extremely suffocating inside.",
  ],
};

const CITIZEN_NAMES = [
  "Rajesh Kumar",
  "Priya Sharma",
  "Amit Patel",
  "Sunita Devi",
  "Vikram Singh",
  "Anjali Verma",
  "Mohammed Irfan",
  "Kavita Joshi",
  "Deepak Malviya",
  "Neha Agrawal",
  "Sanjay Yadav",
  "Rekha Chouhan",
];

const RESOLUTION_NOTES: Record<string, string[]> = {
  water: [
    "Pipeline section replaced and pressure restored.",
    "Leak clamped and the road surface reinstated.",
  ],
  sanitation: [
    "Bin cleared and collection frequency increased for this lane.",
    "Sewer line jetted and the spill area disinfected.",
  ],
  electricity: [
    "Faulty streetlight fitting replaced and tested.",
    "Loose conductor re-tensioned and insulation restored.",
  ],
  roads: ["Pothole filled with hot mix and compacted.", "Carriageway patched and the surface levelled."],
  parks: ["Grass cut, track cleared and debris removed.", "Play equipment repaired and safety-checked."],
  buildings: ["Crack grouted and the wall re-plastered.", "Railing re-anchored and load-tested."],
  metro: [
    "Escalator technician repaired the motor and tested operations.",
    "Ticket machine sensor cleaned and calibrated.",
    "Cleanliness team dispatched, platform cleared.",
    "AC unit serviced and refrigerant recharged.",
  ],
};

const now = new Date();
const MONTH_SPAN = 6;

/** Month buckets covering the trailing 6 months, oldest first. */
function monthBuckets() {
  const buckets: { year: number; month: number; start: Date; end: Date }[] = [];
  for (let i = MONTH_SPAN - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
    buckets.push({ year: start.getFullYear(), month: start.getMonth(), start, end: end > now ? now : end });
  }
  return buckets;
}

/**
 * Monsoon weighting: water and drainage complaints run ~3x through
 * Jul–Sep, so the trend and hotspot charts show a real seasonal shape
 * rather than a flat line.
 */
function monthWeight(categoryCode: string, monthIndex: number): number {
  const isMonsoon = monthIndex >= 6 && monthIndex <= 8; // Jul, Aug, Sep
  if (!isMonsoon) return 1;
  if (categoryCode === "water") return 3;
  if (categoryCode === "sanitation") return 1.6; // drains back up too
  return 1;
}

function randomDateIn(start: Date, end: Date): Date {
  const t = start.getTime() + rand() * (end.getTime() - start.getTime());
  return new Date(Math.min(t, now.getTime()));
}

async function upsertDepartments() {
  const map = new Map<string, string>();
  for (const dept of DEPARTMENTS) {
    const row = await prisma.department.upsert({
      where: { code: dept.code },
      update: { nameEn: dept.nameEn, nameHi: dept.nameHi },
      // Listed field by field rather than spreading `dept`: the constant also
      // carries `adminCity`, which belongs to the admin user, not this row.
      create: { code: dept.code, nameEn: dept.nameEn, nameHi: dept.nameHi },
    });
    map.set(dept.code, row.id);
  }
  return map;
}

async function upsertCategories(deptIds: Map<string, string>) {
  const map = new Map<string, string>();
  for (const cat of CATEGORIES) {
    const departmentId = deptIds.get(cat.dept)!;
    const payload = {
      nameEn: cat.nameEn,
      nameHi: cat.nameHi,
      defaultDepartmentId: departmentId,
      defaultPriority: cat.priority,
      dedupRadiusM: cat.radius,
      dedupWindowHours: cat.window,
    };
    const row = await prisma.issueCategory.upsert({
      where: { code: cat.code },
      update: payload,
      create: { code: cat.code, ...payload },
    });
    map.set(cat.code, row.id);
  }
  return map;
}

async function upsertRoutingRules(deptIds: Map<string, string>, catIds: Map<string, string>) {
  for (const cat of CATEGORIES) {
    await prisma.categoryDepartmentRule.upsert({
      where: {
        categoryId_departmentId_role: {
          categoryId: catIds.get(cat.code)!,
          departmentId: deptIds.get(cat.dept)!,
          role: "primary",
        },
      },
      update: { priority: cat.priority },
      create: {
        categoryId: catIds.get(cat.code)!,
        departmentId: deptIds.get(cat.dept)!,
        role: "primary",
        priority: cat.priority,
      },
    });
  }

  for (const rule of EXTRA_ROUTING_RULES) {
    await prisma.categoryDepartmentRule.upsert({
      where: {
        categoryId_departmentId_role: {
          categoryId: catIds.get(rule.categoryCode)!,
          departmentId: deptIds.get(rule.departmentCode)!,
          role: rule.role,
        },
      },
      update: { priority: rule.priority },
      create: {
        categoryId: catIds.get(rule.categoryCode)!,
        departmentId: deptIds.get(rule.departmentCode)!,
        role: rule.role,
        priority: rule.priority,
      },
    });
  }
}

async function upsertUsers(deptIds: Map<string, string>) {
  const superAdminEmail = requireEnv("SEED_SUPER_ADMIN_EMAIL");
  const superAdminHash = await bcrypt.hash(requireEnv("SEED_SUPER_ADMIN_PASSWORD"), BCRYPT_ROUNDS);
  await prisma.user.upsert({
    where: { email: superAdminEmail },
    update: {},
    create: {
      email: superAdminEmail,
      passwordHash: superAdminHash,
      fullName: "Super Admin",
      role: "super_admin",
    },
  });

  // Each department admin has its own email + password env var.
  // Env key is derived from the department code uppercased:
  //   water_supply → SEED_WATER_SUPPLY_ADMIN_EMAIL / SEED_WATER_SUPPLY_ADMIN_PASSWORD
  const deptAdminIds = new Map<string, string>();
  for (const dept of DEPARTMENTS) {
    const envPrefix = `SEED_${dept.code.toUpperCase()}_ADMIN`;
    const email = requireEnv(`${envPrefix}_EMAIL`);
    const passwordHash = await bcrypt.hash(requireEnv(`${envPrefix}_PASSWORD`), BCRYPT_ROUNDS);
    const city = process.env[`${envPrefix}_CITY`]?.trim() || dept.adminCity;
    const row = await prisma.user.upsert({
      where: { email },
      // City is in the update branch, not just create: re-running the seed
      // against a database where these accounts predate city scoping has to
      // backfill them, or every department login stays fail-closed and empty.
      update: { departmentId: deptIds.get(dept.code), city },
      create: {
        email,
        passwordHash,
        fullName: `${dept.nameEn} Admin`,
        role: "dept_admin",
        departmentId: deptIds.get(dept.code),
        city,
      },
    });
    deptAdminIds.set(dept.code, row.id);
  }

  const citizenHash = await bcrypt.hash(requireEnv("SEED_CITIZEN_PASSWORD"), BCRYPT_ROUNDS);
  const citizenIds: string[] = [];

  // Seed the standard demo citizen
  const citizenDemoEmail = "citizen@samadhan.gov";
  const citizenDemoRow = await prisma.user.upsert({
    where: { email: citizenDemoEmail },
    update: { fullName: "Citizen User" },
    create: { email: citizenDemoEmail, passwordHash: citizenHash, fullName: "Citizen User", role: "citizen" },
  });
  citizenIds.push(citizenDemoRow.id);

  for (let i = 0; i < CITIZEN_NAMES.length; i++) {
    const email = `citizen${i + 1}@samadhan.gov.in`;
    const row = await prisma.user.upsert({
      where: { email },
      update: { fullName: CITIZEN_NAMES[i] },
      create: { email, passwordHash: citizenHash, fullName: CITIZEN_NAMES[i], role: "citizen" },
    });
    citizenIds.push(row.id);
  }

  return { citizenIds, deptAdminIds };
}

type PlannedIssue = {
  id: string;
  ref: string;
  categoryCode: string;
  dept: string;
  title: string;
  description: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  createdAt: Date;
  /** Hours this department realistically takes on this issue. */
  resolutionHours: number;
  lifecycle: "open" | "in_progress" | "done";
  finalStatus: string;
  photoUrl: string;
  reporterId: string;
};

/** Builds the full 120-issue plan in memory before touching the database. */
function planIssues(citizenIds: string[]): PlannedIssue[] {
  const buckets = monthBuckets();
  const planned: PlannedIssue[] = [];
  let refCounter = 1;
  let photoCycle = 0;

  for (const { code, count } of CATEGORY_MIX) {
    const cat = CATEGORIES.find((c) => c.code === code)!;

    // Spread this category's issues across months using the seasonal weights.
    const weights = buckets.map((b) => monthWeight(code, b.month));
    const weightTotal = weights.reduce((a, b) => a + b, 0);
    const perMonth = weights.map((w) => Math.round((w / weightTotal) * count));

    // Rounding drift — fix up against the target count.
    let drift = count - perMonth.reduce((a, b) => a + b, 0);
    for (let i = perMonth.length - 1; drift !== 0 && i >= 0; i--) {
      const step = drift > 0 ? 1 : -1;
      if (perMonth[i] + step >= 0) {
        perMonth[i] += step;
        drift -= step;
      }
    }

    buckets.forEach((bucket, bIdx) => {
      for (let n = 0; n < perMonth[bIdx]; n++) {
        const ward = pick(WARD_POINTS);
        // Tight jitter (~±250 m) keeps issues inside the named locality.
        const lat = ward.lat + (rand() - 0.5) * 0.005;
        const lng = ward.lng + (rand() - 0.5) * 0.005;
        const profile = RESOLUTION_HOURS[cat.dept];

        planned.push({
          id: randomUUID(),
          resolutionHours: profile.min + rand() * (profile.max - profile.min),
          ref: `SAM-SEED-${String(refCounter++).padStart(4, "0")}`,
          categoryCode: code,
          dept: cat.dept,
          title: pick(TITLES[code]),
          description: pick(DESCRIPTIONS[code]),
          address: `${ward.area}, ${ward.city}, Madhya Pradesh`,
          city: ward.city,
          lat,
          lng,
          createdAt: randomDateIn(bucket.start, bucket.end),
          lifecycle: "open",
          finalStatus: "reported",
          photoUrl: CATEGORY_PHOTO[code] ?? PHOTO_POOL[photoCycle++ % PHOTO_POOL.length],
          reporterId: pick(citizenIds),
        });
      }
    });
  }

  // Lifecycle mix: 15% open, 20% in_progress, 65% resolved/verified.
  //
  // Ranked by how much of its own department's turnaround has already
  // elapsed, not by raw age. Ranking on age alone left every issue from the
  // current month unresolved, which flatlined the "resolved" trend line —
  // in reality DISCOM closes a streetlight fault the same week, while a
  // building repair filed in March can still be open.
  const scored = planned
    .map((p) => {
      const elapsedHours = (now.getTime() - p.createdAt.getTime()) / 3_600_000;
      return { p, score: (elapsedHours / p.resolutionHours) * (0.75 + rand() * 0.5) };
    })
    .sort((a, b) => b.score - a.score);

  const doneCount = Math.round(planned.length * 0.65);
  const inProgressCount = Math.round(planned.length * 0.2);

  scored.forEach(({ p }, idx) => {
    if (idx < doneCount) {
      p.lifecycle = "done";
      // Around 40% of finished issues have been confirmed by the reporter.
      p.finalStatus = rand() < 0.4 ? "verified" : "resolved";
    } else if (idx < doneCount + inProgressCount) {
      p.lifecycle = "in_progress";
      p.finalStatus = "in_progress";
    } else {
      p.lifecycle = "open";
      p.finalStatus = rand() < 0.45 ? "acknowledged" : "reported";
    }
  });

  return planned.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

async function seedIssues(
  catIds: Map<string, string>,
  citizenIds: string[],
  deptAdminIds: Map<string, string>
) {
  const planned = planIssues(citizenIds);

  const existing = await prisma.issue.findMany({
    where: { publicRef: { startsWith: "SAM-SEED-" } },
    select: { publicRef: true },
  });
  const existingRefs = new Set(existing.map((e) => e.publicRef));
  const todo = planned.filter((p) => !existingRefs.has(p.ref));

  if (todo.length === 0) {
    console.log(`Issues already seeded (${existingRefs.size} present) — nothing to do.`);
    return { created: 0 };
  }
  if (existingRefs.size > 0) {
    console.log(`Resuming: ${existingRefs.size} already present, creating ${todo.length}.`);
  }

  // Single multi-row insert — geography columns need raw SQL.
  const values = todo.map(
    (p) => Prisma.sql`(
      ${p.id}::uuid, ${p.ref}, ${p.title}, ${p.description}, ${catIds.get(p.categoryCode)!}::uuid,
      ${p.finalStatus}::"IssueStatus",
      ${CATEGORIES.find((c) => c.code === p.categoryCode)!.priority},
      ${p.reporterId}::uuid, ${p.address}, ${p.city},
      ST_SetSRID(ST_MakePoint(${p.lng}, ${p.lat}), 4326)::geography,
      ${p.createdAt}
    )`
  );

  // Everything below runs in one transaction: a partial seed would leave
  // issues with no status history, which the resume check would then skip
  // over and quietly treat as complete.
  return prisma.$transaction(
    async (tx) => {
      const inserted = await tx.$queryRaw<{ id: string; public_ref: string }[]>(Prisma.sql`
        INSERT INTO issues (id, public_ref, title, description, category_id, status, priority, reported_by, address, city, location, created_at)
        VALUES ${Prisma.join(values, ", ")}
        RETURNING id, public_ref
      `);

      const idByRef = new Map(inserted.map((r) => [r.public_ref, r.id]));

      const reports: Prisma.IssueReportCreateManyInput[] = [];
      const history: Prisma.IssueStatusHistoryCreateManyInput[] = [];
      const media: Prisma.IssueMediaCreateManyInput[] = [];
      const workOrders: Prisma.WorkOrderCreateManyInput[] = [];
      const supports: Prisma.IssueSupportCreateManyInput[] = [];
      const verifications: Prisma.CitizenVerificationCreateManyInput[] = [];
      const issueUpdates: {
        id: string;
        supportsCount: number;
        acknowledgedAt: Date | null;
        resolvedAt: Date | null;
        verifiedAt: Date | null;
        resolutionNote: string | null;
        resolvedById: string | null;
      }[] = [];

      const rules = await prisma.categoryDepartmentRule.findMany();

      // Dense wards get the duplicate clusters, so dedup is visible where it
      // would realistically happen.
      const clusterRefs = new Set(
        todo
          .filter((p) => p.lifecycle !== "open")
          .slice(0, 10)
          .map((p) => p.ref)
      );
      // A handful of issues become genuine community hotspots.
      const hotspotRefs = new Set(
        todo
          .filter((_, i) => i % 17 === 0)
          .slice(0, 8)
          .map((p) => p.ref)
      );

      for (const p of todo) {
        const issueId = idByRef.get(p.ref)!;
        const deptAdminId = deptAdminIds.get(p.dept)!;
        const catId = catIds.get(p.categoryCode)!;

        // ── Status history chain ────────────────────────────────────────────
        const chain: string[] =
          p.lifecycle === "done"
            ? p.finalStatus === "verified"
              ? ["reported", "acknowledged", "in_progress", "resolved", "verified"]
              : ["reported", "acknowledged", "in_progress", "resolved"]
            : p.lifecycle === "in_progress"
              ? ["reported", "acknowledged", "in_progress"]
              : p.finalStatus === "acknowledged"
                ? ["reported", "acknowledged"]
                : ["reported"];

        const totalResolutionHours = p.resolutionHours;
        let cursor = p.createdAt.getTime();
        let acknowledgedAt: Date | null = null;
        let resolvedAt: Date | null = null;
        let verifiedAt: Date | null = null;

        for (let step = 0; step < chain.length; step++) {
          const toStatus = chain[step];
          const fromStatus = step === 0 ? null : chain[step - 1];

          if (step > 0) {
            // Spread the department's total turnaround across the steps:
            // acknowledge quickly, then the bulk of the time doing the work.
            const share =
              toStatus === "acknowledged"
                ? 0.15
                : toStatus === "in_progress"
                  ? 0.25
                  : toStatus === "resolved"
                    ? 0.6
                    : 0.2;
            cursor += totalResolutionHours * share * 3_600_000;
          }
          const at = new Date(Math.min(cursor, now.getTime()));
          const byCitizen = toStatus === "reported" || toStatus === "verified";

          history.push({
            issueId,
            fromStatus,
            toStatus,
            actorId: byCitizen ? p.reporterId : deptAdminId,
            actorRole: byCitizen ? "citizen" : "dept_admin",
            reason:
              toStatus === "reported"
                ? "Issue reported"
                : toStatus === "verified"
                  ? "Citizen confirmed the resolution"
                  : `Status moved to ${toStatus}`,
            createdAt: at,
          });

          if (toStatus === "acknowledged") acknowledgedAt = at;
          if (toStatus === "resolved") resolvedAt = at;
          if (toStatus === "verified") verifiedAt = at;
        }

        // ── Primary citizen report + evidence photo ─────────────────────────
        reports.push({
          issueId,
          reporterId: p.reporterId,
          description: p.description,
          isPrimary: true,
          createdAt: p.createdAt,
        });

        media.push({
          issueId,
          kind: "evidence",
          url: p.photoUrl,
          publicId: `seed/evidence/${p.ref}`,
          uploadedBy: p.reporterId,
          createdAt: p.createdAt,
        });

        if (resolvedAt) {
          media.push({
            issueId,
            kind: "resolution_proof",
            url: p.photoUrl,
            publicId: `seed/resolution/${p.ref}`,
            uploadedBy: deptAdminId,
            createdAt: resolvedAt,
          });
        }

        // ── Duplicate clusters: several citizens reporting the same thing ───
        let extraReporters: string[] = [];
        if (clusterRefs.has(p.ref)) {
          const others = citizenIds.filter((c) => c !== p.reporterId);
          const n = randInt(3, 5);
          extraReporters = others.slice(0, n);
          for (const reporterId of extraReporters) {
            reports.push({
              issueId,
              reporterId,
              description: "Reporting the same problem — it is still not fixed.",
              isPrimary: false,
              createdAt: new Date(
                Math.min(p.createdAt.getTime() + randInt(1, 48) * 3_600_000, now.getTime())
              ),
            });
          }
        }

        // ── Work orders from the routing rules ──────────────────────────────
        const categoryRules = rules.filter((r) => r.categoryId === catId);
        const woStatus =
          p.lifecycle === "done"
            ? "done"
            : p.lifecycle === "in_progress"
              ? "in_progress"
              : p.finalStatus === "acknowledged"
                ? "acknowledged"
                : "pending";
        categoryRules.forEach((rule, idx) => {
          workOrders.push({
            issueId,
            departmentId: rule.departmentId,
            role: rule.role,
            status: woStatus,
            priority: rule.priority,
            sequence: idx,
            createdAt: p.createdAt,
            completedAt: resolvedAt,
          });
        });

        // ── Supports and verification votes ─────────────────────────────────
        const supporterPool = citizenIds.filter((c) => c !== p.reporterId);
        const supportCount = hotspotRefs.has(p.ref)
          ? Math.min(supporterPool.length, randInt(8, 11))
          : randInt(0, 4);
        const supporters = supporterPool.slice(0, supportCount);
        for (const userId of supporters) {
          supports.push({
            issueId,
            userId,
            createdAt: new Date(Math.min(p.createdAt.getTime() + randInt(1, 200) * 3_600_000, now.getTime())),
          });
        }

        // Voters skew towards confirming; disputes cluster on unresolved issues.
        const voterCount = hotspotRefs.has(p.ref) ? randInt(6, 10) : randInt(0, 5);
        const voters = supporterPool.slice(0, Math.min(voterCount, supporterPool.length));
        for (const userId of voters) {
          verifications.push({ issueId, userId, vote: rand() < 0.82 });
        }

        issueUpdates.push({
          id: issueId,
          supportsCount: supporters.length + extraReporters.length,
          acknowledgedAt,
          resolvedAt,
          verifiedAt,
          resolutionNote: resolvedAt ? pick(RESOLUTION_NOTES[p.categoryCode]) : null,
          resolvedById: resolvedAt ? deptAdminId : null,
        });
      }

      await tx.issueReport.createMany({ data: reports });
      await tx.issueStatusHistory.createMany({ data: history });
      await tx.issueMedia.createMany({ data: media });
      await tx.workOrder.createMany({ data: workOrders });
      await tx.issueSupport.createMany({ data: supports, skipDuplicates: true });
      await tx.citizenVerification.createMany({ data: verifications, skipDuplicates: true });

      // Denormalised counters + lifecycle timestamps, one statement.
      await tx.$executeRaw(Prisma.sql`
    UPDATE issues AS i SET
      supports_count  = v.supports_count,
      acknowledged_at = v.acknowledged_at,
      resolved_at     = v.resolved_at,
      verified_at     = v.verified_at,
      resolution_note = v.resolution_note,
      resolved_by     = v.resolved_by
    FROM (VALUES ${Prisma.join(
      issueUpdates.map(
        (u) => Prisma.sql`(
          ${u.id}::uuid, ${u.supportsCount}::int, ${u.acknowledgedAt}::timestamp,
          ${u.resolvedAt}::timestamp, ${u.verifiedAt}::timestamp,
          ${u.resolutionNote}::text, ${u.resolvedById}::uuid
        )`
      ),
      ", "
    )}) AS v(id, supports_count, acknowledged_at, resolved_at, verified_at, resolution_note, resolved_by)
        WHERE i.id = v.id
      `);

      console.log(
        `Seeded ${todo.length} issues · ${reports.length} reports · ${history.length} history rows · ` +
          `${media.length} media · ${workOrders.length} work orders · ${supports.length} supports · ${verifications.length} votes`
      );
      console.log(`Duplicate clusters: ${clusterRefs.size} · community hotspots: ${hotspotRefs.size}`);
      return { created: todo.length };
    },
    { timeout: 180_000, maxWait: 20_000 }
  );
}

async function main() {
  console.log("Seeding departments…");
  const deptIds = await upsertDepartments();

  console.log("Seeding categories…");
  const catIds = await upsertCategories(deptIds);

  console.log("Seeding routing rules…");
  await upsertRoutingRules(deptIds, catIds);

  console.log("Seeding users…");
  const { citizenIds, deptAdminIds } = await upsertUsers(deptIds);

  console.log("Seeding issues…");
  await seedIssues(catIds, citizenIds, deptAdminIds);

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
