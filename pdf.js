function pdfFromJpegs(pages) {
  var enc = new TextEncoder(), chunks = [], offsets = [0], pos = 0;
  function add(v) {
    var b = typeof v === "string" ? enc.encode(v) : v;
    chunks.push(b);
    pos += b.length;
  }
  function obj(n, body, stream) {
    offsets[n] = pos;
    add(n + " 0 obj\n" + body);
    if (stream) { add("\nstream\n"); add(stream); add("\nendstream"); }
    add("\nendobj\n");
  }
  add("%PDF-1.4\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Count " + pages.length + " /Kids [" + pages.map(function (_, i) { return (3 + i * 3) + " 0 R"; }).join(" ") + "] >>");
  pages.forEach(function (p, i) {
    var n = 3 + i * 3;
    obj(n, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 " + (n + 1) + " 0 R >> >> /Contents " + (n + 2) + " 0 R >>");
    obj(n + 1, "<< /Type /XObject /Subtype /Image /Width " + p.w + " /Height " + p.h + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + p.bytes.length + " >>", p.bytes);
    var s = enc.encode("q 612 0 0 792 0 0 cm /Im0 Do Q");
    obj(n + 2, "<< /Length " + s.length + " >>", s);
  });
  var x = pos;
  add("xref\n0 " + offsets.length + "\n0000000000 65535 f \n");
  for (var i = 1; i < offsets.length; i++) add(String(offsets[i]).padStart(10, "0") + " 00000 n \n");
  add("trailer\n<< /Size " + offsets.length + " /Root 1 0 R >>\nstartxref\n" + x + "\n%%EOF\n");
  return new Blob(chunks, { type: "application/pdf" });
}

async function makeReportPDF(r) {
  var pages = [], c, ctx, y;
  var W = 1224, H = 1584, M = 84, B = 1450;
  function finish() {
    ctx.fillStyle = "#5e5644";
    ctx.font = "22px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Page " + (pages.length + 1), W / 2, 1520);
    ctx.textAlign = "left";
    var raw = atob(c.toDataURL("image/jpeg", 0.92).split(",")[1]);
    pages.push({ w: W, h: H, bytes: Uint8Array.from(raw, function (ch) { return ch.charCodeAt(0); }) });
  }
  function start(title) {
    c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    ctx = c.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#1e2820";
    ctx.font = "bold 36px Arial";
    ctx.fillText("Pennsylvania State Police Breacher Report", M, 82);
    ctx.font = "24px Arial";
    ctx.fillText(title, M, 116);
    ctx.strokeStyle = "#c4a36a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(M, 126);
    ctx.lineTo(W - M, 126);
    ctx.stroke();
    y = 174;
  }
  function lines(text, width) {
    var out = [];
    String(text).split("\n").forEach(function (para) {
      var line = "";
      Array.from(para).forEach(function (ch) {
        if (ctx.measureText(line + ch).width > width && line) { out.push(line); line = ""; }
        line += ch;
      });
      out.push(line);
    });
    return out.length ? out : [""];
  }
  function write(text, bold) {
    ctx.font = (bold ? "bold " : "") + "28px Arial";
    lines(text, W - 2 * M).forEach(function (line) {
      if (y > B) { finish(); start("BREACHER'S REPORT — CONTINUED"); ctx.font = (bold ? "bold " : "") + "28px Arial"; }
      ctx.fillStyle = "#182018";
      ctx.fillText(line, M, y);
      y += 38;
    });
    y += 8;
  }
  start("BREACHER'S REPORT");
  reportFields(r).forEach(function (pair) { write(pair[0], true); write(pair[1] || "—"); });
  outcomeFields(r).filter(function (pair) { return pair[0] !== "Additional calculation notes"; }).forEach(function (pair) { write(pair[0], true); write(pair[1] || "—"); });
  finish();
  for (var i = 0; i < (r.images || []).length; i++) {
    var p = r.images[i];
    start("PHOTOGRAPH " + (i + 1));
    write("Report: " + (r.number || "Unassigned"));
    var im = new Image();
    im.src = p.data;
    await im.decode();
    var scale = Math.min((W - 2 * M) / im.width, 850 / im.height);
    ctx.drawImage(im, (W - im.width * scale) / 2, y, im.width * scale, im.height * scale);
    y += im.height * scale + 48;
    write("Caption", true);
    write(p.caption || "No caption");
    finish();
  }
  for (var a = 0; a < (r.attachments || []).length; a++) {
    var file = r.attachments[a];
    start("SUPPORTING RECORD");
    write(file.name || "Supporting image");
    var pic = new Image();
    pic.src = file.data;
    await pic.decode();
    var s2 = Math.min((W - 2 * M) / pic.width, 1000 / pic.height);
    ctx.drawImage(pic, (W - pic.width * s2) / 2, y, pic.width * s2, pic.height * s2);
    finish();
  }
  return pdfFromJpegs(pages);
}
