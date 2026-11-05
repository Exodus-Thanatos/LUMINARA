#!/usr/bin/env python3
"""
LUMINARA PowerPoint sync.

Reads the REAL running website (positions, colours, fonts, borders, text, icons) and rebuilds the design slides
as native, editable PowerPoint shapes, so the deck is always a faithful picture of the actual UI.
Run it again after any UI change.

  1. npm run build && npx vite preview --port 4173 --host 127.0.0.1      (do NOT start the receiver: slides show DEMO data)
  2. python3 tools/ppt-sync/build_deck.py  <original-deck.pptx>  <output.pptx>

Needs: pip install playwright python-pptx cairosvg   (and: playwright install chromium)
Slides 1-2 (intro art + login) are kept from the original deck; slides 3+ are regenerated from the site.
"""
import io, json, re, sys
from playwright.sync_api import sync_playwright
from pptx import Presentation
from pptx.util import Emu, Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR, MSO_AUTO_SIZE
from pptx.enum.dml import MSO_LINE
import cairosvg

BASE = "http://127.0.0.1:4173"
SRC, OUT = sys.argv[1], sys.argv[2]
SLIDE_PX_W = 1440.0                     # 1440 px of site == full slide width
EMU_PER_PX = 12192000 / SLIDE_PX_W
FONT = "Arial"

