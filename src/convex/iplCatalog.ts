// ---------------------------------------------------------------------------
// iplCatalog.ts — embedded reference dataset of real IPL players.
//
// Used by the "real IPL auction" mode. Stats are curated approximations of
// IPL career numbers + the most recent season ("form") — good enough to run
// a fun, competitive auction with friends. Swap this static file for a live
// stats API later if you want live numbers; the schema (career/form) stays
// the same.
//
// `wiki` is the English Wikipedia title used to fetch the player's photo at
// call time (Wikimedia REST API, no key needed). Prices are in lakhs (₹).
// ---------------------------------------------------------------------------

export interface IplStatLine {
  matches: number;
  runs: number;
  wickets: number;
  sr: number; // strike rate
  econ: number; // economy (bowlers)
}

export interface IplPlayer {
  key: string;
  name: string;
  role: "Batter" | "All-rounder" | "Wicketkeeper" | "Bowler";
  country: string;
  team: string; // IPL franchise short code
  base: number; // base price in lakhs
  wiki: string;
  career: IplStatLine;
  form: IplStatLine;
}

const P = (
  key: string,
  name: string,
  role: IplPlayer["role"],
  country: string,
  team: string,
  base: number,
  wiki: string,
  career: IplStatLine,
  form: IplStatLine,
): IplPlayer => ({ key, name, role, country, team, base, wiki, career, form });

