/**
 * ui/AnimationLayer.js
 * Canvas-based particle animation overlay for the circuit canvas.
 *
 * Inserts a <canvas> element as a direct child of #circuit-wrap with
 * position:absolute; pointer-events:none so it overlays the SVG without
 * blocking interaction. Stays in sync with the wrap's size via ResizeObserver.
 *
 * Animation types (driven by PRODUCT_DB state field):
 *   'gas'     — bubbles rise from rod_bottom of the electrode
 *   'solid'   — coloured deposit particles settle near rod_bottom (cathode deposits)
 *   'aqueous' — soft colour cloud drifts through the beaker liquid
 *
 * Coordinate system: wrap-local pixels. Since the SVG fills the wrap with
 * no viewBox, SVG viewport coordinates equal wrap-local pixels, so electrode
 * terminal positions can be passed in directly.
 */

import { PRODUCT_EQUATIONS } from '../data/products.js';
import {
  ROD_LENGTH,
  ROD_VISUAL_BOTTOM,
  ROD_VISUAL_TOP,
  ROD_W,
} from '../circuit/ElectrodeNode.js';

const FARADAY_CONSTANT       = 96_485;
const NOTIONAL_VOLUME_DM3    = 0.25;
const BASE_CURRENT_A         = 0.055;
const MAX_CURRENT_A          = 0.12;
const VISIBLE_DEPOSIT_MOL    = 6.0e-5;
const VISIBLE_DISSOLVE_MOL   = 6.0e-5;
const DEPOSIT_MAX_THICKNESS  = 7;
const EROSION_MAX_DEPTH      = 5;
const AQUEOUS_REFERENCE_CONC = 0.18;
const MAX_DT_MS              = 50;
const ELECTRODE_HALF_W       = ROD_W / 2;
const DEBUG_HISTORY_LIMIT    = 180;

export class AnimationLayer {
  /**
   * @param {HTMLElement} circuitWrap — #circuit-wrap (parent of the SVG)
   * @param {object} [opts]
   * @param {SVGElement} [opts.svgEl] — circuit SVG for sampling live wire paths
   */
  constructor(circuitWrap, opts = {}) {
    this._wrap = circuitWrap;
    this._svg = opts.svgEl ?? circuitWrap.querySelector('#circuit-svg');
    this._circuit = opts.circuitCanvas ?? null;

    // Create and insert the overlay canvas
    this._canvas = document.createElement('canvas');
    this._canvas.className = 'anim-canvas';
    Object.assign(this._canvas.style, {
      position:      'absolute',
      inset:         '0',
      pointerEvents: 'none',
      zIndex:        '5',
    });
    circuitWrap.appendChild(this._canvas);
    this._ctx = this._canvas.getContext('2d');

    this._testOverlay = document.createElement('div');
    this._testOverlay.className = 'anim-test-overlay';
    Object.assign(this._testOverlay.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      zIndex: '7',
      overflow: 'visible',
    });
    circuitWrap.appendChild(this._testOverlay);

    // State
    this._particles      = [];
    this._running        = false;
    this._frameId        = null;
    this._lastTs         = null;
    this._gasAccumulator = 0;
    this._liqAccumulator = 0;
    this._anodeProduct   = null;
    this._cathodeProduct = null;
    this._anodePos       = null;   // { x, y } wrap-local px
    this._cathodePos     = null;
    this._beakerBounds   = null;
    this._result         = null;
    this._electrolyte    = null;
    this._anodeElectrode = null;
    this._cathodeElectrode = null;
    this._anodeNodeId    = null;
    this._cathodeNodeId  = null;
    this._batteryEnabled = true;
    this._state          = null;
    this._debugListener  = null;
    this._lastDebugEmitMs = 0;
    this._debugHistory   = [];
    this._flowHintsEnabled = false;
    this._flowPhasePx = 0;
    this._activeTestCleanup = null;

    // Keep canvas sized to the wrap
    this._ro = new ResizeObserver(() => this._onResize());
    this._ro.observe(circuitWrap);
    this._onResize();
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Start (or restart) the animation for the current electrolysis run.
   * @param {object} opts
   * @param {object}   opts.result            — ElectrolysisResult
   * @param {object}   opts.electrolyte       — electrolyte record with live concentration
   * @param {object}   opts.anodeElectrode    — electrode record
   * @param {object}   opts.cathodeElectrode  — electrode record
   * @param {{x,y}}    opts.anodePos          — wrap-local pixel position of rod_bottom
   * @param {{x,y}}    opts.cathodePos        — wrap-local pixel position of rod_bottom
   * @param {object}   opts.beakerBounds      — wrap-local liquid bounds
   */
  start({
    result,
    electrolyte,
    anodeElectrode,
    cathodeElectrode,
    anodeNodeId,
    cathodeNodeId,
    batteryEnabled,
    anodePos,
    cathodePos,
    beakerBounds,
  }) {
    this._stop();
    this._particles        = [];
    this._result           = result;
    this._electrolyte      = electrolyte;
    this._anodeProduct     = result?.anodeProduct ?? null;
    this._cathodeProduct   = result?.cathodeProduct ?? null;
    this._anodeElectrode   = anodeElectrode ?? null;
    this._cathodeElectrode = cathodeElectrode ?? null;
    this._anodeNodeId      = anodeNodeId ?? null;
    this._cathodeNodeId    = cathodeNodeId ?? null;
    this._batteryEnabled   = batteryEnabled !== false;
    this._anodePos         = anodePos;
    this._cathodePos       = cathodePos;
    this._beakerBounds     = normaliseBeakerBounds(beakerBounds);
    this._lastTs           = null;
    this._gasAccumulator   = 0;
    this._liqAccumulator   = 0;
    this._state            = this._buildState(result, electrolyte, anodeElectrode, cathodeElectrode);
    this._lastDebugEmitMs  = 0;
    this._debugHistory     = [];
    this._running          = true;
    this._emitDebugSnapshot('running');
    this._loop();
  }

  /** Stop all animation and clear the canvas. */
  stop() {
    this._stop();
    this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    this._emitIdleDebug();
  }

  /** Subscribe to live debug snapshots from the time-step model. */
  setDebugListener(listener) {
    this._debugListener = typeof listener === 'function' ? listener : null;
    if (this._debugListener) this._emitIdleDebug();
  }

  /** Toggle educational flow hints (electrons in wires + ions in solution). */
  setFlowHintsEnabled(on) {
    this._flowHintsEnabled = Boolean(on);
  }

  /** Attach the live circuit canvas so wire metadata can drive electron direction. */
  setCircuitCanvas(canvas) {
    this._circuit = canvas ?? null;
  }

  /** Play a short verification-test animation for the current run. */
  playTestAnimation(testResult) {
    this._clearTestAnimation();
    if (!testResult?.animId) return;

    switch (testResult.animId) {
      case 'litmus':
        this._activeTestCleanup = this._playLitmusAnimation(testResult);
        break;
      default:
        this._activeTestCleanup = null;
        break;
    }
  }

  /** Whether an animation loop is currently active. */
  get isRunning() {
    return this._running;
  }

