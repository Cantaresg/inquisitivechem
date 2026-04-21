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
const DEPOSIT_MAX_H          = 62;
const DEPOSIT_MAX_THICKNESS  = 7;
const EROSION_MAX_H          = 68;
const EROSION_MAX_DEPTH      = 5;
const AQUEOUS_REFERENCE_CONC = 0.18;
const MAX_DT_MS              = 50;
const ELECTRODE_HALF_W       = ROD_W / 2;
const DEBUG_HISTORY_LIMIT    = 180;

export class AnimationLayer {
  /**
   * @param {HTMLElement} circuitWrap — #circuit-wrap (parent of the SVG)
   */
  constructor(circuitWrap) {
    this._wrap = circuitWrap;

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
    this._state          = null;
    this._debugListener  = null;
    this._lastDebugEmitMs = 0;
    this._debugHistory   = [];

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
    if (this._frameId !== null) {
      cancelAnimationFrame(this._frameId);
      this._frameId = null;
    }
    this._lastTs = null;
  }

  _onResize() {
    this._canvas.width  = this._wrap.clientWidth;
    this._canvas.height = this._wrap.clientHeight;
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
          const edge = Math.random() < 0.5 ? 'left' : 'right';
          const baseX = edge === 'left'
            ? deposit.leftX + deposit.thickness * 0.55
            : deposit.rightX + deposit.thickness * 0.45;
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

      case 'aqueous':
        if (stepS < 0.2) break;
        if (product.electrode === 'anode' && this._result?.isReactiveAnode) {
          this._particles.push({
            x:      pos.x + (Math.random() - 0.5) * 16,
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
    ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

    this._drawSolutionTint(ctx);

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

    if (this._cathodeProduct?.state === 'solid' && this._result?.cathodeWinnerIonId) {
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
    if (this._cathodeProduct?.state !== 'solid' || !this._cathodePos || !this._state) return null;
    const immersed = this._getImmersedRodSegment(this._cathodePos);
    if (!immersed) return null;

    const progress  = clamp(this._state.depositedMoles / VISIBLE_DEPOSIT_MOL, 0, 1);
    if (progress <= 0) return null;

    const displayProgress = clamp(0.12 + Math.pow(progress, 0.78) * 0.88, 0, 1);

    const rawHeight = Math.max(9, DEPOSIT_MAX_H * displayProgress);
    const height    = Math.min(rawHeight, immersed.h);
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
      rodWidth: immersed.rodXMax - immersed.rodXMin,
    };
  }

  _drawDeposit(ctx, deposit) {
    ctx.save();
    ctx.fillStyle = this._cathodeProduct.colour;
    ctx.globalAlpha = 0.62 + deposit.displayProgress * 0.18;

    ctx.fillRect(deposit.leftX, deposit.topY, deposit.thickness, deposit.height);
    ctx.fillRect(deposit.rightX, deposit.topY, deposit.thickness, deposit.height);

    ctx.fillRect(
      deposit.leftX,
      deposit.bottomY - deposit.bottomThickness * 0.72,
      deposit.rodWidth + deposit.thickness * 2,
      deposit.bottomThickness,
    );

    ctx.globalAlpha = 0.20 + deposit.displayProgress * 0.16;
    ctx.fillRect(deposit.leftX - 0.6, deposit.topY, 0.9, deposit.height);
    ctx.fillRect(deposit.rightX + deposit.thickness - 0.3, deposit.topY, 0.9, deposit.height);

    ctx.globalAlpha = 0.16 + deposit.displayProgress * 0.12;
    ctx.fillStyle = 'rgba(255, 225, 200, 0.9)';
    ctx.fillRect(deposit.leftX + deposit.thickness * 0.2, deposit.topY + 2, 0.8, Math.max(8, deposit.height - 4));
    ctx.fillRect(deposit.rightX + deposit.thickness * 0.55, deposit.topY + 2, 0.8, Math.max(8, deposit.height - 4));
    ctx.restore();
  }

  _getAnodeDissolutionGeometry() {
    if (!this._result?.isReactiveAnode || !this._anodePos || !this._state) return null;
    const immersed = this._getImmersedRodSegment(this._anodePos);
    if (!immersed) return null;

    const progress = clamp(this._state.anodeDissolvedMoles / VISIBLE_DISSOLVE_MOL, 0, 1);
    if (progress <= 0) return null;

    const displayProgress = clamp(0.08 + Math.pow(progress, 0.84) * 0.92, 0, 1);
    const height = Math.min(Math.max(8, EROSION_MAX_H * displayProgress), immersed.h);
    const depth = Math.max(1.2, EROSION_MAX_DEPTH * Math.pow(displayProgress, 0.78));

    return {
      progress,
      displayProgress,
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

    ctx.save();
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