export const IPL_PLAYERS: IplPlayer[] = [
  // ---- marquee batters / keepers -------------------------------------------
  P("kohli", "Virat Kohli", "Batter", "India", "RCB", 200, "Virat Kohli", { matches: 252, runs: 8004, wickets: 4, sr: 132, econ: 0 }, { matches: 15, runs: 560, wickets: 0, sr: 133, econ: 0 }),
  P("rohit", "Rohit Sharma", "Batter", "India", "MI", 200, "Rohit Sharma", { matches: 257, runs: 6628, wickets: 15, sr: 131, econ: 0 }, { matches: 15, runs: 480, wickets: 0, sr: 129, econ: 0 }),
  P("dhoni", "MS Dhoni", "Wicketkeeper", "India", "CSK", 200, "MS Dhoni", { matches: 264, runs: 5243, wickets: 0, sr: 137, econ: 0 }, { matches: 13, runs: 350, wickets: 0, sr: 148, econ: 0 }),
  P("surya", "Suryakumar Yadav", "Batter", "India", "MI", 200, "Suryakumar Yadav", { matches: 117, runs: 3251, wickets: 0, sr: 145, econ: 0 }, { matches: 15, runs: 540, wickets: 0, sr: 148, econ: 0 }),
  P("pant", "Rishabh Pant", "Wicketkeeper", "India", "LSG", 200, "Rishabh Pant", { matches: 111, runs: 3284, wickets: 0, sr: 149, econ: 0 }, { matches: 15, runs: 460, wickets: 0, sr: 152, econ: 0 }),
  P("klrahul", "KL Rahul", "Wicketkeeper", "India", "DC", 200, "KL Rahul", { matches: 132, runs: 4683, wickets: 0, sr: 134, econ: 0 }, { matches: 14, runs: 520, wickets: 0, sr: 136, econ: 0 }),
  P("gill", "Shubman Gill", "Batter", "India", "GT", 200, "Shubman Gill", { matches: 103, runs: 3198, wickets: 0, sr: 137, econ: 0 }, { matches: 16, runs: 640, wickets: 0, sr: 139, econ: 0 }),
  P("gaikwad", "Ruturaj Gaikwad", "Batter", "India", "CSK", 200, "Ruturaj Gaikwad", { matches: 72, runs: 2504, wickets: 0, sr: 137, econ: 0 }, { matches: 14, runs: 500, wickets: 0, sr: 140, econ: 0 }),
  P("buttler", "Jos Buttler", "Wicketkeeper", "England", "GT", 200, "Jos Buttler", { matches: 118, runs: 3837, wickets: 0, sr: 141, econ: 0 }, { matches: 15, runs: 540, wickets: 0, sr: 143, econ: 0 }),
  P("faf", "Faf du Plessis", "Batter", "South Africa", "DC", 150, "Faf du Plessis", { matches: 145, runs: 4809, wickets: 0, sr: 136, econ: 0 }, { matches: 13, runs: 420, wickets: 0, sr: 134, econ: 0 }),
  P("qdk", "Quinton de Kock", "Wicketkeeper", "South Africa", "KKR", 150, "Quinton de Kock", { matches: 113, runs: 3462, wickets: 0, sr: 135, econ: 0 }, { matches: 14, runs: 480, wickets: 0, sr: 138, econ: 0 }),
  P("maxwell", "Glenn Maxwell", "All-rounder", "Australia", "PBKS", 200, "Glenn Maxwell", { matches: 134, runs: 2782, wickets: 36, sr: 155, econ: 8.5 }, { matches: 14, runs: 330, wickets: 5, sr: 158, econ: 8.7 }),
  P("klassen", "Heinrich Klaasen", "Wicketkeeper", "South Africa", "SRH", 200, "Heinrich Klaasen", { matches: 54, runs: 1650, wickets: 0, sr: 176, econ: 0 }, { matches: 15, runs: 490, wickets: 0, sr: 168, econ: 0 }),
  P("samson", "Sanju Samson", "Wicketkeeper", "India", "RR", 180, "Sanju Samson", { matches: 168, runs: 4491, wickets: 0, sr: 141, econ: 0 }, { matches: 15, runs: 520, wickets: 0, sr: 142, econ: 0 }),
  P("jaiswal", "Yashasvi Jaiswal", "Batter", "India", "RR", 150, "Yashasvi Jaiswal", { matches: 34, runs: 1050, wickets: 0, sr: 154, econ: 0 }, { matches: 15, runs: 480, wickets: 0, sr: 152, econ: 0 }),
  P("shreyas", "Shreyas Iyer", "Batter", "India", "PBKS", 200, "Shreyas Iyer", { matches: 120, runs: 3320, wickets: 0, sr: 132, econ: 0 }, { matches: 15, runs: 550, wickets: 0, sr: 137, econ: 0 }),
  P("pooran", "Nicholas Pooran", "Wicketkeeper", "West Indies", "LSG", 200, "Nicholas Pooran", { matches: 90, runs: 2440, wickets: 0, sr: 160, econ: 0 }, { matches: 14, runs: 540, wickets: 0, sr: 165, econ: 0 }),
  P("tilak", "Tilak Varma", "Batter", "India", "MI", 150, "Tilak Varma", { matches: 56, runs: 1580, wickets: 0, sr: 138, econ: 0 }, { matches: 15, runs: 470, wickets: 0, sr: 140, econ: 0 }),
  P("travishead", "Travis Head", "Batter", "Australia", "SRH", 200, "Travis Head", { matches: 25, runs: 920, wickets: 0, sr: 158, econ: 0 }, { matches: 14, runs: 560, wickets: 0, sr: 160, econ: 0 }),
  P("ishan", "Ishan Kishan", "Wicketkeeper", "India", "SRH", 200, "Ishan Kishan", { matches: 105, runs: 2900, wickets: 0, sr: 136, econ: 0 }, { matches: 15, runs: 500, wickets: 0, sr: 140, econ: 0 }),
  P("salt", "Phil Salt", "Wicketkeeper", "England", "RCB", 200, "Phil Salt", { matches: 45, runs: 1600, wickets: 0, sr: 165, econ: 0 }, { matches: 15, runs: 540, wickets: 0, sr: 168, econ: 0 }),
  P("rinku", "Rinku Singh", "Batter", "India", "KKR", 150, "Rinku Singh", { matches: 62, runs: 1400, wickets: 0, sr: 150, econ: 0 }, { matches: 15, runs: 430, wickets: 0, sr: 152, econ: 0 }),
  P("parag", "Riyan Parag", "All-rounder", "India", "RR", 140, "Riyan Parag", { matches: 78, runs: 1780, wickets: 0, sr: 140, econ: 0 }, { matches: 15, runs: 450, wickets: 0, sr: 141, econ: 0 }),
  P("dube", "Shivam Dube", "All-rounder", "India", "CSK", 125, "Shivam Dube", { matches: 78, runs: 1820, wickets: 5, sr: 145, econ: 0 }, { matches: 14, runs: 400, wickets: 0, sr: 147, econ: 0 }),
  P("venkatesh", "Venkatesh Iyer", "All-rounder", "India", "KKR", 125, "Venkatesh Iyer", { matches: 52, runs: 1280, wickets: 8, sr: 137, econ: 8.9 }, { matches: 15, runs: 380, wickets: 1, sr: 138, econ: 8.8 }),
  P("brooks", "Harry Brook", "Batter", "England", "DC", 150, "Harry Brook", { matches: 24, runs: 760, wickets: 0, sr: 148, econ: 0 }, { matches: 12, runs: 340, wickets: 0, sr: 150, econ: 0 }),
  P("rachin", "Rachin Ravindra", "All-rounder", "New Zealand", "CSK", 150, "Rachin Ravindra", { matches: 25, runs: 760, wickets: 5, sr: 135, econ: 8.2 }, { matches: 13, runs: 330, wickets: 2, sr: 137, econ: 8.4 }),
  P("conway", "Devon Conway", "Wicketkeeper", "New Zealand", "CSK", 150, "Devon Conway", { matches: 45, runs: 1600, wickets: 0, sr: 137, econ: 0 }, { matches: 12, runs: 380, wickets: 0, sr: 136, econ: 0 }),

  // ---- all-rounders ---------------------------------------------------------
  P("hardik", "Hardik Pandya", "All-rounder", "India", "MI", 200, "Hardik Pandya", { matches: 137, runs: 2625, wickets: 66, sr: 146, econ: 8.3 }, { matches: 15, runs: 420, wickets: 8, sr: 148, econ: 8.6 }),
  P("jadeja", "Ravindra Jadeja", "All-rounder", "India", "CSK", 200, "Ravindra Jadeja", { matches: 240, runs: 2954, wickets: 160, sr: 129, econ: 7.5 }, { matches: 14, runs: 300, wickets: 9, sr: 130, econ: 7.8 }),
  P("russell", "Andre Russell", "All-rounder", "West Indies", "KKR", 200, "Andre Russell", { matches: 128, runs: 2490, wickets: 103, sr: 170, econ: 8.9 }, { matches: 15, runs: 390, wickets: 12, sr: 172, econ: 8.7 }),
  P("narine", "Sunil Narine", "All-rounder", "West Indies", "KKR", 200, "Sunil Narine", { matches: 177, runs: 1350, wickets: 181, sr: 145, econ: 6.6 }, { matches: 15, runs: 350, wickets: 14, sr: 160, econ: 7.0 }),
  P("livingstone", "Liam Livingstone", "All-rounder", "England", "RCB", 150, "Liam Livingstone", { matches: 60, runs: 1400, wickets: 14, sr: 150, econ: 8.7 }, { matches: 14, runs: 380, wickets: 3, sr: 152, econ: 8.9 }),
  P("stoinis", "Marcus Stoinis", "All-rounder", "Australia", "PBKS", 150, "Marcus Stoinis", { matches: 90, runs: 2100, wickets: 35, sr: 140, econ: 9.0 }, { matches: 15, runs: 420, wickets: 4, sr: 142, econ: 8.9 }),
  P("krunal", "Krunal Pandya", "All-rounder", "India", "RCB", 125, "Krunal Pandya", { matches: 123, runs: 1500, wickets: 76, sr: 128, econ: 7.2 }, { matches: 14, runs: 200, wickets: 6, sr: 126, econ: 7.5 }),
  P("axar", "Axar Patel", "All-rounder", "India", "DC", 150, "Axar Patel", { matches: 138, runs: 1600, wickets: 118, sr: 125, econ: 7.4 }, { matches: 15, runs: 260, wickets: 10, sr: 128, econ: 7.6 }),
  P("hasaranga", "Wanindu Hasaranga", "All-rounder", "Sri Lanka", "RR", 150, "Wanindu Hasaranga", { matches: 38, runs: 400, wickets: 45, sr: 125, econ: 7.3 }, { matches: 13, runs: 150, wickets: 8, sr: 122, econ: 7.6 }),
  P("santner", "Mitchell Santner", "All-rounder", "New Zealand", "MI", 100, "Mitchell Santner", { matches: 44, runs: 300, wickets: 38, sr: 118, econ: 7.4 }, { matches: 12, runs: 120, wickets: 6, sr: 120, econ: 7.5 }),
  P("nitish", "Nitish Kumar Reddy", "All-rounder", "India", "SRH", 125, "Nitish Kumar Reddy", { matches: 28, runs: 720, wickets: 4, sr: 138, econ: 8.8 }, { matches: 15, runs: 360, wickets: 2, sr: 140, econ: 8.9 }),
  P("shardul", "Shardul Thakur", "All-rounder", "India", "LSG", 100, "Shardul Thakur", { matches: 100, runs: 450, wickets: 95, sr: 120, econ: 8.6 }, { matches: 13, runs: 100, wickets: 7, sr: 118, econ: 8.9 }),

  // ---- bowlers --------------------------------------------------------------
  P("bumrah", "Jasprit Bumrah", "Bowler", "India", "MI", 200, "Jasprit Bumrah", { matches: 133, runs: 52, wickets: 165, sr: 100, econ: 7.3 }, { matches: 13, runs: 0, wickets: 20, sr: 0, econ: 7.1 }),
  P("cummins", "Pat Cummins", "Bowler", "Australia", "SRH", 200, "Pat Cummins", { matches: 59, runs: 120, wickets: 62, sr: 110, econ: 8.5 }, { matches: 14, runs: 60, wickets: 15, sr: 112, econ: 8.3 }),
  P("starc", "Mitchell Starc", "Bowler", "Australia", "DC", 200, "Mitchell Starc", { matches: 47, runs: 40, wickets: 61, sr: 100, econ: 8.2 }, { matches: 12, runs: 0, wickets: 14, sr: 0, econ: 8.1 }),
  P("rashid", "Rashid Khan", "Bowler", "Afghanistan", "GT", 200, "Rashid Khan", { matches: 121, runs: 673, wickets: 149, sr: 140, econ: 6.9 }, { matches: 14, runs: 150, wickets: 16, sr: 142, econ: 7.2 }),
  P("archer", "Jofra Archer", "Bowler", "England", "RR", 200, "Jofra Archer", { matches: 40, runs: 70, wickets: 48, sr: 110, econ: 7.8 }, { matches: 12, runs: 20, wickets: 12, sr: 108, econ: 8.0 }),
  P("boult", "Trent Boult", "Bowler", "New Zealand", "MI", 150, "Trent Boult", { matches: 106, runs: 40, wickets: 121, sr: 100, econ: 7.7 }, { matches: 15, runs: 0, wickets: 15, sr: 0, econ: 7.9 }),
  P("shami", "Mohammed Shami", "Bowler", "India", "SRH", 200, "Mohammed Shami", { matches: 110, runs: 100, wickets: 127, sr: 105, econ: 8.1 }, { matches: 14, runs: 20, wickets: 16, sr: 100, econ: 7.8 }),
  P("bhuvi", "Bhuvneshwar Kumar", "Bowler", "India", "RCB", 100, "Bhuvneshwar Kumar", { matches: 176, runs: 250, wickets: 181, sr: 110, econ: 7.5 }, { matches: 15, runs: 30, wickets: 14, sr: 110, econ: 7.7 }),
  P("kuldeep", "Kuldeep Yadav", "Bowler", "India", "DC", 150, "Kuldeep Yadav", { matches: 84, runs: 40, wickets: 98, sr: 90, econ: 7.7 }, { matches: 14, runs: 0, wickets: 15, sr: 0, econ: 7.5 }),
  P("chahal", "Yuzvendra Chahal", "Bowler", "India", "PBKS", 200, "Yuzvendra Chahal", { matches: 160, runs: 60, wickets: 205, sr: 90, econ: 7.8 }, { matches: 14, runs: 0, wickets: 17, sr: 0, econ: 7.6 }),
  P("rabada", "Kagiso Rabada", "Bowler", "South Africa", "GT", 200, "Kagiso Rabada", { matches: 81, runs: 50, wickets: 117, sr: 100, econ: 8.3 }, { matches: 13, runs: 10, wickets: 13, sr: 100, econ: 8.1 }),
  P("hazlewood", "Josh Hazlewood", "Bowler", "Australia", "RCB", 200, "Josh Hazlewood", { matches: 50, runs: 30, wickets: 63, sr: 100, econ: 8.1 }, { matches: 13, runs: 0, wickets: 14, sr: 0, econ: 7.9 }),
  P("siraj", "Mohammed Siraj", "Bowler", "India", "GT", 200, "Mohammed Siraj", { matches: 100, runs: 50, wickets: 110, sr: 95, econ: 8.4 }, { matches: 15, runs: 10, wickets: 16, sr: 100, econ: 8.2 }),
  P("ar shdeep", "Arshdeep Singh", "Bowler", "India", "PBKS", 200, "Arshdeep Singh", { matches: 75, runs: 30, wickets: 85, sr: 90, econ: 8.6 }, { matches: 14, runs: 0, wickets: 16, sr: 0, econ: 8.4 }),
  P("varun", "Varun Chakravarthy", "Bowler", "India", "KKR", 150, "Varun Chakravarthy", { matches: 55, runs: 20, wickets: 68, sr: 80, econ: 7.5 }, { matches: 15, runs: 0, wickets: 17, sr: 0, econ: 7.2 }),
  P("natarajan", "T Natarajan", "Bowler", "India", "DC", 125, "T Natarajan", { matches: 60, runs: 20, wickets: 65, sr: 90, econ: 8.4 }, { matches: 12, runs: 0, wickets: 11, sr: 0, econ: 8.6 }),
  P("harshit", "Harshit Rana", "Bowler", "India", "KKR", 100, "Harshit Rana", { matches: 25, runs: 20, wickets: 28, sr: 85, econ: 8.8 }, { matches: 14, runs: 0, wickets: 13, sr: 0, econ: 8.5 }),
  P("mayank", "Mayank Yadav", "Bowler", "India", "LSG", 125, "Mayank Yadav", { matches: 12, runs: 10, wickets: 15, sr: 80, econ: 7.9 }, { matches: 9, runs: 0, wickets: 10, sr: 0, econ: 8.0 }),
  P("noor", "Noor Ahmad", "Bowler", "Afghanistan", "CSK", 125, "Noor Ahmad", { matches: 22, runs: 20, wickets: 26, sr: 85, econ: 7.6 }, { matches: 13, runs: 0, wickets: 14, sr: 0, econ: 7.4 }),
  P("pathirana", "Matheesha Pathirana", "Bowler", "Sri Lanka", "CSK", 150, "Matheesha Pathirana", { matches: 22, runs: 10, wickets: 28, sr: 70, econ: 7.8 }, { matches: 11, runs: 0, wickets: 12, sr: 0, econ: 7.9 }),
  P("ashwin", "Ravichandran Ashwin", "All-rounder", "India", "CSK", 150, "Ravichandran Ashwin", { matches: 212, runs: 720, wickets: 180, sr: 120, econ: 7.0 }, { matches: 13, runs: 80, wickets: 9, sr: 118, econ: 7.3 }),
  P("coetzee", "Gerald Coetzee", "Bowler", "South Africa", "GT", 150, "Gerald Coetzee", { matches: 17, runs: 40, wickets: 21, sr: 110, econ: 8.9 }, { matches: 12, runs: 20, wickets: 12, sr: 108, econ: 8.7 }),
  P("avesh", "Avesh Khan", "Bowler", "India", "LSG", 100, "Avesh Khan", { matches: 75, runs: 30, wickets: 78, sr: 90, econ: 8.5 }, { matches: 14, runs: 0, wickets: 13, sr: 0, econ: 8.6 }),
  P("bishnoi", "Ravi Bishnoi", "Bowler", "India", "LSG", 100, "Ravi Bishnoi", { matches: 70, runs: 20, wickets: 82, sr: 80, econ: 7.7 }, { matches: 14, runs: 0, wickets: 14, sr: 0, econ: 7.8 }),
  P("mukesh", "Mukesh Kumar", "Bowler", "India", "GT", 75, "Mukesh Kumar", { matches: 30, runs: 10, wickets: 30, sr: 80, econ: 8.7 }, { matches: 12, runs: 0, wickets: 9, sr: 0, econ: 8.9 }),
  P("deepakc", "Deepak Chahar", "Bowler", "India", "MI", 150, "Deepak Chahar", { matches: 90, runs: 200, wickets: 95, sr: 110, econ: 7.9 }, { matches: 13, runs: 30, wickets: 10, sr: 108, econ: 8.0 }),
];

export const IPL_FRANCHISES = [
  "RCB",
  "MI",
  "CSK",
  "KKR",
  "SRH",
  "GT",
  "RR",
  "DC",
  "PBKS",
  "LSG",
];