  /**
   * Re-anchor active animation to new electrode/beaker geometry without reset.
   * Used by reaction mode v2 to preserve progress while electrodes move.
   */
  updateAnchors({
    electrolyte,
    anodeElectrode,
    cathodeElectrode,
    anodeNodeId,
    cathodeNodeId,
    batteryEnabled,
    anodePos,
    cathodePos,
    beakerBounds,
  }) {
    this._electrolyte      = electrolyte ?? this._electrolyte;
    this._anodeElectrode   = anodeElectrode ?? this._anodeElectrode;
    this._cathodeElectrode = cathodeElectrode ?? this._cathodeElectrode;
    this._anodeNodeId      = anodeNodeId ?? this._anodeNodeId;
    this._cathodeNodeId    = cathodeNodeId ?? this._cathodeNodeId;
    if (batteryEnabled !== undefined) this._batteryEnabled = Boolean(batteryEnabled);
    if (anodePos) this._anodePos = anodePos;
    if (cathodePos) this._cathodePos = cathodePos;
    if (beakerBounds) this._beakerBounds = normaliseBeakerBounds(beakerBounds);
  }

  /** Download the current phase-one debug trace as CSV. */
  downloadDebugTrace() {
    if (this._debugHistory.length === 0) return false;

    const rows = [
      [
        'elapsed_s',
        'current_a',
        'deposit_progress',
        'cathode_conc_mol_dm3',
        'cathode_depletion',
        'anode_conc_mol_dm3',
        'anode_dissolution_progress',
        'aqueous_tint_progress',
        'particle_count',
        'anode_product_id',
        'cathode_product_id',
      ].join(','),
      ...this._debugHistory.map(point => ([
        point.elapsedS.toFixed(3),
        point.currentA.toFixed(6),
        point.depositProgress.toFixed(6),
        point.cathodeConc.toFixed(6),
        point.cathodeDepletion.toFixed(6),
        point.anodeConc.toFixed(6),
        point.anodeDissolutionProgress.toFixed(6),
        point.aqueousTintProgress.toFixed(6),
        String(point.particleCount),
        csvEscape(point.anodeProductId ?? ''),
        csvEscape(point.cathodeProductId ?? ''),
      ].join(','))),
    ];

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.href = url;
    link.download = `phase1-trace-${this._electrolyte?.id ?? 'electrochem'}-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return true;
  }

  // ── Internal ────────────────────────────────────────────────────────────

  _stop() {
    this._running = false;
    this._clearTestAnimation();
    if (this._frameId !== null) {
      cancelAnimationFrame(this._frameId);
      this._frameId = null;
    }
    this._lastTs = null;
  }

  _onResize() {
    const dpr = window.devicePixelRatio || 1;
    const w   = this._wrap.clientWidth;
    const h   = this._wrap.clientHeight;
    this._canvas.width        = Math.round(w * dpr);
    this._canvas.height       = Math.round(h * dpr);
    this._canvas.style.width  = w + 'px';
    this._canvas.style.height = h + 'px';
    this._dpr = dpr;
  }

  _clearTestAnimation() {
    if (typeof this._activeTestCleanup === 'function') {
      this._activeTestCleanup();
    }
    this._activeTestCleanup = null;
    this._testOverlay.replaceChildren();
  }

  _playLitmusAnimation(testResult) {
    const anchor = this._resolveTestAnchor(testResult.target);
    if (!anchor) return null;

    const svgNS = 'http://www.w3.org/2000/svg';
    const wrapW = this._wrap.clientWidth || 800;
    const wrapH = this._wrap.clientHeight || 480;
    const W = 110;
    const H = 120;
    const x = clamp(anchor.x - W * 0.5, 8, Math.max(8, wrapW - W - 8));
    const y = clamp(anchor.y - 92, 8, Math.max(8, wrapH - H - 8));
    const observation = (testResult.observation ?? '').toLowerCase();
    const startsBlue = !observation.includes('turns blue');
    const initialFill = startsBlue ? '#2850d8' : '#e05b6f';
    const midFill = observation.includes('turns blue')
      ? '#2850d8'
      : observation.includes('red') || observation.includes('bleach')
        ? '#e05b6f'
        : initialFill;
    const finalFill = observation.includes('bleach') ? '#eeebe4' : midFill;

    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${W}px;height:${H}px;overflow:visible;opacity:0;`;

    const scene = document.createElementNS(svgNS, 'g');
    scene.setAttribute('transform', 'translate(0,-36)');
    scene.style.transition = 'transform 420ms ease, opacity 420ms ease';
    scene.style.opacity = '0';
    svg.appendChild(scene);

    for (let i = 0; i < 3; i++) {
      const wisp = document.createElementNS(svgNS, 'ellipse');
      wisp.setAttribute('cx', String(55 + (i - 1) * 10));
      wisp.setAttribute('cy', '78');
      wisp.setAttribute('rx', '3');
      wisp.setAttribute('ry', '5');
      wisp.setAttribute('fill', 'rgba(255,255,255,0.24)');
      wisp.style.animation = `ltWispRise ${1200 + i * 180}ms ease-out ${i * 180}ms infinite`;
      scene.appendChild(wisp);
    }

    for (const [x1, x2] of [[46, 51], [64, 59]]) {
      const arm = document.createElementNS(svgNS, 'line');
      arm.setAttribute('x1', String(x1));
      arm.setAttribute('y1', '6');
      arm.setAttribute('x2', String(x2));
      arm.setAttribute('y2', '24');
      arm.setAttribute('stroke', '#7a8090');
      arm.setAttribute('stroke-width', '1.8');
      arm.setAttribute('stroke-linecap', 'round');
      scene.appendChild(arm);
    }

    const paper = document.createElementNS(svgNS, 'rect');
    paper.setAttribute('x', '48');
    paper.setAttribute('y', '20');
    paper.setAttribute('width', '14');
    paper.setAttribute('height', '40');
    paper.setAttribute('rx', '2');
    paper.setAttribute('fill', initialFill);
    scene.appendChild(paper);

    const overlay = document.createElementNS(svgNS, 'rect');
    overlay.setAttribute('x', '48');
    overlay.setAttribute('y', '20');
    overlay.setAttribute('width', '14');
    overlay.setAttribute('height', '40');
    overlay.setAttribute('rx', '2');
    overlay.setAttribute('fill', midFill);
    overlay.style.opacity = '0';
    scene.appendChild(overlay);

    const bleachOverlay = document.createElementNS(svgNS, 'rect');
    bleachOverlay.setAttribute('x', '48');
    bleachOverlay.setAttribute('y', '20');
    bleachOverlay.setAttribute('width', '14');
    bleachOverlay.setAttribute('height', '40');
    bleachOverlay.setAttribute('rx', '2');
    bleachOverlay.setAttribute('fill', finalFill);
    bleachOverlay.style.opacity = '0';
    scene.appendChild(bleachOverlay);

    const shine = document.createElementNS(svgNS, 'rect');
    shine.setAttribute('x', '50');
    shine.setAttribute('y', '24');
    shine.setAttribute('width', '3');
    shine.setAttribute('height', '32');
    shine.setAttribute('rx', '1.5');
    shine.setAttribute('fill', 'rgba(255,255,255,0.28)');
    scene.appendChild(shine);

    this._testOverlay.appendChild(svg);

    const timers = [];
    requestAnimationFrame(() => {
      svg.style.opacity = '1';
      scene.setAttribute('transform', 'translate(0,0)');
      scene.style.opacity = '1';
    });

    if (midFill !== initialFill) {
      timers.push(window.setTimeout(() => {
        overlay.style.transition = 'opacity 1400ms ease-in-out';
        overlay.style.opacity = '1';
      }, 700));
    }

    if (finalFill !== midFill) {
      timers.push(window.setTimeout(() => {
        bleachOverlay.style.transition = 'opacity 1500ms ease-in-out';
        bleachOverlay.style.opacity = '1';
      }, 2200));
    }

    timers.push(window.setTimeout(() => {
      scene.style.transition = 'transform 480ms ease, opacity 480ms ease';
      scene.setAttribute('transform', 'translate(0,-36)');
      scene.style.opacity = '0';
      svg.style.opacity = '0';
    }, finalFill !== midFill ? 4200 : 3200));

    const remove = () => {
      timers.forEach(id => window.clearTimeout(id));
      svg.remove();
      if (this._activeTestCleanup === remove) this._activeTestCleanup = null;
    };

    timers.push(window.setTimeout(remove, finalFill !== midFill ? 4800 : 3800));
    return remove;
  }

