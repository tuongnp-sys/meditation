/**
 * Simple virtual joystick for mobile — maps stick deflection to movement keys.
 */
export class TouchJoystick {
  /**
   * @param {HTMLElement} mountEl — contains .joystick-base and .joystick-stick
   * @param {{ onChange?: (dx: number, dy: number) => void }} options
   */
  constructor(mountEl, options = {}) {
    this.mount = mountEl;
    this.base = mountEl?.querySelector('.joystick-base');
    this.stick = mountEl?.querySelector('.joystick-stick');
    this.onChange = options.onChange ?? (() => {});
    this.pointerId = null;
    this.dx = 0;
    this.dy = 0;
    this.radius = 48;
    this.deadZone = 0.18;

    if (!this.base || !this.stick) return;

    this.mount.style.touchAction = 'none';
    this.base.style.touchAction = 'none';

    this.base.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.base.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.base.addEventListener('pointerup', (e) => this.onPointerUp(e));
    this.base.addEventListener('pointercancel', (e) => this.onPointerUp(e));
  }

  onPointerDown(e) {
    if (this.pointerId !== null) return;
    this.pointerId = e.pointerId;
    this.base.setPointerCapture(e.pointerId);
    this.updateFromEvent(e);
    e.preventDefault();
  }

  onPointerMove(e) {
    if (e.pointerId !== this.pointerId) return;
    this.updateFromEvent(e);
    e.preventDefault();
  }

  onPointerUp(e) {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.resetStick();
    e.preventDefault();
  }

  updateFromEvent(e) {
    const rect = this.base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxR = Math.min(rect.width, rect.height) / 2 - 8;
    this.radius = maxR;

    let ox = e.clientX - cx;
    let oy = e.clientY - cy;
    const dist = Math.hypot(ox, oy);
    if (dist > maxR && dist > 0) {
      ox = (ox / dist) * maxR;
      oy = (oy / dist) * maxR;
    }

    this.stick.style.transform = `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`;

    const nx = maxR > 0 ? ox / maxR : 0;
    const ny = maxR > 0 ? oy / maxR : 0;
    const len = Math.hypot(nx, ny);
    if (len < this.deadZone) {
      this.dx = 0;
      this.dy = 0;
    } else {
      this.dx = nx / len;
      this.dy = ny / len;
    }
    this.onChange(this.dx, this.dy);
  }

  resetStick() {
    this.stick.style.transform = 'translate(-50%, -50%)';
    this.dx = 0;
    this.dy = 0;
    this.onChange(0, 0);
  }

  release() {
    if (this.pointerId !== null && this.base.hasPointerCapture(this.pointerId)) {
      this.base.releasePointerCapture(this.pointerId);
    }
    this.pointerId = null;
    this.resetStick();
  }
}
