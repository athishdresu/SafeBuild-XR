import {
  createSystem,
  PanelUI,
  PanelDocument,
  UIKitDocument,
  UIKit,
  MeshStandardMaterial,
  Color,
  eq,
} from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import { LEDLight, OutputLED } from '../components/circuit.js';
import type { ApiResult } from './submit-system.js';

const GREEN = new Color(0, 1, 0.2);
const RED = new Color(1, 0.05, 0.05);
const OFF = new Color(0, 0, 0);

export class CircuitResponseSystem extends createSystem({
  led: { required: [LEDLight] },
  outLed: { required: [OutputLED] },
  panel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, 'config', './ui/circuit.json')],
  },
}) {
  private flashTimer = 0;
  private flashOn = false;
  private doorObject: any = null;
  private doorTargetAngle = 0;
  private doorCurrentAngle = 0;

  init() {
    const circuitResult = this.globals.circuitResult as Signal<ApiResult | null>;
    const currentPin = this.globals.currentPin as Signal<string>;

    this.cleanupFuncs.push(
      currentPin.subscribe((pin) => {
        this.updatePanelPin(pin);
      }),
    );

    this.cleanupFuncs.push(
      circuitResult.subscribe((result) => {
        if (!result) return;
        this.applyLED(result);
        this.updatePanelResult(result);
        if (result.state === 'OPEN') {
          (this.globals.resetKeypad as Signal<number>).value++;
        }
      }),
    );

    this.queries.panel.subscribe('qualify', () => {
      this.updatePanelPin(currentPin.peek());
      const result = circuitResult.peek();
      if (result) this.updatePanelResult(result);
    });
  }

  update(delta: number) {
    // Lazy-fetch door reference (stored in globals after world setup)
    if (!this.doorObject) {
      this.doorObject = (this.globals as any).doorObject ?? null;
    }

    // Hinge animation — smooth lerp toward target angle
    if (this.doorObject) {
      const diff = this.doorTargetAngle - this.doorCurrentAngle;
      if (Math.abs(diff) > 0.001) {
        this.doorCurrentAngle += diff * Math.min(delta * 2.5, 1);
        this.doorObject.rotation.y = this.doorCurrentAngle;
      }
    }

    for (const entity of this.queries.led.entities) {
      if (entity.getValue(LEDLight, 'mode') !== 'flashing') continue;
      this.flashTimer += delta;
      if (this.flashTimer >= 0.5) {
        this.flashTimer = 0;
        this.flashOn = !this.flashOn;
        this.setLEDColor(entity, this.flashOn ? RED : OFF);
      }
    }
  }

  private applyLED(result: ApiResult) {
    for (const entity of this.queries.led.entities) {
      const mode =
        result.led === 'GREEN' ? 'green' :
        result.led === 'RED_FLASHING' ? 'flashing' : 'red';
      entity.setValue(LEDLight, 'mode', mode);
      this.flashTimer = 0;
      if (mode !== 'flashing') {
        this.setLEDColor(entity, mode === 'green' ? GREEN : RED);
      }
    }

    // Output LED: only lights green when safe opens
    for (const entity of this.queries.outLed.entities) {
      this.setLEDColor(entity, result.state === 'OPEN' ? GREEN : OFF);
    }

    // Open the door on correct code
    if (result.state === 'OPEN') {
      this.doorTargetAngle = Math.PI * 0.65;
    }
  }

  private setLEDColor(entity: any, color: Color) {
    entity.object3D?.traverse((obj: any) => {
      if (obj.isMesh) {
        const mat = obj.material as MeshStandardMaterial;
        mat.emissive.copy(color);
        mat.emissiveIntensity = color.r + color.g + color.b > 0 ? 3 : 0;
      }
    });
  }

  private updatePanelPin(pin: string) {
    for (const entity of this.queries.panel.entities) {
      const doc = PanelDocument.data.document[entity.index] as UIKitDocument;
      if (!doc) continue;
      (doc.getElementById('pin-display') as UIKit.Text)?.setProperties({ text: pin });
    }
  }

  private updatePanelResult(result: ApiResult) {
    for (const entity of this.queries.panel.entities) {
      const doc = PanelDocument.data.document[entity.index] as UIKitDocument;
      if (!doc) continue;
      (doc.getElementById('circuit-state') as UIKit.Text)?.setProperties({ text: result.state });
      (doc.getElementById('tutor-msg') as UIKit.Text)?.setProperties({
        text: result.tutor_note ?? result.message,
      });
    }
  }
}