# ------------------------------------------------------------------ DOM extraction (runs inside the page)
EXTRACT_JS = r"""
() => {
  const W = innerWidth, H = innerHeight, out = [];
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const norm = (s) => { if (!s) return null; cx.clearRect(0,0,1,1); cx.fillStyle = '#000'; cx.fillStyle = s; cx.fillRect(0,0,1,1);
    const d = cx.getImageData(0,0,1,1).data; return { r:d[0], g:d[1], b:d[2], a:d[3]/255 }; };
  const hex = (c) => '#' + [c.r,c.g,c.b].map(v => Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
  const mix = (c, under, op) => { const a = c.a * op; return { r: c.r*a + under.r*(1-a), g: c.g*a + under.g*(1-a), b: c.b*a + under.b*(1-a), a: 1 }; };
  const effOpacity = (el) => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity); return o; };
  const underColor = (el) => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const c = norm(getComputedStyle(e).backgroundColor); if (c && c.a > 0.98) return c; } return { r:255,g:255,b:255,a:1 }; };
  const fixedLayer = (el) => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.position === 'fixed' && parseInt(cs.zIndex || '0') >= 30) return 1; } return 0; };
  const visible = (el) => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } return true; };
  const px = (v) => parseFloat(v) || 0;
  const rad = (cs, w, h) => { const v = cs.borderTopLeftRadius; if (!v) return 0; return v.endsWith('%') ? parseFloat(v) / 100 * Math.min(w, h) : px(v); };

  const walk = (el) => {
    if (el.nodeType !== 1) return;
    const tag = el.tagName.toLowerCase();
    if (['script','style','img','noscript','head'].includes(tag)) return;
    if (!visible(el)) return;
    const r = el.getBoundingClientRect();
    if (tag === 'svg') {
      if (r.width > 0 && r.height > 0 && r.top < H && r.right > 0 && r.left < W) {
        const cs = getComputedStyle(el); const cl = el.cloneNode(true);
        cl.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); cl.setAttribute('width', r.width); cl.setAttribute('height', r.height);
        let s = cl.outerHTML.replace(/currentColor/g, hex(norm(cs.color)));
        out.push({ t:'svg', x:r.x, y:r.y, w:r.width, h:r.height, svg:s, layer: fixedLayer(el) || (cs.position === 'absolute' ? 0.5 : 0), op:effOpacity(el) });
      }
      return;
    }
    if (r.width > 0 && r.height > 0 && r.top < H && r.bottom > 0 && r.right > 0 && r.left < W) {
      const cs = getComputedStyle(el), op = effOpacity(el), under = underColor(el.parentElement || el);
      const bg = norm(cs.backgroundColor);
      const bw = [px(cs.borderTopWidth), px(cs.borderRightWidth), px(cs.borderBottomWidth), px(cs.borderLeftWidth)];
      const bs = [cs.borderTopStyle, cs.borderRightStyle, cs.borderBottomStyle, cs.borderLeftStyle];
      const bc = [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor].map(norm);
      const hasB = bw.some((w, i) => w > 0 && bs[i] !== 'none' && bc[i] && bc[i].a > 0);
      const isCheck = tag === 'input' && el.type === 'checkbox';
      if ((bg && bg.a > 0) || hasB || isCheck) {
        const item = { t:'box', x:r.x, y:r.y, w:r.width, h:r.height, radius: rad(cs, r.width, r.height), layer:fixedLayer(el), fill:null, border:null, sides:null };
        if (isCheck) { item.fill = el.checked ? '#27a85a' : '#ffffff'; item.border = { w:1, color: el.checked ? '#27a85a' : '#c3cfdf', dash:false }; item.radius = 3; }
        else {
          if (bg && bg.a > 0) item.fill = hex(mix(bg, under, op));
          if (hasB) {
            const same = bw.every(w => w === bw[0]) && bs.every(s => s === bs[0]) && bc.every(c => c && c.r === bc[0].r && c.g === bc[0].g && c.b === bc[0].b && c.a === bc[0].a);
            if (same) item.border = { w: bw[0], color: hex(mix(bc[0], under, op)), dash: bs[0] === 'dashed' || bs[0] === 'dotted' };
            else item.sides = bw.map((w, i) => (w > 0 && bs[i] !== 'none' && bc[i] && bc[i].a > 0) ? { w, color: hex(mix(bc[i], under, op)) } : null);
          }
        }
        out.push(item);
        if (isCheck && el.checked) out.push({ t:'text', x:r.x, y:r.y, w:r.width, h:r.height, text:'✓', fs:12, fw:700, color:'#ffffff', lh:r.height, align:'center', wrap:false, ls:0, italic:false, layer:fixedLayer(el) });
      }
    }
    // form controls draw their own text
    if (['input','select','textarea'].includes(tag) && r.width > 0 && r.top < H && el.type !== 'checkbox' && el.type !== 'file') {
      const cs = getComputedStyle(el); const under = underColor(el);
      let text = '', color = norm(cs.color);
      if (tag === 'select') text = el.options[el.selectedIndex] ? el.options[el.selectedIndex].text : '';
      else { text = el.value; if (!text) { text = el.placeholder || ''; const pc = norm(getComputedStyle(el, '::placeholder').color); if (pc) color = pc; } }
      if (text) {
        const fs = px(cs.fontSize), lh = cs.lineHeight === 'normal' ? fs * 1.2 : px(cs.lineHeight);
        const x = r.x + px(cs.borderLeftWidth) + px(cs.paddingLeft);
        out.push({ t:'text', x, y: r.y + (r.height - lh) / 2, w: r.width - (x - r.x) - 28, h: lh, text, fs, fw: parseInt(cs.fontWeight), color: hex(mix(color, under, 1)), lh, align:'left', wrap:false, ls:0, italic:false, layer:fixedLayer(el) });
      }
      if (tag === 'select') out.push({ t:'svg', x: r.right - 26, y: r.y + r.height/2 - 4, w: 12, h: 8, layer:fixedLayer(el), op:1,
        svg:'<svg xmlns="http://www.w3.org/2000/svg" width="12" height="8" viewBox="0 0 12 8"><polyline points="1,1.5 6,6.5 11,1.5" fill="none" stroke="#6b7a90" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' });
      return;
    }
    // mixed inline text (bold + normal, several text nodes): one rich-text box so spacing and wrapping stay right
    {
      const dsp = getComputedStyle(el).display;
      const tn = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim());
      const inl = [...el.children].filter(c => { const d = getComputedStyle(c).display; return d.startsWith('inline') && c.tagName.toLowerCase() !== 'svg' && c.textContent.trim() && visible(c); });
      if (tn.length >= 1 && tn.length + inl.length >= 2 && !/flex|grid/.test(dsp) && r.width > 0 && r.top < H) {
        const cs = getComputedStyle(el), under = underColor(el);
        const runs = [], rects = [];
        const addRects = (node) => { const rg = document.createRange(); rg.selectNodeContents(node); rects.push(...[...rg.getClientRects()].filter(q => q.width > 0 && q.height > 0)); };
        const style = (e, txt) => { const c = getComputedStyle(e); let t = txt.replace(/\s+/g, ' '); if (c.textTransform === 'uppercase') t = t.toUpperCase(); else if (c.textTransform === 'lowercase') t = t.toLowerCase();
          return { text: t, fs: px(c.fontSize), fw: parseInt(c.fontWeight) || 400, color: hex(mix(norm(c.color), under, effOpacity(e))), italic: c.fontStyle === 'italic', ul: c.textDecorationLine.includes('underline'), ls: px(c.letterSpacing) }; };
        for (const n of el.childNodes) {
          if (n.nodeType === 3) { if (n.textContent.length) { runs.push(style(el, n.textContent)); if (n.textContent.trim()) addRects(n); } }
          else if (n.nodeType === 1 && inl.includes(n)) { runs.push(style(n, n.textContent)); addRects(n); }
        }
        if (runs.length && runs[0]) { runs[0].text = runs[0].text.replace(/^\s+/, ''); runs[runs.length-1].text = runs[runs.length-1].text.replace(/\s+$/, ''); }
        const u = rects.reduce((a, q) => ({ l: Math.min(a.l, q.left), t: Math.min(a.t, q.top), r: Math.max(a.r, q.right), b: Math.max(a.b, q.bottom) }), { l:1e9, t:1e9, r:-1e9, b:-1e9 });
        if (rects.length && u.t < H && u.b <= H + 1) {
          const fs = px(cs.fontSize), lh = cs.lineHeight === 'normal' ? fs * 1.2 : px(cs.lineHeight);
          const lines = new Set(rects.map(q => Math.round(q.top))).size;
          const cl = r.left + px(cs.borderLeftWidth) + px(cs.paddingLeft), cr = r.right - px(cs.borderRightWidth) - px(cs.paddingRight);
          let align = 'left', x = u.l, w = u.r - u.l; const ta = cs.textAlign;
          if (lines > 1) { x = cl; w = cr - cl; align = ta === 'center' ? 'center' : (ta === 'right' || ta === 'end') ? 'right' : 'left'; }
          else if (Math.abs((u.l + u.r) / 2 - (cl + cr) / 2) < 2 && (u.r - u.l) < (cr - cl) - 6) align = 'center';
          out.push({ t:'text', x, y:u.t, w, h:u.b - u.t, runs, fs, lh, align, wrap: lines > 1, layer: fixedLayer(el), single: lines === 1 });
        }
        for (const c of el.children) if (!inl.includes(c)) walk(c);
        return;
      }
    }
    for (const n of el.childNodes) {
      if (n.nodeType === 3) {
        const raw = n.textContent; if (!raw.trim()) continue;
        const rg = document.createRange(); rg.selectNodeContents(n);
        const rects = [...rg.getClientRects()].filter(q => q.width > 0 && q.height > 0);
        if (!rects.length) continue;
        const cs = getComputedStyle(el), op = effOpacity(el), under = underColor(el);
        let text = raw.replace(/\s+/g, ' ').trim();
        if (cs.textTransform === 'uppercase') text = text.toUpperCase(); else if (cs.textTransform === 'lowercase') text = text.toLowerCase();
        const u = rects.reduce((a, q) => ({ l: Math.min(a.l, q.left), t: Math.min(a.t, q.top), r: Math.max(a.r, q.right), b: Math.max(a.b, q.bottom) }), { l:1e9, t:1e9, r:-1e9, b:-1e9 });
        if (u.t >= H || u.b > H + 1 || u.r <= 0 || u.l >= W) continue;
        const fs = px(cs.fontSize), lh = cs.lineHeight === 'normal' ? fs * 1.2 : px(cs.lineHeight);
        const lines = new Set(rects.map(q => Math.round(q.top))).size;
        const pr = el.getBoundingClientRect(), cl = pr.left + px(cs.borderLeftWidth) + px(cs.paddingLeft), cr = pr.right - px(cs.borderRightWidth) - px(cs.paddingRight);
        let align = 'left', x = u.l, w = u.r - u.l;
        const ta = cs.textAlign;
        if (lines > 1) { x = cl; w = cr - cl; align = (ta === 'center') ? 'center' : (ta === 'right' || ta === 'end') ? 'right' : 'left'; }
        else {
          if (Math.abs((u.l + u.r) / 2 - (cl + cr) / 2) < 2 && (u.r - u.l) < (cr - cl) - 6) align = 'center';
          else if (Math.abs(u.r - cr) < 2 && u.l > cl + 6) align = 'right';
        }
        const col = mix(norm(cs.color), under, op);
        out.push({ t:'text', x, y:u.t - (lh - (u.b - u.t)) / 2 * (lines > 1 ? 0 : 1), w, h: u.b - u.t, text, fs, fw: parseInt(cs.fontWeight) || 400, color: hex(col), lh, align, wrap: lines > 1, ls: px(cs.letterSpacing), italic: cs.fontStyle === 'italic', ul: cs.textDecorationLine.includes('underline'), layer: fixedLayer(el), single: lines === 1 });
      }
    }
    for (const c of el.children) walk(c);
  };
  walk(document.body);
  return out;
}
"""