  _resolveTestAnchor(target) {
    switch (target) {
      case 'anode':
        return this._anodePos ? { x: this._anodePos.x, y: this._anodePos.y - 18 } : null;
      case 'cathode':
        return this._cathodePos ? { x: this._cathodePos.x, y: this._cathodePos.y - 18 } : null;
      case 'solution':
        return this._beakerBounds
          ? { x: this._beakerBounds.x + this._beakerBounds.w * 0.5, y: this._beakerBounds.y + 26 }
          : null;
      default:
        return null;
    }
  }

  _loop() {
    if (!this._running) return;
    this._frameId = requestAnimationFrame((ts) => {
      this._update(ts);
      this._draw();
      this._loop();
    });
  }

  _update(ts) {
    if (this._lastTs === null) {
      this._lastTs = ts;
      return;
    }

    const dtMs = Math.min(MAX_DT_MS, Math.max(0, ts - this._lastTs));
    const dtS  = dtMs / 1000;
    this._lastTs = ts;
    if (dtS <= 0) return;

    this._advanceReaction(dtS);
    this._flowPhasePx += dtS * (72 + (this._state.currentA ?? BASE_CURRENT_A) * 420);

    this._gasAccumulator += dtS;
    this._liqAccumulator += dtS;

    const gasPeriod = this._getGasSpawnPeriod();
    while (this._gasAccumulator >= gasPeriod) {
      this._gasAccumulator -= gasPeriod;
      this._spawnFor(this._cathodeProduct, this._cathodePos, gasPeriod);
      this._spawnFor(this._anodeProduct, this._anodePos, gasPeriod);
    }

    const aqueousPeriod = 0.24;
    while (this._liqAccumulator >= aqueousPeriod) {
      this._liqAccumulator -= aqueousPeriod;
      this._spawnFor(this._cathodeProduct, this._cathodePos, aqueousPeriod);
      this._spawnFor(this._anodeProduct, this._anodePos, aqueousPeriod);
    }

    // Age existing particles
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      p.x    += p.vx * dtMs * 0.06;
      p.y    += p.vy * dtMs * 0.06;
      p.life -= dtMs;
      if (p.life <= 0) this._particles.splice(i, 1);
    }

