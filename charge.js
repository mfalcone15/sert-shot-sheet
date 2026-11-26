/* Shot-sheet worksheet. Pounds and feet. */
(function (root) {
  var GRAINS_PER_POUND = 7000;
  var PSI_EXPONENT = 0.72;
  var PSI_COEFFICIENT = 2410;
  var INTERIOR_PSI_MAX = 2;
  var EXTERIOR_PSI_MAX = 4;
  var FORMULA_LINES = [
    "LBS = Total grains / 7000",
    "LBS TNT = LBS × R.E. factor (1.66)",
    "MSD (ft) = K factor (18) × cube root of LBS TNT",
    "Room volume = Length × Width × Height",
    "PSI = (LBS TNT / Volume)^0.72 × 2410",
    "Maximums: 4 PSI exterior · 2 PSI interior",
  ];

  function parseNum(raw) {
    var t = String(raw == null ? "" : raw).trim();
    if (!t) return null;
    var n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  function pressureStatus(psi) {
    if (psi == null || !Number.isFinite(psi)) return "none";
    var shown = Math.round(psi * 100) / 100;
    if (shown > EXTERIOR_PSI_MAX) return "over-both";
    if (shown > INTERIOR_PSI_MAX) return "over-interior";
    return "within";
  }
  function statusCopy(status) {
    if (status === "within") return "Within the 2 PSI interior maximum and the 4 PSI exterior maximum.";
    if (status === "over-interior") return "Exceeds the 2 PSI interior maximum. Within the 4 PSI exterior maximum.";
    if (status === "over-both") return "Exceeds the 2 PSI interior maximum and the 4 PSI exterior maximum.";
    return "Enter length, width, and height in feet to calculate interior overpressure.";
  }
  function formatGrains(n) {
    return (Math.round(n * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  function formatVolume(n) {
    return (Math.round(n * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  function trimNum(n) {
    return String(Math.round(n * 1000) / 1000);
  }
  function computeCharge(input) {
    var total = (input.grains || []).reduce(function (sum, g) {
      return Number.isFinite(g) && g > 0 ? sum + g : sum;
    }, 0);
    if (!(total > 0)) return null;
    var lbs = total / GRAINS_PER_POUND;
    var re = input.reFactor;
    var lbsTnt = re != null && re > 0 ? lbs * re : null;
    var k = input.kFactor;
    var msd = lbsTnt != null && k != null && k > 0 ? k * Math.cbrt(lbsTnt) : null;
    var L = input.lengthFt, W = input.widthFt, H = input.heightFt;
    var volume = L > 0 && W > 0 && H > 0 ? L * W * H : null;
    var psi = lbsTnt != null && volume != null ? PSI_COEFFICIENT * Math.pow(lbsTnt / volume, PSI_EXPONENT) : null;
    return { totalGrains: total, lbs: lbs, lbsTnt: lbsTnt, msdFt: msd, volumeCuFt: volume, psi: psi, status: pressureStatus(psi) };
  }
  function buildWork(report) {
    var grains = (report.explosives || []).map(function (line) {
      var n = parseNum(line.grains);
      return n == null ? NaN : n;
    });
    var figures = computeCharge({
      grains: grains,
      reFactor: parseNum(report.reFactor),
      kFactor: parseNum(report.kFactor),
      lengthFt: parseNum(report.roomLength),
      widthFt: parseNum(report.roomWidth),
      heightFt: parseNum(report.roomHeight),
    });
    var g = figures ? trimNum(figures.totalGrains) : "";
    var re = String(report.reFactor || "").trim();
    var k = String(report.kFactor || "").trim();
    var length = String(report.roomLength || "").trim();
    var width = String(report.roomWidth || "").trim();
    var height = String(report.roomHeight || "").trim();
    var weight = g ? "(" + g + " ÷ 7000)" : "";
    var tntExpr = weight && re ? weight + " × " + re : "";
    var volumeExpr = length && width && height ? "(" + length + " × " + width + " × " + height + ")" : "";
    var steps = [
      { id: "lbs", title: "LBS", formula: "Total grains / 7000", expression: figures ? g + " ÷ 7000" : "", result: figures ? figures.lbs.toFixed(4) + " lb" : "—", note: "" },
      { id: "tnt", title: "LBS TNT", formula: "LBS × R.E. factor", expression: tntExpr, result: figures && figures.lbsTnt != null ? figures.lbsTnt.toFixed(4) + " lb TNT" : "—", note: figures && figures.lbsTnt == null ? "Enter a positive R.E. factor." : "" },
      { id: "msd", title: "MSD", formula: "K factor × cube root of LBS TNT", expression: figures && figures.msdFt != null && tntExpr ? k + " × cube root of [" + tntExpr + "]" : "", result: figures && figures.msdFt != null ? figures.msdFt.toFixed(1) + " ft" : "—", note: figures && figures.msdFt == null ? "Enter a positive K factor and R.E. factor." : "" },
      { id: "volume", title: "Room volume", formula: "Length × width × height", expression: figures && figures.volumeCuFt != null ? length + " × " + width + " × " + height : "", result: figures && figures.volumeCuFt != null ? formatVolume(figures.volumeCuFt) + " ft³" : "—", note: "" },
      { id: "psi", title: "Interior overpressure", formula: "(LBS TNT / volume)^0.72 × 2410", expression: figures && figures.psi != null && tntExpr && volumeExpr ? "[" + tntExpr + " ÷ " + volumeExpr + "]^0.72 × 2410" : "", result: figures && figures.psi != null ? figures.psi.toFixed(2) + " PSI" : "—", note: "" },
    ];
    return { figures: figures, steps: steps };
  }
  root.Charge = {
    FORMULA_LINES: FORMULA_LINES,
    parseNum: parseNum,
    computeCharge: computeCharge,
    buildWork: buildWork,
    statusCopy: statusCopy,
    formatGrains: formatGrains,
    formatVolume: formatVolume,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