FORCE_FONT = "*{font-family:'Liberation Sans',Arial,sans-serif !important}"

def capture(pg, w, h):
    pg.set_viewport_size({"width": w, "height": h})

def rgb(hx):
    hx = hx.lstrip('#'); return RGBColor(int(hx[0:2], 16), int(hx[2:4], 16), int(hx[4:6], 16))

# ------------------------------------------------------------------ drawing into a slide
class Canvas:
    def __init__(self, slide, scale=1.0, ox=0.0, oy=0.0, clip_h=810.0, clip_w=1440.0):
        self.s, self.sc, self.ox, self.oy, self.H, self.W = slide, scale, ox, oy, clip_h, clip_w
    def e(self, v, off): return Emu(int(round((v * self.sc + off) * EMU_PER_PX)))
    def X(self, v): return self.e(v, self.ox)
    def Y(self, v): return self.e(v, self.oy)
    def L(self, v): return Emu(max(1, int(round(v * self.sc * EMU_PER_PX))))
    def pt(self, px): return px * self.sc * EMU_PER_PX / 12700.0

    def box(self, it):
        x, y, w, h = it['x'], it['y'], it['w'], it['h']
        if y >= self.H or x >= self.W: return
        h = min(h, self.H - y); w = min(w, self.W - x)
        if h <= 0 or w <= 0: return
        r = it['radius']; cut_bottom = (it['y'] + it['h']) > self.H
        if r >= min(w, h) / 2 - 0.5 and abs(w - h) < 2 and r > 0: shp = MSO_SHAPE.OVAL
        elif r > 0.5 and not cut_bottom: shp = MSO_SHAPE.ROUNDED_RECTANGLE
        else: shp = MSO_SHAPE.RECTANGLE
        if it.get('sides') and not it.get('fill'):
            self._sides(it, x, y, w, h); return
        sp = self.s.shapes.add_shape(shp, self.X(x), self.Y(y), self.L(w), self.L(h))
        if shp == MSO_SHAPE.ROUNDED_RECTANGLE: sp.adjustments[0] = min(0.5, r / min(w, h))
        sp.shadow.inherit = False
        if it.get('fill'): sp.fill.solid(); sp.fill.fore_color.rgb = rgb(it['fill'])
        else: sp.fill.background()
        b = it.get('border')
        if b:
            sp.line.color.rgb = rgb(b['color']); sp.line.width = Pt(max(0.25, self.pt(b['w'])))
            if b['dash']: sp.line.dash_style = MSO_LINE.DASH
        else: sp.line.fill.background()
        if it.get('sides'): self._sides(it, x, y, w, h)

    def _sides(self, it, x, y, w, h):
        for i, sd in enumerate(it['sides']):
            if not sd: continue
            t = sd['w']
            rx, ry, rw, rh = [(x, y, w, t), (x + w - t, y, t, h), (x, y + h - t, w, t), (x, y, t, h)][i]
            if ry >= self.H: continue
            rh = min(rh, self.H - ry)
            sp = self.s.shapes.add_shape(MSO_SHAPE.RECTANGLE, self.X(rx), self.Y(ry), self.L(rw), self.L(rh))
            sp.shadow.inherit = False; sp.fill.solid(); sp.fill.fore_color.rgb = rgb(sd['color']); sp.line.fill.background()

    def text(self, it):
        slack = 1.0 if it['wrap'] else 1.22
        w = it['w'] * slack + (0 if it['wrap'] else 10)
        x = it['x']
        if it['align'] == 'right' and not it['wrap']: x = it['x'] + it['w'] - w
        elif it['align'] == 'center' and not it['wrap']: x = it['x'] + it['w'] / 2 - w / 2
        top = it['y'] if it['wrap'] else it['y'] + (it['h'] - it['lh']) / 2 if it['lh'] > it['h'] else it['y']
        tb = self.s.shapes.add_textbox(self.X(x), self.Y(top), self.L(w), self.L(max(it['h'], it['lh'])))
        tf = tb.text_frame; tf.word_wrap = True   # wrapping box + slack: keeps left/right/centre alignment stable in PowerPoint and LibreOffice
        tf.auto_size = MSO_AUTO_SIZE.NONE
        tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
        tf.vertical_anchor = MSO_ANCHOR.TOP
        p = tf.paragraphs[0]
        p.alignment = {'left': PP_ALIGN.LEFT, 'center': PP_ALIGN.CENTER, 'right': PP_ALIGN.RIGHT}[it['align']]
        p.line_spacing = Pt(it['lh'] * self.sc * EMU_PER_PX / 12700.0)
        for rn in (it.get('runs') or [it]):
            r = p.add_run(); r.text = rn['text']
            rp = rn['fs'] * self.sc * EMU_PER_PX / 12700.0
            f = r.font; f.name = FONT; f.size = Pt(round(rp * 2) / 2 if rp > 6 else rp); f.bold = rn['fw'] >= 600; f.italic = bool(rn.get('italic'))
            if rn.get('ul'): f.underline = True
            f.color.rgb = rgb(rn['color'])
            if rn.get('ls'): r._r.get_or_add_rPr().set('spc', str(int(rn['ls'] * self.sc * EMU_PER_PX / 12700.0 * 100)))

    def svg(self, it):
        if it['y'] >= self.H: return
        try:
            png = cairosvg.svg2png(bytestring=it['svg'].encode('utf-8'), output_width=int(max(8, it['w'] * 4)), output_height=int(max(8, it['h'] * 4)))
        except Exception:
            return
        h = min(it['h'], self.H - it['y'])
        pic = self.s.shapes.add_picture(io.BytesIO(png), self.X(it['x']), self.Y(it['y']), self.L(it['w']), self.L(it['h']))
        if h < it['h']: pic.crop_bottom = 1 - h / it['h']; pic.height = self.L(h)

    def draw(self, items):
        for it in sorted(items, key=lambda i: i.get('layer', 0)):   # stable: DOM order inside each layer
            {'box': self.box, 'text': self.text, 'svg': self.svg}[it['t']](it)