    if ((this._state.elapsedS * 1000) - this._lastDebugEmitMs >= 200) {
      this._lastDebugEmitMs = this._state.elapsedS * 1000;
      this._emitDebugSnapshot('running');
    }
  }

  _spawnFor(product, pos, stepS) {
    if (!product || !pos) return;

    switch (product.state) {
      case 'gas':
        // Bubbles rise from the tip of the electrode rod
        for (let i = 0; i < 2; i++) {
          this._particles.push({
            x:      pos.x + (Math.random() - 0.5) * 14,
            y:      pos.y - 4,
            vx:     (Math.random() - 0.5) * 0.7,
            vy:     -(0.85 + Math.random() * 0.8 + this._state.currentA * 4.5),
            r:      2.5 + Math.random() * 2.5,
            colour: product.colour,
            alpha:  0.65,
            type:   'bubble',
            life:   900 + Math.random() * 450,
          });
        }
        break;

      case 'solid': {
        const deposit = this._getDepositGeometry();
        if (!deposit || deposit.progress <= 0.03) break;

        const spawnCount = deposit.progress >= 0.35 ? 2 : 1;
        for (let i = 0; i < spawnCount; i++) {
          const laneRand = Math.random();
          const lane = laneRand < 0.38 ? 'left' : laneRand > 0.72 ? 'right' : 'center';
          const baseX = lane === 'left'
            ? deposit.leftX + deposit.thickness * 0.55
            : lane === 'right'
              ? deposit.rightX + deposit.thickness * 0.45
              : deposit.leftX + deposit.thickness + deposit.rodWidth * (0.25 + Math.random() * 0.5);
          this._particles.push({
            x:      baseX + (Math.random() - 0.5) * 2,
            y:      pos.y - Math.random() * Math.max(10, deposit.height),
            vx:     (Math.random() - 0.5) * 0.06,
            vy:     0.015 + Math.random() * 0.04,
            r:      1.4 + Math.random() * 1.8,
            colour: product.colour,
            alpha:  0.82,
            type:   'dot',
            life:   2000 + Math.random() * 900,
          });
        }
        break;
      }

      case 'liquid': {
        // Droplets form on the electrode and float up or sink down depending on density
        const deposit = this._getDepositGeometry();
        if (!deposit || deposit.progress <= 0.08 || !this._beakerBounds) break;
        const floats = product.floats ?? false;
        const bb = this._beakerBounds;
        const layerH = bb.h * 0.20 * deposit.progress;
        if (layerH <= 0.35) break;

        const layerY = floats ? bb.yMin : bb.yMax - layerH;
        const spawnY = floats
          ? layerY + layerH * (0.35 + Math.random() * 0.45)
          : layerY + layerH * (0.55 + Math.random() * 0.40);

        this._particles.push({
          x:      bb.x + Math.random() * bb.w,
          y:      spawnY,
          vx:     (Math.random() - 0.5) * 0.07,
          vy:     floats ? -(0.12 + Math.random() * 0.26) : (0.10 + Math.random() * 0.24),
          r:      1.2 + Math.random() * 1.6,
          colour: product.colour,
          alpha:  0.42,
          type:   'dot',
          life:   520 + Math.random() * 260,
        });
        break;
      }

      case 'aqueous':
        if (stepS < 0.2) break;
        if (product.electrode === 'anode' && this._result?.isReactiveAnode) {
          const erosion = this._getAnodeDissolutionGeometry();
          const edgeX = erosion
            ? (Math.random() < 0.5
              ? erosion.leftX + erosion.depth * (0.55 + Math.random() * 0.35)
              : erosion.rightX - erosion.depth * (0.55 + Math.random() * 0.35))
            : pos.x + (Math.random() - 0.5) * 16;
          this._particles.push({
            x:      edgeX,
            y:      pos.y - Math.random() * 18,
            vx:     (Math.random() - 0.5) * 0.12,
            vy:     0.03 + Math.random() * 0.06,
            r:      2.8 + Math.random() * 2.8,
            colour: mixColours(this._anodeElectrode?.colour ?? '#d8d8d8', this._electrolyte?.colour ?? '#58acd1', 0.42),
            alpha:  0.22,
            type:   'dot',
            life:   1800 + Math.random() * 600,
          });
          break;
        }

        // Soft colour blobs drift slowly through the electrolyte region
        this._particles.push({
          x:      pos.x + (Math.random() - 0.5) * 50,
          y:      pos.y + Math.random() * 40,
          vx:     (Math.random() - 0.5) * 0.18,
          vy:     0.05 + Math.random() * 0.08,
          r:      7 + Math.random() * 7,
          colour: product.colour,
          alpha:  0.25,
          type:   'dot',
          life:   2200 + Math.random() * 900,
        });
        break;

      default:
        break;
    }
  }

  _draw() {
    const ctx = this._ctx;
    const dpr = this._dpr || 1;
    ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    if (this._flowHintsEnabled) {
      this._drawWireElectronFlow(ctx);
      this._drawElectronLegend(ctx);
    }

    this._drawSolutionTint(ctx);

    if (this._flowHintsEnabled) {
      this._drawIonFlowHints(ctx);
    }

    const erosion = this._getAnodeDissolutionGeometry();
    if (erosion) {
      this._withLiquidClip(ctx, () => this._drawAnodeDissolution(ctx, erosion));
    }

    const deposit = this._getDepositGeometry();
    if (deposit) {
      this._withLiquidClip(ctx, () => this._drawDeposit(ctx, deposit));
    }

    for (const p of this._particles) {
      // Fade out in the last 450 ms
      const fade = Math.min(1, p.life / 450);
      ctx.globalAlpha = p.alpha * fade;

      if (p.type === 'bubble') {
        // Outline only (hollow bubble look)
        ctx.strokeStyle = p.colour;
        ctx.lineWidth   = 1.2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.stroke();

        // Tiny specular highlight
        ctx.globalAlpha = p.alpha * fade * 0.28;
        ctx.fillStyle   = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.arc(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.32, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = p.colour;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _drawWireElectronFlow(ctx) {
    const flowWires = this._getFlowWireEntries();
    if (flowWires.length === 0) return;

    const spacing = 30;
    let wireIndex = 0;

    for (const wire of flowWires) {
      const d = wire.pathEl.getAttribute('d') ?? '';
      const points = parsePathToPoints(d);
      if (points.length < 2) {
        wireIndex += 1;
        continue;
      }

      const totalLen = polylineLength(points);
      if (totalLen < 10) {
        wireIndex += 1;
        continue;
      }

      const count = Math.max(2, Math.floor(totalLen / spacing));
      const direction = wire.direction ?? 1;
      for (let i = 0; i < count; i++) {
        const phaseDist = positiveMod(this._flowPhasePx + wireIndex * 11 + i * spacing, totalLen);
        const dist = direction >= 0 ? phaseDist : positiveMod(totalLen - phaseDist, totalLen);
        const pt = pointOnPolyline(points, dist);
        if (!pt) continue;

        ctx.globalAlpha = 0.78;
        ctx.fillStyle = 'rgba(96, 224, 255, 0.95)';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 1.9, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 0.22;
        ctx.fillStyle = 'rgba(96, 224, 255, 1)';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4.1, 0, Math.PI * 2);
        ctx.fill();
      }

      wireIndex += 1;
    }

    ctx.globalAlpha = 1;
  }

  _drawIonFlowHints(ctx) {
    if (!this._beakerBounds || !this._anodePos || !this._cathodePos || !this._electrolyte) return;

    const bounds = this._beakerBounds;
    const cationTarget = {
      x: clamp(this._cathodePos.x, bounds.x + 8, bounds.x + bounds.w - 8),
      y: clamp(this._cathodePos.y + 8, bounds.y + 40, bounds.y + bounds.h - 14),
    };
    const anionTarget = {
      x: clamp(this._anodePos.x, bounds.x + 8, bounds.x + bounds.w - 8),
      y: clamp(this._anodePos.y + 8, bounds.y + 40, bounds.y + bounds.h - 14),
    };

    ctx.save();
    ctx.beginPath();
    ctx.rect(bounds.x, bounds.y, bounds.w, bounds.h);
    ctx.clip();

    const phase = this._flowPhasePx;
    this._drawIonGroup(ctx, {
      count: 10,
      phase,
      startY: bounds.y + 34,
      laneWidth: bounds.w - 18,
      laneX: bounds.x + 9,
      target: cationTarget,
      colour: 'rgba(124, 203, 255, 0.94)',
      trail: 'rgba(124, 203, 255, 0.28)',
      directionBias: 1,
      chargeLabel: '+',
    });
    this._drawIonGroup(ctx, {
      count: 10,
      phase: phase + 35,
      startY: bounds.y + 38,
      laneWidth: bounds.w - 18,
      laneX: bounds.x + 9,
      target: anionTarget,
      colour: 'rgba(255, 186, 96, 0.92)',
      trail: 'rgba(255, 186, 96, 0.25)',
      directionBias: -1,
      chargeLabel: '-',
    });

    ctx.restore();

    this._drawElectrodeIonLists(ctx, bounds, anionTarget, cationTarget);
  }

  _drawIonGroup(ctx, opts) {
    const {
      count,
      phase,
      startY,
      laneWidth,
      laneX,
      target,
      colour,
      trail,
      directionBias,
      chargeLabel,
    } = opts;

    for (let i = 0; i < count; i++) {
      const seed = i * 17.3;
      const laneT = (i + 0.5) / count;
      const sx = laneX + laneWidth * laneT;
      const sy = startY + (i % 3) * 7;
      const progress = positiveMod((phase * 0.008) + i * 0.11, 1);
      const wobble = Math.sin(progress * Math.PI * 2 + seed) * (5 + (1 - progress) * 4) * directionBias;

      const x = sx + (target.x - sx) * progress + wobble;
      const y = sy + (target.y - sy) * progress + Math.cos(progress * Math.PI * 2 + seed * 0.6) * 2.2;

      const tx = sx + (target.x - sx) * Math.max(0, progress - 0.08) + wobble * 0.5;
      const ty = sy + (target.y - sy) * Math.max(0, progress - 0.08);

      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = trail;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(x, y);
      ctx.stroke();

      ctx.globalAlpha = 0.88;
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(x, y, 1.8, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.2;
      ctx.beginPath();
      ctx.arc(x, y, 3.8, 0, Math.PI * 2);
      ctx.fill();

      if (i % 3 === 0) {
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = 'rgba(224, 242, 255, 0.92)';
        ctx.font = '10px DM Mono, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(chargeLabel, x, y - 0.2);
      }
    }

    ctx.globalAlpha = 1;
  }

  _drawElectrodeIonLists(ctx, bounds, anodeTarget, cathodeTarget) {
    const lists = this._buildElectrodeIonLists();

    this._drawIonListCard(ctx, {
      bounds,
      target: anodeTarget,
      side: 'left',
      title: 'Anode (- ions in)',
      ions: lists.anode,
      dotColour: 'rgba(255, 186, 96, 0.95)',
      textColour: 'rgba(250, 232, 205, 0.96)',
    });

    this._drawIonListCard(ctx, {
      bounds,
      target: cathodeTarget,
      side: 'right',
      title: 'Cathode (+ ions in)',
      ions: lists.cathode,
      dotColour: 'rgba(124, 203, 255, 0.95)',
      textColour: 'rgba(220, 242, 255, 0.96)',
    });
  }

  _drawIonListCard(ctx, opts) {
    const {
      bounds,
      target,
      side,
      title,
      ions,
      dotColour,
      textColour,
    } = opts;

    const ionText = ions.join(', ');
    const maxChars = Math.max(title.length, ionText.length);
    const cardW = clamp(maxChars * 6.3 + 24, 156, 260);
    const cardH = 40;

    const logicalW = this._canvas.width / (this._dpr || 1);
    const preferredX = side === 'left'
      ? bounds.x - cardW - 16
      : bounds.x + bounds.w + 16;
    const x = clamp(preferredX, 6, logicalW - cardW - 6);
    const preferredY = target.y - cardH * 0.5;
    const y = clamp(preferredY, bounds.y + 30, bounds.y + bounds.h - cardH - 6);

    ctx.save();
    ctx.globalAlpha = 0.76;
    ctx.fillStyle = 'rgba(8, 14, 24, 0.74)';
    ctx.fillRect(x, y, cardW, cardH);

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = dotColour;
    ctx.beginPath();
    ctx.arc(x + 9, y + 11, 2.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = textColour;
    ctx.font = '10px DM Mono, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, x + 16, y + 11);

    ctx.globalAlpha = 0.95;
    ctx.fillStyle = 'rgba(222, 230, 246, 0.95)';
    ctx.font = '11px DM Mono, monospace';
    ctx.fillText(ionText, x + 8, y + 28);
    ctx.restore();
  }

  _drawElectronLegend(ctx) {
    if (!this._flowHintsEnabled) return;

    const cardW = 186;
    const cardH = 28;
    const logicalW = this._canvas.width / (this._dpr || 1);
    const x = clamp(logicalW * 0.5 - cardW / 2, 12, logicalW - cardW - 12);
    const y = 58;

    ctx.save();
    ctx.globalAlpha = 0.78;
    ctx.fillStyle = 'rgba(8, 14, 24, 0.78)';
    ctx.fillRect(x, y, cardW, cardH);

    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = 'rgba(96, 224, 255, 0.45)';
    ctx.strokeRect(x + 0.5, y + 0.5, cardW - 1, cardH - 1);

    const dotY = y + cardH / 2;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(96, 224, 255, 0.96)';
    ctx.beginPath();
    ctx.arc(x + 16, dotY, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.24;
    ctx.beginPath();
    ctx.arc(x + 16, dotY, 4.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(222, 236, 255, 0.96)';
    ctx.font = '10px DM Mono, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('e- Electron flow in wires', x + 28, dotY);
    ctx.restore();
  }

  _buildElectrodeIonLists() {
    const cationSet = new Set();
    const anionSet = new Set();

    for (const c of this._electrolyte?.cations ?? []) cationSet.add(c.ionId);
    for (const a of this._electrolyte?.anions ?? []) anionSet.add(a.ionId);

    if (!this._electrolyte?.isMolten) {
      // Water ions are only implicit in aqueous electrolytes.
      cationSet.add('H+');
      anionSet.add('OH-');
    }

    return {
      anode: [...anionSet],
      cathode: [...cationSet],
    };
  }

  _getFlowWireEntries() {
    if (!this._circuit?.wires) return [];

    const entries = [];
    for (const wire of this._circuit.wires.values()) {
      const pathEl = wire.svgPath;
      if (!pathEl || !pathEl.classList.contains('wire-live')) continue;
      const direction = this._resolveElectronDirection(wire);
      entries.push({ pathEl, direction });
    }
    return entries;
  }

  _resolveElectronDirection(wire) {
    const fromKey = `${wire.from.nodeId}:${wire.from.terminalId}`;
    const toKey = `${wire.to.nodeId}:${wire.to.terminalId}`;

    const anodeTop = `${this._anodeNodeId}:rod_top`;
    const cathodeTop = `${this._cathodeNodeId}:rod_top`;
    const batPos = 'battery:bat_pos';
    const batNeg = 'battery:bat_neg';

    if (this._batteryEnabled) {
      // External electron path in electrolysis mode:
      // anode -> battery(+), then battery(-) -> cathode.
      if (matchesPair(fromKey, toKey, anodeTop, batPos)) {
        return fromKey === anodeTop ? 1 : -1;
      }
      if (matchesPair(fromKey, toKey, batNeg, cathodeTop)) {
        return fromKey === batNeg ? 1 : -1;
      }
      return 1;
    }

    // Galvanic fallback: show electrons moving from anode to cathode.
    if (matchesPair(fromKey, toKey, anodeTop, cathodeTop)) {
      return fromKey === anodeTop ? 1 : -1;
    }
    return 1;
  }

  _buildState(result, electrolyte, anodeElectrode, cathodeElectrode) {
    const cathodeN = PRODUCT_EQUATIONS[result?.cathodeProduct?.id]?.n ?? 2;
    const anodeN   = PRODUCT_EQUATIONS[result?.anodeProduct?.id]?.n ?? 2;
    const currentA = this._estimateCurrent(result, electrolyte, anodeElectrode, cathodeElectrode);

    return {
      elapsedS: 0,
      currentA,
      cathodeElectronCount: cathodeN,
      anodeElectronCount: anodeN,
      cathodeInitialConc: this._getIonConcentration(electrolyte, result?.cathodeWinnerIonId),
      cathodeConc: this._getIonConcentration(electrolyte, result?.cathodeWinnerIonId),
      depositedMoles: 0,
      anodeInitialConc: this._getIonConcentration(electrolyte, result?.anodeWinnerIonId),
      anodeConc: this._getIonConcentration(electrolyte, result?.anodeWinnerIonId),
      anodeDissolvedMoles: 0,
      dissolvedAqueousConc: 0,
      gasMoles: 0,
    };
  }

  _estimateCurrent(result, electrolyte, anodeElectrode, cathodeElectrode) {
    const concentration = Math.max(0.1, electrolyte?.concentration ?? 0.5);
    const conductivity  = clamp(0.45 + concentration * 0.28, 0.45, 1.55);
    const reactiveBoost = (!anodeElectrode?.isInert || !cathodeElectrode?.isInert) ? 1.08 : 0.94;
    const gasPenalty    = (result?.anodeProduct?.state === 'gas' || result?.cathodeProduct?.state === 'gas') ? 0.92 : 1.0;
    return clamp(BASE_CURRENT_A * conductivity * reactiveBoost * gasPenalty, 0.035, MAX_CURRENT_A);
  }

  _advanceReaction(dtS) {
    if (!this._state) return;

    const electronMoles = (this._state.currentA * dtS) / FARADAY_CONSTANT;
    this._state.elapsedS += dtS;

    if ((this._cathodeProduct?.state === 'solid' || this._cathodeProduct?.state === 'liquid') && this._result?.cathodeWinnerIonId) {
      const depositedMoles = electronMoles / this._state.cathodeElectronCount;
      this._state.depositedMoles += depositedMoles;
      if (this._state.cathodeConc > 0) {
        this._state.cathodeConc = Math.max(
          0,
          this._state.cathodeConc - (depositedMoles / NOTIONAL_VOLUME_DM3),
        );
      }
    }

    if (this._anodeProduct?.state === 'aqueous') {
      const producedMoles = electronMoles / this._state.anodeElectronCount;
      this._state.dissolvedAqueousConc += producedMoles / NOTIONAL_VOLUME_DM3;
      if (this._result?.isReactiveAnode && this._result?.anodeWinnerIonId) {
        this._state.anodeDissolvedMoles += producedMoles;
        this._state.anodeConc += producedMoles / NOTIONAL_VOLUME_DM3;
      }
    }

    if (this._anodeProduct?.state === 'gas' || this._cathodeProduct?.state === 'gas') {
      this._state.gasMoles += electronMoles;
    }
  }

  _getIonConcentration(electrolyte, ionId) {
    if (!electrolyte || !ionId) return 0;
    if (ionId === 'H+') return Math.pow(10, -electrolyte.pH);
    if (ionId === 'OH-') return Math.pow(10, -(14 - electrolyte.pH));

    for (const entry of electrolyte.cations ?? []) {
      if (entry.ionId === ionId) return entry.stoichFactor * electrolyte.concentration;
    }
    for (const entry of electrolyte.anions ?? []) {
      if (entry.ionId === ionId) return entry.stoichFactor * electrolyte.concentration;
    }
    return 0;
  }

  _getGasSpawnPeriod() {
    const current = this._state?.currentA ?? BASE_CURRENT_A;
    return clamp(0.18 - current * 0.6, 0.08, 0.18);
  }

  _getImmersedRodSegment(bottomPos) {
    if (!bottomPos || !this._beakerBounds) return null;

    const rodTopY = bottomPos.y - ROD_LENGTH;
    const rodVisualTopY = rodTopY + ROD_VISUAL_TOP;
    const rodVisualBottomY = rodTopY + ROD_VISUAL_BOTTOM;
    const rodXMin = bottomPos.x - ELECTRODE_HALF_W;
    const rodXMax = bottomPos.x + ELECTRODE_HALF_W;

    const xOverlap = Math.min(rodXMax, this._beakerBounds.xMax) - Math.max(rodXMin, this._beakerBounds.xMin);
    const yMin = Math.max(rodVisualTopY, this._beakerBounds.yMin);
    const yMax = Math.min(rodVisualBottomY, this._beakerBounds.yMax);

    if (xOverlap <= 0 || yMax <= yMin) return null;

    return {
      yMin,
      yMax,
      h: yMax - yMin,
      rodXMin,
      rodXMax,
    };
  }

  _withLiquidClip(ctx, drawFn) {
    if (!this._beakerBounds) {
      drawFn();
      return;
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(this._beakerBounds.x, this._beakerBounds.y, this._beakerBounds.w, this._beakerBounds.h);
    ctx.clip();
    drawFn();
    ctx.restore();
  }

  _getDepositGeometry() {
    if ((this._cathodeProduct?.state !== 'solid' && this._cathodeProduct?.state !== 'liquid') || !this._cathodePos || !this._state) return null;
    const immersed = this._getImmersedRodSegment(this._cathodePos);
    if (!immersed) return null;

    const progress  = clamp(this._state.depositedMoles / VISIBLE_DEPOSIT_MOL, 0, 1);
    if (progress <= 0) return null;

    const displayProgress = clamp(0.12 + Math.pow(progress, 0.78) * 0.88, 0, 1);

    const coverage = clamp(0.14 + Math.pow(displayProgress, 0.74) * 0.86, 0, 1);
    const height    = Math.max(9, immersed.h * coverage);
    const thickness = Math.max(1.8, DEPOSIT_MAX_THICKNESS * Math.pow(displayProgress, 0.82));
    const leftX     = immersed.rodXMin - thickness;
    const rightX    = immersed.rodXMax;

    return {
      progress,
      displayProgress,
      height,
      thickness,
      leftX,
      rightX,
      topY: immersed.yMax - height,
      bottomY: immersed.yMax,
      bottomThickness: Math.max(1.4, thickness),
      coverage,
      rodWidth: immersed.rodXMax - immersed.rodXMin,
    };
  }

  _drawDeposit(ctx, deposit) {
    if (this._cathodeProduct?.state === 'liquid') {
      this._drawLiquidPool(ctx, deposit);
      return;
    }

    const sleeveX = deposit.leftX;
    const sleeveW = deposit.rodWidth + deposit.thickness * 2;

    ctx.save();
    ctx.fillStyle = this._cathodeProduct.colour;
    ctx.globalAlpha = 0.54 + deposit.displayProgress * 0.18;

    // Continuous coating sleeve around the immersed rod section.
    ctx.fillRect(sleeveX, deposit.topY, sleeveW, deposit.height);

    ctx.fillRect(deposit.leftX, deposit.topY, deposit.thickness, deposit.height);
    ctx.fillRect(deposit.rightX, deposit.topY, deposit.thickness, deposit.height);

    ctx.fillRect(
      deposit.leftX,
      deposit.bottomY - deposit.bottomThickness * 0.72,
      deposit.rodWidth + deposit.thickness * 2,
      deposit.bottomThickness,
    );

    ctx.globalAlpha = 0.22 + deposit.displayProgress * 0.18;
    ctx.fillRect(deposit.leftX - 0.6, deposit.topY, 0.9, deposit.height);
    ctx.fillRect(deposit.rightX + deposit.thickness - 0.3, deposit.topY, 0.9, deposit.height);

    // Slightly darker side ridges make growth feel thicker at the edges.
    ctx.globalAlpha = 0.15 + deposit.displayProgress * 0.14;
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(deposit.leftX + deposit.thickness * 0.08, deposit.topY, Math.max(1.1, deposit.thickness * 0.28), deposit.height);
    ctx.fillRect(deposit.rightX + deposit.thickness * 0.64, deposit.topY, Math.max(1.1, deposit.thickness * 0.28), deposit.height);

    ctx.globalAlpha = 0.16 + deposit.displayProgress * 0.12;
    ctx.fillStyle = 'rgba(255, 225, 200, 0.9)';
    ctx.fillRect(deposit.leftX + deposit.thickness * 0.2, deposit.topY + 2, 0.8, Math.max(8, deposit.height - 4));
    ctx.fillRect(deposit.rightX + deposit.thickness * 0.55, deposit.topY + 2, 0.8, Math.max(8, deposit.height - 4));

    // Fine stipple texture for a less "perfect rectangle" look.
    ctx.globalAlpha = 0.10 + deposit.displayProgress * 0.12;
    ctx.fillStyle = 'rgba(255, 205, 150, 0.95)';
    const dotCount = Math.floor(14 + deposit.displayProgress * 20);
    for (let i = 0; i < dotCount; i++) {
      const t = i / Math.max(1, dotCount - 1);
      const x = sleeveX + 1 + t * Math.max(2, sleeveW - 2) + (Math.random() - 0.5) * 0.9;
      const y = deposit.topY + 1 + Math.random() * Math.max(2, deposit.height - 2);
      const r = 0.45 + Math.random() * 0.7;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  _drawLiquidPool(ctx, deposit) {
    if (!this._beakerBounds) return;
    const bb     = this._beakerBounds;
    const colour = this._cathodeProduct.colour;
    const prog   = deposit.progress;
    const floats = this._cathodeProduct.floats ?? false;

    // Avoid an immediate visible slab at t=0; start only after a small accumulation.
    if (prog < 0.05) return;

    // Layer grows to max 20% of beaker height at full progress
    const layerH = bb.h * 0.20 * prog;
    if (layerH <= 0.5) return;
    const layerY = floats ? bb.yMin : bb.yMax - layerH;
    const layerW = bb.w;
    const layerX = bb.x;

    ctx.save();

    // Base fill
    ctx.fillStyle = colour;
    ctx.globalAlpha = 0.35 + prog * 0.28;
    ctx.fillRect(layerX, layerY, layerW, layerH);

    // Sheen gradient — lighter at the exposed interface edge
    const edgeY  = floats ? layerY + layerH : layerY;
    const innerY = floats ? layerY          : layerY + layerH;
    const grad = ctx.createLinearGradient(0, edgeY, 0, innerY);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.26)');
    grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.07)');
    grad.addColorStop(1,   'rgba(0, 0, 0, 0.10)');
    ctx.fillStyle = grad;
    ctx.globalAlpha = 0.88;
    ctx.fillRect(layerX, layerY, layerW, layerH);

    // Interface line where liquid metal meets the melt
    ctx.strokeStyle = 'rgba(200, 218, 236, 0.75)';
    ctx.lineWidth   = 1.2;
    ctx.globalAlpha = 0.30 + prog * 0.35;
    ctx.beginPath();
    ctx.moveTo(layerX,           edgeY);
    ctx.lineTo(layerX + layerW,  edgeY);
    ctx.stroke();

    // Shimmer dots scattered along the interface
    ctx.fillStyle = 'rgba(240, 250, 255, 0.95)';
    ctx.globalAlpha = 0.15 + prog * 0.15;
    const shimmerCount = Math.floor(4 + prog * 10);
    for (let i = 0; i < shimmerCount; i++) {
      const sx = layerX + Math.random() * layerW;
      const sy = edgeY  + (floats ? -1 : 1) * (1 + Math.random() * Math.min(4, layerH * 0.35));
      ctx.beginPath();
      ctx.arc(sx, sy, 0.7 + Math.random() * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  _getAnodeDissolutionGeometry() {
    if (!this._result?.isReactiveAnode || !this._anodePos || !this._state) return null;
    const immersed = this._getImmersedRodSegment(this._anodePos);
    if (!immersed) return null;

    const progress = clamp(this._state.anodeDissolvedMoles / VISIBLE_DISSOLVE_MOL, 0, 1);
    if (progress <= 0) return null;

    const displayProgress = clamp(0.08 + Math.pow(progress, 0.84) * 0.92, 0, 1);
    const coverage = clamp(0.18 + Math.pow(displayProgress, 0.72) * 0.82, 0, 1);
    const height = Math.max(8, immersed.h * coverage);
    const depth = Math.max(1.2, EROSION_MAX_DEPTH * Math.pow(displayProgress, 0.78));

    return {
      progress,
      displayProgress,
      coverage,
      height,
      depth,
      topY: immersed.yMax - height,
      bottomY: immersed.yMax,
      leftX: immersed.rodXMin,
      rightX: immersed.rodXMax,
      rodWidth: immersed.rodXMax - immersed.rodXMin,
    };
  }

  _drawAnodeDissolution(ctx, erosion) {
    const solutionColour = normaliseColour(this._electrolyte?.colour ?? '#58acd1');
    const wornEdgeColour = mixColours(
      this._anodeElectrode?.colour ?? '#bdbdbd',
      this._electrolyte?.colour ?? '#58acd1',
      0.72,
    );

    ctx.save();

    // Base veil over the immersed section to suggest surface thinning.
    ctx.fillStyle = solutionColour;
    ctx.globalAlpha = 0.10 + erosion.displayProgress * 0.1;
    ctx.fillRect(erosion.leftX, erosion.topY, erosion.rodWidth, erosion.height);

    ctx.fillStyle = solutionColour;
    ctx.globalAlpha = 0.36 + erosion.displayProgress * 0.18;

    ctx.fillRect(erosion.leftX, erosion.topY, erosion.depth, erosion.height);
    ctx.fillRect(erosion.rightX - erosion.depth, erosion.topY, erosion.depth, erosion.height);
    ctx.fillRect(
      erosion.leftX + erosion.depth * 0.2,
      erosion.bottomY - erosion.depth * 0.85,
      erosion.rodWidth - erosion.depth * 0.4,
      erosion.depth,
    );

    // Darker edge wear bands make mass loss visually obvious against pale rods.
    ctx.globalAlpha = 0.24 + erosion.displayProgress * 0.18;
    ctx.fillStyle = wornEdgeColour;
    const leftWearW = Math.max(1, erosion.depth * 0.72);
    const rightWearW = Math.max(1, erosion.depth * 0.72);
    ctx.fillRect(erosion.leftX + 0.3, erosion.topY, leftWearW, erosion.height);
    ctx.fillRect(erosion.rightX - rightWearW - 0.3, erosion.topY, rightWearW, erosion.height);

    // Pitting texture near both edges where reactive anodes dissolve fastest.
    ctx.globalAlpha = 0.18 + erosion.displayProgress * 0.1;
    ctx.fillStyle = solutionColour;
    const pitCount = Math.floor(10 + erosion.displayProgress * 18);
    for (let i = 0; i < pitCount; i++) {
      const nearLeft = Math.random() < 0.5;
      const x = nearLeft
        ? erosion.leftX + 0.5 + Math.random() * Math.max(1.2, erosion.depth * 0.9)
        : erosion.rightX - 0.5 - Math.random() * Math.max(1.2, erosion.depth * 0.9);
      const y = erosion.topY + 1 + Math.random() * Math.max(2, erosion.height - 2);
      const r = 0.5 + Math.random() * (0.7 + erosion.displayProgress * 1.1);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 0.14 + erosion.displayProgress * 0.1;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(erosion.leftX + erosion.depth * 0.4, erosion.topY + 4, 0.7, Math.max(10, erosion.height - 8));
    ctx.fillRect(erosion.rightX - erosion.depth, erosion.topY + 6, 0.7, Math.max(8, erosion.height - 12));
    ctx.restore();
  }

  _drawSolutionTint(ctx) {
    if (!this._beakerBounds || !this._electrolyte) return;

    const bounds = this._beakerBounds;
    ctx.save();
    ctx.beginPath();
    ctx.rect(bounds.x, bounds.y, bounds.w, bounds.h);
    ctx.clip();

    const depletion = this._getCathodeDepletionFraction();
    if (depletion > 0.01) {
      ctx.globalAlpha = Math.min(0.58, depletion * this._getDepletionFadeStrength());
      ctx.fillStyle = 'rgba(245, 250, 255, 1)';
      ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
    }

    const tint = this._getAqueousTint();
    if (tint) {
      ctx.globalAlpha = tint.alpha;
      ctx.fillStyle = tint.colour;
      ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
    }

    ctx.restore();
  }

  _getCathodeDepletionFraction() {
    if (!this._state || this._state.cathodeInitialConc <= 0) return 0;
    return clamp(1 - (this._state.cathodeConc / this._state.cathodeInitialConc), 0, 1);
  }

  _getAqueousTint() {
    if (!this._anodeProduct || this._anodeProduct.state !== 'aqueous' || !this._state) return null;

    const progress = clamp(this._state.dissolvedAqueousConc / AQUEOUS_REFERENCE_CONC, 0, 1);
    if (progress <= 0.01) return null;

    return {
      colour: normaliseColour(this._anodeProduct.colour),
      alpha: Math.min(0.28, 0.08 + progress * 0.2),
    };
  }

  _getDepletionFadeStrength() {
    const winnerIonId = this._result?.cathodeWinnerIonId ?? '';
    if (winnerIonId === 'Cu2+') return 0.95;
    return 0.6;
  }

  _emitDebugSnapshot(status) {
    const snapshot = this._buildDebugSnapshot(status);
    if (!snapshot) return;
    this._pushDebugHistory(snapshot);
    window.__echemPhase1Debug = snapshot;
    this._debugListener?.(snapshot);
  }

  _emitIdleDebug() {
    const snapshot = {
      status: 'idle',
      health: 'idle',
      note: 'No active run',
      warnings: [],
      historyPoints: [],
    };
    window.__echemPhase1Debug = snapshot;
    this._debugListener?.(snapshot);
  }

  _buildDebugSnapshot(status) {
    if (status !== 'running' || !this._state) return null;

    const deposit = this._getDepositGeometry();
    const erosion = this._getAnodeDissolutionGeometry();
    const tint = this._getAqueousTint();
    const warnings = [];

    if (!Number.isFinite(this._state.currentA) || this._state.currentA <= 0) {
      warnings.push('Current is not positive.');
    }
    if (this._state.cathodeConc < -1e-9) {
      warnings.push('Cathode concentration dropped below zero.');
    }
    if (deposit && (deposit.progress < 0 || deposit.progress > 1.02)) {
      warnings.push('Deposit progress moved outside the expected range.');
    }
    if (erosion && (erosion.progress < 0 || erosion.progress > 1.02)) {
      warnings.push('Anode dissolution progress moved outside the expected range.');
    }

    const historyPoints = this._debugHistory.map(point => ({ ...point }));

    return {
      status: 'running',
      health: warnings.length === 0 ? 'good' : 'warn',
      note: warnings.length === 0 ? 'Time-step state looks stable.' : 'Check warnings below.',
      elapsedS: this._state.elapsedS,
      currentA: this._state.currentA,
      cathodeIonId: this._result?.cathodeWinnerIonId ?? null,
      cathodeConc: this._state.cathodeConc,
      cathodeInitialConc: this._state.cathodeInitialConc,
      cathodeDepletion: this._getCathodeDepletionFraction(),
      depositProgress: deposit?.progress ?? 0,
      depositedMoles: this._state.depositedMoles,
      anodeIonId: this._result?.anodeWinnerIonId ?? null,
      anodeConc: this._state.anodeConc,
      anodeInitialConc: this._state.anodeInitialConc,
      anodeDissolutionProgress: erosion?.progress ?? 0,
      anodeDissolvedMoles: this._state.anodeDissolvedMoles,
      aqueousTintProgress: tint ? clamp((tint.alpha - 0.08) / 0.2, 0, 1) : 0,
      particleCount: this._particles.length,
      anodeProductId: this._anodeProduct?.id ?? null,
      cathodeProductId: this._cathodeProduct?.id ?? null,
      historyPoints,
      warnings,
    };
  }

  _pushDebugHistory(snapshot) {
    if (snapshot.status !== 'running') return;

    this._debugHistory.push({
      elapsedS: snapshot.elapsedS,
      currentA: snapshot.currentA,
      depositProgress: snapshot.depositProgress,
      cathodeConc: snapshot.cathodeConc,
      cathodeDepletion: snapshot.cathodeDepletion,
      anodeConc: snapshot.anodeConc,
      anodeDissolutionProgress: snapshot.anodeDissolutionProgress,
      aqueousTintProgress: snapshot.aqueousTintProgress,
      particleCount: snapshot.particleCount,
      anodeProductId: snapshot.anodeProductId,
      cathodeProductId: snapshot.cathodeProductId,
    });

    if (this._debugHistory.length > DEBUG_HISTORY_LIMIT) {
      this._debugHistory.splice(0, this._debugHistory.length - DEBUG_HISTORY_LIMIT);
    }

    snapshot.historyPoints = this._debugHistory.map(point => ({ ...point }));
  }
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function normaliseBeakerBounds(bounds) {
  if (!bounds) return null;
  if (
    Number.isFinite(bounds.xMin) && Number.isFinite(bounds.xMax) &&
    Number.isFinite(bounds.yMin) && Number.isFinite(bounds.yMax)
  ) {
    return {
      x: bounds.xMin,
      y: bounds.yMin,
      w: bounds.xMax - bounds.xMin,
      h: bounds.yMax - bounds.yMin,
      xMin: bounds.xMin,
      xMax: bounds.xMax,
      yMin: bounds.yMin,
      yMax: bounds.yMax,
    };
  }
  return bounds;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function positiveMod(value, mod) {
  return ((value % mod) + mod) % mod;
}

function parsePathToPoints(d) {
  if (!d) return [];
  const nums = d.match(/-?\d*\.?\d+/g);
  if (!nums || nums.length < 4) return [];

  const points = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = Number.parseFloat(nums[i]);
    const y = Number.parseFloat(nums[i + 1]);
    if (Number.isFinite(x) && Number.isFinite(y)) points.push({ x, y });
  }
  return points;
}

function matchesPair(a, b, p, q) {
  return (a === p && b === q) || (a === q && b === p);
}

function polylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return total;
}

function pointOnPolyline(points, distance) {
  if (!points || points.length === 0) return null;
  if (points.length === 1) return points[0];

  let remain = Math.max(0, distance);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (segLen < 1e-6) continue;
    if (remain <= segLen) {
      const t = remain / segLen;
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
      };
    }
    remain -= segLen;
  }
  return points[points.length - 1];
}

function normaliseColour(colour) {
  const parsed = parseCssColour(colour);
  if (!parsed) return colour;
  return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, 1)`;
}

function mixColours(a, b, ratio) {
  const c1 = parseCssColour(a);
  const c2 = parseCssColour(b);
  if (!c1 || !c2) return a;
  const t = clamp(ratio, 0, 1);
  const mix = (v1, v2) => Math.round(v1 + (v2 - v1) * t);
  return `rgba(${mix(c1.r, c2.r)}, ${mix(c1.g, c2.g)}, ${mix(c1.b, c2.b)}, 1)`;
}

function parseCssColour(colour) {
  if (typeof colour !== 'string') return null;

  const hex = colour.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const value = hex[1];
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16),
      a: 1,
    };
  }

  const rgba = colour.trim().match(/^rgba?\(([^)]+)\)$/i);
  if (!rgba) return null;

  const parts = rgba[1].split(',').map(part => Number.parseFloat(part.trim()));
  if (parts.length < 3 || parts.some(Number.isNaN)) return null;

  return {
    r: clamp(Math.round(parts[0]), 0, 255),
    g: clamp(Math.round(parts[1]), 0, 255),
    b: clamp(Math.round(parts[2]), 0, 255),
    a: parts.length >= 4 ? clamp(parts[3], 0, 1) : 1,
  };
}
