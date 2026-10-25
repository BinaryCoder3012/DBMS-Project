/**
 * SchemaScene: the UniGrant EER model as a 3D Chen diagram (src/lib/chen.js).
 *
 * Notation, as in docs/images/eer_chen_notation.png:
 *   rectangle            entity set            double rectangle  weak entity
 *   diamond              relationship          double diamond    identifying relationship
 *   1 / N / M            cardinality ratio on each end
 *   double line          total participation (the foreign key is NOT NULL)
 *   oval                 attribute; underline = key, dashed underline = partial key,
 *                        dashed oval = derived. Shown for the selected item (explore mode).
 *   circle "d"           disjoint specialisation of User on role (shown when User is selected)
 *
 * Props
 *   mode       "ambient" (landing hero) | "explore" (Schema page, clickable)
 *   highlight  entity names to light up (landing scroll scene)
 *   selected   entity name or relationship id pinned by the Schema page
 *   onSelect   (id | null) => void
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";
import gsap from "gsap";
import { ENTITIES, RELATIONSHIPS, ISA, parseAttr } from "../lib/chen.js";

const C = {
  field: 0x0f241c,
  paper: 0xe8ebe4,
  diamond: 0xb6d3c1,
  edge: 0x1a1e1c,
  line: 0xc3d2c9,
  hot: 0x9fd3b5,
  lit: 0xf4f7f2,
  pulse: 0xf2d39a,
  derived: 0x173a2c,
};
const INK = "#1A1E1C";
const FONT = '"Schibsted Grotesk", system-ui, sans-serif';
const DEPTH = 0.42;
const LINE_R = 0.03;
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

export default function SchemaScene({ mode = "ambient", highlight = [], selected = null, onSelect, className = "" }) {
  const host = useRef(null);
  const api = useRef(null);
  const props = useRef({});
  props.current = { highlight, selected, onSelect };

  useEffect(() => {
    let dead = false;
    let dispose = null;
    // Text is painted into textures, so wait (briefly) for the webfont.
    const fonts = document.fonts
      ? Promise.all(["800", "600", "italic 500"].map(w => document.fonts.load(`${w} 64px ${FONT}`)))
      : Promise.resolve();
    Promise.race([fonts, new Promise(r => setTimeout(r, 1500))])
      .catch(() => {})
      .then(() => { if (!dead) dispose = build(host.current, mode, api, props); });
    return () => { dead = true; dispose?.(); };
  }, [mode]);

  useEffect(() => { api.current?.setHighlight(highlight); }, [highlight.join("|")]);
  useEffect(() => { api.current?.setSelected(selected); }, [selected]);

  return <div ref={host} className={`schema-scene ${className}`} />;
}

// ── Geometry helpers ──────────────────────────────────────────
function rectShape(w, h) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, -h / 2); s.lineTo(w / 2, -h / 2); s.lineTo(w / 2, h / 2); s.lineTo(-w / 2, h / 2); s.closePath();
  return s;
}
function rhombusShape(w, h) {
  const s = new THREE.Shape();
  s.moveTo(0, -h / 2); s.lineTo(w / 2, 0); s.lineTo(0, h / 2); s.lineTo(-w / 2, 0); s.closePath();
  return s;
}
function ellipseShape(w, h) {
  const s = new THREE.Shape();
  s.absellipse(0, 0, w / 2, h / 2, 0, Math.PI * 2, false, 0);
  return s;
}
function extrude(shape, depth) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 32 });
  g.translate(0, 0, -depth / 2);
  return g;
}
// Second outline of a double rectangle / double diamond.
function ringGeo(outer, inner, depth) {
  outer.holes.push(new THREE.Path(inner.getPoints(32)));
  return extrude(outer, depth);
}

function build(el, mode, api, props) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const explore = mode === "explore";

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(C.field, 1);
  el.appendChild(renderer.domElement);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(C.field, 30, 60);
  const camera = new THREE.PerspectiveCamera(explore ? 36 : 32, 1, 0.1, 200);
  scene.add(new THREE.HemisphereLight(0xf2f6f3, 0x0f241c, 1.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(-6, 10, 14);
  scene.add(sun);

  // rig turns, world slides so the focused item sits at the pivot
  const rig = new THREE.Group();
  const world = new THREE.Group();
  rig.add(world);
  scene.add(rig);

  // ── Text painted into textures ──────────────────────────────
  function text(str, lineH, { weight = 700, color = INK, italic = false, underline = null } = {}) {
    const px = 96;
    const lines = str.split("\n");
    const font = `${italic ? "italic " : ""}${weight} ${px}px ${FONT}`;
    const cv = document.createElement("canvas");
    const ctx = cv.getContext("2d");
    ctx.font = font;
    const tw = Math.max(...lines.map(l => ctx.measureText(l).width));
    const lh = Math.round(px * 1.2);
    cv.width = Math.ceil(tw + px * 0.4);
    cv.height = lh * lines.length;
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    lines.forEach((l, i) => ctx.fillText(l, cv.width / 2, lh * (i + 0.5)));
    if (underline) {
      const uw = ctx.measureText(lines[0]).width;
      const y = lh * 0.5 + px * 0.44;
      ctx.strokeStyle = color;
      ctx.lineWidth = px * 0.075;
      if (underline === "dashed") ctx.setLineDash([px * 0.2, px * 0.13]);
      ctx.beginPath(); ctx.moveTo((cv.width - uw) / 2, y); ctx.lineTo((cv.width + uw) / 2, y); ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = aniso;
    const h = lineH * lines.length;
    const w = h * (cv.width / cv.height);
    return { tex, w, h };
  }
  function textPlane(str, lineH, opts) {
    const t = text(str, lineH, opts);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(t.w, t.h),
      new THREE.MeshBasicMaterial({ map: t.tex, transparent: true, depthWrite: false }));
    m.renderOrder = 2;
    return { mesh: m, w: t.w, h: t.h };
  }
  function sprite(str, lineH, opts) {
    const t = text(str, lineH, opts);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t.tex, transparent: true, depthWrite: false }));
    s.scale.set(t.w, t.h, 1);
    s.renderOrder = 3;
    return s;
  }

  const lineGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1);
  lineGeo.translate(0, 0.5, 0);
  function stick(a, b, r, mat) {
    const d = b.clone().sub(a);
    const m = new THREE.Mesh(lineGeo, mat);
    m.position.copy(a);
    m.quaternion.setFromUnitVectors(Y, d.clone().normalize());
    m.userData.len = d.length();
    m.scale.set(r, d.length(), r);
    return m;
  }
  const perpOf = d => new THREE.Vector3().crossVectors(d, Z).normalize();

  // ── Entities ────────────────────────────────────────────────
  const nodes = new Map();   // id → { kind, g, mats, body, w, h, ... }
  const pickables = [];

  function entityBox(name, weak, lineH = 0.44) {
    const g = new THREE.Group();
    const label = textPlane(name, lineH, { weight: 800 });
    const w = label.w + 0.42, h = lineH * 1.95;
    const mat = new THREE.MeshStandardMaterial({ color: C.paper, roughness: 0.65, emissive: C.hot, emissiveIntensity: 0, transparent: true });
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, DEPTH), mat);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry), new THREE.LineBasicMaterial({ color: C.edge, transparent: true }));
    label.mesh.position.z = DEPTH / 2 + 0.003;
    g.add(body, edges, label.mesh);
    const mats = [mat, edges.material, label.mesh.material];
    if (weak) {
      const ring = new THREE.Mesh(ringGeo(rectShape(w + 0.34, h + 0.34), rectShape(w + 0.2, h + 0.2), DEPTH * 0.7), mat.clone());
      g.add(ring);
      mats.push(ring.material);
    }
    return { g, body, mats, w: weak ? w + 0.34 : w, h: weak ? h + 0.34 : h };
  }

  ENTITIES.forEach(e => {
    const n = entityBox(e.name, e.weak);
    n.g.position.set(...e.pos);
    n.body.userData.id = e.name;
    pickables.push(n.body);
    world.add(n.g);
    nodes.set(e.name, { ...n, kind: "entity", def: e, pos: new THREE.Vector3(...e.pos), lines: [] });
  });

  // ── Relationships, their lines and cardinalities ────────────
  const lines = [];   // { rel, ent, meshes, mats, sprites }
  const paths = [];   // pulse path per relationship
  RELATIONSHIPS.forEach(r => {
    const g = new THREE.Group();
    g.position.set(...r.pos);
    const label = textPlane(r.label || r.id, 0.34, { weight: 600 });
    const dh = Math.max(1.02, label.h * 1.85);
    const dw = label.w / (1 - label.h / dh) + 0.3;
    const mat = new THREE.MeshStandardMaterial({ color: C.diamond, roughness: 0.6, emissive: C.hot, emissiveIntensity: 0, transparent: true });
    const geo = extrude(rhombusShape(dw, dh), DEPTH);
    const body = new THREE.Mesh(geo, mat);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), new THREE.LineBasicMaterial({ color: C.edge, transparent: true }));
    label.mesh.position.z = DEPTH / 2 + 0.003;
    g.add(body, edges, label.mesh);
    const mats = [mat, edges.material, label.mesh.material];
    let hw = dw / 2, hh = dh / 2;
    if (r.identifying) {
      const ring = new THREE.Mesh(ringGeo(rhombusShape(dw * 1.2, dh * 1.3), rhombusShape(dw * 1.11, dh * 1.17), DEPTH * 0.7), mat.clone());
      g.add(ring);
      mats.push(ring.material);
      hw *= 1.2; hh *= 1.3;
    }
    body.userData.id = r.id;
    pickables.push(body);
    world.add(g);
    const pos = new THREE.Vector3(...r.pos);
    const node = { kind: "rel", def: r, g, body, mats, pos, w: dw, h: dh, lines: [] };
    nodes.set(r.id, node);

    const recursive = r.ends[0][0] === r.ends[1][0];
    const ends = r.ends.map(([ent, card, total, role], i) => {
      const en = nodes.get(ent);
      let target = en.pos.clone();
      if (recursive) {
        // two lines into the same entity, entering at different points
        const d0 = en.pos.clone().sub(pos).normalize();
        target.add(perpOf(d0).multiplyScalar(i ? -0.8 : 0.8));
      }
      const dir = target.clone().sub(pos).normalize();
      const perp = perpOf(dir);
      // labels go on the outside of a recursive pair, so the two ends never collide
      const outer = recursive && i ? -1 : 1;
      const lmat = new THREE.MeshStandardMaterial({ color: C.line, roughness: 0.5, emissive: C.lit, emissiveIntensity: 0, transparent: true });
      const meshes = (total ? [-0.075, 0.075] : [0]).map(o =>
        stick(pos.clone().addScaledVector(perp, o), target.clone().addScaledVector(perp, o), LINE_R, lmat));
      meshes.forEach(m => world.add(m));

      // cardinality next to the diamond, on its line
      const edgeT = 1 / (Math.abs(dir.x) / hw + Math.abs(dir.y) / hh);
      const card$ = sprite(card, 0.4, { weight: 800, color: "#F4E3BC" });
      card$.position.copy(pos).addScaledVector(dir, edgeT + 0.38).addScaledVector(perp, (total ? 0.36 : 0.3) * outer);
      world.add(card$);
      const sprites = [card$];
      if (role) {
        const role$ = sprite(role, 0.3, { weight: 500, italic: true, color: "#9FD3B5" });
        role$.position.copy(pos).lerp(target, 0.4).addScaledVector(perp, 0.5 * outer);
        world.add(role$);
        sprites.push(role$);
      }
      const line = { rel: r.id, ent, meshes, mat: lmat, sprites };
      lines.push(line);
      node.lines.push(line);
      en.lines.push(line);
      return target;
    });
    paths.push({ rel: r.id, pts: [ends[0], pos, ends[1]], t: Math.random() * 2, speed: 0.35 + Math.random() * 0.2 });
  });

  // ── Bounds, for framing ─────────────────────────────────────
  const box = new THREE.Box3();
  nodes.forEach(n => {
    box.expandByPoint(n.pos.clone().add(new THREE.Vector3(n.w / 2, n.h / 2, 0)));
    box.expandByPoint(n.pos.clone().sub(new THREE.Vector3(n.w / 2, n.h / 2, 0)));
  });
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  // ── Pulses: one light per relationship, entity → diamond → entity ─
  const pulses = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 12, 12),
    new THREE.MeshBasicMaterial({ color: C.pulse }), paths.length);
  world.add(pulses);
  const m4 = new THREE.Matrix4(), p3 = new THREE.Vector3(), q0 = new THREE.Quaternion(), s3 = new THREE.Vector3();

  // ── Attributes and the User specialisation (explore only) ───
  let detail = null;   // { id, g }
  function attrOval(a, color = C.paper) {
    const g = new THREE.Group();
    const label = textPlane(a.name, 0.27, {
      weight: a.key || a.partial ? 700 : 500,
      color: a.derived ? "#E3EAE4" : INK,
      underline: a.key ? "solid" : a.partial ? "dashed" : null,
    });
    const w = label.w + 0.5, h = 0.62;
    const mat = new THREE.MeshStandardMaterial({ color: a.derived ? C.derived : color, roughness: 0.7, transparent: true });
    g.add(new THREE.Mesh(extrude(ellipseShape(w, h), 0.14), mat));
    label.mesh.position.z = 0.075;
    g.add(label.mesh);
    if (a.derived) {
      const pts = new THREE.EllipseCurve(0, 0, w / 2, h / 2).getPoints(64).map(p => new THREE.Vector3(p.x, p.y, 0.08));
      const dash = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineDashedMaterial({ color: 0xe3eae4, dashSize: 0.12, gapSize: 0.08 }));
      dash.computeLineDistances();
      g.add(dash);
    }
    return { g, w, h };
  }

  function buildDetail(id) {
    const n = nodes.get(id);
    const list = (n.def.attrs || []).map(parseAttr);
    if (!list.length) return null;
    const g = new THREE.Group();
    g.position.copy(n.pos);
    const isa = id === ISA.superclass;
    const count = list.length;
    const zf = 2.6;
    const cmat = new THREE.MeshBasicMaterial({ color: C.line, transparent: true, opacity: 0.7 });
    const items = [];
    const ovals = list.map(a => ({ a, o: attrOval(a), parts: a.parts?.map(pt => attrOval(parseAttr(pt), 0xd3ddd6)) }));

    // Ovals around an ellipse, spaced by how much room each takes along the
    // ring (wide at the top and bottom, only its height at the sides). User
    // keeps the lower part free for its specialisation.
    const full = !isa;
    const a0 = isa ? Math.PI * 1.12 : Math.PI / 2;
    const span = isa ? -Math.PI * 1.24 : -Math.PI * 2;
    const gap = 0.32;
    const foot = (v, th, rx, ry) => {
      const tx = -rx * Math.sin(th), ty = ry * Math.cos(th), l = Math.hypot(tx, ty);
      const ux = Math.abs(tx / l), uy = Math.abs(ty / l);
      const own = ux * v.o.w + uy * v.o.h + gap;
      if (!v.parts) return own;
      return Math.max(own, v.parts.reduce((s, q) => s + ux * q.w + uy * q.h + gap, 0) * 0.8);
    };
    let rx = 2.4, ry = 1.5, thetas = null, fits = 0;
    for (let it = 0; it < 60 && fits < 3; it++) {
      const S = 720, cum = [0];
      const th = k => a0 + span * k / S;
      for (let k = 1; k <= S; k++) cum[k] = cum[k - 1] + Math.hypot(rx * (Math.cos(th(k)) - Math.cos(th(k - 1))), ry * (Math.sin(th(k)) - Math.sin(th(k - 1))));
      const total = cum[S];
      const est = thetas || ovals.map((_, i) => a0 + span * (full ? i / count : i / Math.max(1, count - 1)));
      const f = ovals.map((v, i) => foot(v, est[i], rx, ry));
      const need = f.reduce((s, x) => s + x, 0) - (full ? 0 : (f[0] + f[count - 1]) / 2);
      if (need > total) { rx *= 1.07; ry *= 1.07; thetas = null; fits = 0; continue; }
      const slack = (total - need) / (full ? count : Math.max(1, count - 1));
      let s = 0;
      thetas = f.map((x, i) => {
        if (i) s += f[i - 1] / 2 + x / 2 + slack;
        let k = cum.findIndex(c => c >= s);
        if (k < 0) k = S;
        return th(k);
      });
      fits++;
    }
    const ext = { x: 1.5, top: 1, bottom: -1 };
    const grow = (p, w, h) => {
      ext.x = Math.max(ext.x, Math.abs(p.x) + w / 2 + 0.4);
      ext.top = Math.max(ext.top, p.y + h / 2 + 0.4);
      ext.bottom = Math.min(ext.bottom, p.y - h / 2 - 0.4);
    };
    ovals.forEach((v, i) => {
      const t = thetas[i];
      const p = new THREE.Vector3(Math.cos(t) * rx, Math.sin(t) * ry, zf);
      v.o.g.position.copy(p);
      g.add(v.o.g);
      const c = stick(new THREE.Vector3(0, 0, 0), p, 0.016, cmat);
      g.add(c);
      items.push(v.o.g, c);
      grow(p, v.o.w, v.o.h);
      if (v.parts) {
        // composite: its parts hang outside the ring, joined to the composite oval
        const out = new THREE.Vector3(Math.cos(t) / rx, Math.sin(t) / ry, 0).normalize();
        const tan = perpOf(out);
        const ux = Math.abs(tan.x), uy = Math.abs(tan.y);
        const fw = v.parts.map(q => ux * q.w + uy * q.h + gap);
        let off = -fw.reduce((a, b) => a + b, 0) / 2;
        v.parts.forEach((q, j) => {
          off += fw[j] / 2;
          const qp = p.clone().addScaledVector(out, 1.35 + uy * 0.9).addScaledVector(tan, off);
          off += fw[j] / 2;
          q.g.position.copy(qp);
          g.add(q.g);
          const pc = stick(p, qp, 0.014, cmat);
          g.add(pc);
          items.push(q.g, pc);
          grow(qp, q.w, q.h);
        });
      }
    });

    if (isa) {
      // superclass ═ (d) ─⊂─ subclasses
      const cpos = new THREE.Vector3(0, -2.5, zf);
      const circle = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.14, 40),
        new THREE.MeshStandardMaterial({ color: C.diamond, roughness: 0.6, transparent: true }));
      circle.rotation.x = Math.PI / 2;
      circle.position.copy(cpos);
      const d = textPlane("d", 0.4, { weight: 800 });
      d.mesh.position.copy(cpos).add(new THREE.Vector3(0, 0.02, 0.08));
      g.add(circle, d.mesh);
      items.push(circle, d.mesh);
      const dirUp = cpos.clone().normalize().negate();
      const perp = perpOf(dirUp);
      [-0.075, 0.075].forEach(o => {
        const s = stick(cpos.clone().addScaledVector(perp, o), new THREE.Vector3(0, 0, 0).addScaledVector(perp, o), LINE_R, cmat);
        g.add(s); items.push(s);
      });
      const disc = sprite("role", 0.26, { weight: 500, italic: true, color: "#9FD3B5" });
      disc.position.copy(cpos).add(new THREE.Vector3(0.75, 0.55, 0));
      g.add(disc); items.push(disc);
      ISA.subclasses.forEach((sub, i) => {
        const sb = entityBox(sub, false, 0.34);
        const sp = new THREE.Vector3((i - (ISA.subclasses.length - 1) / 2) * 2.7, -4.6, zf);
        sb.g.position.copy(sp);
        g.add(sb.g);
        const s = stick(cpos, sp, LINE_R, cmat);
        g.add(s);
        // subset symbol: a U opening towards the superclass
        const u = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.028, 8, 24, Math.PI), cmat);
        const toSuper = cpos.clone().sub(sp).normalize();
        u.position.copy(sp).lerp(cpos, 0.5);
        u.quaternion.setFromUnitVectors(Y, toSuper.clone().negate());
        g.add(u);
        items.push(sb.g, s, u);
      });
      ext.x = Math.max(ext.x, 6); ext.bottom = Math.min(ext.bottom, -5.4);
    }
    world.add(g);
    if (!reduce) {
      items.forEach((o, i) => {
        gsap.from(o.position, { x: 0, y: 0, z: 0, duration: 0.7, ease: "power3.out", delay: i * 0.012 });
        gsap.from(o.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.6, ease: "back.out(1.4)", delay: i * 0.012 });
      });
    }
    return { id, g, ext };
  }

  function dropDetail() {
    if (!detail) return;
    const { g } = detail;
    detail = null;
    const kill = () => {
      world.remove(g);
      g.traverse(o => {
        if (o.geometry && o.geometry !== lineGeo) o.geometry.dispose();
        if (o.material) { o.material.map?.dispose(); o.material.dispose(); }
      });
    };
    if (reduce) kill();
    else gsap.to(g.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.3, ease: "power2.in", onComplete: kill });
  }

  // ── Highlighting ───────────────────────────────────────────
  const state = { highlight: [], selected: null, hovered: null };
  const levels = new Map();
  let anyFocus = false;
  function apply() {
    const hl = new Set(state.highlight);
    const hot = new Set(), near = new Set();
    hl.forEach(n => nodes.has(n) && hot.add(n));
    if (hl.size > 1) RELATIONSHIPS.forEach(r => r.ends.every(([e]) => hl.has(e)) && hot.add(r.id));
    [state.selected, state.hovered].forEach(id => {
      if (!id || !nodes.has(id)) return;
      hot.add(id);
      const n = nodes.get(id);
      if (n.kind === "entity") n.lines.forEach(l => { near.add(l.rel); nodes.get(l.rel).def.ends.forEach(([e]) => near.add(e)); });
      else n.def.ends.forEach(([e]) => near.add(e));
    });
    anyFocus = hot.size > 0;
    const focusDetail = explore && detail && detail.id === state.selected && !state.hovered && nodes.get(state.selected).kind === "entity";
    nodes.forEach((n, id) => {
      const lv = !anyFocus ? 1 : hot.has(id) ? 2 : near.has(id) ? 1 : 0;
      levels.set(id, lv);
      const op = lv === 0 ? 0.13 : lv === 1 && focusDetail ? 0.32 : 1;
      n.mats.forEach(m => gsap.to(m, { opacity: op, duration: 0.45, overwrite: "auto" }));
      gsap.to(n.mats[0], { emissiveIntensity: lv === 2 && anyFocus ? 0.45 : 0, duration: 0.45, overwrite: "auto" });
    });
    lines.forEach(l => {
      const lv = Math.min(levels.get(l.rel), levels.get(l.ent));
      const lit = anyFocus && lv >= 1 && Math.max(levels.get(l.rel), levels.get(l.ent)) === 2;
      const lop = lv === 0 ? 0.08 : focusDetail && !lit ? 0.3 : focusDetail ? 0.6 : 1;
      gsap.to(l.mat, { opacity: lop, emissiveIntensity: lit ? 0.7 : 0, duration: 0.45, overwrite: "auto" });
      l.sprites.forEach(s => gsap.to(s.material, { opacity: lop, duration: 0.45, overwrite: "auto" }));
    });
  }

  // ── Camera framing ─────────────────────────────────────────
  const view = { fx: center.x, fy: center.y, fz: center.z, dist: 30, ox: 0 };
  function fitDist(w, h) {
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    return Math.max(h / 2 / t, w / 2 / (t * camera.aspect));
  }
  function frameTarget() {
    if (explore && state.selected && nodes.has(state.selected)) {
      const n = nodes.get(state.selected);
      const ext = { ...(detail?.id === state.selected ? detail.ext : { x: 3, top: 2, bottom: -2 }) };
      // a relationship is read together with the entities it connects
      if (n.kind === "rel") n.def.ends.forEach(([e]) => {
        const d = nodes.get(e).pos.clone().sub(n.pos);
        ext.x = Math.max(ext.x, Math.abs(d.x) + 1.8);
        ext.top = Math.max(ext.top, d.y + 0.8);
        ext.bottom = Math.min(ext.bottom, d.y - 0.8);
      });
      ext.x = Math.max(ext.x, 4.5);
      // the attribute ring sits 2.6 nearer the camera than the diagram plane
      return { fx: n.pos.x, fy: n.pos.y + (ext.top + ext.bottom) / 2, fz: n.pos.z, dist: fitDist(ext.x * 2 + 1.2, ext.top - ext.bottom + 2.2) * 1.06 + 2.6, ox: 0 };
    }
    // explore leaves room for the legend above and the hint below
    if (explore) return { fx: center.x, fy: center.y + 0.35, fz: center.z, dist: fitDist(size.x + 1.5, size.y + 3.6), ox: 0 };
    // Landing hero: the headline sits at the left, so on wide screens the
    // diagram fills the right ~60% of the frame.
    const wide = camera.aspect > 1.3;
    const share = wide ? 0.6 : 1;
    const d = fitDist(size.x / share, size.y + 2);
    const visW = 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
    return { fx: center.x, fy: center.y, fz: center.z, dist: d, ox: wide ? visW * (1 - share / 2 - 0.5 - 0.02) : 0 };
  }
  function reframe(animate = true) {
    const t = frameTarget();
    if (animate && !reduce) gsap.to(view, { ...t, duration: 1.1, ease: "power3.inOut", overwrite: "auto" });
    else Object.assign(view, t);
  }

  // ── Intro: entities land, diamonds pop, lines reach out ─────
  const intro = gsap.timeline({ paused: reduce });
  const byDist = [...nodes.values()].sort((a, b) => a.pos.distanceTo(center) - b.pos.distanceTo(center));
  byDist.filter(n => n.kind === "entity").forEach((n, i) => {
    intro.from(n.g.position, { z: n.pos.z - 8, duration: 1.0, ease: "power3.out" }, i * 0.05);
    intro.from(n.g.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.8, ease: "back.out(1.5)" }, i * 0.05);
  });
  byDist.filter(n => n.kind === "rel").forEach((n, i) => {
    intro.from(n.g.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.55, ease: "back.out(2)" }, 0.6 + i * 0.04);
  });
  lines.forEach((l, i) => {
    l.meshes.forEach(m => {
      const len = m.userData.len, k = { v: 0 };
      intro.to(k, { v: 1, duration: 0.6, ease: "power2.out", onUpdate: () => m.scale.setY(Math.max(1e-4, len * k.v)) }, 0.9 + i * 0.025);
      m.scale.setY(1e-4);
    });
    l.sprites.forEach(s => intro.from(s.scale, { x: 0.001, y: 0.001, duration: 0.4, ease: "back.out(2)" }, 1.3 + i * 0.025));
  });
  if (reduce) intro.progress(1);

  // ── Pointer ────────────────────────────────────────────────
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const drag = { on: false, x: 0, y: 0, moved: 0 };
  const target = { ry: 0, rx: 0, px: 0, py: 0 };
  const canvas = renderer.domElement;
  canvas.style.touchAction = explore ? "none" : "pan-y";
  if (explore) canvas.style.cursor = "grab";

  function pick(ev) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pickables, false).find(h => (levels.get(h.object.userData.id) ?? 1) > 0 || !anyFocus);
    return hit ? hit.object.userData.id : null;
  }
  function onMove(ev) {
    const r = el.getBoundingClientRect();
    target.px = (ev.clientX - r.left) / r.width - 0.5;
    target.py = (ev.clientY - r.top) / r.height - 0.5;
    if (drag.on && explore) {
      target.ry = THREE.MathUtils.clamp(target.ry + (ev.clientX - drag.x) * 0.005, -1.1, 1.1);
      target.rx = THREE.MathUtils.clamp(target.rx + (ev.clientY - drag.y) * 0.004, -0.7, 0.7);
      drag.moved += Math.abs(ev.clientX - drag.x) + Math.abs(ev.clientY - drag.y);
      drag.x = ev.clientX; drag.y = ev.clientY;
    }
    if (!explore) return;
    const id = drag.on ? state.hovered : pick(ev);
    if (id !== state.hovered) {
      state.hovered = id;
      apply();
    }
    canvas.style.cursor = drag.on ? "grabbing" : id ? "pointer" : "grab";
  }
  function onDown(ev) { drag.on = true; drag.moved = 0; drag.x = ev.clientX; drag.y = ev.clientY; }
  function onUp(ev) {
    if (drag.on && drag.moved < 6 && explore) props.current.onSelect?.(pick(ev));
    drag.on = false;
  }
  function onLeave() { if (state.hovered) { state.hovered = null; apply(); } }
  function onKey(ev) { if (ev.key === "Escape" && explore && state.selected) props.current.onSelect?.(null); }
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerdown", onDown);
  window.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointerleave", onLeave);
  window.addEventListener("keydown", onKey);

  // ── Size and visibility ────────────────────────────────────
  function resize() {
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    reframe(false);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  resize();

  let visible = true;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
  io.observe(el);

  // ── Frame loop ─────────────────────────────────────────────
  const clock = new THREE.Clock();
  let raf = 0;
  function frame() {
    raf = requestAnimationFrame(frame);
    if (!visible) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    const sway = reduce || drag.on || state.selected ? 0 : Math.sin(t * 0.16) * (explore ? 0.12 : 0.2);
    const par = explore ? 0.08 : 0.22;
    rig.rotation.y += (target.ry + sway + target.px * par - rig.rotation.y) * 0.06;
    rig.rotation.x += (target.rx + (explore ? 0 : -0.18) + target.py * par * 0.5 - rig.rotation.x) * 0.06;
    rig.position.x = view.ox;
    world.position.set(-view.fx, -view.fy, -view.fz);
    camera.position.set(0, explore ? 0 : view.dist * 0.04, view.dist);
    camera.lookAt(0, 0, 0);

    paths.forEach((p, i) => {
      const lit = levels.get(p.rel) >= 1 && anyFocus && p.pts.length;
      const show = !reduce && intro.progress() > 0.95 && (anyFocus ? lit && (levels.get(p.rel) === 2 || state.selected || state.hovered) : true);
      p.t = (p.t + dt * p.speed * (anyFocus ? 1.6 : 1)) % 2;
      const seg = p.t < 1 ? 0 : 1, u = p.t % 1;
      p3.copy(p.pts[seg]).lerp(p.pts[seg + 1], u);
      const sc = show ? (anyFocus ? 1 : 0.65) * Math.sin(Math.PI * (p.t / 2)) : 0;
      m4.compose(p3, q0, s3.set(sc, sc, sc));
      pulses.setMatrixAt(i, m4);
    });
    pulses.instanceMatrix.needsUpdate = true;
    renderer.render(scene, camera);
  }
  frame();

  api.current = {
    setHighlight(h) { state.highlight = h || []; apply(); },
    setSelected(id) {
      id = id && nodes.has(id) ? id : null;
      state.selected = id;
      if (explore && detail?.id !== id) {
        dropDetail();
        if (id) detail = buildDetail(id);
      }
      apply();
      if (explore) reframe(true);
    },
  };
  // props may have changed while fonts were loading
  api.current.setHighlight(props.current.highlight);
  api.current.setSelected(props.current.selected);

  return () => {
    cancelAnimationFrame(raf);
    intro.kill();
    gsap.killTweensOf(view);
    ro.disconnect();
    io.disconnect();
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointerleave", onLeave);
    window.removeEventListener("keydown", onKey);
    scene.traverse(o => {
      o.geometry?.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.map?.dispose(); m.dispose(); });
    });
    renderer.dispose();
    el.innerHTML = "";
    api.current = null;
  };
}