def new_slide(prs, title, notes):
    s = prs.slides.add_slide(prs.slide_layouts[0])
    for ph in list(s.placeholders): ph._element.getparent().remove(ph._element)
    s.notes_slide.notes_text_frame.text = notes
    return s

# ------------------------------------------------------------------ main
DEMO_NOTE = "DEMONSTRATION DATA: the receiver is not connected, so the site shows its built-in demo data (19 planned lamps, 3 installed). The badge at the bottom right of the slide is part of the real site."
SCREENS = [
    ("Dashboard", "dashboard", "Dashboard Overview with the Extension Power Monitoring panel collapsed (one Voltage card). Lamp counts come from the receiver when it is connected; here they are demo values. The voltage shown is SIMULATED TEST DATA (tagged TEST DATA on the card): no PZEM meter is connected yet. " + DEMO_NOTE),
    ("Dashboard", "dashboard_pzem", "Dashboard with the Extension Power Monitoring panel EXPANDED (click the Voltage card): the other five readings, meter status and the power-consumption history appear underneath; click the Voltage card again to collapse. The values shown are SIMULATED TEST DATA (the panel itself shows a TEST DATA tag): no meter is connected yet. With real hardware the tag is not shown. " + DEMO_NOTE),
    ("Streetlights", "monitoring", "Streetlight Monitoring: filters, panel-feed card (sample data) and the lamp table (lux, battery, signal). " + DEMO_NOTE),
    ("Streetlight Map", "map", "Streetlight Map: Leaflet map (base-map tiles are not captured offline), KPI cards, filters, CSV import/export. 28 sample markers have placeholder coordinates, as the banner says. " + DEMO_NOTE),
    ("DETAILS", "details", "Streetlight Details for L-008: sample readings (labelled SAMPLE DATA). " + DEMO_NOTE),
    ("Maintenance", "maintenance", "Maintenance & Fault History: sample tickets (labelled SAMPLE DATA). " + DEMO_NOTE),
    ("Controls", "controls", "Lighting Controls. Manual Switching is WORKING (it talks to the receiver and relay); here the receiver is not connected, so the pill shows the relay as offline. Automatic Schedule is a PREVIEW and is tagged NOT CONNECTED. " + DEMO_NOTE),
    ("Settings", "settings", "Settings, Profile & Account. Compact Map View is WORKING (same setting as the map's 'Show sample locations'). Everything tagged UI ONLY is a layout preview with no backend. Dark Theme is deferred."),
    ("SYSTEM", "system", "Settings, System & Notifications. All items are UI ONLY / not connected (no email/SMS service, lamp nodes do not measure voltage, the server keeps no history to export)."),
]

def pzem_stub(route, request):
    import math, time as _t
    if "/api/pzem/history" in request.url:
        now = int(_t.time() // 60) * 60000
        pts = [{"t": now - (59 - i) * 60000, "powerW": round(260 + 110 * math.sin(i / 7.0) + 25 * math.sin(i / 2.3), 1), "maxPowerW": round(300 + 110 * math.sin(i / 7.0), 1), "voltageV": 229.8, "currentA": 1.2, "energyKwh": round(12.0 + i * 0.0045, 3), "samples": 12} for i in range(60)]
        body = {"range": "1h", "stepMs": 60000, "points": pts, "includesTestData": True, "summary": {"avgPowerW": 262.4, "peakPowerW": 414.0, "usedKwh": 0.266}}
    else:
        body = {"status": "live", "source": "test", "ageMs": 3000, "staleAfterMs": 15000, "errors": 0, "reason": None, "readingAgeMs": 3000,
                "reading": {"voltage": 229.8, "current": 1.234, "power": 280.5, "energy": 12.345, "frequency": 60.0, "pf": 0.99, "alarm": False}}
    route.fulfill(status=200, content_type="application/json", body=json.dumps(body))

def main():
    prs = Presentation(SRC)
    # keep slides 1-2 (intro + login); drop the old design slides 3..n
    ids = prs.slides._sldIdLst
    for sid in list(ids)[2:]:
        prs.part.drop_rel(sid.rId); ids.remove(sid)
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1440, "height": 810})
        pg = ctx.new_page()
        # the only mocked call: /api/control, so the Controls card shows a normal "relay offline" state instead of an error
        pg.route("**/api/control", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps({"want": None, "applied": None, "controllerOnline": False, "pending": False})))
        import re as _re
        pg.route(_re.compile(r".*/api/pzem(/history.*)?$"), pzem_stub)   # TEST DATA for the new panel (no meter yet)
        def boot(width, height):
            pg.set_viewport_size({"width": width, "height": height}); pg.goto(BASE); pg.add_style_tag(content=FORCE_FONT)
            pg.click("text=Skip intro"); pg.wait_for_selector(".ci-root", state="detached"); pg.click("button[type=submit]")
            pg.wait_for_selector("#sidebar nav button", state="attached"); pg.wait_for_timeout(900)
            assert "DEMO DATA" in pg.inner_text("body"), "Receiver is connected: stop it so the deck shows demo data."
        def nav(label, mobile=False):
            if mobile: pg.click("button[aria-label='Open menu']"); pg.wait_for_timeout(250)
            pg.evaluate("l=>[...document.querySelectorAll('#sidebar nav button')].find(b=>b.innerText.trim()===l).click()", label); pg.wait_for_timeout(900)
            if mobile: pg.mouse.click(380, 400); pg.wait_for_timeout(300)
        boot(1440, 810)
        pages = {}
        for label, key, _ in SCREENS:
            if key == "details":
                nav("Dashboard"); pg.click("text=Lamp fault detected"); pg.wait_for_timeout(900)
            elif key == "dashboard_pzem":
                nav("Dashboard"); pg.click("section[aria-label='Extension power monitoring'] button[aria-expanded]"); pg.wait_for_timeout(1500)
                pg.evaluate("()=>{const s=document.querySelector(\"section[aria-label='Extension power monitoring']\");window.scrollTo(0, s.getBoundingClientRect().top + window.scrollY - 24)}"); pg.wait_for_timeout(400)
                pages[key] = pg.evaluate(EXTRACT_JS); pg.evaluate("window.scrollTo(0,0)"); continue
            elif key == "system":
                pg.click("role=tab[name='System & Notifications']"); pg.wait_for_timeout(500)
            else:
                nav(label)
            pg.evaluate("window.scrollTo(0,0)"); pg.wait_for_timeout(200)
            pages[key] = pg.evaluate(EXTRACT_JS)
        # phones
        phones = []
        boot(390, 844)
        for label, key in [("Dashboard", "m_dashboard"), ("Controls", "m_controls"), ("Settings", "m_settings")]:
            nav(label, mobile=True); pg.evaluate("window.scrollTo(0,0)"); pg.wait_for_timeout(200)
            phones.append((label, pg.evaluate(EXTRACT_JS)))
        b.close()
    for label, key, note in SCREENS:
        s = new_slide(prs, label, note); Canvas(s).draw(pages[key])
    s = new_slide(prs, "Mobile", "Phone layout (390 px wide): the sidebar becomes a slide-out menu; cards stack in one column. " + DEMO_NOTE)
    bg = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, prs.slide_height); bg.fill.solid(); bg.fill.fore_color.rgb = rgb('#0e1a2e'); bg.line.fill.background()
    sc = 0.80; pw = 390 * sc; gap = (1440 - 3 * pw) / 4
    for i, (label, items) in enumerate(phones):
        ox = gap + i * (pw + gap); oy = (810 - 844 * sc) / 2 - 8
        fr = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Emu(int((ox - 6) * EMU_PER_PX)), Emu(int((oy - 6) * EMU_PER_PX)), Emu(int((pw + 12) * EMU_PER_PX)), Emu(int((844 * sc + 12) * EMU_PER_PX)))
        fr.adjustments[0] = 0.07; fr.fill.solid(); fr.fill.fore_color.rgb = rgb('#000000'); fr.line.fill.background()
        Canvas(s, scale=sc, ox=ox, oy=oy, clip_h=844, clip_w=390).draw(items)
        cap = s.shapes.add_textbox(Emu(int(ox * EMU_PER_PX)), Emu(int((oy + 844 * sc + 14) * EMU_PER_PX)), Emu(int(pw * EMU_PER_PX)), Emu(int(30 * EMU_PER_PX)))
        cap.text_frame.paragraphs[0].alignment = PP_ALIGN.CENTER
        r = cap.text_frame.paragraphs[0].add_run(); r.text = label; r.font.size = Pt(12); r.font.name = FONT; r.font.bold = True; r.font.color.rgb = rgb('#cdd7e5')
    prs.save(OUT); print("saved", OUT, "slides:", len(prs.slides))

main()
